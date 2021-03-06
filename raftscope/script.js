/* jshint globalstrict: true */
/* jshint browser: true */
/* jshint devel: true */
/* jshint jquery: true */
/* global util */
/* global raft */
/* global makeState */
/* global ELECTION_TIMEOUT */
/* global NUM_SERVERS */
'use strict';

var playback;
var render = {};
var state;
var record;
var replay;

$(function() {

var ARC_WIDTH = 5;

var onReplayDone = undefined;
record = function(name) {
  localStorage.setItem(name, state.exportToString());
};
replay = function(name, done) {
  state.importFromString(localStorage.getItem(name));
  render.update();
  onReplayDone = done;
};

state = makeState({
  servers: [],
  messages: [],
});

var sliding = false;

var termColors = [
  '#66c2a5',
  '#fc8d62',
  '#8da0cb',
  '#e78ac3',
  '#a6d854',
  '#ffd92f',
];

var SVG = function(tag) {
   return $(document.createElementNS('http://www.w3.org/2000/svg', tag));
};

playback = function() {
  var paused = false;
  var pause = function() {
    paused = true;
    $('#time-icon')
      .removeClass('glyphicon-time')
      .addClass('glyphicon-pause');
    $('#pause').attr('class', 'paused');
    render.update();
  };
  var resume = function() {
    if (paused) {
      paused = false;
      $('#time-icon')
        .removeClass('glyphicon-pause')
        .addClass('glyphicon-time');
      $('#pause').attr('class', 'resumed');
      render.update();
    }
  };
  return {
    pause: pause,
    resume: resume,
    toggle: function() {
      if (paused)
        resume();
      else
        pause();
    },
    isPaused: function() {
      return paused;
    },
  };
}();

(function() {
  for (var i = 1; i <= num_servers;="" i="" +="1)" {="" var="" peers="[];" for="" (var="" j="1;" <="NUM_SERVERS;" if="" (i="" !="j)" peers.push(j);="" }="" state.current.servers.push(raft.server(i,="" peers));="" })();="" svg="$('svg');" ringspec="{" cx:="" 210,="" cy:="" r:="" 150,="" };="" $('#pause').attr('transform',="" 'translate('="" ringspec.cx="" ',="" '="" ringspec.cy="" ')="" 'scale('="" ringspec.r="" 3.5="" ')');="" logsspec="{" x:="" 430,="" y:="" 50,="" width:="" 320,="" height:="" 270,="" serverspec="function(id)" coord="util.circleCoord((id" -="" 1)="" num_servers,="" ringspec.cx,="" ringspec.cy,="" ringspec.r);="" return="" coord.x,="" coord.y,="" 30,="" $('#ring',="" svg).attr(ringspec);="" servermodal;="" messagemodal;="" state.current.servers.foreach(function="" (server)="" s="serverSpec(server.id);" $('#servers',="" svg).append(="" svg('g')="" .attr('id',="" 'server-'="" server.id)="" .attr('class',="" 'server')="" .append(svg('text')="" 'serverid')="" .text('s'="" .attr(util.circlecoord((server.id="" 50)))="" .append(svg('a')="" .append(svg('circle')="" 'background')="" .attr(s))="" .append(svg('g')="" 'votes'))="" .append(svg('path')="" .attr('style',="" 'stroke-width:="" arc_width))="" 'term')="" .attr({x:="" s.cx,="" s.cy}))="" ));="" });="" message_radius="8;" messagespec="function(from," to,="" frac)="" fromspec="serverSpec(from);" tospec="serverSpec(to);" adjust="" frac="" so="" you="" start="" and="" end="" at="" the="" edge="" of="" servers="" totaldist="Math.sqrt(Math.pow(toSpec.cx" fromspec.cx,="" 2)="" math.pow(tospec.cy="" fromspec.cy,="" 2));="" travel="totalDist" fromspec.r="" tospec.r;="" totaldist)="" *="" (travel="" totaldist);="" fromspec.cx="" (tospec.cx="" fromspec.cx)="" frac,="" fromspec.cy="" (tospec.cy="" fromspec.cy)="" message_radius,="" messagearrowspec="function(from," fracs="((fromSpec.r" message_radius)="" frach="((fromSpec.r" 2*message_radius)="" [="" 'm',="" fracs,="" comma,="" 'l',="" frach,="" ].join('="" ');="" comma="," ;="" arcspec="function(spec," fraction)="" radius="spec.r" arc_width="" 2;="" spec.cx,="" spec.cy,="" radius);="" spec.cy="" radius];="" (fraction=""> 0.5) {
    s.push('A', radius, comma, radius, '0 0,1', spec.cx, spec.cy + radius);
    s.push('M', spec.cx, comma, spec.cy + radius);
  }
  s.push('A', radius, comma, radius, '0 0,1', end.x, end.y);
  return s.join(' ');
};

var timeSlider;

render.clock = function() {
  if (!sliding) {
    timeSlider.slider('setAttribute', 'max', state.getMaxTime());
    timeSlider.slider('setValue', state.current.time, false);
  }
};

var serverActions = [
  ['stop', raft.stop],
  ['resume', raft.resume],
  ['restart', raft.restart],
  ['time out', raft.timeout],
  ['request', raft.clientRequest],
];

var messageActions = [
  ['drop', raft.drop],
];

render.servers = function(serversSame) {
  state.current.servers.forEach(function(server) {
    var serverNode = $('#server-' + server.id, svg);
    $('path', serverNode)
      .attr('d', arcSpec(serverSpec(server.id),
         util.clamp((server.electionAlarm - state.current.time) /
                    (ELECTION_TIMEOUT * 2),
                    0, 1)));
    if (!serversSame) {
      $('text.term', serverNode).text(server.term);
      serverNode.attr('class', 'server ' + server.state);
      $('circle.background', serverNode)
        .attr('style', 'fill: ' +
              (server.state == 'stopped' ? 'gray'
                : termColors[server.term % termColors.length]));
      var votesGroup = $('.votes', serverNode);
      votesGroup.empty();
      if (server.state == 'candidate') {
        state.current.servers.forEach(function (peer) {
          var coord = util.circleCoord((peer.id - 1) / NUM_SERVERS,
                                       serverSpec(server.id).cx,
                                       serverSpec(server.id).cy,
                                       serverSpec(server.id).r * 5/8);
          var state;
          if (peer == server || server.voteGranted[peer.id]) {
            state = 'have';
          } else if (peer.votedFor == server.id && peer.term == server.term) {
            state = 'coming';
          } else {
            state = 'no';
          }
          var granted = (peer == server ? true : server.voteGranted[peer.id]);
          votesGroup.append(
            SVG('circle')
              .attr({
                cx: coord.x,
                cy: coord.y,
                r: 5,
              })
              .attr('class', state));
        });
      }
      serverNode
        .unbind('click')
        .click(function() {
          serverModal(state.current, server);
          return false;
        });
      if (serverNode.data('context'))
        serverNode.data('context').destroy();
      serverNode.contextmenu({
        target: '#context-menu',
        before: function(e) {
          var closemenu = this.closemenu.bind(this);
          var list = $('ul', this.getMenu());
          list.empty();
          serverActions.forEach(function(action) {
            list.append($('<li></li>')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  state.fork();
                  action[1](state.current, server);
                  state.save();
                  render.update();
                  closemenu();
                  return false;
                })));
          });
          return true;
        },
      });
    }
  });
};

