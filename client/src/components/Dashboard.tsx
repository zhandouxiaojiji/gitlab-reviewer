import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Table,
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  message,
} from 'antd';
import {
  DashboardOutlined,
  ProjectOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const { Header, Sider, Content } = Layout;
const { confirm } = Modal;

interface Project {
  _id: string;
  name: string;
  gitlabProjectId: number;
  gitlabUrl: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

interface Review {
  _id: string;
  commitId: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  hasReview: boolean;
  reviewedBy?: string[];
  gitlabCommitUrl: string;
  projectId: {
    name: string;
    gitlabUrl: string;
  };
}

interface Stats {
  totalCommits: number;
  reviewedCommits: number;
  unReviewedCommits: number;
  reviewRate: string;
}

const Dashboard: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalCommits: 0,
    reviewedCommits: 0,
    unReviewedCommits: 0,
    reviewRate: '0%',
  });
  const [loading, setLoading] = useState(false);
  const [projectModalVisible, setProjectModalVisible] = useState(false);
  const [form] = Form.useForm();
  const { user, logout } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadProjects(), loadReviews(), loadStats()]);
    } catch (error) {
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await api.get('/api/projects');
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('加载项目失败:', error);
    }
  };

  const loadReviews = async () => {
    try {
      const response = await api.get('/api/reviews');
      setReviews(response.data.reviews || []);
    } catch (error) {
      console.error('加载review记录失败:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/api/reviews/stats');
      setStats(response.data.stats);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  const handleLogout = () => {
    confirm({
      title: '确认退出',
      icon: <ExclamationCircleOutlined />,
      content: '您确定要退出登录吗？',
      onOk() {
        logout();
      },
    });
  };

  const handleAddProject = async (values: any) => {
    try {
      await api.post('/api/projects', values);
      message.success('项目添加成功');
      setProjectModalVisible(false);
      form.resetFields();
      loadProjects();
    } catch (error: any) {
      message.error(error.response?.data?.message || '添加项目失败');
    }
  };

  const projectColumns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'GitLab项目ID',
      dataIndex: 'gitlabProjectId',
      key: 'gitlabProjectId',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'}>
          {isActive ? '活跃' : '已停用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleDateString(),
    },
  ];

  const reviewColumns = [
    {
      title: 'Commit ID',
      dataIndex: 'commitId',
      key: 'commitId',
      render: (text: string) => text.substring(0, 8),
    },
    {
      title: 'Commit信息',
      dataIndex: 'commitMessage',
      key: 'commitMessage',
      ellipsis: true,
    },
    {
      title: '作者',
      dataIndex: 'commitAuthor',
      key: 'commitAuthor',
    },
    {
      title: '项目',
      dataIndex: ['projectId', 'name'],
      key: 'projectName',
    },
    {
      title: 'Review状态',
      dataIndex: 'hasReview',
      key: 'hasReview',
      render: (hasReview: boolean) => (
        <Tag
          icon={hasReview ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={hasReview ? 'success' : 'error'}
        >
          {hasReview ? '已Review' : '未Review'}
        </Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'commitDate',
      key: 'commitDate',
      render: (text: string) => new Date(text).toLocaleDateString(),
    },
  ];

  const renderContent = () => {
    if (selectedKey === 'dashboard') {
      return (
        <div>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <Statistic
                  title="总提交数"
                  value={stats.totalCommits}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="已Review"
                  value={stats.reviewedCommits}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="未Review"
                  value={stats.unReviewedCommits}
                  valueStyle={{ color: '#f5222d' }}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <Statistic
                  title="Review率"
                  value={stats.reviewRate}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            title="最近的Review记录"
            extra={
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadReviews()}
                loading={loading}
              >
                刷新
              </Button>
            }
          >
            <Table
              columns={reviewColumns}
              dataSource={reviews.slice(0, 10)}
              rowKey="_id"
              pagination={false}
              loading={loading}
            />
          </Card>
        </div>
      );
    }

    if (selectedKey === 'projects') {
      return (
        <Card
          title="项目管理"
          extra={
            <Space>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setProjectModalVisible(true)}
              >
                添加项目
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadProjects()}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          }
        >
          <Table
            columns={projectColumns}
            dataSource={projects}
            rowKey="_id"
            loading={loading}
          />
        </Card>
      );
    }

    return null;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div className="logo">
          GitLab Review
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          onClick={({ key }) => setSelectedKey(key)}
          items={[
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: '仪表板',
            },
            {
              key: 'projects',
              icon: <ProjectOutlined />,
              label: '项目管理',
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: 0, paddingRight: 24 }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            height: '100%'
          }}>
            <Button
              type="text"
              icon={collapsed ? '>' : '<'}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: '16px', width: 64, height: 64 }}
            />
            <Space>
              <span>欢迎，{user?.username}</span>
              <Button
                type="text"
                icon={<LogoutOutlined />}
                onClick={handleLogout}
              >
                退出
              </Button>
            </Space>
          </div>
        </Header>
        <Content className="site-layout-content">
          {renderContent()}
        </Content>
      </Layout>

      <Modal
        title="添加项目"
        open={projectModalVisible}
        onCancel={() => {
          setProjectModalVisible(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddProject}
        >
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item
            name="gitlabProjectId"
            label="GitLab项目ID"
            rules={[{ required: true, message: '请输入GitLab项目ID' }]}
          >
            <Input type="number" placeholder="请输入GitLab项目ID" />
          </Form.Item>
          <Form.Item
            name="gitlabUrl"
            label="GitLab项目URL"
            rules={[{ required: true, message: '请输入GitLab项目URL' }]}
          >
            <Input placeholder="请输入GitLab项目URL" />
          </Form.Item>
          <Form.Item
            name="description"
            label="项目描述"
          >
            <Input.TextArea placeholder="请输入项目描述" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                确定
              </Button>
              <Button onClick={() => {
                setProjectModalVisible(false);
                form.resetFields();
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default Dashboard; 