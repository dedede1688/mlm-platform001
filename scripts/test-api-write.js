// 测试通过 API 保存是否会被截断
const API = 'https://ustdai.com/api/admin/settings'

async function test() {
  // 1. 登录
  const loginRes = await fetch('https://ustdai.com/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800138000', password: 'dedede778843' })
  })
  const loginData = await loginRes.json()
  if (!loginData.success) {
    console.log('登录失败:', loginData)
    return
  }
  const token = loginData.data.token
  console.log('登录成功')

  // 2. 获取当前
  const getRes = await fetch(API, { headers: { Authorization: `Bearer ${token}` } })
  const getData = await getRes.json()
  console.log('当前 companyAddress:', JSON.stringify(getData.data?.companyAddress), '长度:', getData.data?.companyAddress?.length)
  console.log('当前 companyName:', JSON.stringify(getData.data?.companyName), '长度:', getData.data?.companyName?.length)

  // 3. 通过 API 写入更长的测试值
  const longAddress = '北京市朝阳区建国路88号SOHO现代城A座1801室'
  const longName = '一个非常非常非常长的公司名称测试字符串'
  console.log('\n准备写入:')
  console.log('  期望 companyAddress:', JSON.stringify(longAddress), '长度:', longAddress.length)
  console.log('  期望 companyName:', JSON.stringify(longName), '长度:', longName.length)

  const putRes = await fetch(API, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      ...getData.data,
      companyAddress: longAddress,
      companyName: longName,
    })
  })
  console.log('\nPUT 状态:', putRes.status)

  // 4. 验证
  const verifyRes = await fetch(API, { headers: { Authorization: `Bearer ${token}` } })
  const verifyData = await verifyRes.json()
  console.log('\n验证结果:')
  console.log('  companyAddress:', JSON.stringify(verifyData.data?.companyAddress), '长度:', verifyData.data?.companyAddress?.length)
  console.log('  companyName:', JSON.stringify(verifyData.data?.companyName), '长度:', verifyData.data?.companyName?.length)

  const ok1 = verifyData.data?.companyAddress === longAddress
  const ok2 = verifyData.data?.companyName === longName
  console.log('\n结果:')
  console.log('  companyAddress 完整保存:', ok1 ? '✅' : '❌')
  console.log('  companyName 完整保存:', ok2 ? '✅' : '❌')
}

test().catch(console.error)
