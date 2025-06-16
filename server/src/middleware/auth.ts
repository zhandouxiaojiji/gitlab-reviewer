import { Request, Response, NextFunction } from 'express';

// 简化的用户列表（与auth.ts保持一致）
const users = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin'
  }
];

export interface AuthRequest extends Request {
  user?: any;
}

// 简单的用户身份验证中间件，通过URL参数获取用户信息
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // 从查询参数或请求体中获取用户名
  const username = req.query.user as string || req.body.user as string || 'anonymous';
  
  // 创建用户对象
  const user = {
    id: `user-${username}`,
    username: username,
    email: `${username}@example.com`,
    role: username === 'admin' ? 'admin' : 'user'
  };

  req.user = user;
  next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: '需要管理员权限' });
  }
  next();
}; 