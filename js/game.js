/* ============================================================
   足球球员竞猜游戏 — 核心逻辑 + UI
   单人模式 + 在线 1v1 对战
   ============================================================ */

// ==================== 游戏状态（单人模式） ====================
var Game = {
  difficulty: 3,
  target: null,
  phase: 'menu',       // menu | playing | reveal
  guesses: [],
  usedIds: {},
  guessesTotal: 8
};

// ==================== 战绩追踪 ====================
var STATS_KEY = 'football_guess_stats';
function loadStats() {
  try { var r = localStorage.getItem(STATS_KEY); return r ? JSON.parse(r) : getDefaultStats(); }
  catch(e) { return getDefaultStats(); }
}
function getDefaultStats() {
  return {
    playerName: '球迷',
    single: {1:{played:0,won:0,guesses:0},2:{played:0,won:0,guesses:0},3:{played:0,won:0,guesses:0},4:{played:0,won:0,guesses:0},5:{played:0,won:0,guesses:0}},
    online: { played: 0, won: 0 }
  };
}
function saveStats(s) { try { localStorage.setItem(STATS_KEY, JSON.stringify(s)) } catch(e) {} }
function recordResult(diff, won, gUsed) {
  var s = loadStats();
  s.single[diff].played++;
  if (won) { s.single[diff].won++; s.single[diff].guesses += gUsed; }
  saveStats(s);
}
function recordOnlineResult(won) {
  var s = loadStats();
  s.online.played++;
  if (won) s.online.won++;
  saveStats(s);
}

// ==================== AI 难度配置 ====================
var DIFFICULTY = {
  1: { name: '新手入门', icon: '🍼', minFame:5, maxFame:5, guesses:8, desc: '全球超巨' },
  2: { name: '足球爱好者', icon: '🎯', minFame:4, maxFame:5, guesses:8, desc: '超巨+顶级球星' },
  3: { name: '资深球迷', icon: '⚡', minFame:3, maxFame:5, guesses:8, desc: '知名球员为主' },
  4: { name: '球探专家', icon: '🔥', minFame:2, maxFame:5, guesses:8, desc: '含冷门球员' },
  5: { name: '足球百科全书', icon: '💀', minFame:1, maxFame:5, guesses:8, desc: '全部球员' }
};

function getTargetPool(diff) {
  var cfg = DIFFICULTY[diff];
  return PLAYERS.filter(function(p) { return p.fame >= cfg.minFame && p.fame <= cfg.maxFame; });
}

function getWeights() {
  try { var w = JSON.parse(localStorage.getItem('football_target_weights') || '{}');
    if (w['league_已退役'] === undefined) w['league_已退役'] = 0.3; return w; }
  catch(e) { return { 'league_已退役': 0.3 }; }
}

function pickTarget() {
  var pool = getTargetPool(Game.difficulty);
  var weights = getWeights();
  var weighted = pool.map(function(p) {
    var fw = weights['fame_' + p.fame]; if (fw === undefined || fw === null) fw = 1;
    var lw = weights['league_' + p.league]; if (lw === undefined || lw === null) lw = 1;
    var sw = weights['status_' + p.status]; if (sw === undefined || sw === null) sw = (p.status === '挂靴/赋闲' ? 0.3 : 1);
    return { player: p, weight: Math.max(0.01, fw * lw * sw) };
  });
  var total = weighted.reduce(function(s, i) { return s + i.weight }, 0);
  var r = Math.random() * total, c = 0;
  for (var i = 0; i < weighted.length; i++) { c += weighted[i].weight; if (r <= c) return weighted[i].player; }
  return weighted[weighted.length - 1].player;
}

