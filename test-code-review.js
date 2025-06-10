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

async function testCodeReviewAPI() {
  console.log('🧪 测试代码审查API功能...\n');

  try {
    // 1. 获取项目列表
    console.log('1. 获取项目列表...');
    const projectsResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/projects',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    console.log(`   状态码: ${projectsResponse.status}`);
    console.log(`   项目数量: ${projectsResponse.data.length || 0}`);
    
    if (projectsResponse.data.length > 0) {
      console.log(`   第一个项目: ${projectsResponse.data[0].name}`);
      
      // 2. 测试GitLab提交记录获取
      const projectId = projectsResponse.data[0].id;
      console.log(`\n2. 获取项目 ${projectId} 的提交记录...`);
      
      const commitsResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/gitlab/projects/${projectId}/commits`,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
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
      }
    } else {
      console.log('   ⚠️ 没有配置任何项目，无法测试GitLab API');
    }

    // 3. 测试API健康检查
    console.log('\n3. 测试API健康检查...');
    const healthResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET'
    });

    console.log(`   状态码: ${healthResponse.status}`);
    console.log(`   响应: ${healthResponse.data.message || '无响应'}`);

    console.log('\n🎉 代码审查API测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testCodeReviewAPI(); 