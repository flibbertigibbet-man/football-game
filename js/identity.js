/* ============================================================
   匿名身份管理 — 零点击注册，每标签页独立UUID
   多窗口可同时匹配（sessionStorage隔离）
   ============================================================ */

// 趣味形容词 + 动物名 生成随机昵称
var ADJECTIVES = [
  '灵巧','敏捷','闪电','暴风','烈焰','暗影','星光','幻影',
  '沉默','欢快','幸运','神秘','勇敢','冷静','炽热','冰霜',
  '旋风','雷霆','黎明','极光','钢铁','黄金','钻石','白银'
];
var ANIMALS = [
  '猫','虎','狼','鹰','鲨','豹','蛇','鹿',
  '狐','熊','龙','狮','鲸','鹤','燕','鸠',
  '隼','獾','獭','貂','羚','犀','鲤','鸢'
];

var UUID_KEY = 'football_uuid';    // sessionStorage — 每标签页独立
var NAME_KEY = 'football_name';    // localStorage — 跨标签页共享昵称

function randomName() {
  var adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  var ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  var num = Math.floor(Math.random() * 9000) + 1000;
  return adj + ani + '#' + num;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** 获取或创建玩家身份 — 每标签页独立UUID，共享昵称 */
function getIdentity() {
  var uuid, name;

  // UUID 用 sessionStorage（标签页隔离）
  try { uuid = sessionStorage.getItem(UUID_KEY); } catch(e) {}
  if (!uuid) {
    uuid = generateUUID();
    try { sessionStorage.setItem(UUID_KEY, uuid); } catch(e) {}
  }

  // 昵称用 localStorage（跨标签页共享，可选设置）
  try { name = localStorage.getItem(NAME_KEY); } catch(e) {}
  if (!name) {
    name = randomName();
    try { localStorage.setItem(NAME_KEY, name); } catch(e) {}
  }

  return { uuid: uuid, name: name };
}

/** 更新昵称（保存到 localStorage，所有标签页可见） */
function updateIdentityName(newName) {
  try { localStorage.setItem(NAME_KEY, newName); } catch(e) {}
}

// 暴露到全局
window.getIdentity = getIdentity;
window.updateIdentityName = updateIdentityName;
