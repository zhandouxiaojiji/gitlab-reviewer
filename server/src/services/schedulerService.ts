import axios from 'axios';
import { projectStorage } from '../utils/storage';
import { shouldSkipReview } from '../utils/filterUtils';
import fs from 'fs';
import path from 'path';

// 内存缓存的数据结构
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
  needsReview?: boolean;
  branch: string;
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

interface ProjectCache {
  projectId: string;
  projectName: string;
  branches: BranchData[];
  defaultBranch: string;
  commits: CommitData[];
  lastUpdateTime: string;
}

class SchedulerService {
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  
  // 内存缓存
  private memoryCache: Map<string, ProjectCache> = new Map();
  
  // 添加全局锁，防止并发执行
  private globalLock: boolean = false;

  constructor() {
    this.ensureDataDir();
    // 启动时进行全量拉取
    this.initializeOnStartup();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  // 启动时初始化
  private async initializeOnStartup() {
    try {
      console.log('\n🚀 ============ 系统启动全量数据拉取 ============');
      console.log(`📅 开始时间: ${new Date().toLocaleString()}`);
      
      // 获取所有活跃项目
      const projects = projectStorage.findAll().filter(p => !p.deletedAt && p.isActive !== false);
      console.log(`📋 发现 ${projects.length} 个活跃项目`);
      
      if (projects.length === 0) {
        console.log('⚠️  没有找到活跃项目，跳过数据拉取');
        return;
      }
      
      // 依次处理每个项目
      for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        console.log(`\n📂 [${i + 1}/${projects.length}] 处理项目: ${project.name}`);
        console.log(`   🔗 GitLab地址: ${project.gitlabUrl}`);
        console.log(`   📅 审核天数: ${project.reviewDays || 30} 天`);
        
        try {
          // 按顺序执行：分支 -> commit -> 评论
          await this.pullProjectData(project);
          console.log(`   ✅ 项目 ${project.name} 数据拉取完成`);
        } catch (error) {
          console.error(`   ❌ 项目 ${project.name} 数据拉取失败:`, error instanceof Error ? error.message : error);
        }
      }
      
      console.log(`\n✅ ============ 系统启动数据拉取完成 ============`);
      console.log(`📅 完成时间: ${new Date().toLocaleString()}`);
      console.log(`💾 缓存项目数: ${this.memoryCache.size}`);
      console.log(`═══════════════════════════════════════════════════════\n`);
      
    } catch (error) {
      console.error('❌ 系统启动数据拉取失败:', error instanceof Error ? error.message : error);
    }
  }

  // 拉取单个项目的完整数据
  public async pullProjectData(project: any): Promise<void> {
    const projectCache: ProjectCache = {
      projectId: project.id,
      projectName: project.name,
      branches: [],
      defaultBranch: 'main',
      commits: [],
      lastUpdateTime: new Date().toISOString()
    };

    // 步骤1: 拉取分支信息
    console.log(`   📌 步骤1: 拉取分支信息...`);
    await this.pullBranches(project, projectCache);

    // 步骤2: 拉取commit记录
    console.log(`   📌 步骤2: 拉取commit记录...`);
    await this.pullCommits(project, projectCache);

    // 步骤3: 拉取评论
    console.log(`   📌 步骤3: 拉取评论...`);
    await this.pullComments(project, projectCache);

    // 保存到内存缓存
    this.memoryCache.set(project.id, projectCache);
    console.log(`   💾 数据已缓存到内存`);
  }

