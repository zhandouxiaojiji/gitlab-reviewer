import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// 简化的用户列表（与auth.ts保持一致）
const users = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin'
  }
];

interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ message: '无效的访问令牌' });
  }
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
}; 