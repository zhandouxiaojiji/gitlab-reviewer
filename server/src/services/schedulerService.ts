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
  branch: string; // 添加分支信息
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
      const isFirstPull = projectData.commits.length === 0;
      
      // 获取项目的默认分支
      const branchData = this.readProjectBranchData(project.id);
      const defaultBranch = branchData.defaultBranch || 'main';
      
      // 构建GitLab API URL
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const commitsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;
      
      // 计算审核时间范围
      const reviewDays = project.reviewDays || 30; // 默认30天
      const reviewStartTime = new Date();
      reviewStartTime.setDate(reviewStartTime.getDate() - reviewDays);
      const reviewStartTimeISO = reviewStartTime.toISOString();
      
      // 确定拉取起始时间
      let pullSinceTime: string;
      if (isFirstPull) {
        // 首次拉取：使用审核时间范围
        pullSinceTime = reviewStartTimeISO;
        console.log(`\n🚀 [${project.name}] 开始首次范围拉取commit数据...`);
        console.log(`📋 [${project.name}] 目标分支: ${defaultBranch}`);
        console.log(`📅 [${project.name}] 审核范围: ${reviewDays} 天`);
        console.log(`⏰ [${project.name}] 拉取起始时间: ${reviewStartTime.toLocaleDateString()}`);
      } else {
        // 增量拉取：使用本地最新commit时间
        const latestCommitTime = this.getLatestCommitTime(projectData.commits);
        pullSinceTime = latestCommitTime || reviewStartTimeISO;
        
        const latestCommit = projectData.commits[0];
        console.log(`\n🔄 [${project.name}] 开始增量拉取commit数据...`);
        console.log(`📋 [${project.name}] 目标分支: ${defaultBranch}`);
        console.log(`📌 [${project.name}] 本地最新: ${latestCommit.short_id} - ${latestCommit.message.substring(0, 30)}... (${latestCommit.committed_date})`);
        console.log(`⏰ [${project.name}] 拉取起始时间: ${pullSinceTime}`);
      }
      
      let allNewCommits: any[] = [];
      let page = 1;
      const perPage = 50; // 固定每页50条，平衡拉取速度和实时性
      let hasMorePages = true;
      let totalFetched = 0;
      let processedCount = 0;
      
      // 循环拉取所有页面的数据
      while (hasMorePages) {
        try {
          console.log(`🔍 [${project.name}] 正在拉取第 ${page} 页数据 (每页${perPage}条)...`);
          
          // 构建请求参数
          const params: any = {
            per_page: perPage,
            page: page,
            ref_name: defaultBranch,
            since: pullSinceTime // 所有拉取都使用时间范围限制
          };
          
          const response = await axios.get(commitsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            params,
            timeout: 15000
          });

          const pageCommits = response.data;
          
          if (pageCommits.length === 0) {
            console.log(`✅ [${project.name}] 第 ${page} 页无数据，拉取结束`);
            hasMorePages = false;
          } else {
            totalFetched += pageCommits.length;
            console.log(`📦 [${project.name}] 第 ${page} 页获取到 ${pageCommits.length} 条commit，累计 ${totalFetched} 条`);
            
            // 显示时间范围
            if (pageCommits.length > 0) {
              const latestInPage = pageCommits[0];
              const oldestInPage = pageCommits[pageCommits.length - 1];
              console.log(`   📅 [${project.name}] 时间范围: ${new Date(latestInPage.committed_date).toLocaleDateString()} ~ ${new Date(oldestInPage.committed_date).toLocaleDateString()}`);
            }
            
            // 立即处理这一页的commit并保存
            let pageNewCount = 0;
            let pageSkippedCount = 0;
            
            for (const commit of pageCommits) {
              const existingCommitIndex = projectData.commits.findIndex(c => c.id === commit.id);
              
              if (existingCommitIndex === -1) {
                // 新commit，添加到列表
                const skipReview = shouldSkipReview(commit.title || commit.message || '', project.filterRules || '');
                const formattedCommit: CommitData = {
                  id: commit.id,
                  short_id: commit.short_id,
                  message: commit.title || commit.message || '',
                  author_name: commit.author_name,
                  author_email: commit.author_email,
                  committed_date: commit.committed_date,
                  web_url: commit.web_url,
                  has_comments: false,
                  comments_count: 0,
                  skip_review: skipReview,
                  comments: [],
                  needsReview: !skipReview,
                  branch: defaultBranch // 添加分支信息
                };
                
                projectData.commits.push(formattedCommit);
                pageNewCount++;
                
                // 显示新增的commit
                if (pageNewCount <= 5 || pageNewCount % 10 === 0) {
                  console.log(`   ✨ [${project.name}] 新增: ${commit.short_id} - ${commit.author_name}: ${commit.message.substring(0, 40)}...`);
                }
              } else {
                pageSkippedCount++;
              }
              processedCount++;
            }
            
            // 如果有新commit，立即排序并保存
            if (pageNewCount > 0) {
              projectData.commits.sort((a, b) => {
                const timeA = new Date(a.committed_date).getTime();
                const timeB = new Date(b.committed_date).getTime();
                return timeB - timeA; // 降序排列，最新的在前
              });
              
              // 实时保存数据，让前端能立即访问
              this.saveProjectCommitData(projectData);
              console.log(`   💾 [${project.name}] 实时保存: 新增 ${pageNewCount} 条，总计 ${projectData.commits.length} 条`);
            }
            
            if (pageSkippedCount > 0 && pageSkippedCount <= 3) {
              console.log(`   ⏭️  [${project.name}] 跳过已存在: ${pageSkippedCount} 条`);
            }
            
            // 如果返回的数据少于每页数量，说明这是最后一页
            if (pageCommits.length < perPage) {
              console.log(`✅ [${project.name}] 第 ${page} 页数据不足 ${perPage} 条，拉取结束`);
              hasMorePages = false;
            } else {
              page++;
            }
          }
        } catch (error) {
          console.error(`❌ [${project.name}] 拉取第 ${page} 页数据失败:`, error instanceof Error ? error.message : error);
          hasMorePages = false;
        }
      }

      // 最终保存和统计
      this.saveProjectCommitData(projectData);
      
      console.log(`\n🎉 [${project.name}] Commit拉取完成!`);
      console.log(`   📊 API获取: ${totalFetched} 条`);
      console.log(`   📈 处理: ${processedCount} 条`);
      console.log(`   📋 总计: ${projectData.commits.length} 条`);
      console.log(`   📅 审核范围: ${reviewDays} 天`);
      
      // 显示最新的commit用于验证
      if (projectData.commits.length > 0) {
        const latestCommit = projectData.commits[0];
        console.log(`   🔝 最新: ${latestCommit.short_id} - ${latestCommit.author_name}: ${latestCommit.message.substring(0, 50)}... (${latestCommit.committed_date})`);
      }
      
      console.log(`─────────────────────────────────────────────────────\n`);
      
    } catch (error) {
      console.error(`❌ [${project.name}] commit拉取失败:`, error instanceof Error ? error.message : error);
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
        console.log(`💬 [${project.name}] 无需拉取评论的commit`);
        return;
      }
      
      console.log(`\n💬 [${project.name}] 开始拉取评论数据...`);
      console.log(`📋 [${project.name}] 需要拉取评论的commit: ${needsReviewCommits.length} 条`);
      
      // 只拉取需要审核的commit的评论
      for (let i = 0; i < needsReviewCommits.length; i++) {
        const commit = needsReviewCommits[i];
        const progress = `${i + 1}/${needsReviewCommits.length}`;
        
        try {
          console.log(`🔍 [${project.name}] (${progress}) 拉取 ${commit.short_id} 的评论...`);
          
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
          
          // 显示评论拉取结果
          if (comments.length > 0) {
            const reviewerNames = reviewers.join(', ');
            console.log(`   ✅ [${project.name}] (${progress}) ${commit.short_id}: ${comments.length} 条评论，审核人: ${reviewerNames}`);
          } else {
            console.log(`   📝 [${project.name}] (${progress}) ${commit.short_id}: 暂无评论`);
          }
          
        } catch (error) {
          console.warn(`   ❌ [${project.name}] (${progress}) 获取 ${commit.short_id} 评论失败:`, error instanceof Error ? error.message : error);
        }
        
        // 添加适当延时，避免API限流
        if (i < needsReviewCommits.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      // 更新最后评论拉取时间
      projectData.lastCommentPullTime = new Date().toISOString();
      
      // 保存数据
      console.log(`💾 [${project.name}] 保存评论数据...`);
      this.saveProjectCommitData(projectData);
      
      // 最终统计
      const totalComments = projectData.commits.reduce((sum, commit) => sum + commit.comments_count, 0);
      const hasCommentsCount = projectData.commits.filter(commit => commit.has_comments).length;
      
      console.log(`\n🎉 [${project.name}] 评论拉取完成!`);
      console.log(`   🔄 处理: ${updatedCount} 条commit`);
      console.log(`   💬 总评论: ${totalComments} 条`);
      console.log(`   ✅ 有评论的commit: ${hasCommentsCount} 条`);
      console.log(`─────────────────────────────────────────────────────\n`);
      
    } catch (error) {
      console.error(`❌ [${project.name}] 评论拉取失败:`, error instanceof Error ? error.message : error);
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
  public getProjectCommits(projectId: string, branch?: string): CommitData[] {
    const projectData = this.readProjectCommitData(projectId);
    
    // 如果指定了分支，则过滤该分支的commits
    if (branch) {
      return projectData.commits.filter(commit => commit.branch === branch);
    }
    
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
      console.log(`\n🌿 [${project.name}] 开始拉取分支数据...`);
      
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
      
      console.log(`📦 [${project.name}] 获取到 ${branches.length} 个分支`);

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

      // 确定默认分支 - 改进算法
      let defaultBranch = 'main';
      
      // 首先查找API标记的默认分支
      const defaultBranchObj = branchData.find(b => b.default);
      if (defaultBranchObj) {
        defaultBranch = defaultBranchObj.name;
        console.log(`🔖 [${project.name}] 检测到API标记的默认分支: ${defaultBranch}`);
      } else {
        // 如果API没有标记，按优先级查找常见的默认分支名称
        const commonDefaultBranches = ['main', 'master', 'develop', 'dev', 'trunk'];
        let found = false;
        
        for (const commonBranch of commonDefaultBranches) {
          const foundBranch = branchData.find(b => b.name.toLowerCase() === commonBranch.toLowerCase());
          if (foundBranch) {
            defaultBranch = foundBranch.name;
            console.log(`🔖 [${project.name}] 使用常见默认分支: ${defaultBranch}`);
            found = true;
            break;
          }
        }
        
        // 如果都没找到，使用第一个分支
        if (!found && branchData.length > 0) {
          defaultBranch = branchData[0].name;
          console.log(`🔖 [${project.name}] 使用第一个分支作为默认: ${defaultBranch}`);
        }
        
        // 如果没有任何分支，给出警告
        if (branchData.length === 0) {
          console.warn(`⚠️  [${project.name}] 未找到任何分支，使用默认值: ${defaultBranch}`);
        }
      }

      // 显示分支列表
      console.log(`📋 [${project.name}] 分支列表:`);
      if (branchData.length > 0) {
        branchData.forEach((branch, index) => {
          const flags = [];
          if (branch.name === defaultBranch) flags.push('默认');
          if (branch.protected) flags.push('保护');
          if (branch.merged) flags.push('已合并');
          const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
          
          const dateStr = new Date(branch.commit.committed_date).toLocaleDateString();
          console.log(`   ${index + 1}. ${branch.name}${flagStr} - ${branch.commit.short_id}: ${branch.commit.message.substring(0, 30)}... (${dateStr})`);
        });
      } else {
        console.log(`   (暂无分支数据)`);
      }

      // 保存分支数据
      const projectBranchData: ProjectBranchData = {
        projectId: project.id,
        lastBranchPullTime: new Date().toISOString(),
        branches: branchData,
        defaultBranch: defaultBranch
      };

      this.saveProjectBranchData(projectBranchData);
      
      console.log(`🎉 [${project.name}] 分支拉取完成! 共 ${branches.length} 个分支，默认分支: ${defaultBranch}`);
      console.log(`─────────────────────────────────────────────────────\n`);
      
    } catch (error) {
      console.error(`❌ [${project.name}] 分支拉取失败:`, error instanceof Error ? error.message : error);
      
      // 即使拉取失败，也要保存一个默认的分支配置，避免阻塞后续操作
      const fallbackBranchData: ProjectBranchData = {
        projectId: project.id,
        lastBranchPullTime: new Date().toISOString(),
        branches: [],
        defaultBranch: 'main'
      };
      this.saveProjectBranchData(fallbackBranchData);
      console.log(`🔧 [${project.name}] 已保存fallback分支配置，默认分支: main`);
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
          console.log(`\n🚀 ============ 手动刷新项目: ${project.name} ============`);
          console.log(`📋 项目ID: ${project.id}`);
          console.log(`🔗 GitLab地址: ${project.gitlabUrl}`);
          console.log(`📅 开始时间: ${new Date().toLocaleString()}`);
          console.log(`═══════════════════════════════════════════════════════\n`);
          
          // 检查是否为首次刷新（没有分支信息）
          const branchData = this.readProjectBranchData(project.id);
          const isFirstRefresh = branchData.branches.length === 0;
          
          if (isFirstRefresh) {
            console.log(`🆕 [${project.name}] 检测到首次刷新，将按顺序执行初始化...`);
            
            // 步骤1: 先拉取分支信息
            console.log(`📌 [${project.name}] 步骤1: 拉取分支信息...`);
            await this.pullProjectBranches(project);
            
            // 步骤2: 获取默认分支后拉取commit
            console.log(`📌 [${project.name}] 步骤2: 拉取commit数据...`);
            await this.pullProjectCommits(project);
            
            // 步骤3: 拉取评论
            console.log(`📌 [${project.name}] 步骤3: 拉取评论数据...`);
            await this.pullCommitComments(project);
            
            console.log(`🎉 [${project.name}] 首次初始化完成！`);
          } else {
            // 非首次刷新，可以并行执行
            console.log(`🔄 [${project.name}] 执行增量刷新...`);
            await Promise.all([
              this.pullProjectCommits(project),
              this.pullCommitComments(project),
              this.pullProjectBranches(project)
            ]);
          }
          
          console.log(`\n✅ ============ 项目 ${project.name} 手动刷新完成 ============`);
          console.log(`📅 完成时间: ${new Date().toLocaleString()}`);
          console.log(`═══════════════════════════════════════════════════════\n`);
        } else {
          throw new Error(`项目 ${projectId} 不存在`);
        }
      } else {
        // 刷新所有项目
        const projects = projectStorage.findAll().filter(p => !p.deletedAt && p.isActive !== false);
        console.log(`\n🚀 ============ 手动刷新所有项目 ============`);
        console.log(`📋 项目数量: ${projects.length}`);
        console.log(`📅 开始时间: ${new Date().toLocaleString()}`);
        console.log(`═══════════════════════════════════════════════════════\n`);
        
        for (let i = 0; i < projects.length; i++) {
          const project = projects[i];
          console.log(`\n📂 [${i + 1}/${projects.length}] 处理项目: ${project.name}`);
          try {
            // 检查是否为首次刷新
            const branchData = this.readProjectBranchData(project.id);
            const isFirstRefresh = branchData.branches.length === 0;
            
            if (isFirstRefresh) {
              console.log(`🆕 [${project.name}] 检测到首次刷新，按顺序初始化...`);
              
              // 顺序执行：分支 -> commit -> 评论
              await this.pullProjectBranches(project);
              await this.pullProjectCommits(project);
              await this.pullCommitComments(project);
            } else {
              console.log(`🔄 [${project.name}] 执行增量刷新...`);
              // 非首次可以并行执行
              await Promise.all([
                this.pullProjectCommits(project),
                this.pullCommitComments(project),
                this.pullProjectBranches(project)
              ]);
            }
          } catch (error) {
            console.error(`❌ 项目 ${project.name} 刷新失败:`, error instanceof Error ? error.message : error);
          }
        }
        
        console.log(`\n✅ ============ 所有项目手动刷新完成 ============`);
        console.log(`📅 完成时间: ${new Date().toLocaleString()}`);
        console.log(`═══════════════════════════════════════════════════════\n`);
      }
    } catch (error) {
      console.error(`❌ 手动刷新失败:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService; 