// 模拟 admin 保存公司地址
async function testUpdate() {
  console.log('=== 测试更新公司地址 ===')

  // 1. 登录获取 token
  const loginRes = await fetch('https://ustdai.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', password: 'dedede778843' })
  })
  const loginData = await loginRes.json()
  const token = loginData.data?.token
  console.log('登录成功, token 长度:', token?.length)

  // 2. 先 GET 当前设置
  const getRes = await fetch('https://ustdai.com/api/admin/settings', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const getData = await getRes.json()
  console.log('当前 companyAddress:', JSON.stringify(getData.data?.companyAddress))

  // 3. PUT 新地址
  const putRes = await fetch('https://ustdai.com/api/admin/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      ...getData.data,
      companyAddress: '测试新地址 - 北京市朝阳区XX路123号',
      // 不发送 banners 字段
    })
  })
  const putData = await putRes.json()
  console.log('PUT 状态:', putRes.status)
  console.log('PUT 响应:', JSON.stringify(putData).substring(0, 500))

  // 4. 再次 GET 验证
  const verifyRes = await fetch('https://ustdai.com/api/admin/settings', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const verifyData = await verifyRes.json()
  console.log('验证 - 当前 companyAddress:', JSON.stringify(verifyData.data?.companyAddress))
}

testUpdate().catch(e => console.error('测试失败:', e))
