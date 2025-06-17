import { Router, Request, Response } from 'express';
import axios from 'axios';
import { authenticateToken } from '../middleware/auth';
import { shouldSkipReview } from '../utils/filterUtils';
import schedulerService from '../services/schedulerService';
import { storage } from '../utils/storage';

const router = Router();

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
  filterRules?: string;
}

interface GitLabBranch {
  name: string;
  default?: boolean;
  protected?: boolean;
  merged?: boolean;
  commit?: {
    id?: string;
    short_id?: string;
    message?: string;
    committed_date?: string;
  };
}

// 获取项目的提交记录（从内存缓存读取）
router.get('/projects/:projectId/commits', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { page = 1, per_page = 20, all, branch } = req.query;

    // 获取项目信息
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 从内存缓存读取commit数据
    const commits = schedulerService.getProjectCommits(projectId, branch as string);
    
    console.log(`从内存缓存读取到 ${commits.length} 个提交记录`);

    let formattedCommits;
    let responseData;

    // 转换数据格式以匹配前端期望的格式
    const formatCommit = (commit: any) => {
      // 检查是否符合过滤规则（无需审查）
      const skipReview = shouldSkipReview(commit.message || '', project.filterRules || '');
      
      return {
        id: commit.id,
        short_id: commit.short_id,
        message: commit.message,
        author_name: commit.author_name,
        author_email: commit.author_email,
        committed_date: commit.committed_date,
        web_url: commit.web_url,
        has_comments: commit.has_comments,
        comments_count: commit.comments_count,
        skip_review: skipReview, // 添加过滤标记
        comments: commit.comments
      };
    };

    if (all === 'true') {
      // 返回所有commit，不分页
      formattedCommits = commits.map(formatCommit);
      responseData = {
        commits: formattedCommits,
        total: commits.length,
        message: commits.length === 0 ? '暂无提交记录，请使用手动刷新按钮拉取数据' : undefined
      };
    } else {
      // 分页处理
      const pageNum = parseInt(page.toString());
      const perPage = parseInt(per_page.toString());
      const startIndex = (pageNum - 1) * perPage;
      const endIndex = startIndex + perPage;
      const paginatedCommits = commits.slice(startIndex, endIndex);

      formattedCommits = paginatedCommits.map(formatCommit);

      const totalPages = Math.ceil(commits.length / perPage);

      responseData = {
        commits: formattedCommits,
        total: commits.length,
        total_pages: totalPages,
        current_page: pageNum,
        per_page: perPage,
        message: commits.length === 0 ? '暂无提交记录，请使用手动刷新按钮拉取数据' : undefined
      };
    }

    res.json(responseData);

  } catch (error: any) {
    console.error('获取提交记录失败:', error);
    res.status(500).json({ 
      message: '获取提交记录失败: ' + (error.message || '未知错误'),
      commits: [],
      total: 0,
      total_pages: 1,
      current_page: 1,
      per_page: parseInt(req.query.per_page?.toString() || '20')
    });
  }
});

// 手动刷新项目的commit数据
router.post('/projects/:projectId/sync', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    
    console.log(`手动刷新项目 ${projectId} 的数据`);

    // 获取项目信息
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 调用手动刷新功能
    await schedulerService.manualRefreshProject(projectId);

    res.json({ 
      message: '数据刷新完成',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('手动刷新失败:', error);
    res.status(500).json({ 
      message: '刷新失败: ' + (error.message || '未知错误')
    });
  }
});

// 获取项目用户信息（保持原有功能）
router.get('/projects/:projectId/users/:username', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, username } = req.params;
    
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 返回简单的用户信息
    const user = {
      id: `user-${username}`,
      username: username,
      name: project.userMappings?.[username] || username,
      email: `${username}@example.com`,
      avatar_url: `https://www.gravatar.com/avatar/${username}?d=identicon`
    };

    res.json(user);
  } catch (error: any) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({ message: '获取用户信息失败' });
  }
});

// 获取项目分支列表（从内存缓存读取）
router.get('/projects/:projectId/branches', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const project = storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 从内存缓存读取分支数据
    const branchData = schedulerService.getProjectBranches(projectId);
    
    console.log(`从内存缓存读取到项目 ${project.name} 的 ${branchData.branches.length} 个分支`);

    res.json({
      branches: branchData.branches,
      defaultBranch: branchData.defaultBranch,
      total: branchData.branches.length,
      message: branchData.branches.length === 0 ? '暂无分支信息，请使用手动刷新按钮拉取分支数据' : undefined
    });

  } catch (error: any) {
    console.error('获取分支列表失败:', error);
    res.status(500).json({ 
      message: '获取分支列表失败: ' + (error.message || '未知错误'),
      branches: [],
      defaultBranch: 'main',
      total: 0
    });
  }
});

// 手动同步项目数据
router.post('/projects/:id/sync', authenticateToken, async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    
    // 获取项目配置
    const projects = storage.getProjects();
    const project = projects.find((p: any) => p.id === parseInt(projectId));
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: `项目ID ${projectId} 不存在` 
      });
    }
    
    console.log(`[手动同步] 开始同步项目: ${project.name}`);
    
    // 调用手动刷新功能
    await schedulerService.manualRefreshProject(projectId);
    
    console.log(`[手动同步] 项目 ${project.name} 同步完成`);
    
    res.json({ 
      success: true, 
      message: `项目 ${project.name} 数据同步完成` 
    });
  } catch (error) {
    console.error('手动同步失败:', error);
    res.status(500).json({ 
      success: false, 
      message: error instanceof Error ? error.message : '手动同步失败' 
    });
  }
});

export default router; 