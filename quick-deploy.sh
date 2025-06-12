#!/bin/bash

# GitLab Reviewer 快速部署脚本
echo "🚀 GitLab Reviewer 快速部署脚本"
echo "=================================="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: Docker 未安装，请先安装 Docker"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ 错误: Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

# 获取服务器IP地址
SERVER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="localhost"
fi

echo "🔍 检测到服务器IP: $SERVER_IP"

# 询问用户API访问方式
echo ""
echo "请选择API访问方式："
echo "1. 使用IP地址访问 (推荐，适合大多数情况)"
echo "2. 使用域名访问 (需要你有域名并配置了DNS)"
echo "3. 使用localhost (仅本机访问)"
read -p "请输入选择 (1-3，默认为1): " API_CHOICE

case $API_CHOICE in
    2)
        read -p "请输入你的域名 (例如: example.com): " DOMAIN_NAME
        if [ -z "$DOMAIN_NAME" ]; then
            echo "❌ 域名不能为空"
            exit 1
        fi
        API_URL="http://$DOMAIN_NAME:3001"
        ;;
    3)
        API_URL="http://localhost:3001"
        ;;
    *)
        API_URL="http://$SERVER_IP:3001"
        ;;
esac

echo "🔧 配置API地址为: $API_URL"

# 创建数据目录
echo "📁 创建数据目录..."
mkdir -p ./data

# 拉取最新镜像
echo "📦 拉取最新Docker镜像..."
if ! docker pull your-dockerhub-username/gitlab-reviewer:latest; then
    echo "⚠️  拉取镜像失败，尝试本地构建..."
    if ! docker build -t your-dockerhub-username/gitlab-reviewer:latest .; then
        echo "❌ 构建镜像失败"
        exit 1
    fi
fi

# 停止并删除旧容器
echo "🛑 停止旧容器..."
docker stop gitlab-reviewer 2>/dev/null || true
docker rm gitlab-reviewer 2>/dev/null || true

# 启动新容器
echo "🚀 启动GitLab Reviewer..."
docker run -d \
    --name gitlab-reviewer \
    -p 8080:80 \
    -p 3001:3001 \
    -v $(pwd)/data:/app/server/data \
    -e NODE_ENV=production \
    -e PORT=3001 \
    -e REACT_APP_API_URL="$API_URL" \
    --restart unless-stopped \
    your-dockerhub-username/gitlab-reviewer:latest

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
if docker ps | grep -q gitlab-reviewer; then
    echo ""
    echo "🎉 部署成功！"
    echo "=================================="
    echo "📱 前端地址: http://$SERVER_IP:8080"
    echo "🔌 API地址: $API_URL"
    echo "👤 默认账号: admin"
    echo "🔑 默认密码: admin123"
    echo ""
    echo "📋 管理命令:"
    echo "  查看日志: docker logs gitlab-reviewer"
    echo "  停止服务: docker stop gitlab-reviewer"
    echo "  启动服务: docker start gitlab-reviewer"
    echo "  重启服务: docker restart gitlab-reviewer"
    echo ""
    echo "💡 提示: 首次使用请先配置GitLab项目信息"
else
    echo "❌ 部署失败，请检查Docker日志: docker logs gitlab-reviewer"
    exit 1
fi 