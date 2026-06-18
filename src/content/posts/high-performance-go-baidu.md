---
title: "High-Performance Go Service Architecture for Millions of Connections at Baidu"
date: 2024-07-04T14:58:46+08:00
permalink: "2024/07/04/High-Performance-Go-Service-Architecture-for-Millions-of-Connections-at-Baidu"
description: "How a unified long-connection platform holds tens of millions of concurrent connections in Go: layered architecture, a connection state machine, and the goroutine, buffer, and GC discipline that keeps tail latency in budget."
tags:
  - Go
  - Architecture
  - Long Connection
  - High Concurrency
  - Networking
---

## Introduction

In the mobile-internet era, demand for real-time, interactive services has surged, making long-connection infrastructure essential. Unlike short connections, which follow a request-response model, a long connection keeps a network channel open between client and server for continuous, full-duplex transmission — which is what lets the server push data to users in real time.

A long-connection service has to deliver low latency, high concurrency, and high stability at once, and building one well is expensive if every business does it alone. The unified long-connection project exists to solve this once: a secure, high-concurrency, low-latency, easy-to-integrate, and cost-effective long-connection platform that many businesses can share.

![background](/images/lcs/background.png)

## The Unified Long-Connection Service

The goal is to give businesses a secure, high-concurrency, low-latency, easily integrable, and cost-effective long-connection system. The key objectives:

>   * Support Baidu's major app scenarios — live streaming, messaging, PUSH, and cloud control — with secure long-connection capabilities.
>   * Guarantee high concurrency, stability, and low latency.
>   * Let multiple businesses **reuse a single long connection**, reducing the cost of establishing and maintaining connections.
>   * Offer a simple integration path with clear external interfaces.

![background](/images/lcs/tback.png)

## Challenges

The challenges fall into two categories: getting the functionality right, and hitting the performance targets.

### Functionality

The central design question is where to draw the boundary between the *unified* service and *individual* business integrations. A dedicated service can bake in business logic freely; a shared service cannot. It must support many businesses on one connection while keeping business-specific logic out of the core — otherwise it can't scale or evolve.

Typical business requirements for a long-connection service:

>   * Establish, maintain, and manage connections.
>   * Forward upstream requests.
>   * Push downstream data.

The data path also has to support different protocols and push models depending on the business:

>   * **Messaging:** private messages and small group chats (500–1,000 members), mostly unicast and batch-unicast, with varying frequency and concurrency.
>   * **Live streaming:** group cast to millions of viewers at high frequency.
>   * **Cloud control:** messages to fixed groups via batch unicast.
>   * **PUSH notifications:** messages to fixed groups via batch unicast, at lower frequency.

| Business      | Push pattern            | Push scale | Frequency |
| ------------- | ----------------------- | ---------- | --------- |
| Messaging     | unicast / batch unicast | 10K        | high      |
| Live stream   | group cast              | 10M        | high      |
| Cloud control | batch unicast           | 1M         | low       |
| PUSH          | batch unicast           | 1M         | low       |

So the unified service must provide:

>   1. Connection establishment, maintenance, and management.
>   2. Upstream/downstream forwarding that accommodates different business data protocols.
>   3. Downstream push supporting unicast, batch unicast, and group cast.

![functional goals](/images/lcs/func.png)

### Performance

To serve Baidu's apps, the service needs high concurrency, high availability, and high stability:

| Metric                 | Target | Notes              |
| ---------------------- | ------ | ------------------ |
| Concurrent connections | 10M    | horizontal scaling |
| Upstream QPS           | 1M     | horizontal scaling |
| Downstream QPS         | 10M    | horizontal scaling |
| Latency                | 10ms-level | order of magnitude, not a hard SLO |

These three numbers — tens of millions of *idle-but-live* connections, millions of upstream QPS, and tens of millions of downstream pushes — pull in different directions, and most of the engineering below is about not letting one of them wreck the others.

#### Connection QPS, latency, and success rate

> Connections must be established quickly when the app opens and held while it's active. The service needs to handle thousands of QPS of new connections and millions of concurrent online connections, scaling horizontally. Establishment is the foundation everything else builds on, so its success rate and latency are critical.

#### Upstream QPS, latency, and success rate

> Once connected, business requests are forwarded to the backend — at least tens to hundreds of thousands of QPS, scaling horizontally.

#### Downstream QPS, latency, and success rate

> Depending on the scenario, downstream traffic is batch unicast or group cast. Batch unicast should support millions of pushes per second and group cast tens of millions, scaling horizontally.

## Overall Architecture

![overall](/images/lcs/overall.png)

### Components

The service has four main components: the unified long-connection **SDK** that clients embed, the **Control Layer**, the **Access Layer**, and the **Route Layer**. The Control and Access layers each get a dedicated section below; the SDK and the Route Layer surface throughout — the Route Layer in particular owns the connection-group routing that makes Group Cast work (see *Downstream → Group Cast*).