// ==================== 匹配算法 ====================
function evaluateGuess(guess, target) {
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
  var nums = [
    { key: 'worldCups', th: 1 }, { key: 'ballonDor', th: 1 },
    { key: 'ucl', th: 1 }, { key: 'age', th: 3 }
  ];
  nums.forEach(function(a) {
    var dv = guess[a.key] - target[a.key];
    if (dv === 0) cells.push({ key: a.key, value: guess[a.key], status: 'green', arrow: null });
    else if (Math.abs(dv) <= a.th) cells.push({ key: a.key, value: guess[a.key], status: 'yellow', arrow: dv < 0 ? 'up' : 'down' });
    else cells.push({ key: a.key, value: guess[a.key], status: 'white', arrow: dv < 0 ? 'up' : 'down' });
  });
  return cells;
}
function isPerfectMatch(cells) { return cells.slice(1).every(function(c) { return c.status === 'green' }); }

// ==================== 球员搜索 ====================
function searchPlayers(query) {
  if (!query || !query.trim()) return [];
  var q = query.trim().toLowerCase(), results = [];
  PLAYERS.forEach(function(p) {
    var best = -1;
    for (var i = 0; i < p.aliases.length; i++) {
      var a = p.aliases[i].toLowerCase();
      if (a === q) { best = 0; break; }
      if (a.indexOf(q) === 0 && best < 1) best = 1;
      if (a.indexOf(q) > 0 && best < 2) best = 2;
    }
    if (best >= 0) results.push({ player: p, score: best, matchText: p.name });
  });
  results.sort(function(a, b) { return a.score - b.score });
  return results.slice(0, 8);
}
function findPlayerByName(name) {
  if (!name) return null;
  var q = name.trim().toLowerCase();
  for (var i = 0; i < PLAYERS.length; i++)
    for (var j = 0; j < PLAYERS[i].aliases.length; j++)
      if (PLAYERS[i].aliases[j].toLowerCase() === q) return PLAYERS[i];
  return null;
}

// ==================== UI 工具 ====================
var $ = function(id) { return document.getElementById(id) };
function showView(viewId) {
  ['menuView','gameView','onlineGameView'].forEach(function(v) {
    var el = $(v); if (el) el.classList.add('hidden');
  });
  var t = $(viewId); if (t) t.classList.remove('hidden');
}
function escapeHtml(s) { var d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; }
function highlightMatch(text, query) {
  var i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return escapeHtml(text);
  return escapeHtml(text.substring(0,i)) + '<mark>' + escapeHtml(text.substring(i,i+query.length)) + '</mark>' + escapeHtml(text.substring(i+query.length));
}

function renderRow(cells, playerTag, isLast) {
  var h = '<tr>';
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i], cls = 'cell-' + c.status;
    if (i === 0) cls += ' cell-name';
    var content = '';
    if (i === 0 && playerTag) content += '<span class="player-tag ' + playerTag + '">' + playerTag.toUpperCase() + '</span>';
    content += escapeHtml(String(c.value));
    if (c.arrow === 'up') content += ' <span class="cell-arrow">↑</span>';
    else if (c.arrow === 'down') content += ' <span class="cell-arrow">↓</span>';
    var delay = isLast ? ' style="animation-delay:' + (i*0.06) + 's"' : '';
    if (isLast) cls += ' flip-in';
    h += '<td class="' + cls + '"' + delay + '>' + content + '</td>';
  }
  h += '</tr>'; return h;
}

function renderDropdown(matches, dropdownId, inputId) {
  var dd = $(dropdownId), input = $(inputId);
  if (!dd) return;
  if (matches.length === 0) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
  var q = input.value.trim().toLowerCase(), h = '';
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    h += '<li data-id="' + m.player.id + '">' +
      '<span class="player-name">' + highlightMatch(m.player.name, q) + '</span>' +
      '<span class="player-context">' + escapeHtml(m.player.club + ' · ' + m.player.league) + '</span></li>';
  }
  dd.innerHTML = h; dd.classList.remove('hidden');
}

function clearInput(inputId, dropdownId, errorId) {
  $(inputId).value = '';
  var dd = $(dropdownId); if (dd) { dd.classList.add('hidden'); dd.innerHTML = ''; }
  var er = $(errorId); if (er) { er.classList.add('hidden'); er.textContent = ''; }
}
function enableInput(inputId, btnId) { $(inputId).disabled = false; $(btnId).disabled = false; }
function disableInput(inputId, btnId) { $(inputId).disabled = true; $(btnId).disabled = true; }

