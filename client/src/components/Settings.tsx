import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Form, 
  Input, 
  Button, 
  Table, 
  Space, 
  message, 
  Modal,
  Popconfirm,
  Typography,
  Divider,
  Select,
  Tag
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  GitlabOutlined,
  LinkOutlined,
  KeyOutlined,
  UserOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { getApiUrl } from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text } = Typography;

interface GitLabProject {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
  reviewers?: string[]; // 审核人员用户名列表
  userMappings?: { [username: string]: string }; // 用户名到昵称的映射
  reviewDays?: number; // 审核范围（天数），默认7天
  filterRules?: string; // 过滤规则（正则表达式），匹配到的commit无需审查
  refreshInterval?: number; // 刷新频率（分钟），默认1分钟
  createdAt: string;
}

const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');
  
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<GitLabProject | null>(null);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]); // 可选用户列表
  const [loadingUsers, setLoadingUsers] = useState(false); // 加载用户状态
  const [form] = Form.useForm();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    loadProjects();
  }, [username, navigate]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/projects');
      setProjects(response.data || []);
    } catch (error) {
      message.error('加载项目配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载项目的用户列表
  const loadProjectUsers = async (project: GitLabProject) => {
    if (!project.userMappings) return;
    
    setLoadingUsers(true);
    try {
      // 从项目的用户映射关系中获取用户列表
      const users = Object.keys(project.userMappings);
      setAvailableUsers(users);
    } catch (error) {
      console.error('加载项目用户失败:', error);
      message.error('加载项目用户失败');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddProject = () => {
    setEditingProject(null);
    setAvailableUsers([]);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditProject = (project: GitLabProject) => {
    setEditingProject(project);
    form.setFieldsValue({
      ...project,
      reviewers: project.reviewers || [],
      reviewDays: project.reviewDays || 7,
      refreshInterval: project.refreshInterval || 1
    });
    // 加载项目用户列表
    loadProjectUsers(project);
    setModalVisible(true);
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await api.delete(`/api/projects/${id}`);
      message.success('项目配置删除成功');
      loadProjects();
    } catch (error) {
      message.error('删除项目配置失败');
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      if (editingProject) {
        // 更新项目
        await api.put(`/api/projects/${editingProject.id}`, values);
        message.success('项目配置更新成功');
      } else {
        // 新增项目
        await api.post('/api/projects', values);
        message.success('项目配置添加成功');
      }
      setModalVisible(false);
      loadProjects();
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存项目配置失败');
    }
  };

  const handleTestConnection = async (project: GitLabProject) => {
    try {
      setLoading(true);
      await api.post(`/api/projects/${project.id}/test`);
      message.success('GitLab连接测试成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || 'GitLab连接测试失败');
    } finally {
      setLoading(false);
    }
  };

  // 刷新单个项目的用户映射关系
  const handleRefreshProjectUserMappings = async (project: GitLabProject) => {
    try {
      setLoading(true);
      
      const response = await api.post(`/api/projects/${project.id}/refresh-users`);
      
      message.success(`项目 "${project.name}" 用户映射关系刷新成功，共更新 ${response.data.userCount} 个用户`);
    } catch (error) {
      console.error('刷新用户映射关系失败:', error);
      message.error(`刷新项目 "${project.name}" 用户映射关系失败`);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '项目信息',
      key: 'info',
      render: (_: any, record: GitLabProject) => (
        <div>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            <GitlabOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            {record.name}
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
            <LinkOutlined style={{ marginRight: '4px' }} />
            {record.gitlabUrl}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            <KeyOutlined style={{ marginRight: '4px' }} />
            Token: {record.accessToken ? '已配置' : '未配置'}
          </div>
          {record.description && (
            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '配置信息',
      key: 'config',
      render: (_: any, record: GitLabProject) => (
        <div>
          <div style={{ marginBottom: '4px' }}>
            <Text strong>审核范围: </Text>
            <Tag color="blue">{record.reviewDays || 7} 天</Tag>
          </div>
          <div style={{ marginBottom: '4px' }}>
            <Text strong>刷新频率: </Text>
            <Tag color="orange">{record.refreshInterval || 1} 分钟</Tag>
          </div>
          <div>
            <Text strong>审核人员: </Text>
            {record.reviewers && record.reviewers.length > 0 ? (
              record.reviewers.map(reviewer => (
                <Tag key={reviewer} color="purple">
                  {record.userMappings?.[reviewer] || reviewer}
                </Tag>
              ))
            ) : (
              <Tag color="default">未配置</Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: GitLabProject) => (
        <Space size="middle">
          <Button 
            size="small" 
            onClick={() => handleTestConnection(record)}
            loading={loading}
          >
            测试连接
          </Button>
          <Button 
            size="small" 
            icon={<UserOutlined />}
            onClick={() => handleRefreshProjectUserMappings(record)}
            loading={loading}
          >
            刷新用户
          </Button>
          <Button 
            size="small" 
            icon={<EditOutlined />} 
            onClick={() => handleEditProject(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个项目配置吗？"
            onConfirm={() => handleDeleteProject(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              size="small" 
              icon={<DeleteOutlined />} 
              danger
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <MainLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <Title level={4} style={{ margin: 0 }}>GitLab项目配置</Title>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddProject}
            >
              添加项目
            </Button>
          </div>
          
          <Table
            columns={columns}
            dataSource={projects}
            rowKey="id"
            loading={loading}
            locale={{
              emptyText: '暂无项目配置，请添加项目'
            }}
          />
        </Card>
      </Space>

      <Modal
        title={editingProject ? '编辑项目配置' : '添加项目配置'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            label="项目名称"
            name="name"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如: 前端项目" />
          </Form.Item>

          <Form.Item
            label="GitLab地址"
            name="gitlabUrl"
            rules={[
              { required: true, message: '请输入GitLab地址' },
              { type: 'url', message: '请输入有效的URL地址' }
            ]}
          >
            <Input placeholder="例如: https://gitlab.com/owner/project" />
          </Form.Item>

          <Form.Item
            label="Access Token"
            name="accessToken"
            rules={[{ required: true, message: '请输入Access Token' }]}
          >
            <Input.Password placeholder="GitLab Personal Access Token" />
          </Form.Item>

          <Form.Item
            label="审核人员"
            name="reviewers"
            help="选择需要审核代码的人员，每条提交都需要所有审核人员审核"
          >
            <Select
              mode="multiple"
              placeholder="请选择审核人员"
              loading={loadingUsers}
              disabled={!editingProject || availableUsers.length === 0}
              notFoundContent={!editingProject ? "请先保存项目后再配置审核人员" : "暂无可选用户"}
            >
              {availableUsers.map(username => (
                <Select.Option key={username} value={username}>
                  {editingProject?.userMappings?.[username] || username}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="审核范围"
            name="reviewDays"
            help="显示多少天内的代码提交记录，默认7天"
            initialValue={7}
          >
            <Input
              type="number"
              min={1}
              max={365}
              suffix="天"
              placeholder="请输入天数"
              style={{ width: '200px' }}
            />
          </Form.Item>

          <Form.Item
            label="刷新频率"
            name="refreshInterval"
            help="自动拉取数据的频率，默认1分钟"
            initialValue={1}
          >
            <Input
              type="number"
              min={1}
              max={60}
              suffix="分钟"
              placeholder="请输入刷新频率"
              style={{ width: '200px' }}
            />
          </Form.Item>

          <Form.Item
            label="过滤规则"
            name="filterRules"
            help="输入正则表达式匹配commit log，匹配到的commit无需审查（每行一个规则）"
          >
            <Input.TextArea 
              rows={4} 
              placeholder="例如：&#10;^(build|ci|docs|feat|fix|perf|refactor|style|test).*&#10;^Merge branch.*&#10;^Update.*"
            />
          </Form.Item>

          <Form.Item
            label="项目描述"
            name="description"
          >
            <Input.TextArea 
              rows={3} 
              placeholder="项目的简要描述（可选）" 
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                {editingProject ? '更新' : '添加'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </MainLayout>
  );
};

export default Settings; 