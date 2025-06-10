import React from 'react';
import { Layout, Menu, Card, Button, message } from 'antd';
import { 
  DashboardOutlined, 
  ProjectOutlined, 
  SettingOutlined,
  LogoutOutlined 
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';

const { Header, Sider, Content } = Layout;

const Dashboard: React.FC = () => {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    message.success('已成功退出登录');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible>
        <div 
          style={{ 
            height: 64, 
            margin: 16, 
            background: 'rgba(255, 255, 255, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '18px',
            fontWeight: 'bold'
          }}
        >
          GitLab 代码审查
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          items={[
            {
              key: '1',
              icon: <DashboardOutlined />,
              label: '仪表盘',
            },
            {
              key: '2',
              icon: <ProjectOutlined />,
              label: '项目管理',
            },
            {
              key: '3',
              icon: <SettingOutlined />,
              label: '设置',
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 16px', 
          background: '#fff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0 }}>GitLab 代码审查管理</h2>
          <Button 
            type="text" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Header>
        <Content style={{ margin: '16px' }}>
          <Card title="欢迎使用 GitLab 代码审查管理工具">
            <p>这是一个用于管理 GitLab 代码审查的工具，您可以：</p>
            <ul>
              <li>查看每次提交的审查状态</li>
              <li>记录审查者信息</li>
              <li>配置多个项目</li>
              <li>基于 GitLab commit 评论来判断审查状态</li>
            </ul>
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
};

export default Dashboard; 