function showModal(title, bodyHtml, actions) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  var ah = '';
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    ah += '<button class="' + (a.primary ? 'btn-primary' : 'btn-secondary') + '" id="' + a.id + '">' + a.label + '</button>';
  }
  $('modalActions').innerHTML = ah;
  $('modalLayer').classList.remove('hidden');
  var btns = $('modalActions').querySelectorAll('button');
  for (var k = 0; k < btns.length; k++) {
    btns[k].onclick = (function(act) { return function(e) { e.preventDefault(); e.stopPropagation(); act.onClick(); }; })(actions[k]);
  }
}
function hideModal() { $('modalLayer').classList.add('hidden'); }

// ==================== 单人模式 UI ====================
function renderMenu() {
  showView('menuView');
  closeAllDrawers();
  document.querySelectorAll('.mode-card').forEach(function(c) { c.classList.remove('selected'); });
}

function closeAllDrawers() {
  document.querySelectorAll('.menu-item').forEach(function(el) { el.classList.remove('open'); });
}

function openDrawer(drawerId) {
  closeAllDrawers();
  var drawer = document.getElementById(drawerId);
  if (drawer) drawer.parentElement.classList.add('open');
}
function startSingleGame() {
  Game.target = pickTarget();
  Game.guesses = []; Game.usedIds = {};
  Game.guessesTotal = DIFFICULTY[Game.difficulty].guesses;
  Game.phase = 'playing';
  showView('gameView');
  $('guessesLeft').textContent = Game.guessesTotal;
  $('guessRows').innerHTML = '<tr><td colspan="9" class="grid-empty">输入球员名称开始猜测...</td></tr>';
  $('roundInfo').textContent = '难度: ' + DIFFICULTY[Game.difficulty].icon + ' ' + DIFFICULTY[Game.difficulty].name;
  $('errorMsg').classList.add('hidden');
  enableInput('playerInput', 'btnSubmit');
  $('playerInput').focus();
}

function submitSingleGuess() {
  if (Game.phase !== 'playing') return;
  var name = $('playerInput').value.trim();
  if (!name) { showSingleError('请输入球员名称'); return; }
  var player = findPlayerByName(name);
  if (!player) { showSingleError('未找到该球员，请从下拉列表选择'); return; }
  Game.phase = 'reveal';
  disableInput('playerInput', 'btnSubmit');
  clearInput('playerInput', 'dropdown', 'errorMsg');

  Game.guesses.push(player);
  Game.usedIds[player.id] = true;
  var used = Game.guesses.length;
  var left = Game.guessesTotal - used;
  var cells = evaluateGuess(player, Game.target);
  var hit = isPerfectMatch(cells);

  // 渲染
  var tbody = $('guessRows');
  if (used === 1) tbody.innerHTML = '';
  tbody.innerHTML += renderRow(cells, null, true);
  $('guessesLeft').textContent = left;
  if (left <= 2) $('guessesLeft').classList.add('urgent'); else $('guessesLeft').classList.remove('urgent');

  var delay = 9 * 60 + 400;
  setTimeout(function() {
    if (hit) {
      recordResult(Game.difficulty, true, used);
      var rating = used <= 1 ? '🦄 神之一手！' : used <= 3 ? '🔥 太强了！' : used <= 5 ? '👏 表现出色！' : used <= 7 ? '💪 稳稳拿下！' : '😅 险胜！';
      showModal('⚽ 恭喜猜中！',
        '<div style="font-size:40px;margin:8px 0;">🎉</div>' +
        '<div style="font-size:26px;font-weight:800;color:var(--gold);">' + Game.target.name + '</div>' +
        '<div style="font-size:13px;color:var(--text-muted);">' + Game.target.club + ' · ' + Game.target.nationality + ' · ' + Game.target.position + '</div>' +
        '<div style="margin-top:10px;">' + rating + ' · 仅用 <strong>' + used + '</strong> 次</div>',
        [
          { id: 'btnReplay', label: '🎲 再来一局', primary: true, onClick: function() { hideModal(); startSingleGame(); }},
          { id: 'btnMenu', label: '返回菜单', primary: false, onClick: function() { hideModal(); renderMenu(); }}
        ]);
    } else if (left === 0) {
      recordResult(Game.difficulty, false, 0);
      showModal('😢 本轮失败',
        '<div style="font-size:40px;">😔</div><p>机会已用完，答案是</p>' +
        '<div style="font-size:24px;font-weight:800;color:var(--gold);">' + Game.target.name + '</div>' +
        '<div style="font-size:13px;color:var(--text-muted);">' + Game.target.club + ' · ' + Game.target.nationality + ' · ' + Game.target.position + '</div>',
        [
          { id: 'btnReplay2', label: '🎲 再来一局', primary: true, onClick: function() { hideModal(); startSingleGame(); }},
          { id: 'btnMenu2', label: '返回菜单', primary: false, onClick: function() { hideModal(); renderMenu(); }}
        ]);
    } else {
      Game.phase = 'playing';
      enableInput('playerInput', 'btnSubmit');
      $('playerInput').focus();
    }
  }, delay);
}

