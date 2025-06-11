# 使用多阶段构建
# 阶段1: 构建前端
FROM node:18-alpine AS frontend-builder

WORKDIR /app/client

# 复制前端package.json文件
COPY client/package*.json ./

# 安装前端依赖（包括开发依赖，用于构建）
RUN npm ci

# 复制前端源代码
COPY client/ ./

# 设置生产环境变量，确保前端使用正确的API配置
ENV NODE_ENV=production

# 构建前端
RUN npm run build

# 阶段2: 构建后端
FROM node:18-alpine AS backend-builder

WORKDIR /app/server

# 复制后端package.json文件
COPY server/package*.json ./

# 安装后端依赖（包括开发依赖，用于TypeScript编译）
RUN npm ci

# 复制后端源代码
COPY server/ ./

# 构建后端TypeScript代码
RUN npm run build

# 阶段3: 安装生产依赖
FROM node:18-alpine AS deps

WORKDIR /app/server

# 复制后端package.json文件
COPY server/package*.json ./

# 只安装生产依赖
RUN npm ci --only=production && npm cache clean --force

# 阶段4: 生产环境镜像
FROM node:18-alpine AS production

# 安装生产环境需要的工具
RUN apk add --no-cache nginx wget

# 创建应用目录
WORKDIR /app

# 复制后端构建结果和生产依赖
COPY --from=backend-builder /app/server/dist ./server/dist
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY --from=backend-builder /app/server/package*.json ./server/

# 复制前端构建结果
COPY --from=frontend-builder /app/client/build ./client/build

# 创建数据目录
RUN mkdir -p /app/server/data

# 配置nginx
COPY nginx.conf /etc/nginx/nginx.conf

# 创建启动脚本
COPY start.sh /start.sh
RUN chmod +x /start.sh

# 暴露端口
EXPOSE 80 3001

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3001

# 启动应用
CMD ["/start.sh"] 