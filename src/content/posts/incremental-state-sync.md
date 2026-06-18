---
title: "Incremental State Sync: How Clients Catch Up Without Re-Downloading the World"
date: 2026-06-18T10:00:00+08:00
permalink: "2026/06/18/Incremental-State-Synchronization"
description: "How real-time apps let a client catch up on state — conversations, group members, missed messages — after going offline, without re-downloading everything. A tour from replication logs and IMAP to Telegram, Discord, Matrix, and WeChat, and the distributed-systems theory underneath."
tags:
  - Distributed Systems
  - Messaging
  - Synchronization
  - Architecture
---

You close a chat app on Friday and reopen it the following Thursday. For a fraction of a second there is a spinner, and then everything is simply *there*: new messages across hundreds of conversations, the colleague who left one group and the three people who joined another, contacts added and removed, read receipts settled, unread badges correct. It feels like nothing happened. Behind that spinner, the client just reconciled a week of drift against the server — and the interesting part is everything it *didn't* do.

The naive implementation is "on reconnect, download the current state." Re-pull every conversation, every group's full member list, the whole roster. It is correct, and it does not survive contact with reality. A single group can have tens of thousands of members; an active account can sit in hundreds of conversations; and the device asking is often on a subway with two bars of signal and a metered data plan. Re-downloading the world on every reconnect turns a one-week absence into a multi-megabyte, multi-second stall — and does it again every time the connection blips.

So every serious messaging system implements some form of **incremental synchronization**: *given what the client already has, send only what changed.* What's striking, once you go looking, is how thoroughly this problem has already been solved — not once, but independently, in database replication, in email, in calendar protocols, in every large chat system — and how all of those solutions converge on the same handful of moves. This post is a tour of those moves and the systems that made them, generalized into a pattern you can reach for deliberately.

## The shape of the solution

Strip away the protocol-specific spelling and incremental sync is always four things.

1. **A monotonic cursor.** A single value — a version, a sequence number, an opaque token — that names *how far along* a client is. It only ever moves forward.
2. **An ordered change log.** The server records mutations in cursor order, so "everything after cursor X" is a well-defined, replayable list.
3. **Explicit tombstones.** Deletions have to be represented *positively* in the log. If a removed item simply vanishes from the source, a client that cached it never learns to drop it. A delete is a record, not the absence of one.
4. **A snapshot fallback, guarded by an epoch.** No log is infinite. When a client's cursor has aged out of retained history, you *cannot* compute a delta — so you fall back to shipping a full snapshot and resetting the cursor. And because a bare cursor is meaningless without knowing *which* log it indexes, you pin a **log identity** (an epoch); if it changes, an old cursor is detected as stale instead of being silently misapplied to a rebuilt log.

In the abstract, the happy path is just:

```text
client → server:  "I'm at cursor X (of log L). What changed?"
server → client:  changes after X  (inserts, updates, tombstones)
                  + new cursor X'
                  -- or --
                  "X is too old / L no longer exists → here is a full snapshot, your cursor is now X'"
```

Hold those four moves in mind. The rest of this post is the same four moves, over and over, in systems that mostly never talked to each other.

## It's an old idea, part 1: replication logs

The purest expression of the pattern isn't in messaging at all — it's in how databases keep replicas in sync. A replica *is* a client catching up on state.

**MySQL** streams its **binary log** — an ordered log of logical changes. The modern cursor is the **GTID** (global transaction identifier): every transaction gets an ID `source_uuid:N`, and a replica's position is simply *the set of GTIDs it has already executed*. With `SOURCE_AUTO_POSITION = 1`, catch-up is a pure set difference: the replica advertises the GTID set it has, and the source streams every transaction whose GTID isn't in it. Deletes are explicit `DELETE_ROWS` events carrying the row's before-image — tombstones, move (3). And when the needed binlogs have been purged because they aged past `binlog_expire_logs_seconds` (default 30 days)? The source refuses with error 1236 ("the master has purged binary logs containing GTIDs that the slave requires") and your only recourse is to re-provision the replica from a fresh snapshot — move (4), the full resync, in its rawest form.