  // 拉取分支信息
  private async pullBranches(project: any, cache: ProjectCache): Promise<void> {
    try {
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const branchesUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/branches`;

      // 计算审核时间范围（与commit拉取保持一致）
      const reviewDays = project.reviewDays || 30;
      const reviewStartDate = new Date();
      reviewStartDate.setDate(reviewStartDate.getDate() - (reviewDays - 1));
      reviewStartDate.setHours(0, 0, 0, 0);
      const reviewStartTime = reviewStartDate.getTime();

      const response = await axios.get(branchesUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const branches = response.data;
      console.log(`      📦 获取到 ${branches.length} 个分支`);

      // 处理分支数据并按审核时间范围过滤
      const allBranches = branches.map((branch: any) => ({
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

      // 过滤：只保留最新提交在审核范围内的分支
      const filteredBranches = allBranches.filter((branch: any) => {
        const commitDate = new Date(branch.commit.committed_date);
        const commitTime = commitDate.getTime();
        const isInRange = commitTime >= reviewStartTime;
        
        if (!isInRange) {
          console.log(`      🚫 过滤分支 ${branch.name}: 最新提交超出审核范围 (${commitDate.toLocaleDateString()})`);
        }
        
        return isInRange;
      });

      cache.branches = filteredBranches;
      console.log(`      ✅ 过滤后保留 ${filteredBranches.length} 个分支 (审核范围: ${reviewDays} 天)`);

      // 确定默认分支（优先从过滤后的分支中选择）
      const defaultBranchObj = cache.branches.find((b: BranchData) => b.default);
      if (defaultBranchObj) {
        cache.defaultBranch = defaultBranchObj.name;
        console.log(`      🔖 默认分支: ${cache.defaultBranch}`);
      } else {
        // 按优先级查找常见的默认分支名称（仅在过滤后的分支中查找）
        const commonDefaultBranches = ['main', 'master', 'develop', 'dev'];
        let found = false;
        
        for (const commonBranch of commonDefaultBranches) {
          const foundBranch = cache.branches.find((b: BranchData) => b.name.toLowerCase() === commonBranch.toLowerCase());
          if (foundBranch) {
            cache.defaultBranch = foundBranch.name;
            console.log(`      🔖 使用常见默认分支: ${cache.defaultBranch}`);
            found = true;
            break;
          }
        }
        
        if (!found && cache.branches.length > 0) {
          cache.defaultBranch = cache.branches[0].name;
          console.log(`      🔖 使用第一个分支: ${cache.defaultBranch}`);
        } else if (!found) {
          // 如果过滤后没有任何分支，回退到原始分支列表中查找
          console.log(`      ⚠️  过滤后无可用分支，回退到完整分支列表`);
          const fallbackDefault = allBranches.find((b: any) => b.default);
          if (fallbackDefault) {
            cache.defaultBranch = fallbackDefault.name;
            cache.branches = [fallbackDefault]; // 至少保留默认分支
            console.log(`      🔖 回退使用默认分支: ${cache.defaultBranch}`);
          } else {
            cache.defaultBranch = 'main';
            cache.branches = [];
            console.log(`      🔖 使用备用默认分支: main`);
          }
        }
      }

    } catch (error) {
      console.error(`      ❌ 拉取分支失败:`, error instanceof Error ? error.message : error);
      // 使用默认分支配置
      cache.defaultBranch = 'main';
      cache.branches = [];
    }
  }

  // 拉取commit记录
  private async pullCommits(project: any, cache: ProjectCache): Promise<void> {
    try {
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const commitsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;

      // 计算审核时间范围（自然天，从今天开始往前推）
      const reviewDays = project.reviewDays || 30;
      const reviewStartDate = new Date();
      reviewStartDate.setDate(reviewStartDate.getDate() - (reviewDays - 1)); // 修复：从今天开始往前推N-1天
      reviewStartDate.setHours(0, 0, 0, 0); // 设置为当天开始
      const pullSinceTime = reviewStartDate.toISOString();

      console.log(`      📅 拉取范围: ${reviewDays} 自然天 (从 ${reviewStartDate.toLocaleDateString()} 0点开始)`);
      console.log(`      🌿 目标分支: ${cache.defaultBranch}`);

      const response = await axios.get(commitsUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`,
          'Accept': 'application/json'
        },
        params: {
          ref_name: cache.defaultBranch,
          since: pullSinceTime,
          per_page: 1000
        },
        timeout: 30000
      });

      const commits = response.data;
      console.log(`      📦 获取到 ${commits.length} 个commit`);

      // 处理commit数据
      cache.commits = commits.map((commit: any) => {
        const skipReview = shouldSkipReview(commit.title || commit.message || '', project.filterRules || '');
        return {
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
          branch: cache.defaultBranch
        };
      });

      // 按时间排序（最新的在前）
      cache.commits.sort((a, b) => {
        const timeA = new Date(a.committed_date).getTime();
        const timeB = new Date(b.committed_date).getTime();
        return timeB - timeA;
      });

      if (cache.commits.length > 0) {
        const latest = cache.commits[0];
        console.log(`      🔝 最新commit: ${latest.short_id} - ${latest.author_name} (${new Date(latest.committed_date).toLocaleDateString()})`);
      }

    } catch (error) {
      console.error(`      ❌ 拉取commit失败:`, error instanceof Error ? error.message : error);
      cache.commits = [];
    }
  }

  // 拉取评论
  private async pullComments(project: any, cache: ProjectCache): Promise<void> {
    try {
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      
      const needsReviewCommits = cache.commits.filter(commit => commit.needsReview);
      
      if (needsReviewCommits.length === 0) {
        console.log(`      💬 无需拉取评论的commit`);
        return;
      }

      console.log(`      💬 需要拉取评论的commit: ${needsReviewCommits.length} 个`);

      for (let i = 0; i < needsReviewCommits.length; i++) {
        const commit = needsReviewCommits[i];
        
        try {
          const commentsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits/${commit.id}/comments`;
          const response = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          const comments = response.data;
          
          // 更新commit的评论信息
          commit.comments = comments.map((comment: any) => ({
            author: comment.author,
            created_at: comment.created_at,
            note: comment.note
          }));
          
          commit.has_comments = comments.length > 0;
          commit.comments_count = comments.length;

          if (comments.length > 0) {
            const reviewers = [...new Set(comments.map((c: any) => c.author?.username).filter(Boolean))];
            console.log(`      ✅ ${commit.short_id}: ${comments.length} 条评论，审核人: ${reviewers.join(', ')}`);
          }

        } catch (error) {
          console.warn(`      ⚠️  获取 ${commit.short_id} 评论失败:`, error instanceof Error ? error.message : error);
        }

        // 添加延时避免API限流
        if (i < needsReviewCommits.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const totalComments = cache.commits.reduce((sum, commit) => sum + commit.comments_count, 0);
      console.log(`      🎉 评论拉取完成，总计: ${totalComments} 条评论`);

    } catch (error) {
      console.error(`      ❌ 拉取评论失败:`, error instanceof Error ? error.message : error);
    }
  }

  // 获取项目的commit数据（供API使用）
  public getProjectCommits(projectId: string, branch?: string): CommitData[] {
    const cache = this.memoryCache.get(projectId);
    if (!cache) {
      return [];
    }
    
    // 如果指定了分支，则过滤该分支的commits
    if (branch && branch !== cache.defaultBranch) {
      return []; // 目前只缓存默认分支的数据
    }
    
    return cache.commits;
  }

  // 获取项目的分支数据（供API使用）
  public getProjectBranches(projectId: string): { branches: BranchData[], defaultBranch: string } {
    const cache = this.memoryCache.get(projectId);
    if (!cache) {
      return {
        branches: [],
        defaultBranch: 'main'
      };
    }
    
    return {
      branches: cache.branches,
      defaultBranch: cache.defaultBranch
    };
  }

  // 手动刷新项目数据
  public async manualRefreshProject(projectId: string): Promise<void> {
    const project = projectStorage.findById(projectId);
    if (!project) {
      throw new Error(`项目 ${projectId} 不存在`);
    }

    console.log(`🔄 手动刷新项目: ${project.name}`);
    await this.pullProjectData(project);
    console.log(`✅ 项目 ${project.name} 手动刷新完成`);
  }

  // 获取缓存统计信息
  public getCacheStats(): { projectCount: number, totalCommits: number, totalBranches: number } {
    let totalCommits = 0;
    let totalBranches = 0;
    
    for (const cache of this.memoryCache.values()) {
      totalCommits += cache.commits.length;
      totalBranches += cache.branches.length;
    }
    
    return {
      projectCount: this.memoryCache.size,
      totalCommits,
      totalBranches
    };
  }

  // 增量更新commit数据（通过webhook触发）
  public async incrementalUpdateCommits(projectId: string, newCommits: any[], branch: string): Promise<void> {
    try {
      const project = projectStorage.findById(projectId);
      if (!project) {
        throw new Error(`项目 ${projectId} 不存在`);
      }

      const cache = this.memoryCache.get(projectId);
      if (!cache) {
        console.log(`⚠️  项目 ${projectId} 缓存不存在，执行全量刷新`);
        await this.manualRefreshProject(projectId);
        return;
      }

      // 只处理默认分支的commit
      if (branch !== cache.defaultBranch) {
        console.log(`ℹ️  跳过非默认分支 ${branch} 的commit更新`);
        return;
      }

      console.log(`🔄 增量更新项目 ${project.name} 的commit数据...`);

      // 处理新的commit数据
      const processedCommits = newCommits.map((commit: any) => {
        const skipReview = shouldSkipReview(commit.message || '', project.filterRules || '');
        return {
          id: commit.id,
          short_id: commit.id.substring(0, 8),
          message: commit.message || '',
          author_name: commit.author?.name || commit.author_name || '',
          author_email: commit.author?.email || commit.author_email || '',
          committed_date: commit.timestamp || commit.committed_date || new Date().toISOString(),
          web_url: commit.url || `${project.gitlabUrl}/${project.name}/-/commit/${commit.id}`,
          has_comments: false,
          comments_count: 0,
          skip_review: skipReview,
          comments: [],
          needsReview: !skipReview,
          branch: cache.defaultBranch
        };
      });

      // 检查是否已存在，避免重复
      const existingCommitIds = new Set(cache.commits.map(c => c.id));
      const newUniqueCommits = processedCommits.filter(c => !existingCommitIds.has(c.id));

      if (newUniqueCommits.length > 0) {
        // 添加新commit到缓存前端
        cache.commits.unshift(...newUniqueCommits);

        // 按时间重新排序
        cache.commits.sort((a, b) => {
          const timeA = new Date(a.committed_date).getTime();
          const timeB = new Date(b.committed_date).getTime();
          return timeB - timeA;
        });

        // 更新缓存时间戳
        cache.lastUpdateTime = new Date().toISOString();

        console.log(`✅ 增量添加 ${newUniqueCommits.length} 个新commit`);

        // 为新的需要审核的commit拉取评论
        const newNeedsReviewCommits = newUniqueCommits.filter(c => c.needsReview);
        if (newNeedsReviewCommits.length > 0) {
          console.log(`💬 为 ${newNeedsReviewCommits.length} 个新commit拉取评论...`);
          await this.pullCommentsForSpecificCommits(project, cache, newNeedsReviewCommits);
        }
      } else {
        console.log(`ℹ️  没有新的commit需要添加`);
      }

    } catch (error) {
      console.error(`❌ 增量更新commit失败:`, error instanceof Error ? error.message : error);
    }
  }

  // 增量更新特定commit的评论（通过webhook触发）
  public async incrementalUpdateCommitComments(projectId: string, commitId: string): Promise<void> {
    try {
      const project = projectStorage.findById(projectId);
      if (!project) {
        throw new Error(`项目 ${projectId} 不存在`);
      }

      const cache = this.memoryCache.get(projectId);
      if (!cache) {
        console.log(`⚠️  项目 ${projectId} 缓存不存在，跳过评论更新`);
        return;
      }

      // 查找对应的commit
      const commit = cache.commits.find(c => c.id === commitId);
      if (!commit) {
        console.log(`⚠️  在缓存中未找到commit ${commitId.substring(0, 8)}`);
        return;
      }

      console.log(`💬 更新commit ${commit.short_id} 的评论...`);

      // 拉取该commit的最新评论
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);
      const commentsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits/${commitId}/comments`;

      const response = await axios.get(commentsUrl, {
        headers: {
          'Authorization': `Bearer ${project.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      const comments = response.data;

      // 更新commit的评论信息
      commit.comments = comments.map((comment: any) => ({
        author: comment.author,
        created_at: comment.created_at,
        note: comment.note
      }));

      commit.has_comments = comments.length > 0;
      commit.comments_count = comments.length;

      // 更新缓存时间戳
      cache.lastUpdateTime = new Date().toISOString();

      const reviewers = [...new Set(comments.map((c: any) => c.author?.username).filter(Boolean))];
      console.log(`✅ 评论更新完成: ${comments.length} 条评论，审核人: ${reviewers.join(', ')}`);

    } catch (error) {
      console.error(`❌ 增量更新评论失败:`, error instanceof Error ? error.message : error);
    }
  }

  // 为特定commit拉取评论（辅助方法）
  private async pullCommentsForSpecificCommits(project: any, cache: ProjectCache, commits: CommitData[]): Promise<void> {
    try {
      const cleanGitlabUrl = project.gitlabUrl.replace(/\/$/, '');
      const projectIdentifier = encodeURIComponent(project.name);

      for (const commit of commits) {
        try {
          const commentsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits/${commit.id}/comments`;
          const response = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 5000
          });

          const comments = response.data;

          // 更新commit的评论信息
          commit.comments = comments.map((comment: any) => ({
            author: comment.author,
            created_at: comment.created_at,
            note: comment.note
          }));

          commit.has_comments = comments.length > 0;
          commit.comments_count = comments.length;

          if (comments.length > 0) {
            const reviewers = [...new Set(comments.map((c: any) => c.author?.username).filter(Boolean))];
            console.log(`      ✅ ${commit.short_id}: ${comments.length} 条评论，审核人: ${reviewers.join(', ')}`);
          }

        } catch (error) {
          console.warn(`      ⚠️  获取 ${commit.short_id} 评论失败:`, error instanceof Error ? error.message : error);
        }

        // 添加延时避免API限流
        await new Promise(resolve => setTimeout(resolve, 100));
      }

    } catch (error) {
      console.error(`❌ 拉取特定commit评论失败:`, error instanceof Error ? error.message : error);
    }
  }

  // 获取全局锁
  private acquireGlobalLock(): boolean {
    if (this.globalLock) {
      return false;
    }
    this.globalLock = true;
    return true;
  }

  // 释放全局锁
  private releaseGlobalLock(): void {
    console.log(`🔓 释放全局锁...`);
    this.globalLock = false;
  }

  // 检查全局锁状态
  private isGlobalLocked(): boolean {
    return this.globalLock;
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService; 