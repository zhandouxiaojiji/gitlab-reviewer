import express from 'express';
import Review from '../models/Review';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// 获取所有review记录
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { projectId, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    }

    const reviews = await Review.find(filter)
      .populate('projectId', 'name gitlabUrl')
      .sort({ commitDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Review.countDocuments(filter);

    res.json({
      message: '获取review记录成功',
      reviews,
      pagination: {
        current: Number(page),
        pageSize: Number(limit),
        total
      }
    });
  } catch (error) {
    console.error('获取review记录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 创建或更新review记录
router.post('/', authenticateToken, async (req, res) => {
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
    const review = await Review.findOneAndUpdate(
      { commitId },
      {
        commitMessage,
        commitAuthor,
        commitDate: new Date(commitDate),
        projectId,
        hasReview: hasReview || false,
        reviewedBy: reviewedBy || [],
        reviewComments: reviewComments || [],
        gitlabCommitUrl
      },
      { upsert: true, new: true }
    );

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
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.query;
    const filter: any = {};
    if (projectId) {
      filter.projectId = projectId;
    }

    const totalCommits = await Review.countDocuments(filter);
    const reviewedCommits = await Review.countDocuments({ ...filter, hasReview: true });
    const unReviewedCommits = totalCommits - reviewedCommits;
    const reviewRate = totalCommits > 0 ? (reviewedCommits / totalCommits * 100).toFixed(2) : 0;

    res.json({
      message: '获取统计信息成功',
      stats: {
        totalCommits,
        reviewedCommits,
        unReviewedCommits,
        reviewRate: `${reviewRate}%`
      }
    });
  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

export default router; 