**MongoDB** does the same with its **oplog**, a capped (fixed-size) collection of idempotent operations. Change-stream consumers carry an opaque **resume token**; reconnect with it and the server replays everything after it. The capped oplog gives you a **window** — a finite retention budget — and a consumer that falls outside it gets a blunt, perfectly-named error: `ChangeStreamHistoryLost`, *"the resume point may no longer be in the oplog."* Cursor aged out → full resync.

**PostgreSQL** logical replication is worth dwelling on because it makes move (4)'s central tension explicit: *who pays for retention?* The cursor is the **LSN** (log sequence number, a byte offset in the write-ahead log). A consumer registers a **replication slot**, and the slot does something consequential — it *pins* the WAL, forbidding the server from discarding any log a lagging consumer still needs. That guarantees the consumer can always catch up... by making the *server* hoard log indefinitely. A consumer that goes away without dropping its slot will fill the server's disk and, in the limit, shut the database down. Postgres 13 added `max_slot_wal_keep_size` to cap it: exceed the cap and the slot's status walks from `reserved` to `extended` to `unreserved` to, finally, **`lost`** — at which point the consumer must drop the slot and do a full resync. *Bounded history or unbounded storage: pick one.* Every system in this post makes that choice somewhere, explicitly or by accident.

Three databases, three vendors, one pattern: a monotonic position, "give me everything since X," explicit deletes, and a snapshot when X falls outside the retained window.

## It's an old idea, part 2: mailboxes and contacts

Long before "real-time app," clients were syncing mailboxes and address books — and the protocols they used are startlingly modern.

**IMAP**, via the CONDSTORE and QRESYNC extensions (RFC 7162), gives every message a **MODSEQ** — a per-mailbox modification sequence that bumps whenever a message's metadata changes. (A precise detail worth getting right: it's a **63-bit** value, deliberately narrowed from 64 bits so it stays a safe positive integer in languages with signed longs.) The mailbox advertises its `HIGHESTMODSEQ`; a client that cached a lower value knows it's behind, and asks `FETCH ... (CHANGEDSINCE <modseq>)` to get only what moved. Deletes are the elegant part: QRESYNC's `VANISHED (EARLIER)` response reports expunged messages as **compact UID ranges** — tombstones, batched. And the epoch from move (4) is right there too, decades early: `UIDVALIDITY`. If the server's `UIDVALIDITY` changes, every UID the client cached is meaningless, and it must discard everything and resync. A version cursor, batched tombstones, and an epoch guard — in an email RFC.

