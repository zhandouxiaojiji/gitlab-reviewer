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
  gitlab_url: string;
  access_token: string;
  gitlab_project_id?: string;
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

    // 构建GitLab API URL
    const gitlabUrl = project.gitlab_url.replace(/\/$/, ''); // 移除末尾斜杠
    const apiUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(project.gitlab_project_id || project.name)}/repository/commits`;
    
    // 构建查询参数
    const params: any = {
      ref_name: branch,
      page: page,
      per_page: per_page
    };
    
    if (since) params.since = since;
    if (until) params.until = until;

    // 调用GitLab API
    const response = await axios.get(apiUrl, {
      headers: {
        'Authorization': `Bearer ${project.access_token}`
      },
      params
    });

    const commits = response.data;

    // 获取每个提交的评论
    const commitsWithComments = await Promise.all(
      commits.map(async (commit: any) => {
        try {
          // 获取提交的评论
          const commentsUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(project.gitlab_project_id || project.name)}/repository/commits/${commit.id}/comments`;
          const commentsResponse = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${project.access_token}`
            }
          });
          
          const comments = commentsResponse.data;
          
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
            comments: comments.map((comment: any) => ({
              author: comment.author,
              created_at: comment.created_at,
              note: comment.note
            }))
          };
        } catch (error) {
          console.warn(`获取提交 ${commit.id} 的评论失败:`, error);
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

    res.json({
      commits: commitsWithComments,
      total: response.headers['x-total'] || commitsWithComments.length,
      total_pages: response.headers['x-total-pages'] || 1,
      current_page: parseInt(page.toString()),
      per_page: parseInt(per_page.toString())
    });

  } catch (error: any) {
    console.error('获取提交记录失败:', error);
    
    if (error.response?.status === 401) {
      return res.status(401).json({ message: 'GitLab访问令牌无效或已过期' });
    } else if (error.response?.status === 404) {
      return res.status(404).json({ message: 'GitLab项目不存在或无法访问' });
    }
    
    res.status(500).json({ 
      message: '获取提交记录失败', 
      error: error.message 
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
    const gitlabUrl = project.gitlab_url.replace(/\/$/, '');
    const apiUrl = `${gitlabUrl}/api/v4/projects/${encodeURIComponent(project.gitlab_project_id || project.name)}/repository/commits`;
    
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
          'Authorization': `Bearer ${project.access_token}`
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

export default router; 