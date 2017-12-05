/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
'use strict';

var raft = {};
var RPC_TIMEOUT = 50000;
var MIN_RPC_LATENCY = 10000;
var MAX_RPC_LATENCY = 15000;
var ELECTION_TIMEOUT = 100000;
var NUM_SERVERS = 5;
var BATCH_SIZE = 1;

(function() {

var sendMessage = function(model, message) {
  message.sendTime = model.time;
  message.recvTime = model.time +
                     MIN_RPC_LATENCY +
                     Math.random() * (MAX_RPC_LATENCY - MIN_RPC_LATENCY);
  model.messages.push(message);
};

var sendRequest = function(model, request) {
  request.direction = 'request';
  sendMessage(model, request);
};

var sendReply = function(model, request, reply) {
  reply.from = request.to;
  reply.to = request.from;
  reply.type = request.type;
  reply.direction = 'reply';
  sendMessage(model, reply);
};

var logTerm = function(log, index) {
  if (index < 1 || index > log.length) {
    return 0;
  } else {
    return log[index - 1].term;
  }
};

var rules = {};
raft.rules = rules;

var makeElectionAlarm = function(now) {
  return now + (Math.random() + 1) * ELECTION_TIMEOUT;
};

raft.server = function(id, peers) {
  return {
    id: id,
    peers: peers,
    state: 'follower',
    term: 1,
    votedFor: null,
    log: [],
    commitIndex: 0,
    electionAlarm: makeElectionAlarm(0),
    voteGranted:  util.makeMap(peers, false),
    matchIndex:   util.makeMap(peers, 0),
    nextIndex:    util.makeMap(peers, 1),
    rpcDue:       util.makeMap(peers, 0),
    heartbeatDue: util.makeMap(peers, 0),
  };
};

var stepDown = function(model, server, term) {
  server.term = term;
  server.state = 'follower';
  server.votedFor = null;
  if (server.electionAlarm <= 1="" model.time="" ||="" server.electionalarm="=" util.inf)="" {="" }="" };="" rules.startnewelection="function(model," server)="" if="" ((server.state="=" 'follower'="" server.state="=" 'candidate')="" &&="" <="model.time)" server.term="" +="1;" server.votedfor="server.id;" ;="" server.votegranted="util.makeMap(server.peers," false);="" server.matchindex="util.makeMap(server.peers," 0);="" server.nextindex="util.makeMap(server.peers," 1);="" server.rpcdue="util.makeMap(server.peers," server.heartbeatdue="util.makeMap(server.peers," rules.sendrequestvote="function(model," server,="" peer)="" (server.state="=" 'candidate'="" server.rpcdue[peer]="" rpc_timeout;="" sendrequest(model,="" from:="" server.id,="" to:="" peer,="" type:="" 'requestvote',="" term:="" server.term,="" lastlogterm:="" logterm(server.log,="" server.log.length),="" lastlogindex:="" server.log.length});="" rules.becomeleader="function(model," util.counttrue(util.mapvalues(server.votegranted))=""> Math.floor(NUM_SERVERS / 2)) {
    //console.log('server ' + server.id + ' is leader in term ' + server.term);
    server.state = 'leader';
    server.nextIndex    = util.makeMap(server.peers, server.log.length + 1);
    server.rpcDue       = util.makeMap(server.peers, util.Inf);
    server.heartbeatDue = util.makeMap(server.peers, 0);
    server.electionAlarm = util.Inf;
  }
};

