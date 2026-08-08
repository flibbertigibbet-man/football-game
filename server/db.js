/* ============================================================
   简易 JSON 文件数据库 — 零依赖，部署无障碍
   ============================================================ */
var fs = require('fs');
var path = require('path');

var DB_PATH = path.join(__dirname, '..', 'game-data.json');

/** 读取数据库 */
function readDB() {
  try {
    var raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch(e) {
    // 首次启动，初始化空库
    return { players: {}, matches: [], nextPlayerId: 1 };
  }
}

/** 写入数据库 */
function writeDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

/** 根据 UUID 查找或创建玩家 */
function getOrCreatePlayer(uuid, name) {
  var db = readDB();
  // 已存在则返回
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    var p = db.players[keys[i]];
    if (p.uuid === uuid) return p;
  }
  // 新玩家
  var id = db.nextPlayerId++;
  var player = {
    id: id,
    uuid: uuid,
    name: name,
    elo: 1000,
    wins: 0,
    losses: 0,
    draws: 0,
    created_at: new Date().toISOString()
  };
  db.players[id] = player;
  writeDB(db);
  return player;
}

/** 更新玩家昵称 */
function updatePlayerName(uuid, name) {
  var db = readDB();
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    if (db.players[keys[i]].uuid === uuid) {
      db.players[keys[i]].name = name;
      writeDB(db);
      return;
    }
  }
}

/** 获取玩家排名信息 */
function getPlayerRank(uuid) {
  var db = readDB();
  var player = null;
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    if (db.players[keys[i]].uuid === uuid) {
      player = db.players[keys[i]];
      break;
    }
  }
  if (!player) return null;

  // 计算排名
  var rank = 1;
  for (var j = 0; j < keys.length; j++) {
    if (db.players[keys[j]].elo > player.elo) rank++;
  }

  var total = player.wins + player.losses + player.draws;
  return {
    elo: player.elo,
    rank: rank,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    total: total,
    winRate: total > 0 ? Math.round(player.wins / total * 100) : 0
  };
}

/** 更新 ELO 积分 */
function updateElo(uuid, newElo, isWin, isDraw) {
  var db = readDB();
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    if (db.players[keys[i]].uuid === uuid) {
      db.players[keys[i]].elo = newElo;
      if (isDraw) db.players[keys[i]].draws++;
      else if (isWin) db.players[keys[i]].wins++;
      else db.players[keys[i]].losses++;
      writeDB(db);
      return;
    }
  }
}

/** 排行榜 Top N */
function getLeaderboard(limit) {
  var db = readDB();
  var players = [];
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    players.push(db.players[keys[i]]);
  }
  players.sort(function(a, b) { return b.elo - a.elo; });
  return players.slice(0, limit || 100).map(function(p) {
    return {
      name: p.name,
      elo: p.elo,
      wins: p.wins,
      losses: p.losses,
      draws: p.draws,
      created_at: p.created_at
    };
  });
}

/** 获取玩家详情 */
function getPlayerInfo(uuid) {
  var db = readDB();
  var player = null;
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    if (db.players[keys[i]].uuid === uuid) {
      player = db.players[keys[i]];
      break;
    }
  }
  if (!player) return null;

  // 最近 10 场比赛
  var recent = [];
  for (var j = db.matches.length - 1; j >= 0 && recent.length < 10; j--) {
    var m = db.matches[j];
    if (m.p1_id === player.id || m.p2_id === player.id) {
      var oppId = m.p1_id === player.id ? m.p2_id : m.p1_id;
      var oppName = db.players[oppId] ? db.players[oppId].name : '未知';
      var result = m.winner === null ? 'draw' : (m.winner === player.id ? 'win' : 'loss');
      recent.push({
        opponent: oppName,
        result: result,
        target: m.target_player,
        playedAt: m.played_at
      });
    }
  }

  return {
    name: player.name,
    elo: player.elo,
    wins: player.wins,
    losses: player.losses,
    draws: player.draws,
    recentMatches: recent
  };
}

/** 记录比赛 */
function recordMatch(p1Uuid, p2Uuid, winnerUuid, p1Guesses, p2Guesses, targetPlayer) {
  var db = readDB();
  var p1Id = null, p2Id = null, winnerId = null;
  var keys = Object.keys(db.players);
  for (var i = 0; i < keys.length; i++) {
    var p = db.players[keys[i]];
    if (p.uuid === p1Uuid) p1Id = p.id;
    if (p.uuid === p2Uuid) p2Id = p.id;
    if (winnerUuid && p.uuid === winnerUuid) winnerId = p.id;
    if (p1Id && p2Id && (!winnerUuid || winnerId)) break;
  }

  var match = {
    id: db.matches.length + 1,
    p1_id: p1Id,
    p2_id: p2Id,
    winner: winnerId,
    p1_guesses: p1Guesses,
    p2_guesses: p2Guesses,
    target_player: targetPlayer,
    played_at: new Date().toISOString()
  };
  db.matches.push(match);
  writeDB(db);
  return match.id;
}

module.exports = {
  getOrCreatePlayer: getOrCreatePlayer,
  updatePlayerName: updatePlayerName,
  getPlayerRank: getPlayerRank,
  updateElo: updateElo,
  getLeaderboard: getLeaderboard,
  getPlayerInfo: getPlayerInfo,
  recordMatch: recordMatch
};