function showSingleError(msg) {
  var el = $('errorMsg'); el.textContent = msg; el.classList.remove('hidden');
  $('playerInput').classList.add('shake');
  setTimeout(function() { $('playerInput').classList.remove('shake') }, 400);
}

function handleSingleGiveUp() {
  if (Game.phase !== 'playing') return;
  Game.phase = 'reveal';
  disableInput('playerInput', 'btnSubmit');
  recordResult(Game.difficulty, false, 0);
  showModal('🏳️ 放弃',
    '<div style="font-size:40px;">😢</div><p>你选择了放弃，答案是</p>' +
    '<div style="font-size:24px;font-weight:800;color:var(--gold);">' + Game.target.name + '</div>' +
    '<div style="font-size:13px;color:var(--text-muted);">' + Game.target.club + ' · ' + Game.target.nationality + ' · ' + Game.target.position + '</div>',
    [
      { id: 'btnReplay3', label: '🔄 再来一局', primary: true, onClick: function() { hideModal(); startSingleGame(); }},
      { id: 'btnMenu3', label: '返回菜单', primary: false, onClick: function() { hideModal(); renderMenu(); }}
    ]);
}

// ==================== 在线对战模式（同时猜 + 倒计时） ====================
var Online = {
  state: 'idle',
  oppName: '', yourSide: '', guessesLeft: 8,
  yourGuesses: [], oppGuesses: [],
  wins: 0, oppWins: 0
};

function enterOnlineLobby() {
  openDrawer('onlineDrawer');
  Online.state = 'idle';
  $('btnStartMatch').classList.add('hidden');
  $('btnCancelMatch').classList.add('hidden');
  $('matchStatus').classList.remove('hidden');
  $('matchStatus').innerHTML = '<div class="spinner"></div> 连接服务器中...';
  Network.connect();
}

function leaveOnlineLobby() {
  if (Online.state === 'queuing') Network.leaveQueue();
  Online.state = 'idle';
  closeAllDrawers();
}

// === WebSocket 事件 ===
Network.on('registered', function(msg) {
  $('onlineElo').textContent = msg.elo;
  $('onlineRank').textContent = '#' + msg.rank.rank + ' ' + onlineRankIcon(msg.elo);
  $('onlinePlayerName').textContent = msg.name;
  // 连接成功，启用匹配按钮
  if (Online.state === 'idle') {
    $('btnStartMatch').classList.remove('hidden');
    $('matchStatus').classList.add('hidden');
  }
});
Network.on('name_updated', function(msg) { $('onlinePlayerName').textContent = msg.name; });
Network.on('queue_joined', function(msg) {
  Online.state = 'queuing';
  $('btnStartMatch').classList.add('hidden');
  $('btnCancelMatch').classList.remove('hidden');
  $('matchStatus').classList.remove('hidden');
  $('matchStatus').innerHTML = '<div class="spinner"></div> 搜索对手中... 排队 #' + msg.position;
});
Network.on('queue_left', function() {
  Online.state = 'idle';
  $('btnStartMatch').classList.remove('hidden');
  $('btnCancelMatch').classList.add('hidden');
  $('matchStatus').classList.add('hidden');
});

