# GitLab代码Review辅助工具

重要提示：本项目完全由Cursor开发，我们不对代码质量做任何保证。

## 功能特性

- 我们期望Review代码是事后进行的，也就是不阻碍团队成员的代码提交
- 我们期望每一个commit都能被团队的每个成员review到

## 技术栈

### 前端
- React 18 + TypeScript
- Ant Design Pro
- React Router
- Axios

### 后端
- Node.js + Express
- TypeScript
- MongoDB + Mongoose
- JWT认证
- bcryptjs密码加密

## 项目结构

```
gitlab-reviewer/
├── client/                 # 前端项目
│   ├── public/
│   ├── src/
│   │   ├── components/     # React组件
│   │   ├── contexts/       # React上下文
│   │   ├── services/       # API服务
│   │   └── ...
│   └── package.json
├── server/                 # 后端项目
│   ├── src/
│   │   ├── config/         # 配置文件
│   │   ├── models/         # 数据模型
│   │   ├── routes/         # 路由
│   │   ├── middleware/     # 中间件
│   │   └── index.ts
│   └── package.json
└── package.json           # 根项目配置
```

## 快速开始

### 环境要求

- Node.js 16+
- MongoDB 5.0+
- npm 或 yarn

### 安装依赖

```bash
# 安装所有依赖
npm run install:all

# 或者分别安装
npm install
cd client && npm install
cd ../server && npm install
```

### 配置环境变量

1. 复制 `server/.env` 文件并配置：

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=your-jwt-secret-key
DB_CONNECTION_STRING=mongodb://localhost:27017/gitlab-reviewer

# GitLab配置
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your-gitlab-token
```

### 启动应用

```bash
# 同时启动前后端（推荐）
npm run dev

# 或者分别启动
npm run dev:server    # 启动后端服务
npm run dev:client    # 启动前端服务
```

### 访问应用

- 前端: http://localhost:3000
- 后端API: http://localhost:3001

## 默认登录信息

由于这是初始框架，需要先在数据库中创建用户，或者可以使用注册接口。

默认管理员账号（需要手动创建）：
- 用户名: admin
- 密码: 123456

## API接口

### 认证相关
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册

### 项目管理
- `GET /api/projects` - 获取项目列表
- `POST /api/projects` - 创建新项目
- `GET /api/projects/:id` - 获取项目详情

### Review管理
- `GET /api/reviews` - 获取review记录
- `POST /api/reviews` - 创建/更新review记录
- `GET /api/reviews/stats` - 获取统计信息

## 开发说明

### 数据模型

1. **User（用户）**
   - username: 用户名
   - email: 邮箱
   - password: 密码（加密）
   - role: 角色（admin/user）
   - gitlabUserId: GitLab用户ID

2. **Project（项目）**
   - name: 项目名称
   - gitlabProjectId: GitLab项目ID
   - gitlabUrl: GitLab项目URL
   - description: 项目描述
   - isActive: 是否活跃

3. **Review（代码review）**
   - commitId: 提交ID
   - commitMessage: 提交信息
   - commitAuthor: 提交作者
   - commitDate: 提交日期
   - hasReview: 是否有review
   - reviewedBy: review者列表
   - reviewComments: review评论

### 构建部署

```bash
# 构建项目
npm run build

# 生产环境启动
npm run start
```

## 后续开发计划

- [ ] GitLab Webhook集成
- [ ] 自动检测commit评论
- [ ] 邮件通知功能
- [ ] Review规则配置
- [ ] 数据导出功能
- [ ] 用户权限管理

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License 