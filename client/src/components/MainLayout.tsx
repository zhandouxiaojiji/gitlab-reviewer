import React, { useEffect, useState } from 'react';
import { Layout, Menu, Button, message, Typography } from 'antd';
import { 
  DashboardOutlined, 
  SettingOutlined,
  LogoutOutlined,
  UserOutlined,
  GitlabOutlined,
  CodeOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

interface MainLayoutProps {
  children: React.ReactNode;
}

interface GitLabProject {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
  createdAt: string;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const username = searchParams.get('user');
  const projectName = searchParams.get('project');
  
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [userNickname, setUserNickname] = useState<string>('');

  useEffect(() => {
    // 如果URL中没有用户名参数，跳转到登录页
    if (!username) {
      navigate('/login');
    } else {
      loadProjects();
      loadUserNickname();
    }
  }, [username, navigate]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/projects');
      setProjects(response.data || []);
    } catch (error) {
      console.error('加载项目配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取当前登录用户的昵称
  const loadUserNickname = async () => {
    try {
      if (!username) return;
      
      // 获取第一个项目的配置来调用GitLab API
      const projectsResponse = await api.get('/api/projects');
      const projects = projectsResponse.data || [];
      
      if (projects.length > 0) {
        const firstProject = projects[0];
        const response = await api.get(`/api/gitlab/projects/${firstProject.id}/users/${encodeURIComponent(username)}`);
        if (response.data.user) {
          setUserNickname(response.data.user.name || username);
        } else {
          setUserNickname(username);
        }
      } else {
        setUserNickname(username);
      }
    } catch (error) {
      console.warn('获取用户昵称失败:', error);
      setUserNickname(username || '');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
    message.success('已成功退出登录');
  };

  const handleMenuClick = (key: string) => {
    // 在切换菜单时保持用户名参数
    switch (key) {
      case 'dashboard':
        navigate(`/dashboard?user=${username}`);
        break;
      case 'code-review':
        navigate(`/code-review?user=${username}`);
        break;
      case 'settings':
        navigate(`/settings?user=${username}`);
        break;
      default:
        // 处理项目菜单项点击
        if (key.startsWith('project-')) {
          const projectId = key.replace('project-', '');
          const project = projects.find(p => p.id === projectId);
          if (project) {
            navigate(`/project?user=${username}&project=${encodeURIComponent(project.name)}&id=${projectId}`);
          }
        }
        break;
    }
  };

  // 根据当前路径确定选中的菜单项
  const getSelectedKey = () => {
    if (location.pathname.includes('/settings')) return 'settings';
    if (location.pathname.includes('/code-review')) return 'code-review';
    if (location.pathname.includes('/project') && projectName) {
      const project = projects.find(p => p.name === decodeURIComponent(projectName));
      return project ? `project-${project.id}` : 'dashboard';
    }
    return 'dashboard'; // 默认是dashboard
  };

  // 构建菜单项
  const getMenuItems = () => {
    const baseItems = [
      {
        key: 'dashboard',
        icon: <DashboardOutlined />,
        label: '仪表盘',
      },
      {
        key: 'code-review',
        icon: <CodeOutlined />,
        label: '代码审查',
      }
    ];

    // 添加项目菜单项
    const projectItems = projects.map(project => ({
      key: `project-${project.id}`,
      icon: <GitlabOutlined />,
      label: project.description || project.name, // 优先显示描述，没有描述则显示项目名称
    }));

    const settingsItem = {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    };

    return [...baseItems, ...projectItems, settingsItem];
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
          selectedKeys={[getSelectedKey()]}
          onClick={({ key }) => handleMenuClick(key)}
          items={getMenuItems()}
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
            <h2 style={{ margin: 0 }}>
              {projectName ? `${decodeURIComponent(projectName)} - GitLab 代码审查` : 'GitLab 代码审查管理'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserOutlined />
              <Text strong>{userNickname || username}</Text>
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
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout; 