render.entry = function(spec, entry, committed) {
  return SVG('g')
    .attr('class', 'entry ' + (committed ? 'committed' : 'uncommitted'))
    .append(SVG('rect')
      .attr(spec)
      .attr('stroke-dasharray', committed ? '1 0' : '5 5')
      .attr('style', 'fill: ' + termColors[entry.term % termColors.length]))
    .append(SVG('text')
      .attr({x: spec.x + spec.width / 2,
             y: spec.y + spec.height / 2})
      .text(entry.term));
};

render.logs = function() {
  var LABEL_WIDTH = 25;
  var INDEX_HEIGHT = 25;
  var logsGroup = $('.logs', svg);
  logsGroup.empty();
  logsGroup.append(
    SVG('rect')
      .attr('id', 'logsbg')
      .attr(logsSpec));
  var height = (logsSpec.height - INDEX_HEIGHT) / NUM_SERVERS;
  var leader = getLeader();
  var indexSpec = {
    x: logsSpec.x + LABEL_WIDTH + logsSpec.width * 0.05,
    y: logsSpec.y + 2*height/6,
    width: logsSpec.width * 0.9,
    height: 2*height/3,
  };
  var indexes = SVG('g')
    .attr('id', 'log-indexes');
  logsGroup.append(indexes);
  for (var index = 1; index <= 10;="" ++index)="" {="" var="" indexentryspec="{" x:="" indexspec.x="" +="" (index="" -="" 0.5)="" *="" indexspec.width="" 11,="" y:="" indexspec.y,="" width:="" height:="" indexspec.height,="" };="" indexes="" .append(svg('text')="" .attr(indexentryspec)="" .text(index));="" }="" state.current.servers.foreach(function(server)="" logspec="{" logsspec.x="" label_width="" logsspec.width="" 0.05,="" logsspec.y="" index_height="" height="" server.id="" 5*height="" 6,="" 0.9,="" 2*height="" 3,="" logentryspec="function(index)" return="" logspec.x="" 1)="" logspec.width="" logspec.y,="" logspec.height,="" log="SVG('g')" .attr('id',="" 'log-s'="" server.id);="" logsgroup.append(log);="" log.append(="" svg('text')="" .text('s'="" server.id)="" .attr('class',="" 'serverid="" '="" server.state)="" .attr({x:="" label_width*4="" 5,="" logspec.y="" logspec.height="" 2}));="" for="" (var="" index="1;" <="10;" log.append(svg('rect')="" .attr(logentryspec(index))="" 'log'));="" server.log.foreach(function(entry,="" i)="" 1;="" log.append(render.entry(="" logentryspec(index),="" entry,="" });="" if="" (leader="" !="=" null="" &&="" leader="" svg('circle')="" .attr('title',="" 'match="" index')="" .tooltip({container:="" 'body'})="" .attr({cx:="" logentryspec(leader.matchindex[server.id]="" 1).x,="" cy:="" r:="" 5}));="" x="logEntrySpec(leader.nextIndex[server.id]" 0.5).x;="" log.append(svg('path')="" 'next="" .attr('style',="" 'marker-end:url(#triangleoutm);="" stroke:="" black')="" .attr('d',="" ['m',="" x,="" comma,="" 'l',="" 6].join('="" '))="" .attr('stroke-width',="" 3));="" render.messages="function(messagesSame)" messagesgroup="$('#messages'," svg);="" (!messagessame)="" messagesgroup.empty();="" state.current.messages.foreach(function(message,="" a="SVG('a')" 'message-'="" 'message="" message.direction="" message.type)="" message.type="" message.direction)="" .append(svg('circle'))="" .append(svg('path').attr('class',="" 'message-direction'));="" (message.direction="=" 'reply')="" a.append(svg('path').attr('class',="" 'message-success'));="" messagesgroup.append(a);="" messagenode="$('a#message-'" i,="" .click(function()="" messagemodal(state.current,="" message);="" false;="" (messagenode.data('context'))="" messagenode.data('context').destroy();="" messagenode.contextmenu({="" target:="" '#context-menu',="" before:="" function(e)="" closemenu="this.closemenu.bind(this);" list="$('ul'," this.getmenu());="" list.empty();="" messageactions.foreach(function(action)="" list.append($('<li="">')
              .append($('<a href="#"></a>')
                .text(action[0])
                .click(function() {
                  state.fork();
                  action[1](state.current, message);
                  state.save();
                  render.update();
                  closemenu();
                  return true;
                })));
          });
          return true;
        },
      });
    });
  }
  state.current.messages.forEach(function(message, i) {
    var s = messageSpec(message.from, message.to,
                        (state.current.time - message.sendTime) /
                        (message.recvTime - message.sendTime));
    $('#message-' + i + ' circle', messagesGroup)
      .attr(s);
    if (message.direction == 'reply') {
      var dlist = [];
      dlist.push('M', s.cx - s.r, comma, s.cy,
                 'L', s.cx + s.r, comma, s.cy);
      if ((message.type == 'RequestVote' && message.granted) ||
          (message.type == 'AppendEntries' && message.success)) {
         dlist.push('M', s.cx, comma, s.cy - s.r,
                    'L', s.cx, comma, s.cy + s.r);
      }
      $('#message-' + i + ' path.message-success', messagesGroup)
        .attr('d', dlist.join(' '));
    }
    var dir = $('#message-' + i + ' path.message-direction', messagesGroup);
    if (playback.isPaused()) {
      dir.attr('style', 'marker-end:url(#TriangleOutS-' + message.type + ')')
         .attr('d',
           messageArrowSpec(message.from, message.to,
                            (state.current.time - message.sendTime) /
                            (message.recvTime - message.sendTime)));
    } else {
      dir.attr('style', '').attr('d', 'M 0,0'); // clear
    }
  });
};

