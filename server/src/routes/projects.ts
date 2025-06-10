import express from 'express';
import { Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import { projectStorage } from '../utils/storage';

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

    res.json({
      message: '获取项目列表成功',
      projects
    });
  } catch (error) {
    console.error('获取项目列表错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建新项目
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { name, gitlabProjectId, gitlabUrl, description } = req.body;

    // 检查项目是否已存在
    const existingProject = projectStorage.findAll().find(p => p.gitlabProjectId === gitlabProjectId);
    if (existingProject) {
      return res.status(400).json({ message: '该GitLab项目已存在' });
    }

    const project = projectStorage.create({
      name,
      gitlabProjectId,
      gitlabUrl,
      description,
      isActive: true,
      createdBy: req.user.id
    });

    res.status(201).json({
      message: '项目创建成功',
      project
    });
  } catch (error) {
    console.error('创建项目错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取单个项目详情
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const project = projectStorage.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: '项目不存在' });
    }

    res.json({
      message: '获取项目详情成功',
      project
    });
  } catch (error) {
    console.error('获取项目详情错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

export default router; 