**CalDAV/CardDAV** (RFC 6578) is even more on-the-nose: the cursor is literally called a **sync-token**, an opaque string the server hands back after each sync. Send an empty token and you get a full sync; send your last token and you get the delta. Removed items come back as a `404 Not Found` for that resource (tombstone); and when the server has expired the history your token points into, it rejects the request with **`403 Forbidden` + `DAV:valid-sync-token`** — "that token is no longer valid, start over with an empty one." (It's a 403, not the 412 you might expect — 412 is for `If-Match` conditional headers, a different mechanism entirely.)

**Exchange ActiveSync** ships the same machinery as a **SyncKey**: `SyncKey = 0` means "initialize, full sync"; every response hands back a *new* key the client must present next time — a ratchet. An invalid or stale key comes back as **Status 3**, and the client's recovery is to reset its key to `0` and full-resync. ActiveSync even distinguishes two kinds of removal: a hard `Delete` (the item is gone) versus a `SoftDelete` (the item still exists server-side but has fallen *out of your sync window* — aged past the date filter — so drop it locally without treating it as a true deletion). That distinction between "deleted" and "no longer in scope for you" is exactly the subtlety that bites people when they build group-member sync.

The point of this section is not nostalgia. It's that **"keep a client's cached list in sync with a server's authoritative list"** — your contact list, your mailbox, your calendar — *is the same problem* as keeping a group's member list in sync, and it was solved, carefully, before chat apps existed.

## XMPP: one pattern, three layers

XMPP is worth a stop because it shows the pattern operating at three different layers of the same stack simultaneously — which is exactly how a real messenger is built.

At the **roster** (contact-list) layer, **Roster Versioning** (originally XEP-0237, now baked into RFC 6121 §2.6) gives the roster a `ver` attribute. The client sends its last known `ver`; the server either returns the full roster or an empty result followed by incremental **roster pushes** — one item per change, each carrying a new `ver`, in modification order. Removals are pushed as an item with `subscription='remove'` (tombstone). One detail is a clean teaching point: `ver` is explicitly **opaque** — the spec forbids the client from assuming it's a sequential integer, even though servers usually implement it as one. (And `ver=''` — empty — opts *into* versioning while requesting a full roster, which is subtly different from omitting `ver` entirely, which opts out.) The roster is the contact-list analogue of group-member sync, and it's *the same cursor pattern*.

At the **transport** layer, **Stream Management** (XEP-0198) handles the brief blip — the TCP drop that lasts three seconds. Each side keeps an `h` counter of stanzas it has handled; on reconnect the client sends `<resume previd=… h=…/>` and each side replays the stanzas the other hasn't acknowledged. This is a monotonic counter and a replay buffer, scoped to a single session. It survives a hiccup; it explicitly does *not* survive a long absence — past the server's resumption window, `<resume>` fails and you fall back to a fresh session.

At the **history** layer, **Message Archive Management** (XEP-0313) is the offline catch-up primitive: a server-side archive where each message has a unique archive ID, queried with "give me messages after `<id>`" and paged until the response says `complete='true'`. It's the message analogue of roster versioning — same cursor, same "since X," same completeness signal.

Put together, a reconnecting multi-device XMPP client **resumes the stream if it's within the window** (cheap, lossless), **else queries MAM after its last archive ID** to backfill missed messages, and **roster-versions** to backfill contact changes — while Message Carbons keeps its *other* online devices live in real time. The same four moves, instantiated three times, at three layers. Once you can see it, you can't unsee it.

## Modern messengers: who holds the cursor?

Now to the systems people actually mean by "real-time app." The interesting axis here isn't *whether* they use the pattern — they all do — but a design decision the older systems mostly didn't have to make: **does the client track its position, or does the server track it for the client?** Telegram and Discord sit at opposite ends, and the trade is instructive.

### Telegram: the client owns its cursor

Telegram's client persists a small **state tuple** — `pts`, `qts`, `seq`, `date` — and the server is largely stateless about where any given client is. The most elegant part is **client-side gap detection**. Every common update carries the new `pts` *and* a `pts_count` (how much the state advanced). The client does arithmetic against its local position:

```text
local_pts + pts_count == pts   →  apply the update
local_pts + pts_count >  pts   →  already applied, ignore it
local_pts + pts_count <  pts   →  GAP: I missed something → call updates.getDifference
```

That third line is the whole game: the client *detects its own staleness* from a discontinuity in the sequence, then calls `updates.getDifference` to fill the hole. When the gap is too large to stream incrementally, the server answers `differenceTooLong` (or, for the whole update stream, pushes `updatesTooLong`) and the client resyncs from a fresh baseline — move (4).

Telegram also nails **per-collection cursors**. Channels and supergroups are deliberately pulled *out* of the global `pts` and given their own independent sequence. A firehose broadcast channel posting hundreds of times an hour does not bump the cursor of every other chat you're in. Catch-up for them is lazy: `getDifference` returns lightweight `updateChannelTooLong` markers naming *which* channels went stale, and the client pulls each one's delta separately with `getChannelDifference` — rather than the server replaying every channel inline. This is the same instinct as per-mailbox MODSEQ, scaled to a system where one "collection" might be a channel with millions of subscribers.

### Discord: the server owns the session

Discord makes the opposite trade. The client tracks exactly *one* integer — `s`, the sequence number on each dispatched gateway event — and the **server** holds a per-session replay buffer keyed by `session_id`. On a dropped socket, the client sends `RESUME` (opcode 6) with its last `s`, and the server replays the missed events it buffered, ending with `RESUMED`. The full-state path is a separate opcode: `IDENTIFY` (2) yields a `READY` snapshot. When a resume can't be honored — session expired, fell off the buffer — the server sends `Invalid Session` (opcode 9), and the client must re-`IDENTIFY` and take a fresh full snapshot.

The trade is real. Telegram's model costs the *client* complexity (it has to persist and reason about a state tuple, do gap arithmetic) but lets the *server* stay lean and mostly stateless about per-client position. Discord's model keeps the *client* trivial (track one number, send it on reconnect) but makes the *server* hold session state and a replay buffer for every connection. Neither is wrong; they fail differently and scale differently, and knowing which you're building is half the battle.

## The other axis: when the *current state* is the problem

A cursor answers "what changed." It does nothing for a second, orthogonal problem: **the current state is itself enormous.** Sync a 50,000-member group for the first time and there's no delta to be clever about — the snapshot *is* the cost. This is the generalization of the group-member question, and the answer is a different tool: **lazy and windowed loading**, gated by **explicit subscriptions**.

**Discord** refuses to ship big member lists by default. `GUILD_CREATE` omits most members for large guilds (controlled by `large_threshold`, 50–250); to get the rest you must explicitly ask with `Request Guild Members` (opcode 8) and receive paginated `GUILD_MEMBERS_CHUNK` events. And the whole thing is gated behind **intents** — a privileged `GUILD_MEMBERS` subscription you have to opt into. Intents are the subscription filter that stops every client from fanning in every member of every large guild it can see.

**Matrix** does it with **lazy-loading members**: a filter (`lazy_load_members`) that tells `/sync` to send only the membership events for users *relevant to the timeline you actually received* — not all 50,000. For accounts that are large along a *different* dimension — thousands of *rooms* — classic `/sync` had a deeper problem: its initial sync returned *every* joined room at once. The fix is **Sliding Sync** (MSC4186): the client syncs a **window** of rooms (a `range` like "rooms 0–19"), grows the window as needed, and rides a delta protocol where an omitted field simply means "unchanged." It's a cursor *and* a window — pagination over the collection of collections.

The lesson generalizes cleanly: **separate "what changed" (the cursor) from "this collection is huge" (lazy/windowed loading + subscription gates).** A version log makes reconnect cheap; it does nothing for first load or for a member list that doesn't fit in a phone's memory. Those need on-demand, paginated, opt-in loading. Most production stalls I've seen in this area come from conflating the two and trying to make the cursor carry weight it was never meant to bear.

## Two systems built *around* the sequence

Two more, because they show the cursor becoming the center of gravity of the whole design.

**Matrix's `/sync`** is the pattern at its most REST-clean: an opaque `next_batch` token returned by each call, replayed as `since` on the next, over a long-poll. Gaps are detected *per room* — a room's timeline comes back with `limited: true` and a `prev_batch` token when too much accumulated, and the client backfills that specific hole via `/messages?from=<prev_batch>&dir=b`. A `full_state=true` lever forces a state resync without throwing away the stream position. One token for the stream, one per room for the timeline — cursors all the way down.

**WeChat's `seqsvr`** is the most extreme case, and the one that best shows *why monotonicity is load-bearing.* The sync model is ordinary in shape — each user has a monotonically increasing 64-bit **sequence number**, the client stores its max, and sync is "give me everything greater than my max seq," per data category (messages, contacts, moments). What's remarkable is that *generating that sequence* at the scale of a national messenger is itself a hard distributed-systems problem, and the public architecture write-up of how they did it is a minor classic of the genre. The trick is to persist only a *ceiling*: hand out sequence numbers from memory, and only write to disk when you cross `max_seq`, bumping it by a step (the article describes a step of 10,000) — turning ten million allocations into a thousand disk writes. On restart you resume from the persisted ceiling, so numbers may *jump forward* but can never go *backward*. Adjacent users are grouped into "sections" (the article describes 100,000 users sharing one ceiling) to amortize that disk write further still.

And the punchline, stated plainly in that write-up: *any regression of the sequence inevitably causes data corruption and lost messages.* Of course it does — the entire sync contract is "everything greater than my cursor." If the cursor ever rewinds, clients silently skip or duplicate changes. The monotonicity isn't a nice-to-have; it's the load-bearing wall. An enormous amount of engineering went into guaranteeing one property — *it never goes backward* — because the correctness of every client's catch-up rests on it.

It's worth ending the tour on an honest counter-example. **Slack** did *not* start with a sync cursor. Its original client boot was a single `rtm.start` call returning a **full snapshot** of the team — every user, every channel, every member. It was simple and it didn't scale; a large team's boot payload was enormous. The fixes weren't a version token but the *other* axis: **incremental boot** (fetch only what the open view needs, fill in the rest lazily after first paint) and **Flannel**, an application-level edge cache that serves user and channel objects on demand from points of presence — cutting boot payloads by up to 44× on large teams. A useful reminder that "snapshot plus lazy loading" is a legitimate architecture, not every system needs a cursor, and the right answer depends on whether your pain is *reconnect churn* or *first-load size*.

## The theory underneath

None of this is folklore; it rests on decades of distributed-systems work, and a couple of pointers keep you honest.

A server-assigned, monotonically increasing sequence is, formally, a **Lamport logical clock** for a single writer (Lamport, 1978). The entire pattern is "one writer, one clock": because the server is the sole source of truth and stamps every change with an increasing number, a single scalar is enough to totally order events and let a client reason about what precedes what.

That "single writer" qualifier is the most important guardrail in this whole space, and it's the easiest way to lose a knowledgeable reader if you get it wrong. Server-authoritative sync — one writer of record, clients catching up read-only — needs **neither vector clocks nor CRDTs nor operational transformation.** Those tools solve a *different* problem: *multiple concurrent authoritative writers* whose edits must be merged without coordination (think collaborative document editing — Google Docs' OT, or Automerge/Yjs CRDTs). If your clients only *read* the synced state and all authority lives on the server, reaching for a CRDT is a category error. You graduate into that machinery only when clients gain the right to originate authoritative state offline — not before.

