#!/bin/bash

# 设置变量
DOCKER_REPO="zhandouxiaojiji/gitlab-reviewer"
VERSION=${1:-latest}

echo "开始构建 GitLab Reviewer Docker 镜像..."

# 构建镜像
echo "正在构建镜像: ${DOCKER_REPO}:${VERSION}"
docker build -t ${DOCKER_REPO}:${VERSION} .

if [ $? -eq 0 ]; then
    echo "镜像构建成功!"
    
    # 标记为 latest
    if [ "$VERSION" != "latest" ]; then
        docker tag ${DOCKER_REPO}:${VERSION} ${DOCKER_REPO}:latest
    fi
    
    # 推送到 Docker Hub
    echo "正在推送镜像到 Docker Hub..."
    docker push ${DOCKER_REPO}:${VERSION}
    
    if [ "$VERSION" != "latest" ]; then
        docker push ${DOCKER_REPO}:latest
    fi
    
    if [ $? -eq 0 ]; then
        echo "镜像推送成功!"
        echo "你可以使用以下命令拉取镜像:"
        echo "docker pull ${DOCKER_REPO}:${VERSION}"
    else
        echo "镜像推送失败!"
        exit 1
    fi
else
    echo "镜像构建失败!"
    exit 1
fi

echo "完成!" 