rules.sendAppendEntries = function(model, server, peer) {
  if (server.state == 'leader' &&
      (server.heartbeatDue[peer] <= 1="" model.time="" ||="" (server.nextindex[peer]="" <="server.log.length" &&="" server.rpcdue[peer]="" {="" var="" previndex="server.nextIndex[peer]" -="" 1;="" lastindex="Math.min(prevIndex" +="" batch_size,="" server.log.length);="" if="" (server.matchindex[peer]="" server.nextindex[peer])="" sendrequest(model,="" from:="" server.id,="" to:="" peer,="" type:="" 'appendentries',="" term:="" server.term,="" previndex:="" previndex,="" prevterm:="" logterm(server.log,="" previndex),="" entries:="" server.log.slice(previndex,="" lastindex),="" commitindex:="" math.min(server.commitindex,="" lastindex)});="" rpc_timeout;="" server.heartbeatdue[peer]="model.time" election_timeout="" 2;="" }="" };="" rules.advancecommitindex="function(model," server)="" matchindexes="util.mapValues(server.matchIndex).concat(server.log.length);" matchindexes.sort(util.numericcompare);="" n="matchIndexes[Math.floor(NUM_SERVERS" 2)];="" (server.state="=" 'leader'="" n)="=" server.term)="" server.commitindex="Math.max(server.commitIndex," n);="" handlerequestvoterequest="function(model," server,="" request)="" (server.term="" request.term)="" stepdown(model,="" request.term);="" granted="false;" request.term="" (server.votedfor="==" null="" server.votedfor="=" request.from)="" (request.lastlogterm=""> logTerm(server.log, server.log.length) ||
       (request.lastLogTerm == logTerm(server.log, server.log.length) &&
        request.lastLogIndex >= server.log.length))) {
    granted = true;
    server.votedFor = request.from;
    server.electionAlarm = makeElectionAlarm(model.time);
  }
  sendReply(model, request, {
    term: server.term,
    granted: granted,
  });
};

var handleRequestVoteReply = function(model, server, reply) {
  if (server.term < reply.term)
    stepDown(model, server, reply.term);
  if (server.state == 'candidate' &&
      server.term == reply.term) {
    server.rpcDue[reply.from] = util.Inf;
    server.voteGranted[reply.from] = reply.granted;
  }
};

var handleAppendEntriesRequest = function(model, server, request) {
  var success = false;
  var matchIndex = 0;
  if (server.term < request.term)
    stepDown(model, server, request.term);
  if (server.term == request.term) {
    server.state = 'follower';
    server.electionAlarm = makeElectionAlarm(model.time);
    if (request.prevIndex === 0 ||
        (request.prevIndex <= server.log.length="" &&="" logterm(server.log,="" request.previndex)="=" request.prevterm))="" {="" success="true;" var="" index="request.prevIndex;" for="" (var="" i="0;" <="" request.entries.length;="" +="1)" if="" (logterm(server.log,="" index)="" !="request.entries[i].term)" while="" (server.log.length=""> index - 1)
            server.log.pop();
          server.log.push(request.entries[i]);
        }
      }
      matchIndex = index;
      server.commitIndex = Math.max(server.commitIndex,
                                    request.commitIndex);
    }
  }
  sendReply(model, request, {
    term: server.term,
    success: success,
    matchIndex: matchIndex,
  });
};

var handleAppendEntriesReply = function(model, server, reply) {
  if (server.term < reply.term)
    stepDown(model, server, reply.term);
  if (server.state == 'leader' &&
      server.term == reply.term) {
    if (reply.success) {
      server.matchIndex[reply.from] = Math.max(server.matchIndex[reply.from],
                                               reply.matchIndex);
      server.nextIndex[reply.from] = reply.matchIndex + 1;
    } else {
      server.nextIndex[reply.from] = Math.max(1, server.nextIndex[reply.from] - 1);
    }
    server.rpcDue[reply.from] = 0;
  }
};

var handleMessage = function(model, server, message) {
  if (server.state == 'stopped')
    return;
  if (message.type == 'RequestVote') {
    if (message.direction == 'request')
      handleRequestVoteRequest(model, server, message);
    else
      handleRequestVoteReply(model, server, message);
  } else if (message.type == 'AppendEntries') {
    if (message.direction == 'request')
      handleAppendEntriesRequest(model, server, message);
    else
      handleAppendEntriesReply(model, server, message);
  }
};


