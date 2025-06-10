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
  Typography
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined,
  GitlabOutlined,
  LinkOutlined,
  KeyOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text } = Typography;

interface GitLabProject {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
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

  const handleAddProject = () => {
    setEditingProject(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditProject = (project: GitLabProject) => {
    setEditingProject(project);
    form.setFieldsValue(project);
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

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <GitlabOutlined style={{ color: '#1890ff' }} />
          <Text strong>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'GitLab地址',
      dataIndex: 'gitlabUrl',
      key: 'gitlabUrl',
      render: (text: string) => (
        <Space>
          <LinkOutlined />
          <Text code>{text}</Text>
        </Space>
      ),
    },
    {
      title: 'Access Token',
      dataIndex: 'accessToken',
      key: 'accessToken',
      render: (text: string) => (
        <Space>
          <KeyOutlined />
          <Text code>{text ? '••••••••••••' + text.slice(-4) : ''}</Text>
        </Space>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
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