import { projectStorage } from '../utils/storage';
import { schedulerService } from './schedulerService';
import { feishuNotificationService, ReviewStats } from './feishuNotificationService';

interface ProjectReviewData {
  projectId: string;
  projectName: string;
  commits: any[];
  reviewers: string[];
  userMappings: { [username: string]: string };
}

// 定义提交数据的类型
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
  comments: Array<{
    author?: {
      username?: string;
      name?: string;
    };
    created_at: string;
    note: string;
  }>;
  needsReview?: boolean;
  branch: string;
}

class ReviewReportService {
  /**
   * 获取项目的审核统计数据
   */
  public async getProjectReviewStats(projectId: string): Promise<ReviewStats | null> {
    try {
      const project = projectStorage.findById(projectId);
      if (!project) {
        console.error(`项目 ${projectId} 不存在`);
        return null;
      }

      // 从内存缓存中获取项目数据
      const projectCache = schedulerService.getProjectCache(projectId);
      if (!projectCache || !projectCache.commits) {
        console.warn(`项目 ${project.name} 没有缓存数据`);
        return null;
      }

      const commits: CommitData[] = projectCache.commits;
      const reviewers: string[] = project.reviewers || [];
      const userMappings: { [username: string]: string } = project.userMappings || {};

      console.log(`📊 开始统计项目 ${project.name} 的审核情况...`);
      console.log(`   📝 总提交数: ${commits.length}`);
      console.log(`   👥 配置审核人员: ${reviewers.length} 人`);

      // 过滤掉无需审核的提交（匹配过滤规则的）
      const needsReviewCommits = commits.filter((commit: CommitData) => !commit.skip_review);
      console.log(`   ✅ 需要审核的提交: ${needsReviewCommits.length} 个`);

      // 统计每个审核人员的完成情况
      const reviewerStats = reviewers.map((reviewerUsername: string) => {
        // 过滤出该审核人员需要审核的提交（排除他自己的提交）
        const assignedCommits = needsReviewCommits.filter((commit: CommitData) => 
          commit.author_name !== reviewerUsername &&
          (userMappings[commit.author_name] !== reviewerUsername)
        );

        // 统计该审核人员已审核的提交
        const reviewedCommits = assignedCommits.filter((commit: CommitData) => {
          // 检查该提交是否有该审核人员的评论
          return commit.comments && commit.comments.some((comment: any) => 
            comment.author?.username === reviewerUsername ||
            comment.author?.name === reviewerUsername
          );
        });

        const reviewRate = assignedCommits.length > 0 
          ? ((reviewedCommits.length / assignedCommits.length) * 100).toFixed(1)
          : '100.0'; // 如果没有需要审核的提交，完成率为100%

        return {
          username: reviewerUsername,
          nickname: userMappings[reviewerUsername] || reviewerUsername,
          totalCommits: assignedCommits.length,
          reviewedCommits: reviewedCommits.length,
          pendingCommits: assignedCommits.length - reviewedCommits.length,
          reviewRate
        };
      });

      // 计算项目总体统计
      const totalCommitsForReview = needsReviewCommits.length;
      const totalReviewedCommits = needsReviewCommits.filter((commit: CommitData) => commit.has_comments).length;
      const totalPendingCommits = totalCommitsForReview - totalReviewedCommits;
      const totalReviewRate = totalCommitsForReview > 0 
        ? ((totalReviewedCommits / totalCommitsForReview) * 100).toFixed(1)
        : '100.0';

      console.log(`   📈 项目统计: ${totalReviewedCommits}/${totalCommitsForReview} (${totalReviewRate}%)`);

      return {
        projectName: project.name,
        reviewers: reviewerStats,
        totalStats: {
          totalCommits: totalCommitsForReview,
          reviewedCommits: totalReviewedCommits,
          pendingCommits: totalPendingCommits,
          reviewRate: totalReviewRate
        }
      };

    } catch (error: any) {
      console.error(`❌ 获取项目 ${projectId} 审核统计失败:`, error.message);
      return null;
    }
  }

