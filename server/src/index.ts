import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import reviewRoutes from './routes/reviews';
import gitlabRoutes from './routes/gitlab';
import webhookRoutes from './routes/webhook';
import settingsRoutes from './routes/settings';
import feishuRoutes from './routes/feishu';
import scheduleRoutes from './routes/schedule';
import { authenticateToken } from './middleware/auth';
import { GitlabUserService } from './services/gitlabUserService';
import schedulerService from './services/schedulerService';
import { scheduledReportService } from './services/scheduledReportService';
import { projectStorage } from './utils/storage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../../client/build')));

// 重要：webhook路由必须在express.json()之前，因为需要原始数据
app.use('/api/webhook', webhookRoutes);

// 其他路由使用JSON解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/gitlab', gitlabRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feishu', feishuRoutes);
app.use('/api/schedule', scheduleRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 前端路由处理（SPA）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build/index.html'));
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
  console.log(`Webhook端点: http://localhost:${PORT}/api/webhook/gitlab`);
  console.log('🔄 仅支持手动全量刷新，已移除自动定时任务');
  
  // 启动定时报告服务
  scheduledReportService.start();
  console.log('📅 定时报告服务已启动');
  
  // 显示项目配置信息
  try {
    const projects = projectStorage.findAll().filter((p: any) => !p.deletedAt && p.isActive !== false);
    if (projects.length > 0) {
      console.log(`📋 检测到 ${projects.length} 个活跃项目`);
      projects.forEach((project: any, index: number) => {
        console.log(`   ${index + 1}. ${project.name} (审核范围: ${project.reviewDays || 30} 天)`);
      });
    } else {
      console.log('⚠️  暂无活跃项目配置');
    }
  } catch (error) {
    console.error('读取项目配置失败:', error);
  }
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
}); 