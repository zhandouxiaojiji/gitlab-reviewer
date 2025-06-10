import express from 'express';
import { Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { projectStorage } from '../utils/storage';
import axios from 'axios';

// 定义AuthRequest接口
interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// 获取所有项目
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projects = projectStorage.findAll()
      .filter(p => p.isActive !== false)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(projects);
  } catch (error) {
    console.error('获取项目列表错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建新项目
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, gitlabUrl, accessToken, description } = req.body;

    // 验证必填字段
    if (!name || !gitlabUrl || !accessToken) {
      return res.status(400).json({ message: '项目名称、GitLab地址和访问令牌为必填项' });
    }

    // 检查项目是否已存在
    const existingProject = projectStorage.findAll().find(p => 
      p.gitlabUrl === gitlabUrl && p.isActive !== false
    );
    if (existingProject) {
      return res.status(400).json({ message: '该GitLab项目已存在' });
    }

    const project = projectStorage.create({
      name,
      gitlabUrl,
      accessToken,
      description,
      isActive: true,
      createdBy: req.user.id
    });

    res.status(201).json(project);
  } catch (error) {
    console.error('创建项目错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新项目
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, gitlabUrl, accessToken, description } = req.body;
    const projectId = req.params.id;

    const existingProject = projectStorage.findById(projectId);
    if (!existingProject) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 验证必填字段
    if (!name || !gitlabUrl || !accessToken) {
      return res.status(400).json({ message: '项目名称、GitLab地址和访问令牌为必填项' });
    }

    // 检查是否有其他项目使用相同的GitLab URL
    const duplicateProject = projectStorage.findAll().find(p => 
      p.gitlabUrl === gitlabUrl && p.id !== projectId && p.isActive !== false
    );
    if (duplicateProject) {
      return res.status(400).json({ message: '该GitLab项目已被其他配置使用' });
    }

    const updatedProject = projectStorage.update(projectId, {
      name,
      gitlabUrl,
      accessToken,
      description,
      updatedAt: new Date().toISOString()
    });

    res.json(updatedProject);
  } catch (error) {
    console.error('更新项目错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 删除项目
router.delete('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    
    const project = projectStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 软删除
    projectStorage.update(projectId, {
      isActive: false,
      deletedAt: new Date().toISOString()
    });

    res.json({ message: '项目删除成功' });
  } catch (error) {
    console.error('删除项目错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 测试GitLab连接（在创建项目前测试）
router.post('/test-connection', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { gitlabUrl, accessToken } = req.body;

    // 验证必填字段
    if (!gitlabUrl || !accessToken) {
      return res.status(400).json({ message: 'GitLab地址和访问令牌为必填项' });
    }

    // 解析GitLab URL
    let gitlabBaseUrl: string;
    try {
      const url = new URL(gitlabUrl);
      gitlabBaseUrl = `${url.protocol}//${url.host}`;
    } catch (error) {
      return res.status(400).json({ message: 'GitLab地址格式无效' });
    }

    const gitlabApiUrl = `${gitlabBaseUrl}/api/v4`;

    // 测试结果对象
    const testResults = {
      tokenValid: false,
      userInfo: null as any,
      projectsCount: 0,
      specificProjectFound: false,
      specificProjectInfo: null as any,
      permissions: {
        canRead: false,
        canWrite: false,
        canAdmin: false
      }
    };

    // 1. 验证token是否有效 - 获取当前用户信息
    try {
      const userResponse = await axios.get(`${gitlabApiUrl}/user`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      });

      if (userResponse.status === 200) {
        testResults.tokenValid = true;
        testResults.userInfo = {
          id: userResponse.data.id,
          username: userResponse.data.username,
          name: userResponse.data.name,
          email: userResponse.data.email
        };
      }
    } catch (error: any) {
      console.error('用户验证失败:', error);
      if (error.response?.status === 401) {
        return res.status(400).json({ 
          message: 'GitLab访问令牌无效或已过期',
          details: 'Token验证失败，请检查访问令牌是否正确'
        });
      }
      throw error; // 其他错误继续抛出
    }

    // 2. 获取用户可访问的项目列表
    try {
      const projectsResponse = await axios.get(`${gitlabApiUrl}/projects`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          per_page: 100,
          membership: true // 只获取用户有权限的项目
        },
        timeout: 10000
      });

      if (projectsResponse.status === 200) {
        testResults.projectsCount = projectsResponse.data.length;
      }
    } catch (error: any) {
      console.error('项目列表获取失败:', error);
      // 项目列表获取失败不影响整体测试
    }

    // 3. 尝试获取具体项目信息（如果URL包含项目路径）
    try {
      // 从URL中提取项目路径 (如 https://gitlab.com/group/project)
      const urlParts = gitlabUrl.split('/');
      if (urlParts.length >= 5) {
        const projectPath = urlParts.slice(-2).join('/'); // 获取 group/project
        
        const specificProjectResponse = await axios.get(`${gitlabApiUrl}/projects/${encodeURIComponent(projectPath)}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 10000
        });

        if (specificProjectResponse.status === 200) {
          testResults.specificProjectFound = true;
          testResults.specificProjectInfo = {
            id: specificProjectResponse.data.id,
            name: specificProjectResponse.data.name,
            path: specificProjectResponse.data.path_with_namespace,
            visibility: specificProjectResponse.data.visibility,
            lastActivity: specificProjectResponse.data.last_activity_at
          };

          // 检查权限
          const permissions = specificProjectResponse.data.permissions;
          if (permissions) {
            testResults.permissions.canRead = permissions.project_access?.access_level >= 10 || 
                                             permissions.group_access?.access_level >= 10;
            testResults.permissions.canWrite = permissions.project_access?.access_level >= 30 || 
                                              permissions.group_access?.access_level >= 30;
            testResults.permissions.canAdmin = permissions.project_access?.access_level >= 40 || 
                                               permissions.group_access?.access_level >= 40;
          }
        }
      }
    } catch (error: any) {
      console.error('具体项目信息获取失败:', error);
      if (error.response?.status === 404) {
        // 项目不存在或无权限访问
        testResults.specificProjectFound = false;
      }
      // 其他错误不影响整体测试结果
    }

    // 4. 测试提交记录访问权限（如果找到了具体项目）
    let commitsAccessible = false;
    if (testResults.specificProjectFound && testResults.specificProjectInfo) {
      try {
        const commitsResponse = await axios.get(`${gitlabApiUrl}/projects/${testResults.specificProjectInfo.id}/repository/commits`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          params: {
            per_page: 1 // 只获取1个提交测试权限
          },
          timeout: 10000
        });

        if (commitsResponse.status === 200) {
          commitsAccessible = true;
        }
      } catch (error: any) {
        console.error('提交记录访问测试失败:', error);
        // 提交记录访问失败不影响整体测试
      }
    }

    // 生成测试报告
    const testReport = {
      success: true,
      message: 'GitLab连接测试完成',
      timestamp: new Date().toISOString(),
      results: {
        tokenStatus: testResults.tokenValid ? '有效' : '无效',
        userInfo: testResults.userInfo,
        accessibleProjects: testResults.projectsCount,
        specificProject: {
          found: testResults.specificProjectFound,
          info: testResults.specificProjectInfo,
          permissions: testResults.permissions,
          commitsAccessible
        }
      },
      recommendations: [] as string[]
    };

    // 添加建议
    if (!testResults.specificProjectFound) {
      testReport.recommendations.push('未找到具体项目，请确认GitLab URL是否正确');
    }
    if (!testResults.permissions.canRead) {
      testReport.recommendations.push('当前Token对该项目没有读取权限');
    }
    if (!commitsAccessible) {
      testReport.recommendations.push('无法访问提交记录，可能需要更高的权限');
    }
    if (testResults.projectsCount === 0) {
      testReport.recommendations.push('Token没有访问任何项目的权限');
    }

    res.json(testReport);

  } catch (error: any) {
    console.error('GitLab连接测试错误:', error);
    
    // 详细的错误处理
    const errorResponse = {
      success: false,
      message: '连接测试失败',
      timestamp: new Date().toISOString(),
      error: '未知错误'
    };

    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 401:
          errorResponse.error = 'GitLab访问令牌无效或已过期';
          break;
        case 403:
          errorResponse.error = 'GitLab访问令牌权限不足';
          break;
        case 404:
          errorResponse.error = 'GitLab服务器或项目不存在';
          break;
        case 429:
          errorResponse.error = 'GitLab API请求频率限制，请稍后重试';
          break;
        case 500:
          errorResponse.error = 'GitLab服务器内部错误';
          break;
        default:
          errorResponse.error = `GitLab API错误: ${error.response.statusText} (${status})`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorResponse.error = 'GitLab服务器连接被拒绝，请检查网络连接';
    } else if (error.code === 'ENOTFOUND') {
      errorResponse.error = 'GitLab服务器地址无效，DNS解析失败';
    } else if (error.code === 'ECONNABORTED') {
      errorResponse.error = '连接超时，GitLab服务器响应缓慢';
    } else {
      errorResponse.error = error.message || '连接测试失败';
    }

    res.status(400).json(errorResponse);
  }
});

// 测试已保存项目的GitLab连接
router.post('/:id/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    
    const project = projectStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 解析GitLab URL
    let gitlabBaseUrl: string;
    try {
      const url = new URL(project.gitlabUrl);
      gitlabBaseUrl = `${url.protocol}//${url.host}`;
    } catch (error) {
      return res.status(400).json({ message: 'GitLab地址格式无效' });
    }

    const gitlabApiUrl = `${gitlabBaseUrl}/api/v4`;

    // 测试结果对象
    const testResults = {
      tokenValid: false,
      userInfo: null as any,
      projectsCount: 0,
      specificProjectFound: false,
      specificProjectInfo: null as any,
      permissions: {
        canRead: false,
        canWrite: false,
        canAdmin: false
      }
    };

    // 1. 验证token是否有效 - 获取当前用户信息
    try {
      const userResponse = await axios.get(`${gitlabApiUrl}/user`, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`
        },
        timeout: 10000
      });

      if (userResponse.status === 200) {
        testResults.tokenValid = true;
        testResults.userInfo = {
          id: userResponse.data.id,
          username: userResponse.data.username,
          name: userResponse.data.name,
          email: userResponse.data.email
        };
      }
    } catch (error: any) {
      console.error('用户验证失败:', error);
      if (error.response?.status === 401) {
        return res.status(400).json({ 
          message: 'GitLab访问令牌无效或已过期',
          details: 'Token验证失败，请检查访问令牌是否正确'
        });
      }
      throw error; // 其他错误继续抛出
    }

    // 2. 获取用户可访问的项目列表
    try {
      const projectsResponse = await axios.get(`${gitlabApiUrl}/projects`, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`
        },
        params: {
          per_page: 100,
          membership: true // 只获取用户有权限的项目
        },
        timeout: 10000
      });

      if (projectsResponse.status === 200) {
        testResults.projectsCount = projectsResponse.data.length;
      }
    } catch (error: any) {
      console.error('项目列表获取失败:', error);
      // 项目列表获取失败不影响整体测试
    }

    // 3. 尝试获取具体项目信息（如果URL包含项目路径）
    try {
      // 从URL中提取项目路径 (如 https://gitlab.com/group/project)
      const urlParts = project.gitlabUrl.split('/');
      if (urlParts.length >= 5) {
        const projectPath = urlParts.slice(-2).join('/'); // 获取 group/project
        
        const specificProjectResponse = await axios.get(`${gitlabApiUrl}/projects/${encodeURIComponent(projectPath)}`, {
          headers: {
            'Authorization': `Bearer ${project.accessToken}`
          },
          timeout: 10000
        });

        if (specificProjectResponse.status === 200) {
          testResults.specificProjectFound = true;
          testResults.specificProjectInfo = {
            id: specificProjectResponse.data.id,
            name: specificProjectResponse.data.name,
            path: specificProjectResponse.data.path_with_namespace,
            visibility: specificProjectResponse.data.visibility,
            lastActivity: specificProjectResponse.data.last_activity_at
          };

          // 检查权限
          const permissions = specificProjectResponse.data.permissions;
          if (permissions) {
            testResults.permissions.canRead = permissions.project_access?.access_level >= 10 || 
                                             permissions.group_access?.access_level >= 10;
            testResults.permissions.canWrite = permissions.project_access?.access_level >= 30 || 
                                              permissions.group_access?.access_level >= 30;
            testResults.permissions.canAdmin = permissions.project_access?.access_level >= 40 || 
                                               permissions.group_access?.access_level >= 40;
          }
        }
      }
    } catch (error: any) {
      console.error('具体项目信息获取失败:', error);
      if (error.response?.status === 404) {
        // 项目不存在或无权限访问
        testResults.specificProjectFound = false;
      }
      // 其他错误不影响整体测试结果
    }

    // 4. 测试提交记录访问权限（如果找到了具体项目）
    let commitsAccessible = false;
    if (testResults.specificProjectFound && testResults.specificProjectInfo) {
      try {
        const commitsResponse = await axios.get(`${gitlabApiUrl}/projects/${testResults.specificProjectInfo.id}/repository/commits`, {
          headers: {
            'Authorization': `Bearer ${project.accessToken}`
          },
          params: {
            per_page: 1 // 只获取1个提交测试权限
          },
          timeout: 10000
        });

        if (commitsResponse.status === 200) {
          commitsAccessible = true;
        }
      } catch (error: any) {
        console.error('提交记录访问测试失败:', error);
        // 提交记录访问失败不影响整体测试
      }
    }

    // 生成测试报告
    const testReport = {
      success: true,
      message: 'GitLab连接测试完成',
      timestamp: new Date().toISOString(),
      results: {
        tokenStatus: testResults.tokenValid ? '有效' : '无效',
        userInfo: testResults.userInfo,
        accessibleProjects: testResults.projectsCount,
        specificProject: {
          found: testResults.specificProjectFound,
          info: testResults.specificProjectInfo,
          permissions: testResults.permissions,
          commitsAccessible
        }
      },
      recommendations: [] as string[]
    };

    // 添加建议
    if (!testResults.specificProjectFound) {
      testReport.recommendations.push('未找到具体项目，请确认GitLab URL是否正确');
    }
    if (!testResults.permissions.canRead) {
      testReport.recommendations.push('当前Token对该项目没有读取权限');
    }
    if (!commitsAccessible) {
      testReport.recommendations.push('无法访问提交记录，可能需要更高的权限');
    }
    if (testResults.projectsCount === 0) {
      testReport.recommendations.push('Token没有访问任何项目的权限');
    }

    res.json(testReport);

  } catch (error: any) {
    console.error('GitLab连接测试错误:', error);
    
    // 详细的错误处理
    const errorResponse = {
      success: false,
      message: '连接测试失败',
      timestamp: new Date().toISOString(),
      error: '未知错误'
    };

    if (error.response) {
      const status = error.response.status;
      switch (status) {
        case 401:
          errorResponse.error = 'GitLab访问令牌无效或已过期';
          break;
        case 403:
          errorResponse.error = 'GitLab访问令牌权限不足';
          break;
        case 404:
          errorResponse.error = 'GitLab服务器或项目不存在';
          break;
        case 429:
          errorResponse.error = 'GitLab API请求频率限制，请稍后重试';
          break;
        case 500:
          errorResponse.error = 'GitLab服务器内部错误';
          break;
        default:
          errorResponse.error = `GitLab API错误: ${error.response.statusText} (${status})`;
      }
    } else if (error.code === 'ECONNREFUSED') {
      errorResponse.error = 'GitLab服务器连接被拒绝，请检查网络连接';
    } else if (error.code === 'ENOTFOUND') {
      errorResponse.error = 'GitLab服务器地址无效，DNS解析失败';
    } else if (error.code === 'ECONNABORTED') {
      errorResponse.error = '连接超时，GitLab服务器响应缓慢';
    } else {
      errorResponse.error = error.message || '连接测试失败';
    }

    res.status(400).json(errorResponse);
  }
});

// 获取单个项目详情
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const project = projectStorage.findById(req.params.id);

    if (!project || project.isActive === false) {
      return res.status(404).json({ message: '项目不存在' });
    }

    res.json(project);
  } catch (error) {
    console.error('获取项目详情错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

export default router; 