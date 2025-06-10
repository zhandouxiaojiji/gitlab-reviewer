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

// 测试GitLab连接
router.post('/:id/test', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projectId = req.params.id;
    
    const project = projectStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    // 提取GitLab API URL
    const gitlabApiUrl = project.gitlabUrl.replace(/\/$/, '') + '/api/v4/projects';
    
    // 测试GitLab API连接
    const response = await axios.get(gitlabApiUrl, {
      headers: {
        'Authorization': `Bearer ${project.accessToken}`
      },
      timeout: 10000
    });

    if (response.status === 200) {
      res.json({ 
        message: 'GitLab连接测试成功',
        projectCount: response.data.length || 0
      });
    } else {
      res.status(400).json({ message: 'GitLab连接测试失败' });
    }
  } catch (error: any) {
    console.error('GitLab连接测试错误:', error);
    
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        res.status(400).json({ message: 'GitLab访问令牌无效' });
      } else if (status === 404) {
        res.status(400).json({ message: 'GitLab项目不存在或无权限访问' });
      } else {
        res.status(400).json({ message: `GitLab API错误: ${error.response.statusText}` });
      }
    } else if (error.code === 'ECONNREFUSED') {
      res.status(400).json({ message: 'GitLab服务器连接失败' });
    } else if (error.code === 'ENOTFOUND') {
      res.status(400).json({ message: 'GitLab服务器地址无效' });
    } else {
      res.status(500).json({ message: '连接测试失败' });
    }
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