// 全面测试所有基础字段
const fs = require('fs')

async function testAllFields() {
  const results = []

  // 1. 登录
  const loginRes = await fetch('https://ustdai.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', password: 'dedede778843' })
  })
  const loginData = await loginRes.json()
  if (!loginData.success) {
    fs.writeFileSync('test-result.json', JSON.stringify({ error: '登录失败' }, null, 2))
    return
  }
  const token = loginData.data.token

  // 2. 测试字段
  const testFields = [
    { key: 'siteName', label: '网站名称' },
    { key: 'contactPhone', label: '联系电话' },
    { key: 'serviceEmail', label: '客服邮箱' },
    { key: 'serviceTime', label: '服务时间' },
    { key: 'companyName', label: '公司名称' },
    { key: 'companyAddress', label: '公司地址' },
    { key: 'icp', label: 'ICP备案号' },
    { key: 'copyright', label: '版权年份' },
  ]

  for (const field of testFields) {
    const testValue = 'TEST_' + field.key + '_' + Date.now()

    // 读取当前
    const getRes = await fetch('https://ustdai.com/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const getData = await getRes.json()
    const oldValue = getData.data?.[field.key]

    // 更新
    const putRes = await fetch('https://ustdai.com/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        ...getData.data,
        [field.key]: testValue,
      })
    })

    // 验证
    const verifyRes = await fetch('https://ustdai.com/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const verifyData = await verifyRes.json()
    const newValue = verifyData.data?.[field.key]

    results.push({
      key: field.key,
      label: field.label,
      oldValue: oldValue,
      testValue: testValue,
      newValue: newValue,
      success: newValue === testValue
    })
  }

  fs.writeFileSync('test-result.json', JSON.stringify(results, null, 2), 'utf-8')
  console.log('测试完成，结果已保存到 test-result.json')
  console.log('成功数:', results.filter(r => r.success).length, '/', results.length)
}

testAllFields().catch(e => {
  fs.writeFileSync('test-result.json', JSON.stringify({ error: e.message }, null, 2))
})
