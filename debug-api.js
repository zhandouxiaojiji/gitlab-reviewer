const http = require('http');

// 创建HTTP请求的辅助函数
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`响应状态码: ${res.statusCode}`);
        console.log(`响应头Content-Type: ${res.headers['content-type']}`);
        
        try {
          const responseData = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: responseData, rawBody: body });
        } catch (error) {
          console.log('JSON解析失败，原始响应内容:', body.substring(0, 200));
          resolve({ status: res.statusCode, data: null, rawBody: body, error: error.message });
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

async function debugAPI() {
  console.log('🔍 调试GitLab API路由...\n');

  try {
    // 1. 测试健康检查
    console.log('1. 测试API健康检查...');
    const healthResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/health',
      method: 'GET'
    });
    console.log(`健康检查结果: ${healthResponse.status === 200 ? '✅ 正常' : '❌ 失败'}`);
    
    if (healthResponse.status !== 200) {
      console.log('❌ 服务器未正常运行，请检查后端服务');
      return;
    }

    // 2. 登录获取token
    console.log('\n2. 登录获取token...');
    const loginResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'admin' });

    if (loginResponse.status !== 200) {
      console.log('❌ 登录失败');
      return;
    }

    const token = loginResponse.data.token;
    console.log(`✅ 登录成功`);

    // 3. 获取项目列表
    console.log('\n3. 获取项目列表...');
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

    console.log(`项目列表状态: ${projectsResponse.status}`);
    console.log(`项目数量: ${projectsResponse.data?.length || 0}`);

    if (!projectsResponse.data || projectsResponse.data.length === 0) {
      console.log('⚠️ 没有配置任何项目，无法测试GitLab API');
      console.log('💡 请先在前端设置页面添加GitLab项目配置');
      return;
    }

    const firstProject = projectsResponse.data[0];
    console.log(`测试项目: ${firstProject.name} (ID: ${firstProject.id})`);

    // 4. 测试GitLab API路由
    console.log('\n4. 测试GitLab提交记录API...');
    const gitlabResponse = await makeRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/gitlab/projects/${firstProject.id}/commits`,
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    console.log(`GitLab API状态: ${gitlabResponse.status}`);
    
    if (gitlabResponse.status === 200) {
      console.log('✅ GitLab API调用成功');
      console.log('数据结构:', typeof gitlabResponse.data);
      
      if (gitlabResponse.data.commits) {
        console.log(`提交记录数量: ${gitlabResponse.data.commits.length}`);
        if (gitlabResponse.data.commits.length > 0) {
          const firstCommit = gitlabResponse.data.commits[0];
          console.log('示例提交信息:');
          console.log(`  ID: ${firstCommit.short_id}`);
          console.log(`  消息: ${firstCommit.message?.substring(0, 50)}...`);
          console.log(`  作者: ${firstCommit.author_name}`);
        }
      }
    } else {
      console.log('❌ GitLab API调用失败');
      if (gitlabResponse.data) {
        console.log('错误信息:', gitlabResponse.data.message || gitlabResponse.data);
      }
      if (gitlabResponse.rawBody && gitlabResponse.rawBody.includes('<!DOCTYPE')) {
        console.log('⚠️ 返回了HTML页面，这可能意味着路由不存在');
      }
    }

  } catch (error) {
    console.error('❌ 调试失败:', error.message);
  }
}

// 延迟5秒执行，确保服务器已启动
setTimeout(() => {
  debugAPI();
}, 5000);

console.log('⏳ 等待5秒钟让服务器启动...'); 