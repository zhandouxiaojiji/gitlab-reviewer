import express from 'express';
import { Response, NextFunction } from 'express';
import Project from '../models/Project';
import { authenticateToken } from '../middleware/auth';

// 定义AuthRequest接口
interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// 获取所有项目
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const projects = await Project.find({ isActive: true })
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

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

    // 验证输入
    if (!name || !gitlabProjectId || !gitlabUrl) {
      return res.status(400).json({ message: '项目名称、GitLab项目ID和URL是必填的' });
    }

    // 检查项目是否已存在
    const existingProject = await Project.findOne({ gitlabProjectId });
    if (existingProject) {
      return res.status(400).json({ message: 'GitLab项目已存在' });
    }

    const project = new Project({
      name,
      gitlabProjectId,
      gitlabUrl,
      description,
      createdBy: req.user._id
    });

    await project.save();

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
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'username email');

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