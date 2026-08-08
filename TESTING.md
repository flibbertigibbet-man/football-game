# 🧪 足球球员竞猜 — 测试流程与手册

## 一、环境准备

### 前置条件
- [ ] Node.js 已安装（`node -v` ≥ 16）
- [ ] npm 依赖已安装（`npm install`）
- [ ] 浏览器：Chrome / Edge / Firefox 最新版

### 项目文件确认
- [ ] `data/players.json` 存在（1.16 MB，3722 名球员）
- [ ] `server/server.js` 无语法错误
- [ ] `js/network.js` 无语法错误
- [ ] `index.html` 在线对战卡片已隐藏（有 `hidden` 类）

---

## 二、启动服务器

```bash
# 在项目根目录执行
cd D:\xiaochengxu

# 启动（默认端口 8080）
node server/server.js

# 或指定端口
set PORT=3000 && node server/server.js    # Windows CMD
$env:PORT=3000; node server/server.js     # PowerShell
```

**预期输出：**
```
✅ 球员数据已加载: 3722 名
⚽ 足球球员竞猜在线对战服务器已启动！
   本地访问: http://localhost:8080
   WebSocket: ws://localhost:8080
   按 Ctrl+C 停止服务器
```

---

## 三、单人模式测试（离线功能验证）

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| 1 | 页面加载 | 打开 `http://localhost:8080` | 加载提示"加载球员数据中..." → 显示菜单 | |
| 2 | 难度选择 | 点击"单人挑战"卡片 | 展开抽屉，显示难度滑条（1-5） | |
| 3 | 滑条交互 | 拖动难度滑条 | 滑条跟随鼠标/触屏，5 个档位可切换 | |
| 4 | 开始游戏 | 选难度后点"开始挑战" | 显示游戏视图，剩余次数 8/8 | |
| 5 | 输入搜索 | 输入"哈兰德" | 下拉列表显示匹配球员，支持中英文 | |
| 6 | 键盘导航 | 按 ↑↓ 切换选项，Enter 选择 | 高亮跟随，回车选中填入输入框 | |
| 7 | 提交猜测 | 选球员后点"提交猜测" | 表格新增一行，单元格有翻转入场动画 | |
| 8 | 颜色反馈 | 多次猜测不同球员 | 绿色=匹配、黄色=接近、白色=不匹配、↑↓箭头 | |
| 9 | 猜中目标 | 正确猜出球员 | 弹窗显示 🎉 + 球员信息 + 猜测次数评级 | |
| 10 | 用完次数 | 8 次全错 | 弹窗显示失败 + 正确答案 | |
| 11 | 放弃按钮 | 点"🏳️ 放弃" | 弹窗确认 → 显示答案 | |
| 12 | 再来一局 | 结算弹窗点"再来一局" | 新游戏开始，表格清空，次数重置 | |
| 13 | 返回菜单 | 结算弹窗点"返回菜单" | 回到菜单视图 | |
| 14 | 玩法说明 | 点"玩法说明"按钮 | 弹窗显示规则和颜色说明 | |
| 15 | 重新开始 | 游戏中点"重新开始" | 确认后回到菜单 | |
| 16 | 个人主页 | 点"👤 个人"按钮 | 跳转 profile.html，显示战绩统计 | |
| 17 | 反馈功能 | 点右下角 💬 → 输入 → 提交 | 弹窗 → 输入内容 → "反馈已保存" | |

---

## 四、在线对战测试（核心功能验证）

### 4.1 准备工作

在线对战入口暂时被隐藏。测试前需要**临时恢复**：

1. 打开 `index.html`，找到第 49 行附近：
   ```html
   <!-- 在线对战卡片（暂时隐藏，等服务器就绪后删除 hidden 类即可恢复） -->
   <div class="menu-item hidden">
   ```
   删除 `hidden` 类：
   ```html
   <div class="menu-item">
   ```

2. 打开 `js/game.js`，找到 `enterOnlineLobby()` 函数，恢复原始实现：
   ```javascript
   function enterOnlineLobby() {
     // 在线对战暂未开放（服务器就绪后取消注释即可恢复）
     // console.log('在线对战暂未开放');
     // return;
     openDrawer('onlineDrawer');
     Online.state = 'idle';
     ...
     Network.connect();
   }
   ```
   改为：
   ```javascript
   function enterOnlineLobby() {
     openDrawer('onlineDrawer');
     Online.state = 'idle';
     $('btnStartMatch').classList.add('hidden');
     $('btnCancelMatch').classList.add('hidden');
     $('matchStatus').classList.remove('hidden');
     $('matchStatus').innerHTML = '<div class="spinner"></div> 连接服务器中...';
     Network.connect();
   }
   ```

