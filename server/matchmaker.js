/* ============================================================
   匹配队列引擎 - ELO范围匹配 + 等待时间扩展
   ============================================================ */

// 队列元素: { uuid, name, elo, ws, joinedAt }

var queue = [];
var matchCallbacks = []; // function(playerA, playerB)

/** 加入匹配队列 */
function joinQueue(player) {
  // 防止重复入队
  if (queue.find(function(p) { return p.uuid === player.uuid; })) {
    return { success: false, reason: 'already_in_queue' };
  }

  var entry = {
    uuid: player.uuid,
    name: player.name,
    elo: player.elo,
    ws: player.ws,
    joinedAt: Date.now()
  };
  queue.push(entry);
  return { success: true, position: queue.length };
}

/** 离开匹配队列 */
function leaveQueue(uuid) {
  var idx = queue.findIndex(function(p) { return p.uuid === uuid; });
  if (idx >= 0) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

/** 获取排队位置 */
function getPosition(uuid) {
  var idx = queue.findIndex(function(p) { return p.uuid === uuid; });
  return idx >= 0 ? idx + 1 : 0;
}

/** 队列大小 */
function queueSize() {
  return queue.length;
}

/** 监听匹配成功 */
function onMatch(callback) {
  matchCallbacks.push(callback);
}

/** 尝试匹配（每秒调用） */
function tryMatch() {
  if (queue.length < 2) return;

  // 按等待时间排序（最久的排前面）
  var now = Date.now();

  for (var i = 0; i < queue.length; i++) {
    for (var j = i + 1; j < queue.length; j++) {
      var a = queue[i];
      var b = queue[j];
      var waitMs = Math.min(now - a.joinedAt, now - b.joinedAt);
      var waitSec = waitMs / 1000;

      // ELO范围随等待时间扩展
      var eloRange;
      if (waitSec < 10) eloRange = 100;
      else if (waitSec < 30) eloRange = 200;
      else eloRange = 400;

      if (Math.abs(a.elo - b.elo) <= eloRange) {
        // 匹配成功！从队列移除
        queue.splice(j, 1);
        queue.splice(i, 1);

        // 随机决定先手
        var goesFirst = Math.random() < 0.5 ? 'a' : 'b';

        // 通知所有监听器
        var pair = goesFirst === 'a'
          ? { playerA: a, playerB: b }
          : { playerA: b, playerB: a };

        matchCallbacks.forEach(function(cb) { cb(pair); });
        return;
      }
    }
  }
}

/** 清理断线玩家 */
function removeByWs(ws) {
  var idx = queue.findIndex(function(p) { return p.ws === ws; });
  if (idx >= 0) {
    queue.splice(idx, 1);
    return true;
  }
  return false;
}

/** 启动匹配循环 */
var matchInterval = null;
function startMatchLoop() {
  if (matchInterval) return;
  matchInterval = setInterval(tryMatch, 1000);
}

function stopMatchLoop() {
  if (matchInterval) {
    clearInterval(matchInterval);
    matchInterval = null;
  }
}

module.exports = {
  joinQueue: joinQueue,
  leaveQueue: leaveQueue,
  getPosition: getPosition,
  queueSize: queueSize,
  onMatch: onMatch,
  removeByWs: removeByWs,
  startMatchLoop: startMatchLoop,
  stopMatchLoop: stopMatchLoop
};