Network.on('match_found', function(msg) {
  Online.state = 'playing';
  Online.oppName = msg.opponentName;
  Online.yourSide = msg.yourSide;
  Online.guessesLeft = 8;
  Online.yourGuesses = [];
  Online.oppGuesses = [];
  $('matchStatus').classList.add('hidden');
  closeAllDrawers();
  startOnlineDuel(msg);
});

Network.on('guess_result', function(msg) {
  Online.guessesLeft = msg.guessesLeft;
  Online.yourGuesses.push({ cells: msg.cells });
  renderYourTable();
  $('onlineYouGuesses').textContent = Online.guessesLeft + '次';
});

Network.on('opponent_guess', function(msg) {
  Online.oppGuesses.push({ cells: msg.cells });
  renderOppTable();
});

var dcInterval = null;
Network.on('opponent_disconnected', function(msg) {
  var el = $('onlineAfkWarn');
  if (!el) return;
  el.classList.remove('hidden');
  var remain = msg.remain || 30;
  $('afkCountdown').textContent = remain;
  if (dcInterval) clearInterval(dcInterval);
  dcInterval = setInterval(function() {
    remain--;
    $('afkCountdown').textContent = Math.max(0, remain);
    if (remain <= 0 && dcInterval) { clearInterval(dcInterval); dcInterval = null; }
  }, 1000);
});

Network.on('opponent_reconnected', function() {
  $('onlineAfkWarn').classList.add('hidden');
  if (dcInterval) { clearInterval(dcInterval); dcInterval = null; }
});

Network.on('reconnected', function(msg) {
  // 自己重连成功，恢复游戏界面
  Online.state = 'playing';
  Online.oppName = msg.opponent;
  showView('onlineGameView');
  enableInput('onlinePlayerInput', 'btnOnlineSubmit');
  $('onlineAfkWarn').classList.add('hidden');
  if (dcInterval) { clearInterval(dcInterval); dcInterval = null; }
});

Network.on('game_over', function(msg) {
  console.log('GAME_OVER received', msg);
  Online.state = 'gameOver';
  $('onlineAfkWarn').classList.add('hidden');
  if (dcInterval) { clearInterval(dcInterval); dcInterval = null; }
  disableInput('onlinePlayerInput', 'btnOnlineSubmit');
  var isWin = msg.winner === Online.yourSide;
  try { if (msg.winner !== null) recordOnlineResult(isWin); } catch(e) {}
  if (isWin) Online.wins++; else if (msg.winner !== null) Online.oppWins++;
  try { updateOnlineScore(); } catch(e) {}

  var icon = isWin ? '🏆' : (msg.winner === null ? '🤝' : '💔');
  var title = isWin ? '你赢了！' : (msg.winner === null ? '平局' : '你输了');
  try {
    showModal('⚔️ ' + title,
      '<div style="font-size:48px;">' + icon + '</div>' +
      '<div style="font-size:24px;font-weight:700;margin:6px 0;">' + title + '</div>' +
      '<p style="font-size:13px;color:var(--text-muted);">对手: ' + Online.oppName + '</p>' +
      '<p style="font-size:13px;color:var(--text-muted);">答案: <strong style="color:var(--gold);">' + msg.target.name + '</strong></p>' +
      '<p style="font-size:12px;color:var(--text-dim);">' + msg.target.club + ' · ' + msg.target.nationality + ' · ' + msg.target.position + '</p>',
      [
        { id: 'btnRematch', label: '🔄 再来一局', primary: true, onClick: function() { hideModal(); Online.state = 'idle'; showView('menuView'); enterOnlineLobby(); setTimeout(function(){ Network.joinQueue(); }, 500); }},
        { id: 'btnLobby', label: '返回大厅', primary: false, onClick: function() { hideModal(); Online.state = 'idle'; showView('menuView'); enterOnlineLobby(); }}
      ]);
  } catch(e) { console.error('showModal error:', e); }
});

