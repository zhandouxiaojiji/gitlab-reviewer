import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// 简化的用户列表（不需要密码）
const users = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin'
  }
];

// 用户登录（仅需用户名）
router.post('/login', async (req, res) => {
  try {
    const { username } = req.body;

    // 验证输入
    if (!username) {
      return res.status(400).json({ message: '用户名不能为空' });
    }

    // 查找用户或创建新用户
    let user = users.find(u => u.username === username || u.email === username);
    
    if (!user) {
      // 如果用户不存在，自动创建
      user = {
        id: `user-${Date.now()}`,
        username: username,
        email: `${username}@example.com`,
        role: 'user'
      };
      users.push(user);
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: '登录成功',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ message: '服务器内部错误' });
  }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: '访问令牌缺失' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as { userId: string; username: string };
    let user = users.find(u => u.id === decoded.userId);
    
    if (!user) {
      // 如果用户不存在，从token中重建用户信息
      user = {
        id: decoded.userId,
        username: decoded.username,
        email: `${decoded.username}@example.com`,
        role: 'user'
      };
      users.push(user);
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return res.status(403).json({ message: '无效的访问令牌' });
  }
});

export default router; 