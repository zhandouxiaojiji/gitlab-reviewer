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
  
  // 可配置的刷新频率（毫秒），默认1分钟
  private commitPullIntervalMs: number = 60 * 1000; // 1分钟
  private commentPullIntervalMs: number = 60 * 1000; // 1分钟

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
        const parsedData = JSON.parse(data);
        
        // 向后兼容：移除旧的lastCommitPullTime字段
        if ('lastCommitPullTime' in parsedData) {
          delete parsedData.lastCommitPullTime;
          console.log(`清理项目 ${projectId} 旧数据字段`);
        }
        
        // 确保数据结构正确
        return {
          projectId: parsedData.projectId || projectId,
          lastCommentPullTime: parsedData.lastCommentPullTime || new Date().toISOString(),
          commits: parsedData.commits || []
        };
      }
    } catch (error) {
      console.error(`读取项目 ${projectId} 的commit数据失败:`, error);
    }
    
    return {
      projectId,
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

  // 获取本地最新commit的时间，用于确定拉取起始点
  private getLatestCommitTime(commits: CommitData[]): string | null {
    if (commits.length === 0) {
      return null;
    }
    
    // commits数组已经按时间排序（最新的在前面），直接取第一个
    const latestCommitDate = new Date(commits[0].committed_date);
    
    // 在最新commit时间基础上加1秒，避免重复拉取同一个commit
    latestCommitDate.setSeconds(latestCommitDate.getSeconds() + 1);
    
    return latestCommitDate.toISOString();
  }

  // 拉取项目的新commit
  private async pullProjectCommits(project: any): Promise<void> {
    try {
      const projectData = this.readProjectCommitData(project.id);
      
      // 获取项目的默认分支
      const branchData = this.readProjectBranchData(project.id);
      const defaultBranch = branchData.defaultBranch || 'main';
      
      // 构建GitLab API URL
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const commitsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;
      
      // 使用本地最新commit的时间作为拉取起始点
      const latestCommitTime = this.getLatestCommitTime(projectData.commits);
      
      // 显示本地最新commit信息
      if (projectData.commits.length > 0) {
        const latestCommit = projectData.commits[0];
        console.log(`项目 ${project.name} 本地最新commit: ${latestCommit.short_id} - ${latestCommit.message} (${latestCommit.committed_date})`);
        if (latestCommitTime) {
          console.log(`项目 ${project.name} 将从时间 ${latestCommitTime} 开始拉取新commit`);
        }
      } else {
        console.log(`项目 ${project.name} 本地暂无commit，将进行首次全量拉取`);
      }
      
      let allNewCommits: any[] = [];
      let page = 1;
      const perPage = 100; // 每页100条
      let hasMorePages = true;
      
      // 循环拉取所有页面的数据
      while (hasMorePages) {
        try {
          // 构建请求参数
          const params: any = {
            per_page: perPage,
            page: page,
            ref_name: defaultBranch // 使用项目的默认分支
          };
          
          // 使用本地最新commit的时间作为拉取起始点
          if (latestCommitTime) {
            params.since = latestCommitTime;
          }
          
          const response = await axios.get(commitsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            params,
            timeout: 15000 // 增加超时时间
          });

          const pageCommits = response.data;
          
          if (pageCommits.length === 0) {
            // 没有更多数据了
            hasMorePages = false;
          } else {
            allNewCommits = allNewCommits.concat(pageCommits);
            
            // 如果返回的数据少于每页数量，说明这是最后一页
            if (pageCommits.length < perPage) {
              hasMorePages = false;
            } else {
              page++;
            }
          }
        } catch (error) {
          console.error(`项目 ${project.name} 拉取第 ${page} 页数据失败:`, error);
          hasMorePages = false;
        }
      }

      // 处理新commit
      let newCommitCount = 0;
      for (const commit of allNewCommits) {
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
          newCommitCount++;
        }
      }

      // 保存数据
      this.saveProjectCommitData(projectData);
      
      console.log(`项目 ${project.name} commit拉取完成: 新增 ${newCommitCount} 个，总计 ${projectData.commits.length} 个`);
    } catch (error) {
      console.error(`项目 ${project.name} commit拉取失败:`, error);
    }
  }

  // 拉取commit的评论
  private async pullCommitComments(project: any): Promise<void> {
    try {
      const projectData = this.readProjectCommitData(project.id);
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      
      let updatedCount = 0;
      const needsReviewCommits = projectData.commits.filter(commit => commit.needsReview);
      
      if (needsReviewCommits.length === 0) {
        console.log(`项目 ${project.name} 无需拉取评论的commit`);
        return;
      }
      
      console.log(`项目 ${project.name} 开始拉取 ${needsReviewCommits.length} 个commit的评论`);
      
      // 只拉取需要审核的commit的评论
      for (const commit of needsReviewCommits) {
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
      
      console.log(`项目 ${project.name} 评论拉取完成: 更新 ${updatedCount} 个commit`);
    } catch (error) {
      console.error(`项目 ${project.name} 评论拉取失败:`, error);
    }
  }

  // 设置刷新频率（分钟）
  public setRefreshInterval(minutes: number = 1) {
    const intervalMs = minutes * 60 * 1000;
    this.commitPullIntervalMs = intervalMs;
    this.commentPullIntervalMs = intervalMs;
    
    console.log(`刷新频率已设置为 ${minutes} 分钟`);
    
    // 如果定时任务正在运行，重新启动以应用新的频率
    if (this.commitPullInterval || this.commentPullInterval) {
      this.stopAll();
      this.startAll();
    }
  }

  // 获取当前刷新频率（分钟）
  public getRefreshInterval(): number {
    return this.commitPullIntervalMs / (60 * 1000);
  }

  // 启动commit拉取定时任务
  public startCommitPulling() {
    if (this.commitPullInterval) {
      return;
    }
    
    console.log(`启动commit拉取定时任务，间隔: ${this.getRefreshInterval()} 分钟`);
    
    // 立即执行一次
    this.pullAllProjectsCommits();
    
    // 按配置的间隔执行
    this.commitPullInterval = setInterval(() => {
      this.pullAllProjectsCommits();
    }, this.commitPullIntervalMs);
  }

  // 启动评论拉取定时任务
  public startCommentPulling() {
    if (this.commentPullInterval) {
      return;
    }
    
    console.log(`启动评论拉取定时任务，间隔: ${this.getRefreshInterval()} 分钟`);
    
    // 立即执行一次
    this.pullAllProjectsComments();
    
    // 按配置的间隔执行
    this.commentPullInterval = setInterval(() => {
      this.pullAllProjectsComments();
    }, this.commentPullIntervalMs);
  }

  // 启动所有定时任务
  public startAll() {
    this.startCommitPulling();
    this.startCommentPulling();
  }

  // 拉取所有项目的commit
  private async pullAllProjectsCommits() {
    try {
      const projects = projectStorage.findAll().filter(p => !p.deletedAt && p.isActive !== false);
      
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
      const projects = projectStorage.findAll().filter(p => !p.deletedAt && p.isActive !== false);
      
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
      
      console.log(`项目 ${project.name} 分支拉取完成: ${branches.length} 个分支，默认分支 ${defaultBranch}`);
    } catch (error) {
      console.error(`项目 ${project.name} 分支拉取失败:`, error);
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

  // 手动刷新所有数据（commit、评论、分支）
  public async manualRefreshAll(projectId?: string): Promise<void> {
    try {
      if (projectId) {
        // 刷新指定项目
        const project = projectStorage.findById(projectId);
        if (project) {
          console.log(`手动刷新项目: ${project.name}`);
          await Promise.all([
            this.pullProjectCommits(project),
            this.pullCommitComments(project),
            this.pullProjectBranches(project)
          ]);
          console.log(`项目 ${project.name} 手动刷新完成`);
        } else {
          throw new Error(`项目 ${projectId} 不存在`);
        }
      } else {
        // 刷新所有项目
        const projects = projectStorage.findAll().filter(p => !p.deletedAt && p.isActive !== false);
        console.log(`手动刷新 ${projects.length} 个项目的所有数据`);
        
        for (const project of projects) {
          try {
            await Promise.all([
              this.pullProjectCommits(project),
              this.pullCommitComments(project),
              this.pullProjectBranches(project)
            ]);
          } catch (error) {
            console.error(`项目 ${project.name} 刷新失败:`, error);
          }
        }
        console.log('所有项目手动刷新完成');
      }
    } catch (error) {
      console.error('手动刷新失败:', error);
      throw error;
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService; 