Network.on('leaderboard', function(msg) {
  var h = '<table class="leaderboard-table"><tr><th>#</th><th>玩家</th><th>ELO</th><th>战绩</th></tr>';
  for (var i = 0; i < msg.data.length; i++) {
    var r = msg.data[i];
    h += '<tr><td>' + (i+1) + '</td><td>' + escapeHtml(r.name) + '</td><td style="color:var(--gold);">' + r.elo + '</td><td style="font-size:11px;">' + r.wins + 'W ' + r.losses + 'L</td></tr>';
  }
  h += '</table>';
  $('leaderboardBody').innerHTML = h || '<p>暂无数据</p>';
  $('leaderboardModal').classList.remove('hidden');
});
Network.on('error', function(msg) { alert('⚠ ' + msg.message); });

// === 启动在线对局 ===
function startOnlineDuel(msg) {
  showView('onlineGameView');
  $('onlineAfkWarn').classList.add('hidden');
  if (dcInterval) { clearInterval(dcInterval); dcInterval = null; }
  $('onlineYouName').textContent = getIdentity().name;
  $('onlineOppName').textContent = Online.oppName;
  $('onlineYouWins').textContent = Online.wins;
  $('onlineOppWins').textContent = Online.oppWins;
  $('onlineYouGuesses').textContent = '8次';
  $('onlineYouRows').innerHTML = '<tr><td colspan="9" class="grid-empty">开始猜测！</td></tr>';
  $('onlineOppDots').innerHTML = '<div class="grid-empty" style="padding:20px;">等待对手...</div>';
  $('onlineOppCount').textContent = '0';
  clearInput('onlinePlayerInput', 'onlineDropdown', 'onlineErrorMsg');
  enableInput('onlinePlayerInput', 'btnOnlineSubmit');
  setTimeout(function() { $('onlinePlayerInput').focus(); }, 300);
}

function updateOnlineScore() {
  $('onlineYouWins').textContent = Online.wins;
  $('onlineOppWins').textContent = Online.oppWins;
}

