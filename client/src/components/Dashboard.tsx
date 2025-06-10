import React from 'react';
import { Card } from 'antd';
import MainLayout from './MainLayout';

const Dashboard: React.FC = () => {
  return (
    <MainLayout>
      <Card title="欢迎使用 GitLab 代码审查管理工具">
        <p>这是一个用于管理 GitLab 代码审查的工具，您可以：</p>
        <ul>
          <li>查看每次提交的审查状态</li>
          <li>记录审查者信息</li>
          <li>配置多个项目</li>
          <li>基于 GitLab commit 评论来判断审查状态</li>
        </ul>
      </Card>
    </MainLayout>
  );
};

export default Dashboard; 