### Protocol

The vision is to let multiple businesses reuse one long connection. That means different business protocols must coexist on the same connection, and upstream/downstream forwarding must be able to tell them apart. This is handled by a private long-connection data protocol with three parts:

>   1. **Protocol Header:** protocol identifier, version, and so on.
>   2. **Common Parameters:** device ID, app ID, business ID, request metadata, etc.
>   3. **Business Data:** custom payload, compatible with different business protocols. The long-connection service only forwards it and never parses business details.

The format is roughly as follows (illustrative, not the actual wire format):

```
Protocol {
  Header {
    Protocol ID  (type) = value,
    Protocol Version (type) = value,
  },
  Common Parameters {
    Device ID    (type) = value,
    App ID       (type) = value,
    Business ID  (type) = value,
    Request Metadata (type) = {
      key: value,
      key: value,
      ...
    },
  },
  Business Data {
    Custom Data 1 (type) = value,
    Custom Data 2 (type) = value,
    ...
  }
}
```

Keeping `Business Data` opaque is the single decision that makes the platform a *platform*: the core never needs to be redeployed when a business changes its payload, and one connection can carry several businesses by switching on `Business ID` alone.

## Control Layer

The Control Layer's main functions:

>   1. Verify device legitimacy and decide access strategy before a connection is established.
>   2. Generate and verify tokens for device authentication.
>   3. Assign an access point based on client properties.
>   4. Manage fine-grained traffic-control strategies.

![control layer](/images/lcs/control-layer.png)

Putting admission control *before* the connection — rather than inside the access layer — is deliberate: it keeps the hot, stateful access nodes free of authentication and routing-policy logic, and it's where you'd shed load or steer clients away from an overloaded access point during an incident.

## Access Layer

The Access Layer's main functions:

>   1. **Peer communication:** establish, maintain, and release long connections with the SDK.
>   2. **Connection management:** map connection IDs to connection information.
>   3. **Group management:** map group IDs to connection information.
>   4. **Upstream forwarding:** forward business requests to the backend and return responses to the SDK.
>   5. **Downstream push:** receive push requests and deliver them to the right SDK.

This is the layer that holds millions of live connections in memory, so it's where the Go-specific engineering matters most. Two costs dominate at this scale:

* **Goroutines.** The natural Go style is a goroutine (often two — one read, one write) per connection. At 10M connections that's 10–20M goroutines; even at the 2 KB minimum starting stack (`runtime._StackMin`, lowered from 8 KB in Go 1.4), that's tens of GB of stack alone, plus scheduler overhead — and because every goroutine stack is a GC root the collector must scan each cycle, millions of them inflate concurrent-mark CPU and the assist back-pressure it pushes onto the mutator, so the goroutine count is a latency problem, not just a memory one. The usual answer is to stop tying a goroutine to each connection: a small pool of reactor goroutines drives `epoll` and hands ready connections to a bounded worker pool (the model behind libraries like `gnet`/`evio`). You trade some of Go's straight-line readability for a flat, predictable memory footprint.
* **Per-connection memory and GC.** Read/write buffers, not the connection struct, are what add up. At ~4 KB each for a default `bufio` read+write pair, allocating a fixed buffer per idle connection burns tens of gigabytes across 10M sockets; the fixes are lazy buffer allocation and shared pools (`sync.Pool`) so memory tracks *active* traffic, not connection count. `sync.Pool` is the right tool on this hot path specifically because it's sharded per-P — buffer reuse stays lock-free as you scale across the cores of a high-core access node — and because the runtime drains it under GC pressure, so transient buffers never settle into the long-lived heap. This also directly governs GC behavior. Go's collector marks concurrently, so the threat to a single-digit-millisecond end-to-end latency budget isn't the stop-the-world pauses — those are sub-millisecond and essentially independent of heap size. It's *mark assist*: when allocation on the hot path outruns the background marker, the allocating goroutine is conscripted into scanning, and that assist time lands directly as tail latency on the forwarding and push paths. A large live set makes it worse on both counts — the GC triggers off live-heap size (GOGC), so a bigger resident set fires cycles more often, and each cycle has more to scan. Keeping per-connection state small and pooling transient allocations on the hot path attacks both — and GC pause is only one contributor to that ~10ms budget anyway, alongside network RTT, queuing, and RPC forwarding.

### Connection-State Management

![state](/images/lcs/state.png)

A long connection must be validated for legitimacy and liveness and must react quickly to anomalies. The unified service models this with an explicit **state machine** that defines each state in a connection's lifecycle, the actions each state permits, and the conditions for transitions.

For example, before transmitting data a connection must pass login validation. Once authenticated, it can carry data. If something goes wrong after login — a malformed frame, a network disruption — the system invalidates the connection and triggers reconnection. Detecting that second case is the hard part at this scale: a half-open TCP connection — peer gone, no FIN or RST — looks alive indefinitely, so liveness can't ride on TCP alone. The state machine is driven by an application-level heartbeat with an idle deadline; miss N pings and the connection transitions to invalid and is reaped.