raft.update = function(model) {
  model.servers.forEach(function(server) {
    rules.startNewElection(model, server);
    rules.becomeLeader(model, server);
    rules.advanceCommitIndex(model, server);
    server.peers.forEach(function(peer) {
      rules.sendRequestVote(model, server, peer);
      rules.sendAppendEntries(model, server, peer);
    });
  });
  var deliver = [];
  var keep = [];
  model.messages.forEach(function(message) {
    if (message.recvTime <= model.time)="" deliver.push(message);="" else="" if="" (message.recvtime="" <="" util.inf)="" keep.push(message);="" });="" model.messages="keep;" deliver.foreach(function(message)="" {="" model.servers.foreach(function(server)="" (server.id="=" message.to)="" handlemessage(model,="" server,="" message);="" }="" };="" raft.stop="function(model," server)="" server.state="stopped" ;="" server.electionalarm="0;" raft.resume="function(model," raft.resumeall="function(model)" raft.resume(model,="" server);="" raft.restart="function(model," raft.stop(model,="" raft.drop="function(model," message)="" return="" m="" !="=" message;="" raft.timeout="function(model," rules.startnewelection(model,="" raft.clientrequest="function(model," (server.state="=" 'leader')="" server.log.push({term:="" server.term,="" value:="" 'v'});="" raft.spreadtimers="function(model)" var="" timers="[];" (server.electionalarm=""> model.time &&
        server.electionAlarm < util.Inf) {
      timers.push(server.electionAlarm);
    }
  });
  timers.sort(util.numericCompare);
  if (timers.length > 1 &&
      timers[1] - timers[0] < MAX_RPC_LATENCY) {
    if (timers[0] > model.time + MAX_RPC_LATENCY) {
      model.servers.forEach(function(server) {
        if (server.electionAlarm == timers[0]) {
          server.electionAlarm -= MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout forward');
        }
      });
    } else {
      model.servers.forEach(function(server) {
        if (server.electionAlarm > timers[0] &&
            server.electionAlarm < timers[0] + MAX_RPC_LATENCY) {
          server.electionAlarm += MAX_RPC_LATENCY;
          console.log('adjusted S' + server.id + ' timeout backward');
        }
      });
    }
  }
};

raft.alignTimers = function(model) {
  raft.spreadTimers(model);
  var timers = [];
  model.servers.forEach(function(server) {
    if (server.electionAlarm > model.time &&
        server.electionAlarm < util.Inf) {
      timers.push(server.electionAlarm);
    }
  });
  timers.sort(util.numericCompare);
  model.servers.forEach(function(server) {
    if (server.electionAlarm == timers[1]) {
      server.electionAlarm = timers[0];
      console.log('adjusted S' + server.id + ' timeout forward');
    }
  });
};

raft.setupLogReplicationScenario = function(model) {
  var s1 = model.servers[0];
  raft.restart(model, model.servers[1]);
  raft.restart(model, model.servers[2]);
  raft.restart(model, model.servers[3]);
  raft.restart(model, model.servers[4]);
  raft.timeout(model, model.servers[0]);
  rules.startNewElection(model, s1);
  model.servers[1].term = 2;
  model.servers[2].term = 2;
  model.servers[3].term = 2;
  model.servers[4].term = 2;
  model.servers[1].votedFor = 1;
  model.servers[2].votedFor = 1;
  model.servers[3].votedFor = 1;
  model.servers[4].votedFor = 1;
  s1.voteGranted = util.makeMap(s1.peers, true);
  raft.stop(model, model.servers[2]);
  raft.stop(model, model.servers[3]);
  raft.stop(model, model.servers[4]);
  rules.becomeLeader(model, s1);
  raft.clientRequest(model, s1);
  raft.clientRequest(model, s1);
  raft.clientRequest(model, s1);
};

})();
</=></=></=></=>