The two halves of the pattern even have distinct ancestors. The **delta path** — "sync the log" — descends most directly from **Bayou** (Terry et al., 1995): occasionally-connected replicas reconcile by exchanging the missing *suffix* of an ordered write log, each tracking what the other already knows. The cleanest mental model for it is **Git's fetch negotiation**: the client advertises what it `have`s and what it `want`s, and the server computes and ships the minimal pack of missing objects — *compute what I'm missing from what I already have.* The **snapshot/fallback path**, meanwhile, is the lineage of **Merkle-tree anti-entropy** (Amazon's Dynamo, 2007) and the **rsync algorithm** (1996): diff two large states by exchanging hashes or rolling checksums and shipping only the parts that differ, instead of re-sending everything. When you design "what does a full resync actually transfer," that's the literature to raid.

## A design checklist

Pulling the tour into something you can act on. When you build "how does a client catch up," you are choosing a position on each of these well-worn axes — not inventing:

- **Decide where the cursor lives.** Client-tracked (Telegram: lean server, complex client, client-side gap detection) versus server-session (Discord: trivial client, stateful server, server-side replay buffer). This is the first and most consequential choice.
- **Make the position monotonic, and never rewind it.** The whole contract is "everything greater than my cursor." A cursor that goes backward — after a failover, a restart, a clock issue — silently skips or duplicates data. If you persist a ceiling and jump forward on restart (the seqsvr trick), you preserve monotonicity at the cost of gaps in the number space, which is exactly the right trade.
- **Represent deletes explicitly, and retain tombstones.** A removed item must appear in the log as a tombstone, or caches never converge. Decide how long tombstones live — they age out too, and a client older than your oldest tombstone must full-resync.
- **Bound the log and define the fallback — including its trigger.** "Fell off the back of the log" must be a *defined* state with a clean signal (`ChangeStreamHistoryLost`, `differenceTooLong`, `403 valid-sync-token`, Status 3), not undefined behavior. The fallback is a full snapshot; make it explicit.
- **Pin a log identity / epoch.** A bare cursor is meaningless without knowing which log it indexes. An epoch (`UIDVALIDITY`, a log UUID) lets a stale cursor be *detected* and rejected instead of being misapplied to a rebuilt log — a genuinely dangerous bug, because it "succeeds" and corrupts silently.
- **Decide who pays for retention, and cap it.** Postgres slots pin WAL and can fill the server's disk; an unbounded change log is a latent outage. Bound it, and make exceeding the bound trigger the fallback rather than an incident.
- **Use per-collection cursors for hot collections.** Don't let one busy channel bump the cursor of every client in every other chat (Telegram's per-channel `pts`). Independent sequences keep a firehose from creating sync churn everywhere.
- **Separate "what changed" from "this collection is huge."** The cursor handles reconnect; lazy/windowed loading and subscription gates (Discord intents, Matrix lazy-loaded members and Sliding Sync) handle first-load and oversized collections. Don't make one mechanism do both jobs.
- **Batch the sync, and combine push with pull.** One round trip should reconcile many collections at once. Push to *notify* a client it's behind for freshness; pull on reconnect to *catch up*. You want both.

