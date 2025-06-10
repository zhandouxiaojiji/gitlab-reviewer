const http = require('http');

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`状态码: ${res.statusCode}`);
        console.log(`响应内容: ${body.substring(0, 100)}...`);
        resolve({ status: res.statusCode, body });
      });
    });

    req.on('error', (error) => {
      console.log(`请求失败: ${error.message}`);
      resolve({ status: 0, error: error.message });
    });
    
    req.end();
  });
}

async function testAPI() {
  console.log('测试后端服务连接...');
  
  const result = await makeRequest({
    hostname: 'localhost',
    port: 3001,
    path: '/api/health',
    method: 'GET'
  });
  
  if (result.status === 200) {
    console.log('✅ 后端服务正常运行');
  } else {
    console.log('❌ 后端服务未运行或出现错误');
  }
}

testAPI(); 