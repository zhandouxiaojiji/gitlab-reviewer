import express from 'express';
import { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { storage } from '../utils/storage';
import axios from 'axios';

const router = express.Router();

interface AuthRequest extends Request {
  user?: any;
}

interface Project {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  userMappings?: Record<string, string>;
  reviewDays?: number;
  maxCommits?: number;
}

// 获取项目的提交记录
router.get('/projects/:projectId/commits', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { branch = 'master', since, until, page = 1, per_page = 20 } = req.query;

    // 获取项目配置
    const projects = await storage.getProjects();
    const project = projects.find((p: Project) => p.id === projectId);
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    console.log('项目配置:', {
      name: project.name,
      gitlabUrl: project.gitlabUrl,
      hasToken: !!project.accessToken,
      reviewDays: project.reviewDays,
      maxCommits: project.maxCommits
    });

    // 验证和标准化GitLab URL
    let gitlabBaseUrl = project.gitlabUrl.replace(/\/$/, ''); // 移除末尾斜杠
    
    // 确保URL包含协议
    if (!gitlabBaseUrl.startsWith('http://') && !gitlabBaseUrl.startsWith('https://')) {
      gitlabBaseUrl = 'http://' + gitlabBaseUrl;
    }

    // 修复URL构建 - 不要将项目名称作为路径的一部分
    // GitLab URL应该只包含域名，不包含项目路径
    const urlParts = new URL(gitlabBaseUrl);
    const cleanGitlabUrl = `${urlParts.protocol}//${urlParts.host}`;

    // 构建GitLab API URL
    let projectIdentifier = encodeURIComponent(project.name);
    
    // 如果项目名称包含斜杠，说明是group/project格式
    if (project.name.includes('/')) {
      projectIdentifier = encodeURIComponent(project.name);
    }
    
    const apiUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;
    
    console.log('清理后的GitLab URL:', cleanGitlabUrl);
    console.log('完整请求URL:', apiUrl);
    console.log('项目标识符:', projectIdentifier);
    console.log('原始项目名称:', project.name);
    
    // 根据项目配置的审核范围自动设置时间范围
    const reviewDays = project.reviewDays || 7; // 默认7天
    const maxCommits = project.maxCommits || 100; // 默认100条
    let sinceDate: string;
    
    if (!since) {
      // 如果没有传入since参数，根据reviewDays计算
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - reviewDays);
      sinceDate = cutoffDate.toISOString();
      console.log(`根据审核范围 ${reviewDays} 天，自动设置since参数: ${sinceDate}`);
    } else {
      sinceDate = since as string;
      console.log(`使用传入的since参数: ${sinceDate}`);
    }
    
    console.log(`拉取记录上限设置为: ${maxCommits} 条`);
    
    // 构建查询参数
    const params: any = {
      ref_name: branch,
      since: sinceDate, // 根据审核范围设置起始时间
      per_page: maxCommits // 使用项目配置的拉取记录上限
    };
    
    if (until) params.until = until;

    console.log('请求参数:', params);

    // 调用GitLab API
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${project.accessToken}`,
        'Accept': 'application/json'
      },
      params,
      timeout: 10000, // 10秒超时
      validateStatus: function (status) {
        return status < 500; // 不要自动抛出4xx错误
      }
    });

    console.log('GitLab API响应状态:', response.status);
    console.log('GitLab API响应头Content-Type:', response.headers['content-type']);

    // 检查响应状态
    if (response.status === 404) {
      // 项目不存在，可能项目名称格式不对，尝试其他格式
      console.log('项目未找到，尝试其他标识符格式...');
      
      // 尝试使用项目名称的不同格式
      const alternativeIdentifiers = [
        project.name, // 原始名称
        project.name.replace(/\//g, '%2F'), // 手动编码斜杠
        encodeURI(project.name), // URI编码
      ];
      
      return res.status(404).json({ 
        message: `GitLab项目 "${project.name}" 不存在或无法访问`,
        details: `请检查项目名称是否正确。尝试的标识符: ${alternativeIdentifiers.join(', ')}`,
        gitlabUrl: gitlabBaseUrl,
        suggestedFormats: [
          'group/project (如: mygroup/myproject)',
          'project (如: myproject)',
          '项目ID (如: 123)'
        ]
      });
    } else if (response.status === 401) {
      return res.status(401).json({ 
        message: 'GitLab访问令牌无效或已过期',
        details: '请检查访问令牌是否正确，以及是否有访问该项目的权限'
      });
    } else if (response.status === 403) {
      return res.status(403).json({ 
        message: 'GitLab访问被禁止',
        details: '访问令牌没有访问该项目的权限'
      });
    }

    // 检查响应内容类型
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      console.log('收到非JSON响应:', response.data);
      
      // 如果收到HTML响应，说明URL可能错误
      if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
        return res.status(500).json({
          message: 'GitLab API URL配置错误',
          details: '请求返回了HTML页面而不是API响应，请检查GitLab URL配置是否正确',
          receivedUrl: apiUrl,
          suggestion: '确保GitLab URL格式正确，例如: http://your-gitlab.com 或 https://gitlab.com'
        });
      }
      
      return res.status(500).json({
        message: 'GitLab API响应格式错误',
        details: `期望JSON格式，但收到了 ${contentType}`,
        responseData: response.data
      });
    }

    console.log('GitLab API响应数据类型:', typeof response.data);
    console.log('GitLab API响应数据长度:', Array.isArray(response.data) ? response.data.length : '不是数组');

    let commits = response.data;

    // 检查数据类型并处理
    if (!Array.isArray(commits)) {
      console.log('响应数据不是数组:', commits);
      
      // 如果是对象且包含commits字段
      if (commits && typeof commits === 'object' && Array.isArray(commits.commits)) {
        commits = commits.commits;
      } else {
        console.error('无法解析提交数据:', commits);
        return res.status(500).json({ 
          message: 'GitLab API返回的数据格式不正确',
          receivedType: typeof commits,
          receivedData: commits
        });
      }
    }

    if (commits.length === 0) {
      return res.json({
        commits: [],
        total: 0,
        total_pages: 1,
        current_page: 1,
        per_page: parseInt(per_page.toString()),
        message: '该分支暂无提交记录'
      });
    }

    // 获取每个提交的评论
    const commitsWithComments = await Promise.all(
      commits.map(async (commit: any) => {
        try {
          // 获取提交的评论
          const commentsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits/${commit.id}/comments`;
          const commentsResponse = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });
          
          const comments = commentsResponse.data;
          
          console.log(`提交 ${commit.short_id} 的评论数据:`, JSON.stringify(comments, null, 2));
          
          return {
            id: commit.id,
            short_id: commit.short_id,
            message: commit.message,
            author_name: commit.author_name,
            author_email: commit.author_email,
            committed_date: commit.committed_date,
            web_url: commit.web_url,
            has_comments: comments.length > 0,
            comments_count: comments.length,
            comments: comments.map((comment: any) => {
              console.log(`处理评论作者信息:`, comment.author);
              return {
                author: comment.author,
                created_at: comment.created_at,
                note: comment.note
              };
            })
          };
        } catch (error) {
          console.warn(`获取提交 ${commit.id} 的评论失败:`, error instanceof Error ? error.message : error);
          return {
            id: commit.id,
            short_id: commit.short_id,
            message: commit.message,
            author_name: commit.author_name,
            author_email: commit.author_email,
            committed_date: commit.committed_date,
            web_url: commit.web_url,
            has_comments: false,
            comments_count: 0,
            comments: []
          };
        }
      })
    );

    console.log(`成功处理 ${commitsWithComments.length} 条提交记录`);

    // 获取项目的用户映射关系
    const userMappings = project.userMappings || {};
    console.log(`项目 ${project.name} 的用户映射关系:`, userMappings);

    res.json({
      commits: commitsWithComments,
      userMappings: userMappings,
      total: response.headers['x-total'] || commitsWithComments.length,
      total_pages: response.headers['x-total-pages'] || 1,
      current_page: parseInt(page.toString()),
      per_page: parseInt(per_page.toString())
    });

  } catch (error: any) {
    console.error('获取提交记录失败:', error);
    
    // 详细的错误信息
    let errorMessage = '获取提交记录失败';
    let statusCode = 500;
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'GitLab服务器连接被拒绝，请检查URL是否正确';
      statusCode = 503;
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'GitLab服务器域名无法解析，请检查URL';
      statusCode = 503;
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'GitLab服务器连接超时';
      statusCode = 504;
    } else if (error.response?.status === 401) {
      errorMessage = 'GitLab访问令牌无效或已过期';
      statusCode = 401;
    } else if (error.response?.status === 404) {
      errorMessage = 'GitLab项目不存在或无法访问';
      statusCode = 404;
    } else if (error.response?.status === 403) {
      errorMessage = 'GitLab访问被禁止，请检查令牌权限';
      statusCode = 403;
    }
    
    res.status(statusCode).json({ 
      message: errorMessage,
      error: error.message,
      code: error.code,
      responseStatus: error.response?.status,
      responseData: error.response?.data
    });
  }
});