// === 渲染表格 ===
function renderYourTable() {
  var h = '';
  for (var i = 0; i < Online.yourGuesses.length; i++) {
    h += renderRow(Online.yourGuesses[i].cells, 'you', i === Online.yourGuesses.length - 1);
  }
  $('onlineYouRows').innerHTML = h || '<tr><td colspan="9" class="grid-empty">开始猜测！</td></tr>';
  scrollLast('onlineYouRows');
}
function renderOppTable() {
  var count = Online.oppGuesses.length;
  $('onlineOppCount').textContent = count;
  var html = '';
  for (var i = 0; i < Online.oppGuesses.length; i++) {
    var dots = '';
    for (var j = 0; j < Online.oppGuesses[i].cells.length; j++) {
      var c = Online.oppGuesses[i].cells[j];
      var cls = c.status === 'green' ? 'dot-g' : c.status === 'yellow' ? 'dot-y' : 'dot-w';
      dots += '<span class="opp-dot ' + cls + '"></span>';
    }
    html += '<div class="opp-guess-row"><span class="opp-guess-num">#' + (i + 1) + '</span>' + dots + '</div>';
  }
  if (!html) html = '<div class="grid-empty" style="padding:20px;">等待对手...</div>';
  $('onlineOppDots').innerHTML = html;
  var last = $('onlineOppDots').querySelector('.opp-guess-row:last-child');
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function scrollLast(tbodyId) {
  var rows = $(tbodyId).querySelectorAll('tr');
  if (rows.length) rows[rows.length-1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// === 提交猜测 ===
function onlineSubmitGuess() {
  if (Online.state !== 'playing') return;
  var name = $('onlinePlayerInput').value.trim();
  if (!name) { $('onlineErrorMsg').textContent = '请输入球员名称'; $('onlineErrorMsg').classList.remove('hidden'); return; }
  $('onlineErrorMsg').classList.add('hidden');
  Network.submitGuess(name);
  $('onlinePlayerInput').value = '';
  $('onlineDropdown').classList.add('hidden');
}
function onlineGiveUp() {
  if (Online.state !== 'playing') return;
  if (confirm('确定认输？')) Network.giveUp();
}
function onlineRankIcon(elo) {
  if (elo>=2400) return '👑'; if (elo>=2200) return '💎'; if (elo>=2000) return '💠';
  if (elo>=1800) return '🪙'; if (elo>=1600) return '🥇'; if (elo>=1400) return '🥈';
  if (elo>=1200) return '🥉'; return '⚫';
}

// ==================== 玩法说明 ====================
function showRules() {
  showModal('📋 玩法说明',
    '<div class="rules-content">' +
    '<h3>基本规则</h3><p>系统随机选定一名球员，通过输入球员名字来猜出目标。每次猜测后根据属性匹配程度给出颜色提示。</p>' +
    '<h3>颜色说明</h3>' +
    '<p><span class="rule-green">🟢 绿色</span> — 完全匹配：同一俱乐部、国籍、位置</p>' +
    '<p><span class="rule-yellow">🟡 黄色</span> — 部分匹配：同一联赛不同俱乐部、同一大洲不同国家</p>' +
    '<p><span class="rule-white">⚪ 灰色</span> — 不匹配</p>' +
    '<p>数值属性：相等=绿，接近(1~3)=黄+↑↓箭头，差距大=白+↑↓箭头</p>' +
    '<h3>游戏模式</h3>' +
    '<p><strong>单人挑战：</strong>8次机会，5档难度</p>' +
    '<p><strong>在线对战：</strong>匹配真实玩家1v1，轮流猜同一目标，ELO排位</p>' +
    '<h3>提示</h3><p>输入框支持中英文搜索，点击下拉列表选择。数据快照: 2026-2027赛季</p></div>',
    [{ id: 'btnCloseRules', label: '知道了', primary: true, onClick: function() { hideModal(); }}]
  );
}

// ==================== 反馈 ====================
function initFeedback() {
  var btn = $('btnFeedback'), modal = $('feedbackModal'), ta = $('feedbackText');
  if (!btn) return;
  btn.addEventListener('click', function() { modal.classList.remove('hidden'); ta.focus(); });
  $('btnFeedbackCancel').addEventListener('click', function() { modal.classList.add('hidden'); });
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.classList.add('hidden'); });
  $('btnFeedbackSubmit').addEventListener('click', function() {
    var t = ta.value.trim(); if (!t) return;
    var fbs = []; try { fbs = JSON.parse(localStorage.getItem('football_feedbacks') || '[]') } catch(e) {}
    fbs.push({ time: new Date().toISOString(), text: t });
    localStorage.setItem('football_feedbacks', JSON.stringify(fbs));
    ta.value = ''; modal.classList.add('hidden');
    alert('✅ 反馈已保存！');
  });
}

// ==================== 事件绑定 ====================
var composing = false;

/** 共享输入事件绑定 */
function bindPlayerInput(inputId, dropdownId, errorId, submitFn) {
  var input = $(inputId), dd = $(dropdownId);
  if (!input || !dd) return;
  input.addEventListener('input', function() {
    if (composing) return;
    renderDropdown(searchPlayers(input.value), dropdownId, inputId);
    var er = $(errorId); if (er) er.classList.add('hidden');
  });
  input.addEventListener('compositionstart', function() { composing = true; });
  input.addEventListener('compositionend', function() {
    composing = false;
    renderDropdown(searchPlayers(input.value), dropdownId, inputId);
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); if (composing) return;
      var act = dd.querySelector('li.active');
      if (act && !dd.classList.contains('hidden')) { input.value = findPlayerById(act.dataset.id).name; dd.classList.add('hidden'); }
      submitFn(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveDropdownSel(dropdownId, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveDropdownSel(dropdownId, -1); }
    else if (e.key === 'Escape') { dd.classList.add('hidden'); }
  });
  dd.addEventListener('mousedown', function(e) {
    e.preventDefault(); var li = e.target.closest('li');
    if (li) { input.value = findPlayerById(li.dataset.id).name; dd.classList.add('hidden'); }
  });
  input.addEventListener('blur', function() { setTimeout(function() { dd.classList.add('hidden') }, 200); });
}

function initEvents() {
  // 单人输入
  bindPlayerInput('playerInput', 'dropdown', 'errorMsg', submitSingleGuess);
  $('btnSubmit').addEventListener('click', submitSingleGuess);
  $('btnGiveUp').addEventListener('click', handleSingleGiveUp);

  // 在线输入
  bindPlayerInput('onlinePlayerInput', 'onlineDropdown', 'onlineErrorMsg', onlineSubmitGuess);
  $('btnOnlineSubmit').addEventListener('click', onlineSubmitGuess);
  $('btnOnlineGiveUp').addEventListener('click', onlineGiveUp);

  // === 菜单 ===
  var cards = document.querySelectorAll('.mode-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', function() {
      var mode = this.dataset.mode;
      if (mode === 'single') {
        openDrawer('singleDrawer');
        this.classList.add('selected');
        document.querySelector('.mode-card[data-mode="online"]').classList.remove('selected');
      } else if (mode === 'online') {
        this.classList.add('selected');
        document.querySelector('.mode-card[data-mode="single"]').classList.remove('selected');
        enterOnlineLobby();
      }
    });
  }

  // === 难度 ===
  $('btnStartSingle').addEventListener('click', function() {
    Game.difficulty = parseInt($('difficultySlider').value);
    startSingleGame();
  });
  // 抽屉返回按钮
  document.querySelectorAll('.drawer-back').forEach(function(btn) {
    btn.addEventListener('click', function() { closeAllDrawers(); });
  });

  // === 在线大厅（安全绑定） ===
  var el;
  el = $('btnStartMatch'); if (el) el.addEventListener('click', function() { Network.joinQueue(); });
  el = $('btnCancelMatch'); if (el) el.addEventListener('click', function() { Network.leaveQueue(); });
  el = $('btnShowLeaderboard'); if (el) el.addEventListener('click', function() { Network.getLeaderboard(); });
  el = $('btnCloseLeaderboard'); if (el) el.addEventListener('click', function() { $('leaderboardModal').classList.add('hidden'); });
  el = $('leaderboardModal'); if (el) el.addEventListener('click', function(e) { if (e.target === el) el.classList.add('hidden'); });

  // === 昵称 ===
  el = $('onlinePlayerName'); if (el) el.addEventListener('click', function() {
    var nn = prompt('输入新昵称（12字内）：', $('onlinePlayerName').textContent);
    if (nn && nn.trim() && nn.trim().length <= 12) {
      nn = nn.trim(); updateIdentityName(nn); Network.setName(nn);
    }
  });

  // === 全局 ===
  $('btnReset').addEventListener('click', function() {
    if (Game.phase === 'playing') { if (!confirm('确定重新开始？当前进度将丢失。')) return; }
    Game.phase = 'menu';
    renderMenu();
  });
  $('btnRules').addEventListener('click', showRules);

  // 弹窗背景关闭
  $('modalLayer').addEventListener('click', function(e) {
    if (e.target === $('modalLayer') && (Game.phase === 'reveal' || Game.phase === 'menu')) {
      hideModal(); renderMenu();
    }
  });
}

function moveDropdownSel(ddId, dir) {
  var dd = $(ddId); if (dd.classList.contains('hidden')) return;
  var items = dd.querySelectorAll('li'); if (!items.length) return;
  var ai = -1;
  for (var i = 0; i < items.length; i++) { if (items[i].classList.contains('active')) { ai = i; items[i].classList.remove('active'); break; } }
  if (ai === -1) ai = dir > 0 ? -1 : items.length;
  ai += dir; if (ai >= items.length) ai = 0; else if (ai < 0) ai = items.length - 1;
  items[ai].classList.add('active');
  items[ai].scrollIntoView({ block: 'nearest' });
}

function findPlayerById(id) {
  for (var i = 0; i < PLAYERS.length; i++) { if (PLAYERS[i].id === id) return PLAYERS[i]; }
  return null;
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function() {
  console.log('⚽ 足球球员竞猜 — ' + PLAYERS.length + ' 名球员');
  initEvents();
  initFeedback();
  renderMenu();
});