3. 刷新页面。

### 4.2 双标签页测试

**打开两个浏览器标签页，都访问 `http://localhost:8080`**

> 💡 标签页 A 和标签页 B 使用不同的 `sessionStorage`，所以 UUID 独立，模拟两个不同玩家。

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| A1 | 在线大厅 | 两个标签页分别点"在线对战"卡片 | 显示玩家卡片（随机昵称 + ELO 分数 + 排名） | |
| A2 | 连接状态 | 观察大厅 | 短暂"连接服务器中..." → 显示 ELO 和排名 → "🔍 开始匹配"按钮出现 | |
| A3 | 昵称修改 | 标签页 A 点昵称 → 输入新昵称 → 确定 | 昵称更新，其他标签页也可见（共享 localStorage） | |
| A4 | 开始匹配 | 标签页 A 和 B 都点"🔍 开始匹配" | 显示"搜索对手中...排队 #1" / "#2" | |
| A5 | 匹配成功 | 等待 1-3 秒 | 两个标签页同时进入对战视图，显示 VS 界面 | |
| A6 | 对手名称 | 观察顶栏 | 标签页 A 显示自己 vs 标签页 B 的昵称，反之亦然 | |
| A7 | 提交猜测 | 标签页 A 搜索球员 → 提交 | A 的表格新增一行（完整颜色），A 的剩余次数减 1 | |
| A8 | 对手可见 | 观察标签页 B | B 的对手区域显示彩色圆点（模糊反馈），对手已猜次数 +1 | |
| A9 | 同时猜测 | A 和 B 交替猜测（不等待回合） | 双方独立猜测，各自剩余次数减少 | |
| A10 | 猜中获胜 | 标签页 A 猜中目标 | A 显示 🏆 胜利弹窗，B 显示 💔 失败弹窗 | |
| A11 | 游戏结算 | 结算弹窗 | 双方看到正确答案 + 对手昵称 + ELO 变化 | |
| A12 | 再来一局 | A 和 B 都点"🔄 再来一局" | 双方重新进入匹配 → 匹配成功 → 新游戏 | |
| A13 | 认输测试 | 开始新游戏后，A 点"🏳️ 认输" → 确认 | A 判负，B 判胜，双方看到结算弹窗 | |
| A14 | 次数耗尽 | 重新匹配，双方各猜 8 次全错 | 弹窗显示平局，双方看到正确答案 | |

### 4.3 断线重连测试

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| B1 | 断线提示 | 游戏中关闭标签页 A | 标签页 B 显示红色警告"🔌 对手已断开连接，等待重连 30s..." | |
| B2 | 倒计时 | 观察倒计时 | 从 30 倒数到 0，每秒更新 | |
| B3 | 重连恢复 | 在倒计时内重新打开标签页 A → 进入在线对战 | 标签页 B 警告消失，游戏恢复正常 | |
| B4 | 超时判负 | 重新匹配 → 关闭 A → 等待 30 秒 | 标签页 B 显示胜利，A 被判负 | |

### 4.4 排行榜测试

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| C1 | 查看排行 | 在线大厅点"🏆 排行榜" | 弹窗显示排行榜表格（排名/玩家/ELO/战绩） | |
| C2 | 排名更新 | 完成几场比赛后再查看 | 排名和 ELO 分数更新 | |
| C3 | 关闭排行 | 点"关闭"或点弹窗背景 | 排行榜关闭 | |

---

## 五、移动端测试

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| M1 | 响应式布局 | Chrome DevTools → 切换为 iPhone 14 (390×844) | 布局自适应，无横向溢出 | |
| M2 | 触屏输入 | 点击输入框，用手机模拟器或实机 | 键盘弹出，输入框不被遮挡，字体 16px 不触发缩放 | |
| M3 | 下拉菜单 | 在输入框输入球员名 | 下拉菜单正常显示，列表项可点击选中 | |
| M4 | 表格滚动 | 猜测多次后查看表格 | 表格可左右滑动，姓名列 sticky 定位不丢失 | |
| M5 | 弹窗适配 | 猜中后弹窗 | 弹窗宽度自适应，按钮不溢出 | |
| M6 | 滑条触屏 | 拖动难度滑条 | 44px 滑块触控区域充足，拖动流畅 | |
| M7 | 小屏 (320px) | Galaxy Fold 或 iPhone SE | 极端窄屏下功能完整可用 | |

---

## 六、服务器健壮性测试

