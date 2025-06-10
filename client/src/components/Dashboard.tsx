import React, { useEffect } from 'react';
import { Layout, Menu, Card, Button, message, Typography } from 'antd';
import { 
  DashboardOutlined, 
  ProjectOutlined, 
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  GitlabOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const Dashboard: React.FC = () => {
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');

  useEffect(() => {
    // 如果URL中没有用户名参数，跳转到登录页
    if (!username) {
      navigate('/login');
    }
  }, [username, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    message.success('已成功退出登录');
  };

  const handleMenuClick = (key: string) => {
    // 在切换菜单时保持用户名参数
    switch (key) {
      case '1':
        navigate(`/dashboard?user=${username}`);
        break;
      case '2':
        navigate(`/projects?user=${username}`);
        break;
      case '3':
        navigate(`/settings?user=${username}`);
        break;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible>
        <div 
          style={{ 
            height: 64, 
            margin: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            borderRadius: '8px',
            gap: '8px'
          }}
        >
          <GitlabOutlined style={{ fontSize: '20px' }} />
          <span>GitLab Review</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          onClick={({ key }) => handleMenuClick(key)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h2 style={{ margin: 0 }}>GitLab 代码审查管理</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserOutlined />
              <Text strong>{username}</Text>
            </div>
          </div>
          <Button 
            type="text" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
          >
            退出登录
          </Button>
        </Header>
        <Content style={{ margin: '16px' }}>
          <Card title={`欢迎 ${username}，使用 GitLab 代码审查管理工具`}>
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