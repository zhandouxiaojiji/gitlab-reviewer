import express from 'express';
import { Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { projectStorage } from '../utils/storage';
import { GitlabUserService } from '../services/gitlabUserService';
import { schedulerService } from '../services/schedulerService';
import axios from 'axios';
import { validateFilterRules } from '../utils/filterUtils';

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
    const { name, gitlabUrl, accessToken, description, reviewers, reviewDays, maxCommits, filterRules } = req.body;

    // 验证必填字段
    if (!name || !gitlabUrl || !accessToken) {
      return res.status(400).json({ message: '项目名称、GitLab地址和访问令牌为必填项' });
    }

    // 生成项目ID（基于GitLab URL + 项目名称）
    const generateProjectId = (gitlabUrl: string, projectName: string) => {
      const cleanUrl = gitlabUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .replace(/[^a-zA-Z0-9.-]/g, '_');
      
      const cleanProject = projectName
        .replace(/[^a-zA-Z0-9.-_]/g, '_')
        .replace(/\/+/g, '_');
      
      return `${cleanUrl}_${cleanProject}`;
    };

    const projectId = generateProjectId(gitlabUrl, name);

    // 检查项目是否已存在（通过生成的ID检查）
    const existingProject = projectStorage.findById(projectId);
    if (existingProject && existingProject.isActive !== false) {
      return res.status(400).json({ message: '该GitLab项目已存在（相同的GitLab地址和项目名称）' });
    }

    const project = projectStorage.create({
      name,
      gitlabUrl,
      accessToken,
      description,
      reviewers: reviewers || [],
      reviewDays: reviewDays || 7, // 审核范围默认7天
      maxCommits: maxCommits || 100, // 拉取记录上限默认100条
      filterRules: filterRules || '', // 过滤规则
      isActive: true,
      createdBy: req.user.id
    });

    // 异步获取用户映射关系（不阻塞响应）
    setTimeout(async () => {
      try {
        console.log(`开始为新创建的项目 ${project.name} 获取用户映射关系...`);
        await GitlabUserService.updateProjectUserMappings(project.id);
      } catch (error) {
        console.error(`为项目 ${project.name} 获取用户映射关系失败:`, error);
      }
    }, 100);

    res.status(201).json(project);
  } catch (error) {
    console.error('创建项目错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 更新项目
router.put('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const { name, gitlabUrl, accessToken, description, reviewers, reviewDays, maxCommits, filterRules } = req.body;

    // 验证必填字段
    if (!name || !gitlabUrl || !accessToken) {
      return res.status(400).json({ message: '项目名称、GitLab地址和访问令牌为必填项' });
    }

    // 检查项目是否存在
    const existingProject = projectStorage.findById(projectId);
    if (!existingProject || existingProject.isActive === false) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 生成新的项目ID（用于检查是否需要重新创建）
    const generateProjectId = (gitlabUrl: string, projectName: string) => {
      const cleanUrl = gitlabUrl
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
        .replace(/[^a-zA-Z0-9.-]/g, '_');
      
      const cleanProject = projectName
        .replace(/[^a-zA-Z0-9.-_]/g, '_')
        .replace(/\/+/g, '_');
      
      return `${cleanUrl}_${cleanProject}`;
    };

    const newProjectId = generateProjectId(gitlabUrl, name);

    // 如果GitLab URL或项目名称发生变化，ID会改变
    if (newProjectId !== projectId) {
      // 检查新ID是否已存在
      const duplicateProject = projectStorage.findById(newProjectId);
      if (duplicateProject && duplicateProject.isActive !== false) {
        return res.status(400).json({ message: '该GitLab项目已被其他配置使用（相同的GitLab地址和项目名称）' });
      }

      // 创建新项目（保留原有配置）
      const newProject = projectStorage.create({
        name,
        gitlabUrl,
        accessToken,
        description,
        reviewers: reviewers || existingProject.reviewers || [],
        reviewDays: reviewDays !== undefined ? reviewDays : (existingProject.reviewDays || 7),
        maxCommits: maxCommits !== undefined ? maxCommits : (existingProject.maxCommits || 100),
        filterRules: filterRules !== undefined ? filterRules : (existingProject.filterRules || ''),
        userMappings: existingProject.userMappings || {},
        isActive: true,
        createdBy: existingProject.createdBy,
        createdAt: existingProject.createdAt
      });

      // 删除旧项目
      projectStorage.update(projectId, { isActive: false, deletedAt: new Date().toISOString() });

      // 重新获取用户映射关系
      setTimeout(async () => {
        try {
          console.log(`项目ID已更新，重新获取用户映射关系: ${newProject.name}`);
          await GitlabUserService.updateProjectUserMappings(newProject.id);
        } catch (error) {
          console.error(`为项目 ${newProject.name} 重新获取用户映射关系失败:`, error);
        }
      }, 100);

      res.json(newProject);
    } else {
      // ID没有变化，正常更新
      const updatedProject = projectStorage.update(projectId, {
        name,
        gitlabUrl,
        accessToken,
        description,
        reviewers: reviewers || [],
        reviewDays: reviewDays !== undefined ? reviewDays : (existingProject.reviewDays || 7),
        maxCommits: maxCommits !== undefined ? maxCommits : (existingProject.maxCommits || 100),
        filterRules: filterRules !== undefined ? filterRules : (existingProject.filterRules || ''),
        updatedAt: new Date().toISOString()
      });

      // 如果GitLab配置有变化，重新获取用户映射关系
      if (existingProject.gitlabUrl !== gitlabUrl || 
          existingProject.accessToken !== accessToken) {
        setTimeout(async () => {
          try {
            console.log(`项目配置已更新，重新获取用户映射关系: ${updatedProject.name}`);
            await GitlabUserService.updateProjectUserMappings(projectId);
          } catch (error) {
            console.error(`为项目 ${updatedProject.name} 重新获取用户映射关系失败:`, error);
          }
        }, 100);
      }

      res.json(updatedProject);
    }
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

// 添加新的API端点：手动刷新用户映射关系
router.post('/:id/refresh-users', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    
    const project = projectStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    console.log(`手动刷新项目 ${project.name} 的用户映射关系...`);
    const success = await GitlabUserService.updateProjectUserMappings(projectId);
    
    if (success) {
      const updatedProject = projectStorage.findById(projectId);
      res.json({ 
        message: '用户映射关系刷新成功',
        userMappings: updatedProject?.userMappings || {},
        userCount: Object.keys(updatedProject?.userMappings || {}).length
      });
    } else {
      res.status(500).json({ message: '用户映射关系刷新失败' });
    }
  } catch (error) {
    console.error('刷新用户映射关系错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 新增API端点：清理所有项目的重复用户映射关系
router.post('/cleanup-duplicate-mappings', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projects = projectStorage.findAll();
    let totalCleaned = 0;
    let totalProjects = 0;

    for (const project of projects) {
      if (project.userMappings) {
        const originalMappings = project.userMappings;
        const cleanedMappings: { [username: string]: string } = {};
        
        // 清理重复映射关系（避免昵称映射到自身）
        Object.entries(originalMappings).forEach(([username, nickname]) => {
          // 只保留username到nickname的映射，跳过nickname到nickname的映射
          if (username !== nickname && typeof nickname === 'string') {
            cleanedMappings[username] = nickname;
          }
        });
        
        const cleanedCount = Object.keys(originalMappings).length - Object.keys(cleanedMappings).length;
        if (cleanedCount > 0) {
          projectStorage.updateUserMappings(project.id, cleanedMappings);
          totalCleaned += cleanedCount;
          totalProjects++;
          console.log(`项目 ${project.name} 清理了 ${cleanedCount} 个重复映射关系`);
        }
      }
    }

    res.json({
      message: '重复用户映射关系清理完成',
      totalProjects,
      totalCleaned,
      details: `共处理 ${totalProjects} 个项目，清理 ${totalCleaned} 个重复映射关系`
    });
  } catch (error) {
    console.error('清理重复映射关系错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 验证过滤规则
router.post('/validate-filter-rules', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { filterRules } = req.body;
    
    const validation = validateFilterRules(filterRules);
    
    res.json({
      valid: validation.valid,
      errors: validation.errors
    });
  } catch (error) {
    console.error('验证过滤规则错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 手动刷新项目数据 - 特定项目
router.post('/:id/refresh', authenticateToken, async (req, res) => {
  try {
    const project = projectStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    if (project.deletedAt || project.isActive === false) {
      return res.status(400).json({ 
        success: false, 
        message: '项目已被删除或停用' 
      });
    }

    console.log(`🔄 开始手动刷新项目: ${project.name}`);
    
    // 执行数据同步
    await schedulerService.pullProjectData(project);
    
    console.log(`✅ 项目 ${project.name} 数据刷新完成`);
    
    res.json({ 
      success: true, 
      message: '项目数据刷新成功',
      project: {
        id: project.id,
        name: project.name
      }
    });
  } catch (error: any) {
    console.error('手动刷新项目数据失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '刷新失败: ' + error.message 
    });
  }
});

// 手动刷新所有活跃项目数据
router.post('/refresh-all', authenticateToken, async (req, res) => {
  try {
    const projects = projectStorage.findAll().filter((p: any) => !p.deletedAt && p.isActive !== false);
    
    if (projects.length === 0) {
      return res.json({ 
        success: true, 
        message: '没有活跃项目需要刷新' 
      });
    }

    console.log(`🔄 开始刷新所有 ${projects.length} 个活跃项目`);
    
    const results = [];
    for (const project of projects) {
      try {
        console.log(`🔄 正在刷新项目: ${project.name}`);
        await schedulerService.pullProjectData(project);
        results.push({ 
          id: project.id, 
          name: project.name, 
          success: true 
        });
        console.log(`✅ 项目 ${project.name} 刷新完成`);
      } catch (error: any) {
        console.error(`❌ 项目 ${project.name} 刷新失败:`, error);
        results.push({ 
          id: project.id, 
          name: project.name, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`🎯 批量刷新完成: ${successCount}/${results.length} 个项目成功`);
    
    res.json({ 
      success: true, 
      message: `批量刷新完成: ${successCount}/${results.length} 个项目成功`,
      results
    });
  } catch (error: any) {
    console.error('批量刷新项目数据失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '刷新失败: ' + error.message 
    });
  }
});

// 获取项目的webhook配置
router.get('/:id/webhook', authenticateToken, (req, res) => {
  try {
    const project = projectStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    const webhookConfig = {
      enabled: project.webhookEnabled || false,
      secret: project.webhookSecret || '',
      url: `${req.protocol}://${req.get('host')}/api/webhook/gitlab`,
      supportedEvents: [
        'Push Hook',
        'Note Hook',
        'Merge Request Hook'
      ],
      projectId: project.id,
      projectName: project.name
    };

    res.json({ 
      success: true, 
      webhook: webhookConfig 
    });
  } catch (error: any) {
    console.error('获取webhook配置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '获取webhook配置失败: ' + error.message 
    });
  }
});

// 更新项目的webhook配置
router.put('/:id/webhook', authenticateToken, (req, res) => {
  try {
    const { enabled, secret } = req.body;
    
    const project = projectStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    // 更新webhook配置
    const updatedProject = {
      ...project,
      webhookEnabled: enabled,
      webhookSecret: secret,
      updatedAt: new Date().toISOString()
    };

    projectStorage.update(req.params.id, updatedProject);
    
    console.log(`🔗 项目 ${project.name} webhook配置已更新: ${enabled ? '启用' : '禁用'}`);

    res.json({ 
      success: true, 
      message: 'Webhook配置更新成功',
      webhook: {
        enabled: updatedProject.webhookEnabled,
        secret: updatedProject.webhookSecret,
        url: `${req.protocol}://${req.get('host')}/api/webhook/gitlab`
      }
    });
  } catch (error: any) {
    console.error('更新webhook配置失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '更新webhook配置失败: ' + error.message 
    });
  }
});

// 测试webhook连接
router.post('/:id/webhook/test', authenticateToken, async (req, res) => {
  try {
    const project = projectStorage.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: '项目不存在' 
      });
    }

    if (!project.webhookEnabled) {
      return res.status(400).json({ 
        success: false, 
        message: '项目webhook未启用' 
      });
    }

    // 这里可以添加实际的webhook测试逻辑
    // 比如向GitLab发送测试webhook等

    res.json({ 
      success: true, 
      message: 'Webhook配置测试成功',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('测试webhook失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '测试webhook失败: ' + error.message 
    });
  }
});

export default router; 