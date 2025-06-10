const http = require('http');

// 创建HTTP请求的辅助函数
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const responseData = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: responseData });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testCodeReviewWithAuth() {
  console.log('🧪 测试代码审查功能（带认证）...\n');

  try {
    // 1. 先登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'admin' });

    console.log(`   状态码: ${loginResponse.status}`);
    
    if (loginResponse.status !== 200) {
      console.log('   ❌ 登录失败，无法继续测试');
      return;
    }

    const token = loginResponse.data.token;
    console.log(`   ✅ 登录成功，获取到token`);

    // 2. 获取项目列表
    console.log('\n2. 获取项目列表...');
    const projectsResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/projects',
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`   状态码: ${projectsResponse.status}`);
    console.log(`   项目数量: ${projectsResponse.data.length || 0}`);
    
    if (projectsResponse.data.length > 0) {
      console.log(`   第一个项目: ${projectsResponse.data[0].name}`);
      
      // 3. 测试GitLab提交记录获取
      const projectId = projectsResponse.data[0].id;
      console.log(`\n3. 获取项目 ${projectId} 的提交记录...`);
      
      const commitsResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/gitlab/projects/${projectId}/commits`,
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`   状态码: ${commitsResponse.status}`);
      
      if (commitsResponse.status === 200) {
        console.log(`   ✅ 成功获取 ${commitsResponse.data.length} 条提交记录`);
        if (commitsResponse.data.length > 0) {
          const firstCommit = commitsResponse.data[0];
          console.log(`   最新提交: ${firstCommit.short_id} - ${firstCommit.message.substring(0, 50)}...`);
          console.log(`   作者: ${firstCommit.author_name}`);
          console.log(`   Review状态: ${firstCommit.hasComments ? '已Review' : '待Review'}`);
        }
      } else {
        console.log(`   ❌ 获取提交记录失败: ${commitsResponse.data.message || '未知错误'}`);
        console.log(`   详细信息:`, commitsResponse.data);
      }
    } else {
      console.log('   ⚠️ 没有配置任何项目');
      console.log('   💡 提示：请先在设置页面添加GitLab项目配置');
    }

    // 4. 测试API健康检查
    console.log('\n4. 测试API健康检查...');
    const healthResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET'
    });

    console.log(`   状态码: ${healthResponse.status}`);
    console.log(`   响应: ${healthResponse.data.message || '无响应'}`);

    console.log('\n🎉 代码审查功能测试完成！');
    console.log('💡 接下来可以：');
    console.log('   1. 访问 http://localhost:3000 打开前端界面');
    console.log('   2. 使用任意用户名登录（比如：testuser）');
    console.log('   3. 在设置页面配置GitLab项目');
    console.log('   4. 在代码审查页面查看提交记录');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testCodeReviewWithAuth(); 