  /**
   * 获取所有活跃项目的审核统计数据
   */
  public async getAllProjectsReviewStats(): Promise<ReviewStats[]> {
    try {
      const projects = projectStorage.findAll().filter((p: any) => 
        !p.deletedAt && p.isActive !== false
      );

      console.log(`📊 开始统计所有 ${projects.length} 个活跃项目的审核情况...`);

      const allStats: ReviewStats[] = [];

      for (const project of projects) {
        const stats = await this.getProjectReviewStats(project.id);
        if (stats) {
          allStats.push(stats);
        }
      }

      console.log(`✅ 成功获取 ${allStats.length} 个项目的统计数据`);
      return allStats;

    } catch (error: any) {
      console.error('❌ 获取所有项目审核统计失败:', error.message);
      return [];
    }
  }

  /**
   * 发送单个项目的审核报告到飞书
   */
  public async sendProjectReviewReport(
    projectId: string, 
    feishuWebhookUrl: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!feishuWebhookUrl) {
        return { success: false, message: '飞书webhook地址未配置' };
      }

      const stats = await this.getProjectReviewStats(projectId);
      if (!stats) {
        return { success: false, message: '无法获取项目统计数据' };
      }

      const reportDate = new Date().toLocaleDateString('zh-CN');
      const success = await feishuNotificationService.sendProjectReviewReport(
        feishuWebhookUrl,
        stats,
        reportDate
      );

      return {
        success,
        message: success ? '项目审核报告发送成功' : '项目审核报告发送失败'
      };

    } catch (error: any) {
      return {
        success: false,
        message: `发送项目审核报告失败: ${error.message}`
      };
    }
  }

  /**
   * 发送所有项目的汇总报告到飞书
   */
  public async sendAllProjectsReport(
    feishuWebhookUrl: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      if (!feishuWebhookUrl) {
        return { success: false, message: '飞书webhook地址未配置' };
      }

      const allStats = await this.getAllProjectsReviewStats();
      if (allStats.length === 0) {
        return { success: false, message: '没有可用的项目统计数据' };
      }

      const reportDate = new Date().toLocaleDateString('zh-CN');
      const success = await feishuNotificationService.sendMultiProjectReport(
        feishuWebhookUrl,
        allStats,
        reportDate
      );

      return {
        success,
        message: success ? '汇总报告发送成功' : '汇总报告发送失败'
      };

    } catch (error: any) {
      return {
        success: false,
        message: `发送汇总报告失败: ${error.message}`
      };
    }
  }

  /**
   * 手动触发审核报告
   */
  public async triggerManualReport(
    reportType: 'single' | 'all',
    projectId?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // 从全局配置中获取飞书webhook地址
      const globalConfig = this.getGlobalConfig();
      if (!globalConfig.feishuWebhookUrl) {
        return { success: false, message: '全局飞书webhook地址未配置' };
      }

      if (reportType === 'single') {
        if (!projectId) {
          return { success: false, message: '单项目报告需要指定项目ID' };
        }
        return this.sendProjectReviewReport(projectId, globalConfig.feishuWebhookUrl);
      } else {
        return this.sendAllProjectsReport(globalConfig.feishuWebhookUrl);
      }

    } catch (error: any) {
      return {
        success: false,
        message: `触发报告失败: ${error.message}`
      };
    }
  }

  /**
   * 获取全局配置
   */
  private getGlobalConfig(): { feishuWebhookUrl?: string; reportSchedule?: string } {
    try {
      // 这里可以从配置文件或数据库中读取全局配置
      // 暂时返回空配置，后续会通过API设置
      return {};
    } catch (error) {
      console.error('读取全局配置失败:', error);
      return {};
    }
  }

  /**
   * 设置全局配置
   */
  public setGlobalConfig(config: { feishuWebhookUrl?: string; reportSchedule?: string }): void {
    try {
      // 这里应该保存到配置文件或数据库
      // 暂时存储在内存中
      this.globalConfig = { ...this.globalConfig, ...config };
      console.log('全局配置已更新:', this.globalConfig);
    } catch (error) {
      console.error('保存全局配置失败:', error);
    }
  }

  private globalConfig: { feishuWebhookUrl?: string; reportSchedule?: string } = {};

  /**
   * 获取当前全局配置
   */
  public getCurrentGlobalConfig(): { feishuWebhookUrl?: string; reportSchedule?: string } {
    return { ...this.globalConfig };
  }
}

export const reviewReportService = new ReviewReportService(); 