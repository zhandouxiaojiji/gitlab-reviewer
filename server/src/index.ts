import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import reviewRoutes from './routes/reviews';
import gitlabRoutes from './routes/gitlab';
import { authenticateToken } from './middleware/auth';
import { GitlabUserService } from './services/gitlabUserService';
import schedulerService from './services/schedulerService';
import { projectStorage } from './utils/storage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/gitlab', gitlabRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({ message: '服务器内部错误' });
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  
  // 根据项目配置设置刷新频率
  try {
    const projects = projectStorage.findAll().filter((p: any) => !p.deletedAt && p.isActive !== false);
    if (projects.length > 0) {
      // 使用所有项目中最小的刷新频率，确保所有项目都能及时更新
      const minRefreshInterval = Math.min(...projects.map((p: any) => p.refreshInterval || 1));
      console.log(`检测到 ${projects.length} 个项目，设置刷新频率为 ${minRefreshInterval} 分钟`);
      schedulerService.setRefreshInterval(minRefreshInterval);
    } else {
      console.log('暂无项目配置，使用默认刷新频率 1 分钟');
      schedulerService.setRefreshInterval(1);
    }
  } catch (error) {
    console.error('设置刷新频率失败，使用默认值:', error);
    schedulerService.setRefreshInterval(1);
  }
  
  // 启动定时任务
  schedulerService.startAll();
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  schedulerService.stopAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  schedulerService.stopAll();
  process.exit(0);
}); 