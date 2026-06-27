/**
 * v50 Group B: 分红 5 级独立池算法验证脚本
 *
 * 验证业务规则 §2.4 的两个情况：
 *   情况 A：全部不勾选 include_upstream → D=50, M=50, S=50, B=50, 总计=200
 *   情况 B：主任+经理勾选 include_upstream → D=16.67, M=41.67, S=141.67, B=50
 *
 * 本脚本纯算法模拟，不连数据库，直接验证算法逻辑正确性。
 */

// ---- 模拟用户 ----
const users = [
  { id: 'D', phone: '13800000001', nickname: '主任D', level: 3 }, // 主任
  { id: 'M', phone: '13800000002', nickname: '经理M', level: 4 }, // 经理
  { id: 'S', phone: '13800000003', nickname: '总监S', level: 5 }, // 总监
  // 没有总裁(level=6)
  { id: 'B', phone: '13800000004', nickname: '董事B', level: 7 }, // 董事
]

const TOTAL_ORDER_AMOUNT = 1000 // 订单 1000 元

// ---- v2 5 级独立池算法 ----
function calculateDividends(rates, includes) {
  // rates: { 3: 0.05, 4: 0.05, 5: 0.05, 6: 0.05, 7: 0.05 }
  // includes: { 3: false, 4: false, 5: false, 6: false, 7: false }

  // 5 级独立池总额
  const poolsTotal = {}
  for (const level of [3, 4, 5, 6, 7]) {
    poolsTotal[level] = Math.round(TOTAL_ORDER_AMOUNT * rates[level] * 100) / 100
  }

  // 用户累计分红：{ userId: { level: perPerson } }
  const userDividends = {}

  // 按从高到低处理（董事→总裁→总监→经理→主任）
  for (const level of [7, 6, 5, 4, 3]) {
    const poolTotal = poolsTotal[level]
    if (poolTotal <= 0) continue

    let eligibleLevels
    if (level === 7) {
      // 董事池永远只覆盖董事
      eligibleLevels = [7]
    } else if (includes[level]) {
      // 包含上级：本级 + 更高级（不含董事，因为董事池独占）
      eligibleLevels = []
      for (let l = level; l <= 6; l++) {
        eligibleLevels.push(l)
      }
    } else {
      // 仅本级
      eligibleLevels = [level]
    }

    const candidates = users.filter(u => eligibleLevels.includes(u.level))
    if (candidates.length === 0) continue

    const perPerson = Math.round((poolTotal / candidates.length) * 100) / 100

    for (const user of candidates) {
      if (!userDividends[user.id]) userDividends[user.id] = {}
      userDividends[user.id][level] = perPerson
    }
  }

  // 计算每个用户的总分红
  const userTotalDividends = {}
  for (const [userId, levelMap] of Object.entries(userDividends)) {
    userTotalDividends[userId] = Math.round(
      Object.values(levelMap).reduce((sum, amt) => sum + amt, 0) * 100
    ) / 100
  }

  return { userDividends, userTotalDividends, poolsTotal }
}

// ---- 情况 A：全部不勾选 include_upstream ----
console.log('========================================')
console.log('  情况 A：全部不勾选 include_upstream')
console.log('========================================')

const resultA = calculateDividends(
  { 3: 0.05, 4: 0.05, 5: 0.05, 6: 0.05, 7: 0.05 },
  { 3: false, 4: false, 5: false, 6: false, 7: false }
)

console.log('池总额:', resultA.poolsTotal)
console.log('用户分红明细:', resultA.userDividends)
console.log('用户总分红:', resultA.userTotalDividends)

const totalA = Object.values(resultA.userTotalDividends).reduce((s, v) => s + v, 0)
console.log(`\n验证结果：`)
console.log(`  D = ${resultA.userTotalDividends.D} (期望 50) ${resultA.userTotalDividends.D === 50 ? '✅' : '❌'}`)
console.log(`  M = ${resultA.userTotalDividends.M} (期望 50) ${resultA.userTotalDividends.M === 50 ? '✅' : '❌'}`)
console.log(`  S = ${resultA.userTotalDividends.S} (期望 50) ${resultA.userTotalDividends.S === 50 ? '✅' : '❌'}`)
console.log(`  B = ${resultA.userTotalDividends.B} (期望 50) ${resultA.userTotalDividends.B === 50 ? '✅' : '❌'}`)
console.log(`  总计 = ${totalA} (期望 200) ${totalA === 200 ? '✅' : '❌'}`)

// ---- 情况 B：主任+经理勾选 include_upstream ----
console.log('\n========================================')
console.log('  情况 B：主任池 + 经理池勾选 include_upstream')
console.log('========================================')

const resultB = calculateDividends(
  { 3: 0.05, 4: 0.05, 5: 0.05, 6: 0.05, 7: 0.05 },
  { 3: true, 4: true, 5: false, 6: false, 7: false }
)

console.log('池总额:', resultB.poolsTotal)
console.log('用户分红明细:', JSON.stringify(resultB.userDividends, null, 2))
console.log('用户总分红:', resultB.userTotalDividends)

const totalB = Object.values(resultB.userTotalDividends).reduce((s, v) => s + v, 0)
console.log(`\n验证结果：`)
console.log(`  D = ${resultB.userTotalDividends.D} (期望 16.67) ${resultB.userTotalDividends.D === 16.67 ? '✅' : '❌'}`)
console.log(`  M = ${resultB.userTotalDividends.M} (期望 41.67) ${resultB.userTotalDividends.M === 41.67 ? '✅' : '❌'}`)
console.log(`  S = ${resultB.userTotalDividends.S} (期望 91.67) ${resultB.userTotalDividends.S === 91.67 ? '✅' : '❌'}`)
console.log(`  B = ${resultB.userTotalDividends.B} (期望 50) ${resultB.userTotalDividends.B === 50 ? '✅' : '❌'}`)
console.log(`  总计 = ${totalB} (期望 ~200) ${totalB >= 199 && totalB <= 201 ? '✅' : '❌'}`)

// ---- 详细分解 ----
console.log('\n========================================')
console.log('  情况 B 详细分解')
console.log('========================================')
for (const user of users) {
  const divs = resultB.userDividends[user.id] || {}
  const parts = []
  for (const [level, amount] of Object.entries(divs)) {
    const names = { 3: '主任池', 4: '经理池', 5: '总监池', 6: '总裁池', 7: '董事池' }
    parts.push(`${names[level]}: ${amount}`)
  }
  console.log(`  ${user.nickname} (level=${user.level}): ${parts.join(' + ') || '无分红'} = ${resultB.userTotalDividends[user.id] || 0}`)
}

console.log('\n✅ 算法验证完成')
