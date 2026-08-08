/* ============================================================
   ELO 排位算法模块
   ============================================================ */

/**
 * 计算新 ELO 分值
 * @param {number} ratingA - 玩家A当前ELO
 * @param {number} ratingB - 玩家B当前ELO
 * @param {number} scoreA - A的得分: 1=胜, 0.5=平, 0=负
 * @param {number} kFactor - K因子 (默认32)
 * @returns {{ newA: number, newB: number, deltaA: number, deltaB: number }}
 */
function calculateElo(ratingA, ratingB, scoreA, kFactor) {
  kFactor = kFactor || 32;

  // 预期得分
  var expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  var expectedB = 1 - expectedA;

  // 新分 = 旧分 + K * (实际分 - 预期分)
  var deltaA = Math.round(kFactor * (scoreA - expectedA));
  var deltaB = Math.round(kFactor * ((1 - scoreA) - expectedB));

  return {
    newA: ratingA + deltaA,
    newB: ratingB + deltaB,
    deltaA: deltaA,
    deltaB: deltaB
  };
}

/** ELO段位映射 */
function getRank(elo) {
  if (elo >= 2400) return { tier: '传奇', icon: '👑', color: '#FF4655' };
  if (elo >= 2200) return { tier: '大师', icon: '💎', color: '#9B59B6' };
  if (elo >= 2000) return { tier: '钻石', icon: '💠', color: '#3498DB' };
  if (elo >= 1800) return { tier: '铂金', icon: '🪙', color: '#2ECC71' };
  if (elo >= 1600) return { tier: '黄金', icon: '🥇', color: '#F1C40F' };
  if (elo >= 1400) return { tier: '白银', icon: '🥈', color: '#BDC3C7' };
  if (elo >= 1200) return { tier: '青铜', icon: '🥉', color: '#E67E22' };
  return { tier: '黑铁', icon: '⚫', color: '#7F8C8D' };
}

module.exports = { calculateElo: calculateElo, getRank: getRank };
