import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Space, message, Typography, List, Avatar, Tooltip, Divider, Row, Col, Statistic, Spin, Empty, Select } from 'antd';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
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
  LinkOutlined,
  ArrowLeftOutlined,
  ExclamationCircleOutlined,
  BranchesOutlined
} from '@ant-design/icons';
import api, { getApiUrl } from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text, Paragraph } = Typography;

interface GitLabProject {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
  reviewers?: string[]; // 审核人员用户名列表
  userMappings?: { [username: string]: string }; // 用户名到昵称的映射
  reviewDays?: number; // 审核范围（天数），默认7天
  maxCommits?: number; // 拉取记录上限，默认100条
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
  allReviewers?: string[]; // 所有参与评论的审核人员
  reviewComments: number;
  gitlabUrl?: string;
  key?: string;
}

interface GitLabBranch {
  name: string;
  default: boolean;
  protected: boolean;
  merged: boolean;
  commit: {
    id?: string;
    short_id?: string;
    message?: string;
    committed_date?: string;
  };
}

interface BranchesResponse {
  branches: GitLabBranch[];
  defaultBranch: string;
  total: number;
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

  // 新增分支相关状态
  const [branches, setBranches] = useState<GitLabBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('master');
  const [branchesLoading, setBranchesLoading] = useState(false);

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    if (!projectName) {
      navigate(`/dashboard?user=${username}`);
      return;
    }
    
    // 重置状态，允许重新加载
    setIsInitialized(false);
    setProject(null);
    setCommits([]);
    setBranches([]);
    setSelectedBranch('master');
    setError(null);
    
