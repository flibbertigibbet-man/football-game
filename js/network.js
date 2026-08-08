/* ============================================================
   WebSocket 客户端 — 在线对战通信
   ============================================================ */

var Network = {
  ws: null,
  connected: false,
  _everConnected: false,
  handlers: {},
  reconnectTimer: null,
  reconnectAttempts: 0,
  serverUrl: null,

  /** 连接到服务器 */
  connect: function(url) {
    var self = this;
    // 自动适配 wss://（HTTPS 页面必须用加密 WebSocket）
    self.serverUrl = url || (window.location.protocol === 'https:'
      ? 'wss://' + window.location.host
      : 'ws://' + window.location.host);
    console.log('🔗 连接服务器:', self.serverUrl);

    try {
      self.ws = new WebSocket(self.serverUrl);
    } catch(e) {
      console.error('WebSocket 连接失败:', e);
      self._showStatus('❌ 连接失败，请刷新重试');
      self._scheduleReconnect();
      return;
    }

    self.ws.onopen = function() {
      console.log('🔗 WebSocket 已连接');
      self.connected = true;
      self._everConnected = true;
      self.reconnectAttempts = 0;

      var identity = getIdentity();
      self.send({
        type: 'register',
        uuid: identity.uuid,
        name: identity.name
      });
    };

    self.ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); }
      catch(e) { return; }

      console.log('📩', msg.type, msg);
      var cbs = self.handlers[msg.type] || [];
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](msg); } catch(e) { console.error('处理消息出错:', msg.type, e); }
      }
    };

    self.ws.onclose = function(e) {
      console.log('🔌 WebSocket 断开 code:', e.code, 'reason:', e.reason);
      self.connected = false;
      self.ws = null;
      // 第一次连接就失败 → 服务器未启动或地址错误
      if (!self._everConnected && e.code !== 1000) {
        self._showStatus('❌ 无法连接服务器，请确认服务器已启动');
      } else if (e.code !== 1000) {
        self._showStatus('🔌 连接已断开，正在重连...');
      }
      self._scheduleReconnect();
    };

    self.ws.onerror = function(err) {
      console.error('WebSocket 错误（将自动重连）');
      // onclose 会紧接着触发，状态提示放在 onclose 里处理
    };
  },

  /** 发送消息 */
  send: function(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch(e) {
        console.error('发送消息失败:', e);
      }
    } else {
      console.warn('WebSocket 未连接，消息未发送:', msg.type);
    }
  },

  /** 监听事件 */
  on: function(eventType, callback) {
    if (!this.handlers[eventType]) this.handlers[eventType] = [];
    this.handlers[eventType].push(callback);
  },

  /** 取消监听 */
  off: function(eventType, callback) {
    var cbs = this.handlers[eventType];
    if (cbs) {
      var idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  },

  /** 加入匹配 */
  joinQueue: function() {
    this.send({ type: 'join_queue' });
  },

  /** 离开匹配 */
  leaveQueue: function() {
    this.send({ type: 'leave_queue' });
  },

  /** 提交猜测 */
  submitGuess: function(playerName) {
    this.send({ type: 'submit_guess', name: playerName });
  },

  /** 认输 */
  giveUp: function() {
    this.send({ type: 'give_up' });
  },

  /** 修改昵称 */
  setName: function(newName) {
    this.send({ type: 'set_name', name: newName });
  },

  /** 获取排行榜 */
  getLeaderboard: function() {
    this.send({ type: 'leaderboard' });
  },

  /** 获取个人资料 */
  getPlayerInfo: function() {
    this.send({ type: 'player_info' });
  },

  /** 断线重连（指数退避: 2s → 4s → 8s → ... → 最大30s） */
  _scheduleReconnect: function() {
    var self = this;
    if (self.reconnectTimer) return;
    var delay = Math.min(2000 * Math.pow(2, self.reconnectAttempts), 30000);
    self.reconnectAttempts++;
    console.log('🔄 ' + delay/1000 + 's 后尝试重连 (第' + self.reconnectAttempts + '次)...');
    self.reconnectTimer = setTimeout(function() {
      self.reconnectTimer = null;
      self.connect(self.serverUrl);
    }, delay);
  },

  _showStatus: function(msg) {
    var st = document.getElementById('matchStatus');
    if (st) { st.innerHTML = msg; st.classList.remove('hidden'); }
  }
};
