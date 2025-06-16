import express from 'express';

const router = express.Router();

// 用户登录（仅需用户名）
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    // 验证输入
    if (!username) {
      return res.status(400).json({ message: '用户名不能为空' });
    }

    // 创建用户信息
    const user = {
      id: `user-${username}`,
      username: username,
      email: `${username}@example.com`,
      role: username === 'admin' ? 'admin' : 'user'
    };

    res.json({
      message: '登录成功',
      user: user
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  // 从查询参数获取用户名
  const username = req.query.user as string || 'anonymous';
  
  const user = {
    id: `user-${username}`,
    username: username,
    email: `${username}@example.com`,
    role: username === 'admin' ? 'admin' : 'user'
  };

  res.json({
    user: user
  });
});

export default router; 