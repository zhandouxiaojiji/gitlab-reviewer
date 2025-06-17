import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Button, Space, message, Typography, List, Avatar, Row, Col, Statistic, Select } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  CodeOutlined,
  LinkOutlined,
  BranchesOutlined
} from '@ant-design/icons';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Text } = Typography;

interface GitLabProject {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  description?: string;
  reviewers?: string[]; // 审核人员用户名列表
  userMappings?: { [username: string]: string }; // 用户名到昵称的映射
  reviewDays?: number; // 审核范围（天数），默认7天
  refreshInterval?: number; // 刷新频率（分钟），默认1分钟
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
  skip_review?: boolean; // 是否符合过滤规则（无需审查）
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
  
  const [project, setProject] = useState<GitLabProject | null>(null);
  const [commits, setCommits] = useState<CommitReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userNicknames, setUserNicknames] = useState<{ [username: string]: string }>({});

  // 新增分支相关状态
  const [branches, setBranches] = useState<GitLabBranch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('master');
  const [branchesLoading, setBranchesLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const response = await api.get('/api/projects');
      const projectsData = response.data || [];
      
      // 根据项目名称查找项目
      const foundProject = projectsData.find((p: GitLabProject) => p.name === decodeURIComponent(projectName!));
      if (foundProject) {
        setProject(foundProject);
        // 设置用户映射关系
        if (foundProject.userMappings) {
          setUserNicknames(foundProject.userMappings);
        }
        // 项目设置后，loadCommits会通过useCallback自动执行
      } else {
        message.error('未找到指定项目');
        navigate(`/dashboard?user=${username}`);
      }
    } catch (error) {
      message.error('加载项目信息失败');
      navigate(`/dashboard?user=${username}`);
    }
  }, [projectName, navigate, username]);

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
    setProject(null);
    setCommits([]);
    setBranches([]);
    setSelectedBranch('master');
    setError(null);
    
    loadProjects();
  }, [username, projectName, navigate, loadProjects]);

  // 获取分支列表
  const loadBranches = useCallback(async () => {
    if (!project) return;
    
    try {
      setBranchesLoading(true);
      const response = await api.get(`/api/gitlab/projects/${project.id}/branches`);
      const branchData: BranchesResponse = response.data;
      
      setBranches(branchData.branches);
      setSelectedBranch(branchData.defaultBranch);
      
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
      
      // 使用选中的分支获取提交记录，添加all=true参数获取所有commit
      const response = await api.get(`/api/gitlab/projects/${project.id}/commits`, {
        params: {
          branch: selectedBranch,
          all: 'true' // 获取所有commit，不分页
        }
      });
      
      // 后端返回的数据结构是 { commits: [], userMappings: {}, ... }
      const responseData = response.data || {};
      const commitsData = Array.isArray(responseData.commits) ? responseData.commits : [];
      
      console.log(`获取到 ${commitsData.length} 个commit记录`);
      
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
          skip_review: commit.skip_review,
          key: commit.id
        };
      });
      
      // 按提交时间从新到旧排序
      formattedCommits.sort((a: CommitReview, b: CommitReview) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // 从新到旧排序
      });
      
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

  // 手动刷新GitLab数据
  const handleRefresh = useCallback(async () => {
    if (!project) return;
    
    try {
      setLoading(true);
      
      // 检查是否为首次刷新（没有分支数据）
      const isFirstRefresh = branches.length === 0;
      
      console.log(`手动刷新项目 ${project.name} 的GitLab数据${isFirstRefresh ? ' (首次刷新)' : ''}`);
      
      // 生成时间戳避免缓存
      const timestamp = Date.now();
      
      // 先调用sync API，触发从GitLab拉取最新数据
      console.log('触发后端数据同步...');
      const syncResponse = await api.post(`/api/gitlab/projects/${project.id}/sync`, {}, {
        params: { _t: timestamp },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      console.log('后端数据同步完成:', syncResponse.data);
      
      // 立即重新加载分支数据（内存缓存，无需等待）
      console.log('重新加载分支数据...');
      const branchResponse = await api.get(`/api/gitlab/projects/${project.id}/branches`, {
        params: { 
          _t: timestamp + 1000,
          refresh: 'true'
        },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      const branchData: BranchesResponse = branchResponse.data;
      
      // 更新分支状态
      setBranches(branchData.branches);
      const newSelectedBranch = branchData.defaultBranch;
      setSelectedBranch(newSelectedBranch);
      
      console.log(`分支数据加载完成，共 ${branchData.branches.length} 个分支，默认分支: ${newSelectedBranch}`);
      
      // 立即重新加载commit数据（内存缓存，无需等待）
      console.log('重新加载commit数据...');
      const commitResponse = await api.get(`/api/gitlab/projects/${project.id}/commits`, {
        params: {
          branch: newSelectedBranch,
          all: 'true',
          _t: timestamp + 2000,
          refresh: 'true'
        },
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      
      // 处理commit数据
      const responseData = commitResponse.data || {};
      const commitsData = Array.isArray(responseData.commits) ? responseData.commits : [];
      
      console.log(`获取到 ${commitsData.length} 个commit记录`);
      
      // 显示最新几个commit的信息用于调试
      if (commitsData.length > 0) {
        console.log('最新的commit:');
        commitsData.slice(0, 3).forEach((commit: any, index: number) => {
          console.log(`  ${index + 1}. ${commit.short_id} - ${commit.author_name}: ${commit.message.substring(0, 50)}... (${commit.committed_date})`);
        });
      }
      
      // 更新用户映射关系
      if (responseData.userMappings) {
        setUserNicknames(responseData.userMappings);
      }
      
      // 将后端格式转换为前端期望的格式
      const formattedCommits = commitsData.map((commit: any) => {
        const allReviewers = commit.comments?.map((comment: any) => {
          if (comment.author) {
            return comment.author.username || comment.author.name || '';
          }
          return '';
        }).filter(Boolean) || [];
        
        const uniqueReviewers = Array.from(new Set(allReviewers));
        
        return {
          id: commit.id,
          commitId: commit.short_id,
          fullCommitId: commit.id,
          commitMessage: commit.message,
          author: commit.author_name,
          date: commit.committed_date,
          hasReview: commit.has_comments,
          reviewer: uniqueReviewers[0] || '',
          allReviewers: uniqueReviewers,
          reviewComments: commit.comments_count || 0,
          gitlabUrl: commit.web_url,
          skip_review: commit.skip_review,
          key: commit.id
        };
      });
      
      // 按提交时间从新到旧排序
      formattedCommits.sort((a: CommitReview, b: CommitReview) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA;
      });
      
      setCommits(formattedCommits);
      setError(null);
      
      console.log(`数据刷新完成：${branchData.branches.length} 个分支，${formattedCommits.length} 个commit`);
      
      // 计算并显示今日新增的commit数量
      const today = new Date().toDateString();
      const todayCommits = formattedCommits.filter((commit: CommitReview) => {
        const commitDate = new Date(commit.date);
        return commitDate.toDateString() === today;
      });
      
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = yesterdayDate.toDateString();
      const yesterdayCommits = formattedCommits.filter((commit: CommitReview) => {
        const commitDate = new Date(commit.date);
        return commitDate.toDateString() === yesterday;
      });
      
      let successMessage = `数据刷新完成${isFirstRefresh ? ' (首次初始化)' : ''}`;
      if (todayCommits.length > 0) {
        successMessage += `，今日有 ${todayCommits.length} 个新commit`;
      }
      if (yesterdayCommits.length > 0) {
        successMessage += `，昨日有 ${yesterdayCommits.length} 个commit`;
      }
      
      message.success(successMessage);
      
    } catch (error: any) {
      console.error('刷新失败:', error);
      message.error('刷新失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  }, [project, branches.length]);

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

  // 跳转到GitLab commit页面
  const openGitLabCommit = (commit: CommitReview, event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (project) {
      const gitlabCommitUrl = `${project.gitlabUrl}/${project.name}/-/commit/${commit.fullCommitId}`;
      window.open(gitlabCommitUrl, '_blank');
    }
  };

  // 删除原来的 columns 定义，替换为列表渲染函数
  const renderCommitItem = (commit: CommitReview) => {
    // 计算审查状态
    const getReviewStatus = () => {
      // 首先检查：如果匹配过滤规则，显示"无需审查"
      if (commit.skip_review) {
        return { 
          status: 'filtered', 
          text: '无需审查', 
          color: 'default',
          icon: <CheckCircleOutlined />
        };
      }
      
      // 然后检查：如果当前登录用户查看自己的提交，显示"本人提交"
      if (commit.author === username || 
          (userNicknames[commit.author] && userNicknames[commit.author] === username) ||
          (Object.keys(userNicknames).find(key => userNicknames[key] === username) === commit.author)) {
        return { 
          status: 'own', 
          text: '本人提交', 
          color: 'blue',
          icon: <CheckCircleOutlined />
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
      onClick={() => openGitLabCommit(commit)}
      style={{
        padding: '16px',
        margin: '8px 0',
        backgroundColor: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: '8px',
        transition: 'all 0.3s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        cursor: 'pointer'
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
            {userNicknames[commit.author] || commit.author}
          </Text>
          <Text type="secondary">
            {formatDate(commit.date)}
          </Text>
          {commit.hasReview && commit.allReviewers && commit.allReviewers.length > 0 && (
            <Text type="secondary">
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
              onClick={(e) => {
                e.stopPropagation();
                copyCommitId(commit.fullCommitId);
              }}
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
                {commit.reviewComments} 条评论
              </Text>
            )}
            <Button
              type="primary"
              size="small"
              icon={<LinkOutlined />}
              onClick={(e) => openGitLabCommit(commit, e)}
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
    const totalCommits = commits.length;
    const reviewedCommits = commits.filter(c => c.hasReview).length;
    const pendingCommits = commits.filter(c => !c.hasReview && !c.skip_review).length;
    
    return {
      totalCommits,
      reviewedCommits,
      pendingCommits,
      reviewRate: totalCommits > 0 ? ((reviewedCommits / (totalCommits - commits.filter(c => c.skip_review).length)) * 100).toFixed(1) : '0'
    };
  };

  const { totalCommits, reviewedCommits, pendingCommits, reviewRate } = calculateReviewStats();

  // 分支选择变化处理
  const handleBranchChange = (branchName: string) => {
    setSelectedBranch(branchName);
  };

  return (
    <MainLayout>
      <style>
        {`
          .commit-item:hover {
            border-color: #1890ff !important;
            box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15) !important;
            transform: translateY(-2px) !important;
          }
          .commit-item {
            transition: all 0.3s ease !important;
          }
          .commit-item:active {
            transform: translateY(0px) !important;
            box-shadow: 0 2px 6px rgba(24, 144, 255, 0.2) !important;
          }
          .ant-list-item {
            border: none !important;
            padding: 0 !important;
          }
        `}
      </style>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* 项目信息卡片 */}
        <Card>
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
              
              {/* 分支选择 */}
              <div style={{ marginTop: '16px' }}>
                <Typography.Text strong>当前分支: </Typography.Text>
                <Select
                  value={selectedBranch}
                  onChange={handleBranchChange}
                  style={{ width: 200, marginLeft: '8px' }}
                  loading={branchesLoading}
                >
                  {branches.map(branch => (
                    <Select.Option key={branch.name} value={branch.name}>
                      <Space>
                        <BranchesOutlined />
                        {branch.name}
                        {branch.default && <Tag color="blue">默认</Tag>}
                        {branch.protected && <Tag color="red">保护</Tag>}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </div>
            </Col>
            
            {/* 统计信息 */}
            <Col span={6}>
              <Row gutter={[4, 4]}>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <Statistic
                      title="总提交数"
                      value={totalCommits}
                      prefix={<CodeOutlined />}
                      valueStyle={{ fontSize: '14px' }}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <Statistic
                      title="已审核"
                      value={reviewedCommits}
                      valueStyle={{ color: '#3f8600', fontSize: '14px' }}
                      prefix={<CheckCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <Statistic
                      title="待审核"
                      value={pendingCommits}
                      valueStyle={{ color: '#cf1322', fontSize: '14px' }}
                      prefix={<ClockCircleOutlined />}
                    />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <Statistic
                      title="覆盖率"
                      value={reviewRate}
                      suffix="%"
                      valueStyle={{ fontSize: '14px' }}
                      prefix={<CheckCircleOutlined />}
                    />
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

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
              onClick={handleRefresh}
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