var relTime = function(time, now) {
  if (time == util.Inf)
    return 'infinity';
  var sign = time > now ? '+' : '';
  return sign + ((time - now) / 1e3).toFixed(3) + 'ms';
};

var button = function(label) {
  return $('<button type="button" class="btn btn-default"></button>')
    .text(label);
};

serverModal = function(model, server) {
  var m = $('#modal-details');
  $('.modal-title', m).text('Server ' + server.id);
  $('.modal-dialog', m).removeClass('modal-sm').addClass('modal-lg');
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var peerTable = $('<table></table>')
    .addClass('table table-condensed')
    .append($('<tr></tr>')
      .append('<th>peer</th>')
      .append('<th>next index</th>')
      .append('<th>match index</th>')
      .append('<th>vote granted</th>')
      .append('<th>RPC due</th>')
      .append('<th>heartbeat due</th>')
    );
  server.peers.forEach(function(peer) {
    peerTable.append($('<tr></tr>')
      .append('<td>S' + peer + '</td>')
      .append('<td>' + server.nextIndex[peer] + '</td>')
      .append('<td>' + server.matchIndex[peer] + '</td>')
      .append('<td>' + server.voteGranted[peer] + '</td>')
      .append('<td>' + relTime(server.rpcDue[peer], model.time) + '</td>')
      .append('<td>' + relTime(server.heartbeatDue[peer], model.time) + '</td>')
    );
  });
  $('.modal-body', m)
    .empty()
    .append($('<dl class="dl-horizontal"></dl>')
      .append(li('state', server.state))
      .append(li('currentTerm', server.term))
      .append(li('votedFor', server.votedFor))
      .append(li('commitIndex', server.commitIndex))
      .append(li('electionAlarm', relTime(server.electionAlarm, model.time)))
      .append($('<dt>peers</dt>'))
      .append($('<dd></dd>').append(peerTable))
    );
  var footer = $('.modal-footer', m);
  footer.empty();
  serverActions.forEach(function(action) {
    footer.append(button(action[0])
      .click(function(){
        state.fork();
        action[1](model, server);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

messageModal = function(model, message) {
  var m = $('#modal-details');
  $('.modal-dialog', m).removeClass('modal-lg').addClass('modal-sm');
  $('.modal-title', m).text(message.type + ' ' + message.direction);
  var li = function(label, value) {
    return '<dt>' + label + '</dt><dd>' + value + '</dd>';
  };
  var fields = $('<dl class="dl-horizontal"></dl>')
      .append(li('from', 'S' + message.from))
      .append(li('to', 'S' + message.to))
      .append(li('sent', relTime(message.sendTime, model.time)))
      .append(li('deliver', relTime(message.recvTime, model.time)))
      .append(li('term', message.term));
  if (message.type == 'RequestVote') {
    if (message.direction == 'request') {
      fields.append(li('lastLogIndex', message.lastLogIndex));
      fields.append(li('lastLogTerm', message.lastLogTerm));
    } else {
      fields.append(li('granted', message.granted));
    }
  } else if (message.type == 'AppendEntries') {
    if (message.direction == 'request') {
      var entries = '[' + message.entries.map(function(e) {
            return e.term;
      }).join(' ') + ']';
      fields.append(li('prevIndex', message.prevIndex));
      fields.append(li('prevTerm', message.prevTerm));
      fields.append(li('entries', entries));
      fields.append(li('commitIndex', message.commitIndex));
    } else {
      fields.append(li('success', message.success));
      fields.append(li('matchIndex', message.matchIndex));
    }
  }
  $('.modal-body', m)
    .empty()
    .append(fields);
  var footer = $('.modal-footer', m);
  footer.empty();
  messageActions.forEach(function(action) {
    footer.append(button(action[0])
      .click(function(){
        state.fork();
        action[1](model, message);
        state.save();
        render.update();
        m.modal('hide');
      }));
  });
  m.modal();
};

// Transforms the simulation speed from a linear slider
// to a logarithmically scaling time factor.
var speedSliderTransform = function(v) {
  v = Math.pow(10, v);
  if (v < 1)
    return 1;
  else
    return v;
};

var lastRenderedO = null;
var lastRenderedV = null;
render.update = function() {
  // Same indicates both underlying object identity hasn't changed and its
  // value hasn't changed.
  var serversSame = false;
  var messagesSame = false;
  if (lastRenderedO == state.current) {
    serversSame = util.equals(lastRenderedV.servers, state.current.servers);
    messagesSame = util.equals(lastRenderedV.messages, state.current.messages);
  }
  lastRenderedO = state;
  lastRenderedV = state.base();
  render.clock();
  render.servers(serversSame);
  render.messages(messagesSame);
  if (!serversSame)
    render.logs();
};

(function() {
  var last = null;
  var step = function(timestamp) {
    if (!playback.isPaused() && last !== null && timestamp - last < 500) {
      var wallMicrosElapsed = (timestamp - last) * 1000;
      var speed = speedSliderTransform($('#speed').slider('getValue'));
      var modelMicrosElapsed = wallMicrosElapsed / speed;
      var modelMicros = state.current.time + modelMicrosElapsed;
      state.seek(modelMicros);
      if (modelMicros >= state.getMaxTime() && onReplayDone !== undefined) {
        var f = onReplayDone;
        onReplayDone = undefined;
        f();
      }
      render.update();
    }
    last = timestamp;
    window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
})();

$(window).keyup(function(e) {
  if (e.target.id == "title")
    return;
  var leader = getLeader();
  if (e.keyCode == ' '.charCodeAt(0) ||
      e.keyCode == 190 /* dot, emitted by Logitech remote */) {
    $('.modal').modal('hide');
    playback.toggle();
  } else if (e.keyCode == 'C'.charCodeAt(0)) {
    if (leader !== null) {
      state.fork();
      raft.clientRequest(state.current, leader);
      state.save();
      render.update();
      $('.modal').modal('hide');
    }
  } else if (e.keyCode == 'R'.charCodeAt(0)) {
    if (leader !== null) {
      state.fork();
      raft.stop(state.current, leader);
      raft.resume(state.current, leader);
      state.save();
      render.update();
      $('.modal').modal('hide');
    }
  } else if (e.keyCode == 'T'.charCodeAt(0)) {
    state.fork();
    raft.spreadTimers(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'A'.charCodeAt(0)) {
    state.fork();
    raft.alignTimers(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'L'.charCodeAt(0)) {
    state.fork();
    playback.pause();
    raft.setupLogReplicationScenario(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'B'.charCodeAt(0)) {
    state.fork();
    raft.resumeAll(state.current);
    state.save();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 'F'.charCodeAt(0)) {
    state.fork();
    render.update();
    $('.modal').modal('hide');
  } else if (e.keyCode == 191 && e.shiftKey) { /* question mark */
    playback.pause();
    $('#modal-help').modal('show');
  }
});

$('#modal-details').on('show.bs.modal', function(e) {
  playback.pause();
});

var getLeader = function() {
  var leader = null;
  var term = 0;
  state.current.servers.forEach(function(server) {
    if (server.state == 'leader' &&
        server.term > term) {
        leader = server;
        term = server.term;
    }
  });
  return leader;
};

$("#speed").slider({
  tooltip: 'always',
  formater: function(value) {
    return '1/' + speedSliderTransform(value).toFixed(0) + 'x';
  },
  reversed: true,
});

timeSlider = $('#time');
timeSlider.slider({
  tooltip: 'always',
  formater: function(value) {
    return (value / 1e6).toFixed(3) + 's';
  },
});
timeSlider.on('slideStart', function() {
  playback.pause();
  sliding = true;
});
timeSlider.on('slideStop', function() {
  // If you click rather than drag,  there won't be any slide events, so you
  // have to seek and update here too.
  state.seek(timeSlider.slider('getValue'));
  sliding = false;
  render.update();
});
timeSlider.on('slide', function() {
  state.seek(timeSlider.slider('getValue'));
  render.update();
});

$('#time-button')
  .click(function() {
    playback.toggle();
    return false;
  });

// Disabled for now, they don't seem to behave reliably.
// // enable tooltips
// $('[data-toggle="tooltip"]').tooltip();

state.updater = function(state) {
  raft.update(state.current);
  var time = state.current.time;
  var base = state.base(time);
  state.current.time = base.time;
  var same = util.equals(state.current, base);
  state.current.time = time;
  return !same;
};

state.init();
render.update();
});

</=></=>