// 模拟真实登录 + 访问 stats API 的完整流程
async function testLogin() {
  console.log('=== 测试 1: 登录 ===')
  const loginRes = await fetch('https://ustdai.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', password: 'dedede778843' })
  })
  const loginData = await loginRes.json()
  console.log('登录状态:', loginRes.status)
  console.log('登录响应:', JSON.stringify(loginData, null, 2).substring(0, 500))

  if (!loginData.success) {
    console.log('登录失败，无法继续')
    return
  }

  const token = loginData.data?.token
  console.log('\nToken 前缀:', token?.substring(0, 30) + '...')
  console.log('Token 长度:', token?.length)

  console.log('\n=== 测试 2: 访问 /api/admin/stats ===')
  const statsRes = await fetch('https://ustdai.com/api/admin/stats', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const statsData = await statsRes.json()
  console.log('stats 状态:', statsRes.status)
  console.log('stats 响应:', JSON.stringify(statsData, null, 2).substring(0, 500))

  console.log('\n=== 测试 3: 访问 /api/admin/stats/trend ===')
  const trendRes = await fetch('https://ustdai.com/api/admin/stats/trend?days=7', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const trendData = await trendRes.json()
  console.log('trend 状态:', trendRes.status)
  console.log('trend 响应:', JSON.stringify(trendData, null, 2).substring(0, 500))

  console.log('\n=== 测试 4: 访问 /api/auth/me ===')
  const meRes = await fetch('https://ustdai.com/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const meData = await meRes.json()
  console.log('me 状态:', meRes.status)
  console.log('me 响应:', JSON.stringify(meData, null, 2).substring(0, 500))
}

testLogin().catch(e => console.error('测试失败:', e))