// 同步GitLab数据到本地存储
router.post('/projects/:projectId/sync', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { branch = 'master', since, until } = req.body;

    // 获取项目配置
    const projects = await storage.getProjects();
    const project = projects.find((p: Project) => p.id === projectId);
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 获取提交记录（不分页，获取所有数据）
    const gitlabUrl = project.gitlabUrl.replace(/\/$/, '');
    const apiUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(project.name)}/repository/commits`;
    
    const params: any = {
      ref_name: branch,
      per_page: 100 // GitLab API最大限制
    };
    
    if (since) params.since = since;
    if (until) params.until = until;

    let allCommits: any[] = [];
    let page = 1;
    let hasNextPage = true;

    // 分页获取所有提交
    while (hasNextPage) {
      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`
        },
        params: { ...params, page }
      });

      const commits = response.data;
      allCommits = allCommits.concat(commits);
      
      // 检查是否有下一页
      const totalPages = parseInt(response.headers['x-total-pages'] || '1');
      hasNextPage = page < totalPages;
      page++;
    }

    // 保存到本地存储
    const commitData = {
      projectId,
      branch,
      commits: allCommits,
      syncedAt: new Date().toISOString(),
      total: allCommits.length
    };

    await storage.saveCommitData(projectId, commitData);

    res.json({
      message: '数据同步成功',
      syncedCount: allCommits.length,
      syncedAt: commitData.syncedAt
    });

  } catch (error: any) {
    console.error('同步GitLab数据失败:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ message: 'GitLab访问令牌无效或已过期' });
    } else if (error.response?.status === 404) {
      return res.status(404).json({ message: 'GitLab项目不存在或无法访问' });
    }
    
    res.status(500).json({ 
      message: '同步数据失败', 
      error: error.message 
    });
  }
});

