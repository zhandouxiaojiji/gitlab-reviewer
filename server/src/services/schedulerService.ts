import axios from 'axios';
import { projectStorage } from '../utils/storage';
import { shouldSkipReview } from '../utils/filterUtils';
import fs from 'fs';
import path from 'path';

interface CommitData {
  id: string;
  short_id: string;
  message: string;
  author_name: string;
  author_email: string;
  committed_date: string;
  web_url: string;
  has_comments: boolean;
  comments_count: number;
  skip_review: boolean;
  comments: any[];
  allReviewers?: string[];
  needsReview?: boolean; // 是否需要继续拉取评论
}

interface ProjectCommitData {
  projectId: string;
  lastCommitPullTime: string;
  lastCommentPullTime: string;
  commits: CommitData[];
}

interface BranchData {
  name: string;
  default: boolean;
  protected: boolean;
  merged: boolean;
  commit: {
    id: string;
    short_id: string;
    message: string;
    committed_date: string;
  };
}

interface ProjectBranchData {
  projectId: string;
  lastBranchPullTime: string;
  branches: BranchData[];
  defaultBranch: string;
}

class SchedulerService {
  private commitPullInterval: NodeJS.Timeout | null = null;
  private commentPullInterval: NodeJS.Timeout | null = null;
  private readonly DATA_DIR = path.join(process.cwd(), 'data');

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  // 获取项目的commit数据文件路径
  private getCommitDataPath(projectId: string): string {
    return path.join(this.DATA_DIR, `commits_${projectId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  }

  // 读取项目的commit数据
  private readProjectCommitData(projectId: string): ProjectCommitData {
    const filePath = this.getCommitDataPath(projectId);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`读取项目 ${projectId} 的commit数据失败:`, error);
    }
    
    return {
      projectId,
      lastCommitPullTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 默认7天前
      lastCommentPullTime: new Date().toISOString(),
      commits: []
    };
  }

  // 保存项目的commit数据
  private saveProjectCommitData(data: ProjectCommitData) {
    const filePath = this.getCommitDataPath(data.projectId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error(`保存项目 ${data.projectId} 的commit数据失败:`, error);
    }
  }

  // 拉取项目的新commit
  private async pullProjectCommits(project: any): Promise<void> {
    try {
      console.log(`开始拉取项目 ${project.name} 的新commit...`);
      
      const projectData = this.readProjectCommitData(project.id);
      const since = projectData.lastCommitPullTime;
      
      // 构建GitLab API URL
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const commitsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;
      
      const response = await axios.get(commitsUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`,
          'Accept': 'application/json'
        },
        params: {
          since: since,
          per_page: 100,
          ref_name: 'main' // 可以根据需要调整分支
        },
        timeout: 10000
      });

      const newCommits = response.data;
      console.log(`项目 ${project.name} 拉取到 ${newCommits.length} 个新commit`);

      // 处理新commit
      for (const commit of newCommits) {
        const existingCommitIndex = projectData.commits.findIndex(c => c.id === commit.id);
        
        if (existingCommitIndex === -1) {
          // 新commit，添加到列表
          const skipReview = shouldSkipReview(commit.message || '', project.filterRules || '');
          const newCommitData: CommitData = {
            id: commit.id,
            short_id: commit.short_id,
            message: commit.message,
            author_name: commit.author_name,
            author_email: commit.author_email,
            committed_date: commit.committed_date,
            web_url: commit.web_url,
            has_comments: false,
            comments_count: 0,
            skip_review: skipReview,
            comments: [],
            needsReview: !skipReview // 如果不跳过审核，则需要拉取评论
          };
          
          projectData.commits.unshift(newCommitData); // 新commit放在前面
        }
      }

      // 更新最后拉取时间
      projectData.lastCommitPullTime = new Date().toISOString();
      
      // 保存数据
      this.saveProjectCommitData(projectData);
      
      console.log(`项目 ${project.name} commit拉取完成`);
    } catch (error) {
      console.error(`拉取项目 ${project.name} 的commit失败:`, error);
    }
  }

  // 拉取commit的评论
  private async pullCommitComments(project: any): Promise<void> {
    try {
      console.log(`开始拉取项目 ${project.name} 的commit评论...`);
      
      const projectData = this.readProjectCommitData(project.id);
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      
      let updatedCount = 0;
      
      // 只拉取需要审核的commit的评论
      for (const commit of projectData.commits) {
        if (!commit.needsReview) {
          continue; // 跳过不需要审核的commit
        }
        
        try {
          const commentsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits/${commit.id}/comments`;
          const commentsResponse = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });
          
          const comments = commentsResponse.data;
          
          // 更新commit的评论信息
          commit.comments = comments.map((comment: any) => ({
            author: comment.author,
            created_at: comment.created_at,
            note: comment.note
          }));
          
          commit.has_comments = comments.length > 0;
          commit.comments_count = comments.length;
          
          // 提取所有评论者
          const reviewers = [...new Set(comments.map((c: any) => c.author?.username).filter(Boolean))] as string[];
          commit.allReviewers = reviewers;
          
          // 检查是否还需要继续拉取评论
          if (project.reviewers && project.reviewers.length > 0) {
            const requiredReviewers = project.reviewers.filter((reviewer: string) => reviewer !== commit.author_name);
            const reviewedCount = requiredReviewers.filter((reviewer: string) => reviewers.includes(reviewer)).length;
            
            // 如果所有需要的审核人员都已评论，则不再需要拉取
            commit.needsReview = reviewedCount < requiredReviewers.length;
          } else {
            // 如果没有配置审核人员，有评论就不再拉取
            commit.needsReview = comments.length === 0;
          }
          
          updatedCount++;
        } catch (error) {
          console.warn(`获取commit ${commit.short_id} 的评论失败:`, error instanceof Error ? error.message : error);
        }
      }
      
      // 更新最后评论拉取时间
      projectData.lastCommentPullTime = new Date().toISOString();
      
      // 保存数据
      this.saveProjectCommitData(projectData);
      
      console.log(`项目 ${project.name} 评论拉取完成，更新了 ${updatedCount} 个commit的评论`);
    } catch (error) {
      console.error(`拉取项目 ${project.name} 的评论失败:`, error);
    }
  }

  // 启动commit拉取定时任务（每5分钟）
  public startCommitPulling() {
    if (this.commitPullInterval) {
      return;
    }
    
    console.log('启动commit拉取定时任务...');
    
    // 立即执行一次
    this.pullAllProjectsCommits();
    
    // 每5分钟执行一次
    this.commitPullInterval = setInterval(() => {
      this.pullAllProjectsCommits();
    }, 5 * 60 * 1000);
  }

  // 启动评论拉取定时任务（每10秒）
  public startCommentPulling() {
    if (this.commentPullInterval) {
      return;
    }
    
    console.log('启动评论拉取定时任务...');
    
    // 立即执行一次
    this.pullAllProjectsComments();
    
    // 每10秒执行一次
    this.commentPullInterval = setInterval(() => {
      this.pullAllProjectsComments();
    }, 10 * 1000);
  }

  // 拉取所有项目的commit
  private async pullAllProjectsCommits() {
    try {
      const projects = projectStorage.findAll().filter(p => p.isActive !== false);
      console.log(`开始拉取 ${projects.length} 个项目的commit...`);
      
      for (const project of projects) {
        await this.pullProjectCommits(project);
      }
    } catch (error) {
      console.error('拉取所有项目commit失败:', error);
    }
  }

  // 拉取所有项目的评论
  private async pullAllProjectsComments() {
    try {
      const projects = projectStorage.findAll().filter(p => p.isActive !== false);
      
      for (const project of projects) {
        await this.pullCommitComments(project);
      }
    } catch (error) {
      console.error('拉取所有项目评论失败:', error);
    }
  }

  // 停止所有定时任务
  public stopAll() {
    if (this.commitPullInterval) {
      clearInterval(this.commitPullInterval);
      this.commitPullInterval = null;
      console.log('commit拉取定时任务已停止');
    }
    
    if (this.commentPullInterval) {
      clearInterval(this.commentPullInterval);
      this.commentPullInterval = null;
      console.log('评论拉取定时任务已停止');
    }
  }

  // 获取项目的commit数据（供API使用）
  public getProjectCommits(projectId: string): CommitData[] {
    const projectData = this.readProjectCommitData(projectId);
    return projectData.commits;
  }

  // 手动触发项目的commit拉取
  public async manualPullCommits(projectId: string): Promise<void> {
    const project = projectStorage.findById(projectId);
    if (project) {
      await this.pullProjectCommits(project);
    }
  }

  // 手动触发项目的评论拉取
  public async manualPullComments(projectId: string): Promise<void> {
    const project = projectStorage.findById(projectId);
    if (project) {
      await this.pullCommitComments(project);
    }
  }

  // 获取项目的分支数据文件路径
  private getBranchDataPath(projectId: string): string {
    return path.join(this.DATA_DIR, `branches_${projectId.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
  }

  // 读取项目的分支数据
  private readProjectBranchData(projectId: string): ProjectBranchData {
    const filePath = this.getBranchDataPath(projectId);
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`读取项目 ${projectId} 的分支数据失败:`, error);
    }
    
    return {
      projectId,
      lastBranchPullTime: new Date().toISOString(),
      branches: [],
      defaultBranch: 'main'
    };
  }

  // 保存项目的分支数据
  private saveProjectBranchData(data: ProjectBranchData) {
    const filePath = this.getBranchDataPath(data.projectId);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error(`保存项目 ${data.projectId} 的分支数据失败:`, error);
    }
  }

  // 拉取项目的分支信息
  private async pullProjectBranches(project: any): Promise<void> {
    try {
      console.log(`开始拉取项目 ${project.name} 的分支信息...`);
      
      // 构建GitLab API URL
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const branchesUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/branches`;
      
      const response = await axios.get(branchesUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const branches = response.data;
      console.log(`项目 ${project.name} 拉取到 ${branches.length} 个分支`);

      // 处理分支数据
      const branchData: BranchData[] = branches.map((branch: any) => ({
        name: branch.name,
        default: branch.default || false,
        protected: branch.protected || false,
        merged: branch.merged || false,
        commit: {
          id: branch.commit?.id || '',
          short_id: branch.commit?.short_id || '',
          message: branch.commit?.message || '',
          committed_date: branch.commit?.committed_date || new Date().toISOString()
        }
      }));

      // 确定默认分支
      let defaultBranch = 'main';
      const defaultBranchObj = branchData.find(b => b.default);
      if (defaultBranchObj) {
        defaultBranch = defaultBranchObj.name;
      } else {
        // 查找常见的默认分支名称
        const commonDefaultBranches = ['main', 'master', 'develop', 'dev'];
        for (const commonBranch of commonDefaultBranches) {
          if (branchData.find(b => b.name === commonBranch)) {
            defaultBranch = commonBranch;
            break;
          }
        }
      }

      // 保存分支数据
      const projectBranchData: ProjectBranchData = {
        projectId: project.id,
        lastBranchPullTime: new Date().toISOString(),
        branches: branchData,
        defaultBranch: defaultBranch
      };

      this.saveProjectBranchData(projectBranchData);
      
      console.log(`项目 ${project.name} 分支信息拉取完成，默认分支: ${defaultBranch}`);
    } catch (error) {
      console.error(`拉取项目 ${project.name} 的分支信息失败:`, error);
    }
  }

  // 获取项目的分支数据（供API使用）
  public getProjectBranches(projectId: string): { branches: BranchData[], defaultBranch: string } {
    const branchData = this.readProjectBranchData(projectId);
    return {
      branches: branchData.branches,
      defaultBranch: branchData.defaultBranch
    };
  }

  // 手动触发项目的分支拉取
  public async manualPullBranches(projectId: string): Promise<void> {
    const project = projectStorage.findById(projectId);
    if (project) {
      await this.pullProjectBranches(project);
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService; 