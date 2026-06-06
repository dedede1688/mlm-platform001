// 简单的API测试脚本
const fetch = require('node-fetch');

async function testAPI() {
  console.log('测试API连接...');
  
  try {
    // 测试商品列表API
    const productsResponse = await fetch('http://localhost:3000/api/products');
    if (productsResponse.ok) {
      const products = await productsResponse.json();
      console.log('✅ 商品API正常:', products.data?.length || 0, '个商品');
    } else {
      console.log('❌ 商品API异常:', productsResponse.status);
    }
    
    // 测试用户注册API
    const registerResponse = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: '13800138000',
        password: '123456',
        nickname: '测试用户'
      })
    });
    
    if (registerResponse.ok) {
      console.log('✅ 注册API正常');
    } else {
      console.log('❌ 注册API异常:', registerResponse.status);
    }
    
  } catch (error) {
    console.log('❌ API测试失败:', error.message);
  }
}

testAPI();