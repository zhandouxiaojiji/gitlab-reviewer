# GitLab代码Review辅助工具

![Docker Image](https://img.shields.io/badge/docker-zhandouxiaojiji%2Fgitlab--reviewer-blue)
![License](https://img.shields.io/badge/license-MIT-green)

重要提示：本项目完全由Cursor开发，我们只注重功能的可用性，不对代码质量做任何保证！

## 项目介绍

这是一个GitLab代码review辅助工具，帮助团队追踪和管理代码审核状态。通过集成GitLab API，自动监控提交记录和review状态，让代码审核更加透明和高效。

### 为什么要开发这个工具
- 我们期望Review代码是事后进行的，也就是不阻碍团队成员的代码提交
- 我们期望每一个commit都能被团队的每个成员review到
- 提供清晰的可视化界面，显示代码审核覆盖率和统计信息

### 如何审核代码
- 我们是以gitlab上的commit的评论作为是否已审核的依据
- 系统会自动检测GitLab提交记录的评论，统计审核状态

## 功能特性

- 🔐 **用户认证** - 安全的登录验证机制
- 📊 **项目管理** - 支持多个GitLab项目配置
- 👥 **审核人员配置** - 灵活的审核人员分配
- 📈 **审核统计** - 实时显示审核覆盖率
- 🎯 **用户映射** - 自动映射GitLab用户名到中文昵称
- ⚙️ **灵活配置** - 可配置审核时间范围和记录数量上限
- 🔄 **实时同步** - 自动同步GitLab提交和评论数据

## 技术栈

- **前端**: React + TypeScript + Ant Design Pro
- **后端**: Node.js + Express + TypeScript
- **部署**: Docker + Nginx

## Docker 一键部署

### 方式一：使用快速部署脚本（推荐）

```bash
# 下载并运行快速部署脚本
curl -sSL https://raw.githubusercontent.com/your-username/gitlab-reviewer/main/quick-deploy.sh | bash

# 或者下载仓库后运行
git clone https://github.com/your-username/gitlab-reviewer.git
cd gitlab-reviewer
chmod +x quick-deploy.sh
./quick-deploy.sh
```

### 方式二：使用 Docker Hub 镜像

```bash
# 拉取最新镜像
docker pull zhandouxiaojiji/gitlab-reviewer:latest

# 运行容器
docker run -d \
  --name gitlab-reviewer \
  -p 8080:80 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/server/data \
  zhandouxiaojiji/gitlab-reviewer:latest

# 访问应用
open http://localhost:8080
```

### 方式三：使用 Docker Compose

```bash
# 克隆仓库
git clone https://github.com/zhandouxiaojiji/gitlab-reviewer.git
cd gitlab-reviewer

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方式四：本地构建

```bash
# 克隆仓库
git clone https://github.com/zhandouxiaojiji/gitlab-reviewer.git
cd gitlab-reviewer

# 构建镜像
docker build -t gitlab-reviewer .

# 运行容器
docker run -d \
  --name gitlab-reviewer \
  -p 8080:80 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/server/data \
  gitlab-reviewer
```

## 本地开发

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装依赖
```bash
# 安装所有依赖
npm run install:all
```

### 开发模式
```bash
# 同时启动前后端开发服务器
npm run dev

# 或者分别启动
npm run dev:server  # 后端开发服务器
npm run dev:client  # 前端开发服务器
```

### 构建生产版本
```bash
npm run build
```

## 使用指南

### 1. 初始登录
- 默认用户名：`admin`

### 2. 项目配置
1. 进入"设置"页面
2. 点击"添加项目"
3. 填写以下信息：
   - **项目名称**：自定义项目名称
   - **GitLab地址**：GitLab项目URL
   - **Access Token**：GitLab Personal Access Token
   - **审核人员**：选择需要参与代码审核的人员
   - **审核范围**：设置显示多少天内的提交记录
   - **拉取记录上限**：设置从GitLab拉取的提交数量上限

### 3. GitLab Token 配置
1. 登录GitLab
2. 进入 Settings → Access Tokens
3. 创建Personal Access Token，需要以下权限：
   - `read_api`
   - `read_repository`
   - `read_user`

### 4. 查看审核状态
- 在项目详情页面查看提交记录
- 绿色标签表示已审核
- 灰色标签表示待审核
- 查看审核覆盖率统计

## 配置说明

### 数据持久化
数据存储在 `/app/server/data` 目录下：
- `projects.json` - 项目配置数据
- `users.json` - 用户数据

使用Docker时，建议将此目录挂载到宿主机：
```bash
-v $(pwd)/data:/app/server/data
```

### 端口配置
- **80** - Web界面端口
- **3001** - API服务端口

### 环境变量
- `NODE_ENV` - 运行环境（production/development）
- `PORT` - API服务端口（默认3001）

## 健康检查

访问 `http://localhost:8080/health` 查看服务状态。

## 故障排除

### 常见问题

1. **前端无法连接后端API（服务器部署）**
   - **问题**：在服务器上部署后，前端仍然尝试连接localhost:3001
   - **解决方案**：
     ```bash
     # 方案1: 使用nginx代理（推荐，默认配置）
     # 系统会自动通过nginx将/api请求代理到后端
     
     # 方案2: 如果需要直连后端，设置环境变量
     docker run -d \
       --name gitlab-reviewer \
       -p 8080:80 \
       -p 3001:3001 \
       -e REACT_APP_API_URL=http://YOUR_SERVER_IP:3001 \
       -v $(pwd)/data:/app/server/data \
       zhandouxiaojiji/gitlab-reviewer:latest
     ```

2. **GitLab连接失败**
   - 检查GitLab URL是否正确
   - 确认Access Token权限充足
   - 验证网络连接

3. **用户映射显示异常**
   - 在设置页面点击"刷新用户"按钮
   - 确认Token有用户读取权限

4. **提交记录不显示**
   - 检查审核时间范围设置
   - 确认拉取记录上限配置
   - 查看控制台错误日志

### 查看日志

```bash
# Docker容器日志
docker logs gitlab-reviewer

# Docker Compose日志
docker-compose logs -f gitlab-reviewer
```

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 发起Pull Request

## 许可证

MIT License

## 联系方式

如有问题或建议，请提交Issue或联系开发团队。 