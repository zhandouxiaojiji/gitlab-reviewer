import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Button, Space, message, Typography } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  GitlabOutlined,
  EyeOutlined,
  CommentOutlined,
  CalendarOutlined,
  UserOutlined,
  ReloadOutlined
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
  fullCommitId: string;
  commitMessage: string;
  author: string;
  date: string;
  hasReview: boolean;
  reviewer?: string;
  reviewComments: number;
  gitlabUrl?: string;
  key?: string;
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
  const [error, setError] = useState<string | null>(null);

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
      if (!projectId) {
        throw new Error('项目ID不存在');
      }

      const token = localStorage.getItem('token');
      console.log('开始获取项目提交记录...', { projectId, token: token ? '有token' : '无token' });

      const response = await fetch(`http://localhost:3001/api/gitlab/projects/${projectId}/commits`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('API响应状态:', response.status);
      console.log('API响应头:', response.headers.get('content-type'));

      // 检查响应状态
      if (response.status === 404) {
        setError('项目不存在或无法访问');
        setCommits([]);
        return;
      } else if (response.status === 401) {
        setError('认证失败，请重新登录');
        setCommits([]);
        return;
      } else if (!response.ok) {
        const errorText = await response.text();
        console.error('API错误响应:', errorText);
        setError(`服务器错误 (${response.status})`);
        setCommits([]);
        return;
      }

      // 检查响应内容类型
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const htmlContent = await response.text();
        console.error('API返回了非JSON内容:', htmlContent.substring(0, 200));
        
        if (htmlContent.includes('<!DOCTYPE')) {
          setError('API路由不存在，请检查后端服务是否正确启动');
        } else {
          setError('服务器返回了错误的数据格式');
        }
        setCommits([]);
        return;
      }

      const data = await response.json();
      console.log('API返回数据:', data);

      // 检查数据结构
      if (!data || typeof data !== 'object') {
        setError('服务器返回的数据格式错误');
        setCommits([]);
        return;
      }

      // 处理提交数据
      let commitsData = [];
      if (Array.isArray(data)) {
        // 如果直接返回数组
        commitsData = data;
      } else if (data.commits && Array.isArray(data.commits)) {
        // 如果是包装在commits字段中的数组
        commitsData = data.commits;
      } else {
        console.warn('未找到commits数据，数据结构:', Object.keys(data));
        setError('未找到提交记录数据');
        setCommits([]);
        return;
      }

      if (commitsData.length === 0) {
        setError('该项目暂无提交记录');
        setCommits([]);
        return;
      }

      // 转换数据格式以匹配表格显示
      const formattedCommits = commitsData.map((commit: any, index: number) => ({
        key: commit.id || commit.short_id || index,
        id: String(index + 1),
        commitId: commit.short_id || commit.id?.substring(0, 8) || '未知',
        fullCommitId: commit.id || commit.short_id || '',
        commitMessage: commit.message || commit.title || '无提交信息',
        author: commit.author_name || commit.author?.name || '未知作者',
        date: commit.committed_date || commit.created_at || new Date().toISOString(),
        hasReview: commit.has_comments || commit.comments_count > 0 || false,
        reviewer: commit.comments && commit.comments.length > 0 
          ? commit.comments[0].author?.name || commit.comments[0].author_name || '有评论'
          : (commit.has_comments ? '有评论' : ''),
        reviewComments: commit.comments_count || (commit.comments ? commit.comments.length : 0),
        gitlabUrl: commit.web_url
      }));

      console.log('格式化后的提交数据:', formattedCommits.slice(0, 2));
      setCommits(formattedCommits);
      
      if (formattedCommits.length > 0) {
        setError('');
        message.success(`成功获取 ${formattedCommits.length} 条提交记录`);
      }
    } catch (error) {
      console.error('获取提交记录失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(`获取提交记录失败: ${errorMessage}`);
      
      // 提供模拟数据选项
      if (errorMessage.includes('API路由不存在') || errorMessage.includes('服务器错误')) {
        setError(`
          后端服务连接失败。请检查：
          1. 后端服务是否正在运行 (端口3001)
          2. GitLab API路由是否正确配置
          
          提示：您可以点击下方"加载演示数据"按钮查看功能演示
        `);
      }
    } finally {
      setLoading(false);
    }
  };

  // 加载演示数据的函数
  const loadDemoData = () => {
    const demoCommits: CommitReview[] = [
      {
        key: 'demo1',
        id: '1',
        commitId: 'abc123ef',
        fullCommitId: 'abc123ef456789012345678901234567890abcdef',
        commitMessage: 'feat: 添加用户认证功能',
        author: '张三',
        date: '2024-01-15 10:30:00',
        hasReview: true,
        reviewer: '李四',
        reviewComments: 3,
        gitlabUrl: `${project?.gitlabUrl}/-/commit/abc123ef456789012345678901234567890abcdef`
      },
      {
        key: 'demo2',
        id: '2',
        commitId: 'def456gh',
        fullCommitId: 'def456gh789012345678901234567890abcdef123',
        commitMessage: 'fix: 修复登录页面样式问题',
        author: '王五',
        date: '2024-01-14 16:45:00',
        hasReview: false,
        reviewer: '',
        reviewComments: 0,
        gitlabUrl: `${project?.gitlabUrl}/-/commit/def456gh789012345678901234567890abcdef123`
      },
      {
        key: 'demo3',
        id: '3',
        commitId: 'ghi789jk',
        fullCommitId: 'ghi789jk012345678901234567890abcdef123456',
        commitMessage: 'docs: 更新API文档',
        author: '赵六',
        date: '2024-01-13 14:20:00',
        hasReview: true,
        reviewer: '钱七',
        reviewComments: 1,
        gitlabUrl: `${project?.gitlabUrl}/-/commit/ghi789jk012345678901234567890abcdef123456`
      }
    ];
    
    setCommits(demoCommits);
    setError('');
    message.success('已加载演示数据，展示功能界面');
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
            // 打开GitLab查看提交详情，使用完整的commit ID
            if (project) {
              const gitlabCommitUrl = `${project.gitlabUrl}/-/commit/${record.fullCommitId}`;
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
        <Card 
          title="提交记录与审查状态"
          extra={
            <Button 
              type="primary" 
              icon={<ReloadOutlined />} 
              onClick={loadCommitReviews}
              loading={loading}
            >
              刷新数据
            </Button>
          }
        >
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Text type="danger">{error}</Text>
              {(error.includes('后端服务连接失败') || error.includes('API路由不存在')) && (
                <div style={{ marginTop: 8 }}>
                  <Button 
                    type="default" 
                    size="small"
                    onClick={loadDemoData}
                  >
                    加载演示数据
                  </Button>
                </div>
              )}
            </div>
          )}
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