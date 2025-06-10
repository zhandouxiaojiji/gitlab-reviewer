import express from 'express';
import { Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { reviewStorage } from '../utils/storage';

// 定义AuthRequest接口
interface AuthRequest extends express.Request {
  user?: any;
}

const router = express.Router();

// 获取所有review记录
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, page = 1, limit = 20 } = req.query;
    
    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    }

    const allReviews = reviewStorage.findAll(filter);
    
    // 分页处理
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    
    const reviews = allReviews
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(startIndex, endIndex);

    const total = allReviews.length;

    res.json({
      message: '获取review记录成功',
      reviews,
      pagination: {
        current: pageNum,
        pageSize: limitNum,
        total
      }
    });
  } catch (error) {
    console.error('获取review记录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建或更新review记录
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const {
      commitId,
      commitMessage,
      commitAuthor,
      commitDate,
      projectId,
      hasReview,
      reviewedBy,
      reviewComments,
      gitlabCommitUrl
    } = req.body;

    // 验证输入
    if (!commitId || !commitMessage || !commitAuthor || !projectId || !gitlabCommitUrl) {
      return res.status(400).json({ message: '缺少必要的字段' });
    }

    // 尝试更新现有记录或创建新记录
    const review = reviewStorage.updateByCommitId(commitId, {
      commitMessage,
      commitAuthor,
      commitDate: new Date(commitDate),
      projectId,
      hasReview: hasReview || false,
      reviewedBy: reviewedBy || [],
      reviewComments: reviewComments || [],
      gitlabCommitUrl
    });

    res.json({
      message: 'Review记录保存成功',
      review
    });
  } catch (error) {
    console.error('保存review记录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取review统计信息
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;
    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    }

    const stats = reviewStorage.getStats(filter);

    res.json({
      message: '获取统计信息成功',
      stats
    });
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

export default router; 