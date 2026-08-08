/* ============================================================
   1v1 游戏房间 — 同时猜 + 断线检测 + 即时结束
   ============================================================ */
var rooms = new Map();
var roomIdCounter = 0;
var RECONNECT_SEC = 30;

function createRoom(pA, pB, target) {
  var id = 'room_' + (++roomIdCounter);
  var room = {
    id: id,
    playerA: pA, playerB: pB,
    target: target,
    state: 'playing',
    guessesA: [], guessesB: [],
    bankA: 8, bankB: 8,
    finishedBy: null,
    disconnected: { A: false, B: false },
    dcTimer: null,
    onDcEnd: null,
    onDcCountdown: null
  };
  rooms.set(id, room);
  return room;
}

/** 玩家断线 — 启动30秒倒计时，不立即结束 */
function playerDisconnected(ws) {
  var room = findRoomByWs(ws);
  if (!room || room.state !== 'playing') return null;

  var side = room.playerA.ws === ws ? 'A' : 'B';
  room.disconnected[side] = true;

  // 通知另一方
  var oppSide = side === 'A' ? 'B' : 'A';
  var oppWs = side === 'A' ? room.playerB.ws : room.playerA.ws;
  if (room.onDcCountdown) room.onDcCountdown(room, oppSide, RECONNECT_SEC);

  // 启动倒计时
  var remain = RECONNECT_SEC;
  room.dcTimer = setInterval(function() {
    remain--;
    if (room.onDcCountdown) room.onDcCountdown(room, oppSide, remain);
    if (remain <= 0) {
      clearInterval(room.dcTimer);
      room.state = 'finished';
      room.finishedBy = 'dc_' + side;
      if (room.onDcEnd) room.onDcEnd({ gameOver: true, winner: oppSide, dc: true });
    }
  }, 1000);

  return { side: side, room: room };
}

/** 玩家重连 — 取消倒计时，恢复游戏 */
function playerReconnected(room, side, newWs) {
  if (!room || room.state !== 'playing') return false;
  if (!room.disconnected[side]) return false;
  room.disconnected[side] = false;
  if (side === 'A') room.playerA.ws = newWs;
  else room.playerB.ws = newWs;
  if (room.dcTimer) { clearInterval(room.dcTimer); room.dcTimer = null; }
  // 通知对方
  var oppSide = side === 'A' ? 'B' : 'A';
  var oppWs = side === 'A' ? room.playerB.ws : room.playerA.ws;
  oppWs.send(JSON.stringify({ type: 'opponent_reconnected' }));
  return true;
}

function getRoom(id) { return rooms.get(id); }

function findRoomByWs(ws) {
  var all = Array.from(rooms.values());
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    // 匹配活跃 ws 或断线中的 ws
    if (r.playerA.ws === ws || r.playerB.ws === ws) {
      if (r.state === 'playing') return r;
    }
  }
  return null;
}

function submitGuess(roomId, side, name, cells, isCorrect) {
  var room = rooms.get(roomId);
  if (!room || room.state !== 'playing') return { error: '房间已结束' };
  if (room.disconnected[side]) return { error: '你已断线' };
  var bank = side === 'A' ? room.bankA : room.bankB;
  if (bank <= 0) return { error: '次数已用完' };

  var guesses = side === 'A' ? room.guessesA : room.guessesB;
  guesses.push({ name: name, cells: cells });
  if (side === 'A') room.bankA--; else room.bankB--;

  var result = {
    side: side, cells: cells, isCorrect: isCorrect,
    guessesLeft: side === 'A' ? room.bankA : room.bankB,
    gameOver: false, winner: null
  };

  if (isCorrect) {
    result.gameOver = true; result.winner = side;
    room.state = 'finished'; room.finishedBy = side;
    clearDcTimer(room);
  } else if (room.bankA === 0 && room.bankB === 0) {
    result.gameOver = true; result.winner = null;
    room.state = 'finished'; room.finishedBy = 'draw';
    clearDcTimer(room);
  }
  return result;
}

function giveUp(roomId, side) {
  var room = rooms.get(roomId);
  if (!room || room.state !== 'playing') return null;
  room.state = 'finished';
  room.finishedBy = side === 'A' ? 'B' : 'A';
  clearDcTimer(room);
  return { gameOver: true, winner: side === 'A' ? 'B' : 'A' };
}

function clearDcTimer(room) {
  if (room.dcTimer) { clearInterval(room.dcTimer); room.dcTimer = null; }
}

function destroyRoom(id) {
  var room = rooms.get(id);
  if (room) clearDcTimer(room);
  rooms.delete(id);
}

/** 根据UUID查找断线中的房间 */
function findDisconnectedByUuid(uuid) {
  var all = Array.from(rooms.values());
  for (var i = 0; i < all.length; i++) {
    var r = all[i];
    if (r.state === 'playing') {
      if (r.disconnected.A && r.playerA.uuid === uuid) return { room: r, side: 'A' };
      if (r.disconnected.B && r.playerB.uuid === uuid) return { room: r, side: 'B' };
    }
  }
  return null;
}

module.exports = {
  createRoom, getRoom, findRoomByWs, findDisconnectedByUuid,
  submitGuess, giveUp, destroyRoom,
  playerDisconnected, playerReconnected,
  RECONNECT_SEC: RECONNECT_SEC
};