The state machine keeps state-handling logic clear and prevents the worst failure mode at this scale: connections stuck in an unknown state that can neither recover nor be cleaned up, slowly leaking memory across millions of sockets.

### Multi-Protocol Support

Long connections ride on TCP, TLS, QUIC, or WebSocket depending on the scenario — native clients use TCP/TLS, while mini-programs and web clients use WebSocket. To support all of them without scattering protocol logic through the codebase, the design splits into two layers:

> **Connection Layer:** owns a specific protocol (TLS, WebSocket, QUIC, …) and exposes a uniform data interface to the session layer. A new protocol is adapted here and nowhere else.
> **Session Layer:** owns long-connection business logic (request forwarding, downstream push) and talks to the connection layer without knowing which protocol is underneath.

Clients pick a protocol and access point based on their conditions — client type, network type, device quality.

![multi-protocol](/images/lcs/multi-protocol.png)

Advantages:

>   1. Isolates business logic from protocol details, so supporting a new protocol is a local change.
>   2. Lets clients choose the protocol that gives them the best connection quality.

### Upstream

#### Request Forwarding

Once the access layer identifies the source business of an inbound frame, it forwards the payload to that business's server over RPC and returns the response to the client, attaching the long-connection common parameters. Because a single connection can have several requests in flight at once, this forwarding is asynchronous rather than a blocking call on the read path — each frame carries a sequence/request ID in its metadata, so when a backend responds the access layer can correlate it back to the right pending request. Otherwise one slow business server would stall every other request multiplexed onto that connection. When needed, the access layer can also notify the business server in real time about connection-state changes — a disconnect, for instance — so the server can react.

![request forward](/images/lcs/forward.png)

### Downstream

There are two main downstream cast types:

  * **Batch unicast:** push to specific devices by mapping device IDs to connection information.
  * **Group cast:** send one message to many users by maintaining connection groups for efficient distribution.

#### Unicast / Batch Unicast

The server pushes to a specific device by resolving its connection instance and connection ID — i.e. mapping the device ID to `(instance IP + connection ID)`. The core task is locating the target user's device:

> Device-targeted scenarios push directly via an interface.
> ![unicast](/images/lcs/unicast.png)

#### Group Cast

Group cast is for scenarios like live streaming, where one message goes to many users. The **Route Layer** maintains connection groups, mapping a group ID to its connections. The business controls group creation; clients join and leave; and once a group exists, the service distributes each message to every connection in it.

To use connection groups, a business needs to:

>   1. Create connection groups.
>   2. Manage client joins and leaves.
>   3. Push messages by group ID.
> ![group](/images/lcs/group.png)

The thing that makes group cast scale is that the message is produced **once** and fanned out close to the connections — the access node receives a single copy and replicates it locally to each connection in the group, rather than the publisher sending N copies across the network. (Common refinements at this point are batching the per-connection writes and, for many small payloads, compressing them — though the original write-up doesn't specify either.) The fan-out multiplier — a single hot room can account for tens of thousands of the connections an access instance holds (each node is sized for ~100K–200K connections total) — lives in memory on the access layer, which is exactly why the per-connection memory discipline from the Access Layer section isn't optional. On the instance, the same logic applies in the small: the message is serialized once into a single immutable buffer that every connection's writer references — and compressed once too, if you compress at all — never re-encoded per recipient. At high fan-out frequency it's per-connection serialization, not the socket writes, that would otherwise dominate CPU.

## Summary

The unified long-connection system now supports tens of millions of concurrent connections and handles millions of pushes per second across batch unicast and group cast, scaling in real time. It has stayed stable since launch, absorbing high-concurrency events without spilling over onto other services. Overall it has met its service-quality goals.

Key lessons:

>   1. **Requirements:** draw a clear line between platform requirements and business logic. Keeping business logic out of the core is what preserves stability as the platform grows.
>   2. **Design:** prefer the simplest design that meets a clearly stated requirement. Optimize for stability and predictable performance over cleverness.
>   3. **Operations:** balance single-instance performance against operability. Many smaller instances often beat a few large ones — and in a GC'd runtime there's a concrete reason why. It isn't shorter stop-the-world pauses: Go's STW pauses are already sub-millisecond and effectively independent of heap size. The win is that a smaller, less busy heap per process means less GC-assist pressure (fewer allocating goroutines getting conscripted into mark work on the hot path) and lower GC CPU per instance, with a smaller blast radius and easier per-process tuning on top. So spreading the same load over more, smaller processes trades a little efficiency for far steadier tail latency.

## References

* [千万级高性能长连接 Go 服务架构实践](https://mp.weixin.qq.com/s/E8rO4uBkFpcLAb_LsBOphw) by glstr

Many thanks to the original author, glstr.
