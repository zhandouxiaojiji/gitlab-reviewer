import React, { useState, useEffect } from 'react';
import { Table, Card, Button, Select, message, Spin, Tag, Typography, Space } from 'antd';
import { useParams, useNavigate } from 'react-router-dom';
import { ReloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

interface Commit {
  id: string;
  message: string;
  author_name: string;
  author_email: string;
  created_at: string;
  web_url: string;
  short_id: string;
  hasComments: boolean;
  commentsCount: number;
}

interface Project {
  id: string;
  name: string;
  gitlab_url: string;
  access_token: string;
}

const CodeReview: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  
  const [commits, setCommits] = useState<Commit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      } else {
        throw new Error('获取项目列表失败');
      }
    } catch (error) {
      console.error('获取项目列表失败:', error);
      message.error('获取项目列表失败');
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadCommits = async (projectId: string) => {
    try {
      setLoading(true);
      setCommits([]);
      
      const response = await fetch(`/api/gitlab/projects/${projectId}/commits`);
      if (response.ok) {
        const data = await response.json();
        setCommits(data);
        message.success(`成功获取 ${data.length} 条提交记录`);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || '获取提交记录失败');
      }
    } catch (error) {
      console.error('获取提交记录失败:', error);
      message.error(error instanceof Error ? error.message : '获取提交记录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = (projectId: string) => {
    setSelectedProject(projectId);
    if (projectId) {
      loadCommits(projectId);
    } else {
      setCommits([]);
    }
  };

  const handleRefresh = () => {
    if (selectedProject) {
      loadCommits(selectedProject);
    }
  };

  const columns = [
    {
      title: '提交ID',
      dataIndex: 'short_id',
      key: 'short_id',
      width: 100,
      render: (shortId: string, record: Commit) => (
        <a href={record.web_url} target="_blank" rel="noopener noreferrer">
          {shortId}
        </a>
      ),
    },
    {
      title: '提交信息',
      dataIndex: 'message',
      key: 'message',
      render: (message: string) => (
        <Text ellipsis={{ tooltip: message }} style={{ maxWidth: 300 }}>
          {message}
        </Text>
      ),
    },
    {
      title: '作者',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 120,
    },
    {
      title: '提交时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: 'Review状态',
      key: 'review_status',
      width: 120,
      render: (record: Commit) => (
        <Space>
          {record.hasComments ? (
            <Tag color="green">已Review</Tag>
          ) : (
            <Tag color="orange">待Review</Tag>
          )}
          {record.commentsCount > 0 && (
            <Text type="secondary">({record.commentsCount}条评论)</Text>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={3}>代码审查 - {username}</Title>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={handleRefresh}
            disabled={!selectedProject || loading}
          >
            刷新
          </Button>
        </div>
        
        <div>
          <Text strong>选择项目：</Text>
          <Select
            style={{ width: 300, marginLeft: 8 }}
            placeholder="请选择要查看的项目"
            value={selectedProject}
            onChange={handleProjectChange}
            loading={projectsLoading}
          >
            <Option value="">全部项目</Option>
            {projects.map(project => (
              <Option key={project.id} value={project.id}>
                {project.name}
              </Option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text>正在获取提交记录...</Text>
            </div>
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={commits}
            rowKey="id"
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
            }}
            locale={{ emptyText: selectedProject ? '暂无提交记录' : '请先选择项目' }}
          />
        )}
      </Space>
    </Card>
  );
};

export default CodeReview; 