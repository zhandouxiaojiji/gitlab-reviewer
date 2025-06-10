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

async function testProjectDetailAPI() {
  console.log('🧪 测试项目详情页面GitLab API集成...\n');

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
      const firstProject = projectsResponse.data[0];
      console.log(`   项目信息: ${firstProject.name} (ID: ${firstProject.id})`);
      
      // 3. 测试项目详情API
      console.log(`\n3. 获取项目详情...`);
      const projectDetailResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/projects/${firstProject.id}`,
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`   状态码: ${projectDetailResponse.status}`);
      if (projectDetailResponse.status === 200) {
        console.log(`   ✅ 成功获取项目详情: ${projectDetailResponse.data.name}`);
        console.log(`   GitLab URL: ${projectDetailResponse.data.gitlabUrl}`);
      }

      // 4. 测试GitLab提交记录获取（这是ProjectDetail现在调用的API）
      console.log(`\n4. 获取项目 ${firstProject.id} 的GitLab提交记录...`);
      
      const commitsResponse = await makeRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/gitlab/projects/${firstProject.id}/commits`,
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log(`   状态码: ${commitsResponse.status}`);
      
      if (commitsResponse.status === 200) {
        const commits = commitsResponse.data.commits || commitsResponse.data;
        console.log(`   ✅ 成功获取 ${commits.length} 条真实提交记录`);
        
        if (commits.length > 0) {
          const firstCommit = commits[0];
          console.log(`   \n📝 示例提交信息:`);
          console.log(`   - ID: ${firstCommit.short_id} (完整: ${firstCommit.id})`);
          console.log(`   - 信息: ${firstCommit.message.substring(0, 50)}...`);
          console.log(`   - 作者: ${firstCommit.author_name}`);
          console.log(`   - 时间: ${firstCommit.committed_date}`);
          console.log(`   - Review状态: ${firstCommit.has_comments ? '已Review' : '待Review'}`);
          console.log(`   - 评论数: ${firstCommit.comments_count}`);
          
          if (firstCommit.web_url) {
            console.log(`   - GitLab链接: ${firstCommit.web_url}`);
          }
        }
      } else {
        console.log(`   ❌ 获取提交记录失败: ${commitsResponse.data.message || '未知错误'}`);
        console.log(`   详细信息:`, commitsResponse.data);
      }
    } else {
      console.log('   ⚠️ 没有配置任何项目');
      console.log('   💡 提示：请先在设置页面添加GitLab项目配置');
    }

    console.log('\n🎉 项目详情页面API测试完成！');
    console.log('💡 现在ProjectDetail页面将显示真实的GitLab提交记录，而不是模拟数据');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
testProjectDetailAPI(); 