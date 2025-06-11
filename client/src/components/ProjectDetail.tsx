import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Space, message, Typography, List, Avatar, Tooltip, Divider } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  GitlabOutlined,
  EyeOutlined,
  CommentOutlined,
  CalendarOutlined,
  UserOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  CodeOutlined,
  MessageOutlined,
  LinkOutlined
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
  reviewers?: string[]; // 审核人员用户名列表
  userMappings?: { [username: string]: string }; // 用户名到昵称的映射
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
  
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [project, setProject] = useState<GitLabProject | null>(null);
  const [commits, setCommits] = useState<CommitReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userNicknames, setUserNicknames] = useState<{ [username: string]: string }>({});
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return; // 防止重复加载
    
    if (!username) {
      navigate('/login');
      return;
    }
    if (!projectName) {
      navigate(`/dashboard?user=${username}`);
      return;
    }
    
    setIsInitialized(true);
    loadProjects();
  }, [username, projectName]); // 移除navigate依赖

  const loadProjects = async () => {
    try {
      const response = await api.get('/api/projects');
      const projectsData = response.data || [];
      setProjects(projectsData);
      
      // 根据项目名称查找项目
      const foundProject = projectsData.find((p: GitLabProject) => p.name === decodeURIComponent(projectName!));
      if (foundProject) {
        setProject(foundProject);
        loadCommitReviews(foundProject.id);
      } else {
        message.error('未找到指定项目');
        navigate(`/dashboard?user=${username}`);
      }
    } catch (error) {
      message.error('加载项目信息失败');
      navigate(`/dashboard?user=${username}`);
    }
  };

  const loadCommitReviews = async (projectId: string) => {
    if (loading) return; // 防止重复加载
    
    setLoading(true);
    try {
      if (!projectId) {
        throw new Error('项目ID不存在');
      }

      const token = localStorage.getItem('token');

      const response = await fetch(`http://localhost:3001/api/gitlab/projects/${projectId}/commits`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('GitLab访问令牌无效或已过期');
        } else if (response.status === 404) {
          throw new Error('GitLab项目不存在或无法访问');
        } else {
          const errorText = await response.text();
          throw new Error(`API调用失败 (${response.status}): ${errorText.substring(0, 100)}`);
        }
      }

      const data = await response.json();

      // 处理提交数据
      const commits = data.commits || [];
      
      // 直接从后端获取用户映射关系
      const backendUserMappings = data.userMappings || {};
      setUserNicknames(backendUserMappings);
      
      if (commits.length === 0) {
        setError('该项目暂无提交记录');
        setCommits([]);
        return;
      }

      // 格式化提交数据
      const formattedCommits = commits.map((commit: any, index: number) => {
        // 获取第一个评论的作者作为审核人
        let reviewer = '';
        if (commit.has_comments && commit.comments && commit.comments.length > 0) {
          reviewer = commit.comments[0].author?.username || commit.comments[0].author?.name || '';
        }
        
        return {
          key: commit.id || index,
          id: commit.short_id || commit.id?.substring(0, 8) || `commit-${index}`,
          commitId: commit.short_id || commit.id?.substring(0, 8) || `commit-${index}`,
          fullCommitId: commit.id || '',
          commitMessage: commit.message || '无提交信息',
          author: commit.author_name || '未知作者',
          date: commit.committed_date || new Date().toISOString(),
          hasReview: commit.has_comments || false,
          reviewer: reviewer,
          reviewComments: commit.comments_count || 0
        };
      });

      setCommits(formattedCommits);
      
    } catch (error) {
      console.error('获取提交记录失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setError(`获取提交记录失败: ${errorMessage}`);
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
        gitlabUrl: `${project?.gitlabUrl}/${project?.name}/-/commit/abc123ef456789012345678901234567890abcdef`
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
        gitlabUrl: `${project?.gitlabUrl}/${project?.name}/-/commit/def456gh789012345678901234567890abcdef123`
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
        gitlabUrl: `${project?.gitlabUrl}/${project?.name}/-/commit/ghi789jk012345678901234567890abcdef123456`
      }
    ];
    
    setCommits(demoCommits);
    setError('');
    message.success('已加载演示数据，展示功能界面');
  };

  // 格式化时间函数
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString;
      }
      
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      return dateString;
    }
  };

  // 复制提交ID
  const copyCommitId = (commitId: string) => {
    navigator.clipboard.writeText(commitId);
    message.success('提交ID已复制到剪贴板');
  };

  // 删除原来的 columns 定义，替换为列表渲染函数
  const renderCommitItem = (commit: CommitReview) => {
    return (
    <div
      className="commit-item"
      style={{
        padding: '16px',
        margin: '8px 0',
        backgroundColor: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: '8px',
        transition: 'all 0.3s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px'
      }}
    >
      {/* 左侧图标 */}
      <Avatar
        icon={<CodeOutlined />}
        style={{
          backgroundColor: '#f6ffed',
          color: '#52c41a',
          border: '1px solid #d9f7be',
          flexShrink: 0
        }}
      />

      {/* 主要内容区域 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 顶部：提交信息和状态 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text
              strong
              style={{
                fontSize: '15px',
                color: '#262626',
                display: 'block',
                lineHeight: '20px',
                marginBottom: '4px'
              }}
            >
              {commit.commitMessage}
            </Text>
          </div>
          
          {/* 右侧状态 */}
          <div style={{ marginLeft: '16px', flexShrink: 0 }}>
            {commit.hasReview ? (
              <Tag icon={<CheckCircleOutlined />} color="success">
                已审核
              </Tag>
            ) : (
              <Tag icon={<ClockCircleOutlined />} color="warning">
                待审核
              </Tag>
            )}
          </div>
        </div>

        {/* 中间：作者和时间信息 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '16px', 
          marginBottom: '12px',
          fontSize: '13px',
          color: '#8c8c8c'
        }}>
          <Text type="secondary">
            <UserOutlined style={{ marginRight: '4px' }} />
            {userNicknames[commit.author] || commit.author}
          </Text>
          <Text type="secondary">
            <ClockCircleOutlined style={{ marginRight: '4px' }} />
            {formatDate(commit.date)}
          </Text>
          {commit.hasReview && commit.reviewer && (
            <Text type="secondary">
              <CheckCircleOutlined style={{ marginRight: '4px' }} />
              审核人: {userNicknames[commit.reviewer] || commit.reviewer}
            </Text>
          )}
        </div>

        {/* 底部：提交ID和操作按钮 + 审核人员信息 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          paddingTop: '8px',
          borderTop: '1px solid #f5f5f5'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text
              code
              style={{
                fontSize: '12px',
                color: '#1890ff',
                backgroundColor: '#f0f5ff',
                padding: '2px 6px',
                borderRadius: '4px'
              }}
            >
              {commit.commitId}
            </Text>
            <Button
              type="link"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyCommitId(commit.fullCommitId)}
              style={{ padding: '0', height: 'auto' }}
            >
              复制
            </Button>
            
            {/* 审核人员信息 */}
            {project?.reviewers && project.reviewers.length > 0 && (
              <div style={{ marginLeft: '16px' }}>
                <Text type="secondary" style={{ fontSize: '11px', marginRight: '6px' }}>
                  需要审核人员:
                </Text>
                <Space wrap size={[2, 2]}>
                  {project.reviewers
                    .filter(reviewer => reviewer !== commit.author) // 排除提交人自己
                    .map(reviewer => {
                      const hasReviewed = commit.hasReview && commit.reviewer === reviewer;
                      return (
                        <Tag 
                          key={reviewer} 
                          color={hasReviewed ? "green" : "default"}
                          style={{ fontSize: '10px', margin: '1px', padding: '0 4px', lineHeight: '16px' }}
                        >
                          {userNicknames[reviewer] || reviewer}
                          {hasReviewed && ' ✓'}
                        </Tag>
                      );
                    })}
                </Space>
                {project.reviewers.filter(reviewer => reviewer !== commit.author).length === 0 && (
                  <Text type="secondary" style={{ fontSize: '10px' }}>
                    提交人是唯一审核人员，无需其他人审核
                  </Text>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {commit.hasReview && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                <MessageOutlined style={{ marginRight: '2px' }} />
                {commit.reviewComments} 条评论
              </Text>
            )}
            <Button
              type="primary"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => {
                if (project) {
                  const gitlabCommitUrl = `${project.gitlabUrl}/${project.name}/-/commit/${commit.fullCommitId}`;
                  window.open(gitlabCommitUrl, '_blank');
                }
              }}
            >
              查看
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
  };

  if (!project) {
    return <MainLayout><div>加载中...</div></MainLayout>;
  }

  // 更新审核覆盖率计算逻辑
  const calculateReviewStats = () => {
    if (!project.reviewers || project.reviewers.length === 0) {
      // 如果没有配置审核人员，使用原来的逻辑
      const reviewedCount = commits.filter(c => c.hasReview).length;
      const totalCount = commits.length;
      const reviewRate = totalCount > 0 ? ((reviewedCount / totalCount) * 100).toFixed(1) : '0';
      return { reviewedCount, totalCount, reviewRate };
    }

    // 如果配置了审核人员，需要计算每个提交需要的审核人员数量
    let reviewedCount = 0;
    const totalCount = commits.length;

    commits.forEach(commit => {
      const requiredReviewers = project.reviewers!.filter(reviewer => reviewer !== commit.author);
      if (requiredReviewers.length === 0) {
        // 如果提交人是唯一的审核人员，则认为不需要审核
        reviewedCount++;
      } else if (commit.hasReview) {
        // 目前只支持单人审核，后续可以扩展为多人审核
        reviewedCount++;
      }
    });

    const reviewRate = totalCount > 0 ? ((reviewedCount / totalCount) * 100).toFixed(1) : '0';
    return { reviewedCount, totalCount, reviewRate };
  };

  const { reviewedCount, totalCount, reviewRate } = calculateReviewStats();

  return (
    <MainLayout>
      <style>
        {`
          .commit-item:hover {
            border-color: #1890ff !important;
            box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2) !important;
          }
          .ant-list-item {
            border: none !important;
            padding: 0 !important;
          }
        `}
      </style>
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
                <Text type="secondary">审核人员:</Text>
                <br />
                {project.reviewers && project.reviewers.length > 0 ? (
                  <Space wrap>
                    {project.reviewers.map(username => (
                      <Tag key={username} color="blue">
                        {userNicknames[username] || username}
                      </Tag>
                    ))}
                  </Space>
                ) : (
                  <Text type="secondary">未配置</Text>
                )}
              </div>
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
              onClick={() => loadCommitReviews(project?.id || '')}
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
          <List
            dataSource={commits}
            renderItem={renderCommitItem}
            loading={loading}
            size="large"
            locale={{
              emptyText: '暂无提交记录'
            }}
            pagination={{
              pageSize: 10,
              showQuickJumper: true,
              showSizeChanger: true,
              showTotal: (total: number, range: [number, number]) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
              pageSizeOptions: ['10', '20', '50'],
            }}
            style={{
              backgroundColor: '#fafafa',
              padding: '16px',
              borderRadius: '8px'
            }}
          />
        </Card>
      </Space>
    </MainLayout>
  );
};

export default ProjectDetail; 