// 获取GitLab用户信息（根据用户名获取显示名称）
router.get('/projects/:projectId/users/:username', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, username } = req.params;

    // 获取项目配置
    const projects = await storage.getProjects();
    const project = projects.find((p: Project) => p.id === projectId);
    
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 验证和标准化GitLab URL
    let gitlabBaseUrl = project.gitlabUrl.replace(/\/$/, '');
    
    if (!gitlabBaseUrl.startsWith('http://') && !gitlabBaseUrl.startsWith('https://')) {
      gitlabBaseUrl = 'http://' + gitlabBaseUrl;
    }

    const urlParts = new URL(gitlabBaseUrl);
    const cleanGitlabUrl = `${urlParts.protocol}//${urlParts.host}`;

    // 构建GitLab用户搜索API URL
    const apiUrl = `${cleanGitlabUrl}/api/v4/users`;
    
    console.log('搜索GitLab用户:', username);
    console.log('API URL:', apiUrl);
    
    // 调用GitLab API搜索用户
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${project.accessToken}`,
        'Accept': 'application/json'
      },
      params: {
        username: username
      },
      timeout: 10000,
      validateStatus: function (status) {
        return status < 500;
      }
    });

    console.log('GitLab用户搜索响应状态:', response.status);

    if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
      const user = response.data[0]; // 取第一个匹配的用户
      
      res.json({
        user: {
          id: user.id,
          username: user.username,
          name: user.name, // 这是显示名称/昵称
          email: user.email,
          avatar_url: user.avatar_url,
          web_url: user.web_url
        }
      });
    } else if (response.status === 401) {
      return res.status(401).json({ 
        message: 'GitLab访问令牌无效或已过期'
      });
    } else if (response.status === 403) {
      return res.status(403).json({ 
        message: 'GitLab访问被禁止，请检查令牌权限'
      });
    } else {
      // 用户不存在，返回默认信息
      res.json({
        user: {
          username: username,
          name: username, // 找不到用户时使用用户名作为显示名称
          email: null,
          avatar_url: null,
          web_url: null
        }
      });
    }

  } catch (error: any) {
    console.error('获取GitLab用户信息失败:', error);
    
    // 如果出错，返回默认用户信息
    res.json({
      user: {
        username: req.params.username,
        name: req.params.username,
        email: null,
        avatar_url: null,
        web_url: null
      }
    });
  }
});

export default router; 