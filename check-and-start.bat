@echo off
echo 正在启动GitLab Review后端服务...

cd server
echo 安装依赖...
call npm install

echo 启动服务...
call npm run dev

pause 