| # | 测试项 | 操作 | 预期结果 | ✓ |
|---|--------|------|----------|---|
| S1 | 无效消息 | 浏览器 console 发送畸形 JSON | 服务器不崩溃，日志提示解析错误 | |
| S2 | 未注册操作 | 直接发送 `join_queue` 而不先 `register` | 服务器不崩溃，返回错误 | |
| S3 | 重复入队 | 同一玩家连续点"开始匹配" | 提示"已在匹配队列中" | |
| S4 | 未知球员名 | 提交 `submit_guess` 传不存在的球员名 | 返回"未找到该球员"错误 | |
| S5 | 异常关闭 | 按 Ctrl+C 停止服务器 | 优雅关闭，清理所有连接和房间 | |
| S6 | 未捕获异常 | 触发边缘路径 | `uncaughtException` 捕获并打印，不崩溃 | |

---

## 七、Bug 修复验证清单

以下 bug 已修复，需验证：

| # | Bug 描述 | 验证方法 | ✓ |
|---|---------|---------|---|
| F1 | 服务器用 eval() 加载球员数据 | 检查 `server/server.js`：使用 `JSON.parse(fs.readFileSync('data/players.json'))` | |
| F2 | PORT 硬编码 8080 | 检查 `server/server.js`：使用 `process.env.PORT \|\| 8080` | |
| F3 | WebSocket 不支持 wss:// | 检查 `js/network.js`：自动根据页面协议选择 ws:// 或 wss:// | |
| F4 | ws.send 无异常保护 | 检查 `server/server.js`：所有发送改用 `safeSend()` 包装 | |
| F5 | 重连间隔固定 3s | 检查 `js/network.js`：使用指数退避 2s→4s→8s→...→30s | |
| F6 | `leaveOnlineLobby()` 重复定义 | 检查 `js/game.js`：全局搜索只找到 1 个定义 | |
| F7 | `enterOnlineLobby()` 无保护 | 检查 `js/game.js`：函数体已注释，等待恢复 | |

---

## 八、快速回归测试命令

### 自动化检查（无需浏览器）

```bash
# 1. 验证 JSON 数据完整性
node -e "
var p = require('./data/players.json');
console.log('Players:', p.length);
console.log('Sample:', p[0].name, '-', p[0].club);
"

# 2. 验证服务器语法
node -e "
var fs = require('fs');
new Function(fs.readFileSync('server/server.js','utf8'));
console.log('server.js syntax OK');
new Function(fs.readFileSync('js/network.js','utf8'));
console.log('network.js syntax OK');
new Function(fs.readFileSync('js/game.js','utf8'));
console.log('game.js syntax OK');
"

# 3. 验证服务器能加载数据
node -e "
var fs = require('fs');
var p = JSON.parse(fs.readFileSync('data/players.json','utf8'));
console.log('Server can load:', p.length, 'players');
"

# 4. 静态文件完整性检查
node -e "
var fs = require('fs');
var required = ['index.html','profile.html','css/style.css',
  'js/game.js','js/identity.js','js/network.js','data/players.json'];
required.forEach(function(f) {
  if (fs.existsSync(f)) console.log('✓ ' + f);
  else console.log('✗ MISSING: ' + f);
});
"
```

### 手动测试最小路径（5 分钟）

```bash
# 终端 1：启动服务器
node server/server.js

# 终端 2：验证 HTTP 服务
curl http://localhost:8080/ | head -5          # 应返回 HTML
curl http://localhost:8080/data/players.json | head -1  # 应返回 JSON 数组

# 浏览器
# 1. 打开 http://localhost:8080
# 2. 单人模式：难度3 → 开始 → 搜索"哈兰德" → 提交 → 看到颜色反馈
# 3. 检查 Console：无红色错误，球员数据加载日志正常
```

---

## 九、测试进度追踪

- [ ] **Phase 1**：单人模式回归（17 项）
- [ ] **Phase 2**：在线对战功能（14 项）
- [ ] **Phase 3**：断线重连（4 项）
- [ ] **Phase 4**：排行榜（3 项）
- [ ] **Phase 5**：移动端适配（7 项）
- [ ] **Phase 6**：服务器健壮性（6 项）
- [ ] **Phase 7**：Bug 修复验证（7 项）

**总计：58 项测试**

---

## 十、已知限制

1. **在线对战 UI 当前隐藏**：测试 Phase 2-4 前需手动恢复（见 4.1 节）
2. **本地测试只能双标签页**：两个浏览器标签页通过不同 `sessionStorage` 模拟两个玩家，UUID 不同，WebSocket 连接独立
3. **SQLite 文件在gitignore中**：`game-data.db` 不会被提交到仓库，部署时需要初始化脚本
4. **没有 HTTPS 证书**：本地 `localhost` 使用 `ws://`，部署后用 `wss://`
5. **排行榜仅在在线模式可用**：单人模式战绩存储在 `localStorage`，不与服务器同步
