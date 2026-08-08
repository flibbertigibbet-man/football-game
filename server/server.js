/* ============================================================
   足球球员竞猜 — 在线1v1对战服务器
   启动: node server/server.js
   ============================================================ */
var http = require('http');
var fs = require('fs');
var path = require('path');
var WebSocket = require('ws');

var db = require('./db.js');
var rating = require('./rating.js');
var matchmaker = require('./matchmaker.js');
var gameRoom = require('./game-room.js');

var PORT = process.env.PORT || 8080;
var DATA_FILE = path.join(__dirname, '..', 'data', 'players.json');

// ============ 加载球员数据库 ============
var PLAYERS = [];

function loadPlayers() {
  try {
    var raw = fs.readFileSync(DATA_FILE, 'utf8');
    PLAYERS = JSON.parse(raw);
    if (!Array.isArray(PLAYERS) || PLAYERS.length === 0) {
      throw new Error('球员数据为空或格式错误');
    }
    console.log('✅ 球员数据已加载:', PLAYERS.length, '名');
  } catch(e) {
    console.error('❌ 加载球员数据失败:', e.message);
    console.error('   文件路径:', DATA_FILE);
    process.exit(1);
  }
}

// 评估猜测（复制客户端逻辑，在服务端验证）
function serverEvaluate(guess, target) {
  var cells = [];
  cells.push({ key: 'name', value: guess.name, status: 'white', arrow: null });
  cells.push({ key: 'status', value: guess.status || '现役',
    status: (guess.status || '现役') === (target.status || '现役') ? 'green' : 'white', arrow: null });
  cells.push({ key: 'club', value: guess.club,
    status: guess.club === target.club ? 'green' : guess.league === target.league ? 'yellow' : 'white', arrow: null });
  cells.push({ key: 'nationality', value: guess.nationality,
    status: guess.nationality === target.nationality ? 'green' : guess.continent === target.continent ? 'yellow' : 'white', arrow: null });
  cells.push({ key: 'position', value: guess.position,
    status: guess.position === target.position ? 'green' : 'white', arrow: null });

  var numAttrs = [
    { key: 'worldCups', threshold: 1 },
    { key: 'ballonDor', threshold: 1 },
    { key: 'ucl', threshold: 1 },
    { key: 'age', threshold: 3 }
  ];
  numAttrs.forEach(function(attr) {
    var gv = guess[attr.key], tv = target[attr.key], diff = gv - tv;
    if (diff === 0) cells.push({ key: attr.key, value: gv, status: 'green', arrow: null });
    else if (Math.abs(diff) <= attr.threshold) cells.push({ key: attr.key, value: gv, status: 'yellow', arrow: diff < 0 ? 'up' : 'down' });
    else cells.push({ key: attr.key, value: gv, status: 'white', arrow: diff < 0 ? 'up' : 'down' });
  });

  return cells;
}

function isPerfectMatch(cells) {
  return cells.slice(1).every(function(c) { return c.status === 'green'; });
}

function findPlayerByName(name) {
  if (!name) return null;
  var q = name.trim().toLowerCase();
  for (var i = 0; i < PLAYERS.length; i++) {
    for (var j = 0; j < PLAYERS[i].aliases.length; j++) {
      if (PLAYERS[i].aliases[j].toLowerCase() === q) return PLAYERS[i];
    }
  }
  return null;
}

// ============ HTTP 静态文件服务 ============
var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

