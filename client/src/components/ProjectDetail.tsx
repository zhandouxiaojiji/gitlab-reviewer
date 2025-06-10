import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, message, Typography } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  GitlabOutlined,
  EyeOutlined,
  CommentOutlined,
  CalendarOutlined,
  UserOutlined
} from '@ant-design/icons';
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

interface CommitReview {
  id: string;
  commitId: string;
  commitMessage: string;
  author: string;
  date: string;
  hasReview: boolean;
  reviewer?: string;
  reviewComments: number;
}

const ProjectDetail: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');
  const projectName = searchParams.get('project');
  const projectId = searchParams.get('id');
  
  const [project, setProject] = useState<GitLabProject | null>(null);
  const [commits, setCommits] = useState<CommitReview[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    if (!projectId) {
      navigate(`/dashboard?user=${username}`);
      return;
    }
    loadProjectDetail();
    loadCommitReviews();
  }, [username, projectId, navigate]);

  const loadProjectDetail = async () => {
    try {
      const response = await api.get(`/api/projects/${projectId}`);
      setProject(response.data);
    } catch (error) {
      message.error('加载项目信息失败');
      navigate(`/dashboard?user=${username}`);
    }
  };

  const loadCommitReviews = async () => {
    setLoading(true);
    try {
      // 这里是模拟数据，实际应该从GitLab API获取
      const mockCommits: CommitReview[] = [
        {
          id: '1',
          commitId: 'abc123',
          commitMessage: '修复登录页面样式问题',
          author: '张三',
          date: '2024-01-15 10:30:00',
          hasReview: true,
          reviewer: '李四',
          reviewComments: 2
        },
        {
          id: '2',
          commitId: 'def456',
          commitMessage: '添加用户权限管理功能',
          author: '王五',
          date: '2024-01-15 09:15:00',
          hasReview: false,
          reviewComments: 0
        },
        {
          id: '3',
          commitId: 'ghi789',
          commitMessage: '优化数据库查询性能',
          author: '赵六',
          date: '2024-01-14 16:45:00',
          hasReview: true,
          reviewer: '张三',
          reviewComments: 5
        }
      ];
      
      setCommits(mockCommits);
    } catch (error) {
      message.error('加载提交记录失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '提交ID',
      dataIndex: 'commitId',
      key: 'commitId',
      width: 120,
      render: (text: string) => (
        <Text code style={{ fontSize: '12px' }}>{text.substring(0, 8)}</Text>
      ),
    },
    {
      title: '提交信息',
      dataIndex: 'commitMessage',
      key: 'commitMessage',
      ellipsis: true,
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 100,
      render: (text: string) => (
        <Space>
          <UserOutlined />
          {text}
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'date',
      key: 'date',
      width: 160,
      render: (text: string) => (
        <Space>
          <CalendarOutlined />
          {text}
        </Space>
      ),
    },
    {
      title: '审查状态',
      dataIndex: 'hasReview',
      key: 'hasReview',
      width: 100,
      render: (hasReview: boolean, record: CommitReview) => (
        <Space direction="vertical" size="small">
          <Tag color={hasReview ? 'green' : 'red'}>
            {hasReview ? '已审查' : '待审查'}
          </Tag>
          {hasReview && record.reviewer && (
            <Text type="secondary" style={{ fontSize: '12px' }}>
              审查者: {record.reviewer}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '评论数',
      dataIndex: 'reviewComments',
      key: 'reviewComments',
      width: 80,
      render: (count: number) => (
        <Space>
          <CommentOutlined />
          {count}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: CommitReview) => (
        <Button 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => {
            // 打开GitLab查看提交详情
            if (project) {
              const gitlabCommitUrl = `${project.gitlabUrl}/-/commit/${record.commitId}`;
              window.open(gitlabCommitUrl, '_blank');
            }
          }}
        >
          查看
        </Button>
      ),
    },
  ];

  if (!project) {
    return <MainLayout><div>加载中...</div></MainLayout>;
  }

  const reviewedCount = commits.filter(c => c.hasReview).length;
  const totalCount = commits.length;
  const reviewRate = totalCount > 0 ? ((reviewedCount / totalCount) * 100).toFixed(1) : '0';

  return (
    <MainLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 项目信息卡片 */}
        <Card>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <GitlabOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
              <Title level={3} style={{ margin: 0 }}>{project.name}</Title>
            </div>
            
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div>
                <Text type="secondary">GitLab地址:</Text>
                <br />
                <Text code>{project.gitlabUrl}</Text>
              </div>
              {project.description && (
                <div>
                  <Text type="secondary">项目描述:</Text>
                  <br />
                  <Text>{project.description}</Text>
                </div>
              )}
              <div>
                <Text type="secondary">审查覆盖率:</Text>
                <br />
                <Text strong style={{ fontSize: '16px', color: reviewedCount === totalCount ? '#52c41a' : '#fa8c16' }}>
                  {reviewRate}% ({reviewedCount}/{totalCount})
                </Text>
              </div>
            </div>
          </Space>
        </Card>

        {/* 提交记录表格 */}
        <Card title="提交记录与审查状态">
          <Table
            columns={columns}
            dataSource={commits}
            rowKey="id"
            loading={loading}
            pagination={{
              pageSize: 10,
              showQuickJumper: true,
              showSizeChanger: true,
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            }}
            locale={{
              emptyText: '暂无提交记录'
            }}
          />
        </Card>
      </Space>
    </MainLayout>
  );
};

export default ProjectDetail; 