    loadProjects();
  }, [username, projectName, navigate]); // 添加 navigate 和 projectName 到依赖项

  const loadProjects = async () => {
    try {
      const response = await api.get('/api/projects');
      const projectsData = response.data || [];
      setProjects(projectsData);
      
      // 根据项目名称查找项目
      const foundProject = projectsData.find((p: GitLabProject) => p.name === decodeURIComponent(projectName!));
      if (foundProject) {
        setProject(foundProject);
        // 设置用户映射关系
        if (foundProject.userMappings) {
          setUserNicknames(foundProject.userMappings);
        }
        // 设置初始化完成
        setIsInitialized(true);
        // 项目设置后，loadCommits会通过useCallback自动执行
      } else {
        message.error('未找到指定项目');
        navigate(`/dashboard?user=${username}`);
      }
    } catch (error) {
      message.error('加载项目信息失败');
      navigate(`/dashboard?user=${username}`);
    }
  };

  // 获取分支列表
  const loadBranches = useCallback(async () => {
    if (!project) return;
    
    try {
      setBranchesLoading(true);
      const response = await api.get(`/api/gitlab/projects/${project.id}/branches`);
      const branchData: BranchesResponse = response.data;
      
      setBranches(branchData.branches);
      setSelectedBranch(branchData.defaultBranch);
      
      console.log(`获取到 ${branchData.branches.length} 个分支，默认分支: ${branchData.defaultBranch}`);
    } catch (error: any) {
      console.error('获取分支列表失败:', error);
      message.error('获取分支列表失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setBranchesLoading(false);
    }
  }, [project]);

  const loadCommits = useCallback(async () => {
    if (!project) return;
    
    try {
      setLoading(true);
      
      // 使用选中的分支获取提交记录
      const response = await api.get(`/api/gitlab/projects/${project.id}/commits`, {
        params: {
          branch: selectedBranch
        }
      });
      
      // 后端返回的数据结构是 { commits: [], userMappings: {}, ... }
      const responseData = response.data || {};
      const commitsData = Array.isArray(responseData.commits) ? responseData.commits : [];
      
      // 更新用户映射关系
      if (responseData.userMappings) {
        setUserNicknames(responseData.userMappings);
      }
      
      // 将后端格式转换为前端期望的格式
      const formattedCommits = commitsData.map((commit: any) => {
        // 提取所有评论者的用户名，优先使用username，其次name
        const allReviewers = commit.comments?.map((comment: any) => {
          if (comment.author) {
            // 优先使用username，如果没有则使用name
            return comment.author.username || comment.author.name || '';
          }
          return '';
        }).filter(Boolean) || [];
        
        // 去重评论者
        const uniqueReviewers = Array.from(new Set(allReviewers));
        
        console.log(`提交 ${commit.short_id} 的评论者:`, uniqueReviewers);
        
        return {
          id: commit.id,
          commitId: commit.short_id,
          fullCommitId: commit.id,
          commitMessage: commit.message,
          author: commit.author_name,
          date: commit.committed_date,
          hasReview: commit.has_comments,
          reviewer: uniqueReviewers[0] || '', // 第一个评论者作为主要审核人（兼容性）
          allReviewers: uniqueReviewers, // 所有参与评论的人员
          reviewComments: commit.comments_count || 0,
          gitlabUrl: commit.web_url,
          key: commit.id
        };
      });
      
      console.log(`从分支 ${selectedBranch} 获取到 ${formattedCommits.length} 条提交记录`);
      setCommits(formattedCommits);
      
      // 清除错误状态
      setError(null);
    } catch (error: any) {
      console.error('获取提交记录失败:', error);
      message.error('获取提交记录失败: ' + (error.response?.data?.message || error.message));
      setCommits([]);
      setError('获取提交记录失败，请检查GitLab连接或后端服务状态');
    } finally {
      setLoading(false);
    }
  }, [project, selectedBranch]);

  // 加载分支列表
  useEffect(() => {
    if (project) {
      loadBranches();
    }
  }, [project, loadBranches]);

  // 当分支改变时重新加载提交记录
  useEffect(() => {
    if (project && selectedBranch && branches.length > 0) {
      loadCommits();
    }
  }, [project, selectedBranch, branches.length, loadCommits]);

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
    // 计算审查状态
    const getReviewStatus = () => {
      // 首先检查：如果当前登录用户查看自己的提交，显示"本人提交"
      if (commit.author === username || 
          (userNicknames[commit.author] && userNicknames[commit.author] === username) ||
          (Object.keys(userNicknames).find(key => userNicknames[key] === username) === commit.author)) {
        return { 
          status: 'own', 
          text: '本人提交', 
          color: 'blue',
          icon: <UserOutlined />
        };
      }
      
      // 获取需要审核此提交的人员（排除提交人自己）
      const requiredReviewers = project?.reviewers?.filter(reviewer => reviewer !== commit.author) || [];
      
      // 如果没有配置审核人员或者没有人需要审核此提交
      if (!project?.reviewers || project.reviewers.length === 0 || requiredReviewers.length === 0) {
        return { 
          status: 'none', 
          text: '无需审核', 
          color: 'default',
          icon: <CheckCircleOutlined />
        };
      }
      
      // 检查实际评论的人员中，有多少是配置的审核人员
      const actualReviewers = commit.allReviewers || [];
      const reviewedCount = requiredReviewers.filter(reviewer => 
        actualReviewers.includes(reviewer)
      ).length;
      
      console.log(`提交 ${commit.commitId} 审核状态检查:`, {
        currentUser: username,
        commitAuthor: commit.author,
        userNicknames,
        isOwnCommit: commit.author === username || 
                     (userNicknames[commit.author] && userNicknames[commit.author] === username) ||
                     (Object.keys(userNicknames).find(key => userNicknames[key] === username) === commit.author),
        requiredReviewers,
        actualReviewers,
        reviewedCount
      });
      
      if (reviewedCount === requiredReviewers.length) {
        // 所有需要的人员都已审核
        return { 
          status: 'completed', 
          text: '已审核', 
          color: 'success',
          icon: <CheckCircleOutlined />
        };
      } else if (reviewedCount > 0) {
        // 部分人员已审核
        return { 
          status: 'partial', 
          text: `部分审核 (${reviewedCount}/${requiredReviewers.length})`, 
          color: 'processing',
          icon: <ClockCircleOutlined />
        };
      } else {
        // 没有人审核
        return { 
          status: 'pending', 
          text: '待审核', 
          color: 'warning',
          icon: <ClockCircleOutlined />
        };
      }
    };

    const reviewStatus = getReviewStatus();

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
            <Tag icon={reviewStatus.icon} color={reviewStatus.color}>
              {reviewStatus.text}
            </Tag>
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
          {commit.hasReview && commit.allReviewers && commit.allReviewers.length > 0 && (
            <Text type="secondary">
              <CheckCircleOutlined style={{ marginRight: '4px' }} />
              审核人: {commit.allReviewers.map(reviewer => userNicknames[reviewer] || reviewer).join(', ')}
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
                      // 检查该审核人员是否已审核 - 直接检查allReviewers数组
                      const hasReviewed = commit.allReviewers?.includes(reviewer) || false;
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
      // 首先检查：如果是当前用户自己的提交，算作无需审核（已完成）
      if (commit.author === username || 
          (userNicknames[commit.author] && userNicknames[commit.author] === username) ||
          (Object.keys(userNicknames).find(key => userNicknames[key] === username) === commit.author)) {
        reviewedCount++;
        return;
      }
      
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

  const refreshUserMappings = async () => {
    if (!project?.id) {
      message.error('项目ID不存在，无法刷新用户映射关系');
      return;
    }

    try {
      setLoading(true);
      
      const response = await api.post(`/api/projects/${project.id}/refresh-users`);
      
      // 更新本地状态
      if (response.data.userMappings) {
        setUserNicknames(response.data.userMappings);
      }
      
      message.success(`用户映射关系刷新成功，共更新 ${response.data.userCount} 个用户`);
    } catch (error) {
      console.error('刷新用户映射关系失败:', error);
      message.error('刷新用户映射关系失败');
    } finally {
      setLoading(false);
    }
  };

  // 分支选择变化处理
  const handleBranchChange = (branchName: string) => {
    console.log(`切换到分支: ${branchName}`);
    setSelectedBranch(branchName);
  };

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
        <Card style={{ marginBottom: '24px' }}>
          <Row gutter={[16, 16]}>
            <Col span={18}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {project?.name}
              </Typography.Title>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>
                {project?.description || '暂无描述'}
              </Typography.Text>
              <div style={{ marginTop: '12px' }}>
                <Typography.Text strong>GitLab地址: </Typography.Text>
                <Typography.Text copyable>{project?.gitlabUrl}</Typography.Text>
              </div>
              <div style={{ marginTop: '8px' }}>
                <Typography.Text strong>审核范围: </Typography.Text>
                <Typography.Text>{project?.reviewDays || 7} 天</Typography.Text>
              </div>
              <div style={{ marginTop: '8px' }}>
                <Typography.Text strong>拉取记录上限: </Typography.Text>
                <Typography.Text>{project?.maxCommits || 100} 条</Typography.Text>
              </div>
              
              {/* 分支选择 */}
              <div style={{ marginTop: '16px' }}>
                <Typography.Text strong>当前分支: </Typography.Text>
                <Select
                  value={selectedBranch}
                  onChange={handleBranchChange}
                  loading={branchesLoading}
                  style={{ minWidth: 150, marginLeft: 8 }}
                  placeholder="选择分支"
                  suffixIcon={<BranchesOutlined />}
                >
                  {branches.map(branch => (
                    <Select.Option key={branch.name} value={branch.name}>
                      <Space>
                        <span>{branch.name}</span>
                        {branch.default && <Tag color="blue">默认</Tag>}
                        {branch.protected && <Tag color="red">保护</Tag>}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
                {selectedBranch && branches.length > 0 && (
                  <Typography.Text type="secondary" style={{ marginLeft: 16 }}>
                    共 {branches.length} 个分支
                  </Typography.Text>
                )}
              </div>
            </Col>
            
            {/* 统计信息 */}
            <Col span={6}>
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Statistic
                    title="总提交数"
                    value={commits.length}
                    prefix={<EyeOutlined />}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="Review覆盖率"
                    value={commits.length > 0 ? Math.round((reviewedCount / commits.length) * 100) : 0}
                    suffix="%"
                    prefix={<CheckCircleOutlined />}
                  />
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        <Divider />

        {/* 提交记录表格 */}
        <Card 
          title={
            <Space>
              <span>提交记录</span>
              {selectedBranch && (
                <Tag icon={<BranchesOutlined />} color="processing">
                  {selectedBranch}
                </Tag>
              )}
            </Space>
          }
          extra={
            <Button 
              type="primary" 
              onClick={loadCommits}
              loading={loading}
            >
              刷新
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