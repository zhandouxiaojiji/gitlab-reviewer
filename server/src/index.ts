import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import reviewRoutes from './routes/reviews';
import gitlabRoutes from './routes/gitlab';
import { GitlabUserService } from './services/gitlabUserService';

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

app.get('/api/health', (req, res) => {
  res.json({ message: 'GitLab Review服务器运行正常', status: 'ok' });
});

// 服务器启动时初始化用户映射关系
const initializeUserMappings = async () => {
  try {
    console.log('正在初始化所有项目的用户映射关系...');
    // 延迟5秒后开始，确保服务器完全启动
    setTimeout(async () => {
      await GitlabUserService.updateAllProjectUserMappings();
      console.log('用户映射关系初始化完成');
    }, 5000);
  } catch (error) {
    console.error('初始化用户映射关系失败:', error);
  }
};

app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log('使用任意用户名即可登录，系统会自动创建新用户');
  
  // 启动用户映射关系初始化
  initializeUserMappings();
}); 