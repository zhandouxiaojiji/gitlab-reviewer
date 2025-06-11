#!/bin/sh

# 启动nginx
nginx

# 启动Node.js后端服务
cd /app/server
node dist/index.js &

# 等待服务启动
sleep 5

# 保持容器运行
wait 