var httpServer = http.createServer(function(req, res) {
  var filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  var fullPath = path.join(__dirname, '..', filePath);

  if (!fullPath.startsWith(path.join(__dirname, '..'))) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(fullPath, function(err, data) {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    var ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ============ WebSocket 服务 ============
var wss = new WebSocket.Server({ server: httpServer });

// ws → { uuid, name } 映射
var clients = new Map();

/** 安全发送 WebSocket 消息 */
function safeSend(ws, data) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  } catch(e) {
    console.error('发送消息失败:', e.message);
  }
}

wss.on('connection', function(ws) {
  console.log('🔗 新连接');

  var clientInfo = null;

  ws.on('message', function(data) {
    var msg;
    try { msg = JSON.parse(data.toString()); }
    catch(e) { return; }

    handleMessage(ws, msg, clientInfo);
  });

  ws.on('close', function() {
    console.log('🔌 连接断开');
    matchmaker.removeByWs(ws);
    // 断线不立即判负，启动30秒倒计时
    var dcInfo = gameRoom.playerDisconnected(ws);
    if (dcInfo) {
      console.log('  玩家' + dcInfo.side + '断线，启动' + gameRoom.RECONNECT_SEC + '秒倒计时');
    }
    clients.delete(ws);
  });
});

function handleMessage(ws, msg) {
  switch (msg.type) {

    // === 身份注册 ===
    case 'register':
      var player = db.getOrCreatePlayer(msg.uuid, msg.name);
      var rank = db.getPlayerRank(msg.uuid);
      clients.set(ws, { uuid: msg.uuid, name: player.name });
      safeSend(ws, {
        type: 'registered',
        name: player.name,
        elo: player.elo,
        rank: rank
      });
      // 检查该 UUID 是否有未完成的游戏（断线重连）
      var reconnectRoom = findDisconnectedRoom(msg.uuid);
      if (reconnectRoom) {
        var reSide = reconnectRoom.side;
        var ok = gameRoom.playerReconnected(reconnectRoom.room, reSide, ws);
        if (ok) {
          safeSend(ws, { type: 'reconnected', side: reSide,
            opponent: reSide === 'A' ? reconnectRoom.room.playerB.name : reconnectRoom.room.playerA.name
          });
          clients.set(ws, { uuid: msg.uuid, name: player.name });
        }
      }
      break;

    // === 修改昵称 ===
    case 'set_name':
      if (!clients.has(ws)) return;
      var ci = clients.get(ws);
      var newName = (msg.name || '').trim().substring(0, 12);
      if (newName) {
        db.updatePlayerName(ci.uuid, newName);
        ci.name = newName;
        safeSend(ws, { type: 'name_updated', name: newName });
      }
      break;

    // === 加入匹配队列 ===
    case 'join_queue':
      if (!clients.has(ws)) return;
      var qPlayer = clients.get(ws);
      var rankInfo = db.getPlayerRank(qPlayer.uuid);
      var result = matchmaker.joinQueue({
        uuid: qPlayer.uuid,
        name: qPlayer.name,
        elo: rankInfo ? rankInfo.elo : 1000,
        ws: ws
      });
      if (result.success) {
        safeSend(ws, { type: 'queue_joined', position: result.position });
      } else {
        safeSend(ws, { type: 'error', message: '已在匹配队列中' });
      }
      break;

    // === 离开匹配队列 ===
    case 'leave_queue':
      if (!clients.has(ws)) return;
      matchmaker.leaveQueue(clients.get(ws).uuid);
      safeSend(ws, { type: 'queue_left' });
      break;

    // === 提交猜测 ===
    case 'submit_guess':
      if (!clients.has(ws)) return;
      var guessRoom = gameRoom.findRoomByWs(ws);
      if (!guessRoom) { safeSend(ws, { type: 'error', message: '无活跃房间' }); return; }

      var side = guessRoom.playerA.ws === ws ? 'A' : 'B';
      // 查找球员
      var guessPlayer = findPlayerByName(msg.name);
      if (!guessPlayer) { safeSend(ws, { type: 'error', message: '未找到该球员' }); return; }

      // 评估猜测
      var cells = serverEvaluate(guessPlayer, guessRoom.target);
      var hit = isPerfectMatch(cells);

      // 提交到房间
      var procResult = gameRoom.submitGuess(guessRoom.id, side, msg.name, cells, hit);
      if (procResult.error) { safeSend(ws, { type: 'error', message: procResult.error }); return; }

      // 生成模糊版 cells（仅颜色+箭头，不显示具体名称数值）
      var blurredCells = cells.map(function(c) {
        return { key: c.key, status: c.status, arrow: c.arrow };
      });

      // 通知猜测方（完整信息）
      safeSend(ws, {
        type: 'guess_result',
        cells: cells,
        isCorrect: hit,
        guessesLeft: procResult.guessesLeft
      });

      var oppWs = side === 'A' ? guessRoom.playerB.ws : guessRoom.playerA.ws;
      safeSend(oppWs, {
        type: 'opponent_guess',
        cells: blurredCells,
        oppGuessesLeft: procResult.guessesLeft
      });

      // 游戏结束处理
      if (procResult.gameOver) {
        handleGameEnd(guessRoom, procResult);
      }
      break;

    // === 认输 ===
    case 'give_up':
      if (!clients.has(ws)) return;
      var gvRoom = gameRoom.findRoomByWs(ws);
      if (!gvRoom) return;

      var gvSide = gvRoom.playerA.ws === ws ? 'A' : 'B';
      var gvResult = gameRoom.giveUp(gvRoom.id, gvSide);
      if (gvResult) {
        handleGameEnd(gvRoom, gvResult);
      }
      break;

    // === 获取排行榜 ===
    case 'leaderboard':
      var lb = db.getLeaderboard(100);
      safeSend(ws, { type: 'leaderboard', data: lb });
      break;

    // === 获取自己的资料 ===
    case 'player_info':
      if (!clients.has(ws)) return;
      var info = db.getPlayerInfo(clients.get(ws).uuid);
      if (info) safeSend(ws, { type: 'player_info', data: info });
      break;

    default:
      console.log('未知消息类型:', msg.type);
  }
}

function findDisconnectedRoom(uuid) {
  return gameRoom.findDisconnectedByUuid(uuid);
}

// 游戏结束处理
function handleGameEnd(room, result) {
  var pA = room.playerA, pB = room.playerB;
  var pAInfo = clients.get(pA.ws), pBInfo = clients.get(pB.ws);
  var pAUuid = pAInfo ? pAInfo.uuid : 'unknown';
  var pBUuid = pBInfo ? pBInfo.uuid : 'unknown';

  var pAElo = db.getPlayerRank(pAUuid) || { elo: 1000 };
  var pBElo = db.getPlayerRank(pBUuid) || { elo: 1000 };

  var winnerUuid = null;
  var pAGuesses = 8 - room.bankA;
  var pBGuesses = 8 - room.bankB;

  if (result.winner === 'A') {
    winnerUuid = pAUuid;
    var eloRes = rating.calculateElo(pAElo.elo, pBElo.elo, 1, 32);
    db.updateElo(pAUuid, eloRes.newA, true, false);
    db.updateElo(pBUuid, eloRes.newB, false, false);
  } else if (result.winner === 'B') {
    winnerUuid = pBUuid;
    var eloRes = rating.calculateElo(pBElo.elo, pAElo.elo, 1, 32);
    db.updateElo(pBUuid, eloRes.newA, true, false);
    db.updateElo(pAUuid, eloRes.newB, false, false);
  } else {
    // 平局
    var eloRes = rating.calculateElo(pAElo.elo, pBElo.elo, 0.5, 32);
    db.updateElo(pAUuid, eloRes.newA, false, true);
    db.updateElo(pBUuid, eloRes.newB, false, true);
  }

  // 记录比赛
  db.recordMatch(pAUuid, pBUuid, winnerUuid, pAGuesses, pBGuesses, room.target.name);

  // 通知双方
  var winnerName = null;
  if (result.winner === 'A') winnerName = pAInfo ? pAInfo.name : '玩家A';
  else if (result.winner === 'B') winnerName = pBInfo ? pBInfo.name : '玩家B';

  var endMsg = JSON.stringify({
    type: 'game_over',
    winner: result.winner,
    winnerName: winnerName,
    target: { name: room.target.name, club: room.target.club, nationality: room.target.nationality, position: room.target.position }
  });

  safeSend(pA.ws, endMsg);
  safeSend(pB.ws, endMsg);

  // 清理房间
  gameRoom.destroyRoom(room.id);
}

// ============ 匹配回调 ============
matchmaker.onMatch(function(pair) {
  var pA = pair.playerA, pB = pair.playerB;

  // 随机选择目标球员（fame 3-5，避免太冷门）
  var pool = PLAYERS.filter(function(p) { return p.fame >= 3; });
  var target = pool[Math.floor(Math.random() * pool.length)];

  // 创建房间
  var room = gameRoom.createRoom(pA, pB, target);

  // 断线倒计时回调
  room.onDcCountdown = function(r, oppSide, remain) {
    var oppWs = oppSide === 'A' ? r.playerA.ws : r.playerB.ws;
    safeSend(oppWs, { type: 'opponent_disconnected', remain: remain });
  };

  // 断线到期回调 → 另一方获胜
  room.onDcEnd = function(gResult) {
    handleGameEnd(room, gResult);
  };

  safeSend(pA.ws, {
    type: 'match_found', opponent: pB.name, opponentName: pB.name, yourSide: 'A'
  });
  safeSend(pB.ws, {
    type: 'match_found', opponent: pA.name, opponentName: pA.name, yourSide: 'B'
  });
});

// ============ 启动 ============
loadPlayers();
matchmaker.startMatchLoop();

httpServer.listen(PORT, function() {
  console.log('⚽ 足球球员竞猜在线对战服务器已启动！');
  console.log('   本地访问: http://localhost:' + PORT);
  console.log('   WebSocket: ws://localhost:' + PORT);
  console.log('   按 Ctrl+C 停止服务器\n');
});

process.on('uncaughtException', function(err) {
  console.error('❌ 未捕获异常:', err.message);
});

// 优雅关闭
process.on('SIGINT', function() {
  console.log('\n🛑 服务器关闭中...');
  matchmaker.stopMatchLoop();
  wss.close();
  httpServer.close();
  process.exit(0);
});
