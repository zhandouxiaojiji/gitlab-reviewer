#!/bin/bash

echo "GitLab Reviewer 快速部署脚本"
echo "================================"

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

echo "✅ Docker 环境检查通过"

# 获取服务器IP
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    echo "⚠️  无法自动获取服务器IP，请手动指定"
    read -p "请输入服务器IP地址: " SERVER_IP
fi

echo "🌐 检测到服务器IP: $SERVER_IP"

# 创建数据目录
mkdir -p ./data
echo "📁 创建数据目录: ./data"

# 拉取最新镜像
echo "📥 拉取最新Docker镜像..."
docker pull zhandouxiaojiji/gitlab-reviewer:latest

if [ $? -eq 0 ]; then
    echo "✅ 镜像拉取成功"
else
    echo "❌ 镜像拉取失败，将使用本地构建"
    echo "🔨 开始构建本地镜像..."
    docker build -t zhandouxiaojiji/gitlab-reviewer:latest .
fi

# 停止并删除旧容器
echo "🛑 停止旧容器..."
docker stop gitlab-reviewer 2>/dev/null || true
docker rm gitlab-reviewer 2>/dev/null || true

# 启动新容器
echo "🚀 启动新容器..."
docker run -d \
  --name gitlab-reviewer \
  -p 8080:80 \
  -p 3001:3001 \
  -v $(pwd)/data:/app/server/data \
  -e NODE_ENV=production \
  -e PORT=3001 \
  --restart unless-stopped \
  zhandouxiaojiji/gitlab-reviewer:latest

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 部署成功！"
    echo ""
    echo "📋 部署信息:"
    echo "   - 前端地址: http://$SERVER_IP:8080"
    echo "   - API地址:  http://$SERVER_IP:3001"
    echo "   - 数据目录: $(pwd)/data"
    echo ""
    echo "👤 默认登录信息:"
    echo "   - 用户名: admin"
    echo ""
    echo "🔧 管理命令:"
    echo "   - 查看日志: docker logs gitlab-reviewer"
    echo "   - 停止服务: docker stop gitlab-reviewer"
    echo "   - 重启服务: docker restart gitlab-reviewer"
    echo ""
    echo "✨ 请在浏览器中访问 http://$SERVER_IP:8080 开始使用"
else
    echo "❌ 部署失败，请检查错误信息"
    exit 1
fi 