## Closing

From an email extension in 2006 to a database replica to a chat app you reopened this morning, it is the same four moves: a monotonic cursor, an ordered log, explicit tombstones, and a snapshot fallback guarded by an epoch. The spellings differ wildly — MODSEQ, GTID, `pts`, `next_batch`, sync-token, a 64-bit per-user seq — but the skeleton is identical, because the constraints are identical: clients go away, come back, and must not pay for the whole world to learn what they missed.

So the next time you're staring at "how does the client catch up," resist the urge to invent. You're picking coordinates on a map that database, email, and messaging engineers have been charting for forty years. Know where you're standing on each axis, get the four moves right — and especially never let the cursor run backward — and the result is the best kind of engineering: the kind nobody notices, because the app just quietly has everything there when they open it.

---

## References

Foundational sync and replication:

- IMAP CONDSTORE/QRESYNC — [RFC 7162](https://www.rfc-editor.org/rfc/rfc7162) (MODSEQ, HIGHESTMODSEQ, `CHANGEDSINCE`, `VANISHED`, UIDVALIDITY)
- WebDAV Collection Synchronization — [RFC 6578](https://www.rfc-editor.org/rfc/rfc6578) (sync-token; `DAV:valid-sync-token`)
- MySQL GTID auto-positioning — [dev.mysql.com](https://dev.mysql.com/doc/refman/8.0/en/replication-gtids-auto-positioning.html)
- MongoDB change streams & oplog — [mongodb.com](https://www.mongodb.com/docs/manual/changeStreams/)
- PostgreSQL logical decoding & replication slots — [postgresql.org](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html)
- Exchange ActiveSync `Sync`/`SyncKey` — [MS-ASCMD](https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-ascmd/)

XMPP:

- Roster Versioning — [RFC 6121 §2.6](https://www.rfc-editor.org/rfc/rfc6121) / [XEP-0237](https://xmpp.org/extensions/xep-0237.html)
- Stream Management — [XEP-0198](https://xmpp.org/extensions/xep-0198.html) · Message Archive Management — [XEP-0313](https://xmpp.org/extensions/xep-0313.html)

Modern messengers:

- Telegram MTProto updates — [core.telegram.org/api/updates](https://core.telegram.org/api/updates)
- Discord Gateway — [discord.com/developers](https://discord.com/developers/docs/topics/gateway) and [gateway events](https://discord.com/developers/docs/topics/gateway-events)
- Matrix client-server `/sync` — [spec.matrix.org](https://spec.matrix.org/latest/client-server-api/#syncing) · Simplified Sliding Sync — [MSC4186](https://github.com/matrix-org/matrix-spec-proposals/pull/4186)
- WeChat `seqsvr` sequence-number architecture — ["万亿级调用系统：微信序列号生成器架构设计及演变"](https://www.infoq.cn/article/wechat-serial-number-generator-architecture) (曾钦松)
- Slack — ["Flannel: An Application-Level Edge Cache"](https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/) and ["Getting to Slack faster with incremental boot"](https://slack.engineering/getting-to-slack-faster-with-incremental-boot/)

Theory:

- L. Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System," *CACM* 21(7), 1978
- D. Terry et al., "Managing Update Conflicts in Bayou," *SOSP* 1995
- G. DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store," *SOSP* 2007 (Merkle-tree anti-entropy)
- M. Shapiro et al., "Conflict-free Replicated Data Types," *SSS* 2011
- Git transfer protocols (`have`/`want`) — [Pro Git: Transfer Protocols](https://git-scm.com/book/en/v2/Git-Internals-Transfer-Protocols)
- A. Tridgell & P. Mackerras, ["The rsync algorithm"](https://rsync.samba.org/tech_report/), 1996
