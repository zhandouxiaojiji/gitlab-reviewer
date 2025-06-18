import axios from 'axios';
import { projectStorage } from '../utils/storage';

interface FeishuMessage {
  msg_type: string;
  content: {
    text?: string;
    post?: {
      zh_cn: {
        title: string;
        content: Array<Array<{
          tag: string;
          text?: string;
          href?: string;
        }>>;
      };
    };
  };
}

interface ReviewStats {
  projectName: string;
  reviewers: Array<{
    username: string;
    nickname: string;
    totalCommits: number;
    reviewedCommits: number;
    pendingCommits: number;
    reviewRate: string;
  }>;
  totalStats: {
    totalCommits: number;
    reviewedCommits: number;
    pendingCommits: number;
    reviewRate: string;
  };
}

class FeishuNotificationService {
  /**
   * 发送消息到飞书webhook
   */
  public async sendMessage(webhookUrl: string, message: FeishuMessage): Promise<boolean> {
    try {
      console.log(`📨 向飞书发送消息: ${webhookUrl}`);
      
      const response = await axios.post(webhookUrl, message, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.code === 0) {
        console.log('✅ 飞书消息发送成功');
        return true;
      } else {
        console.error('❌ 飞书消息发送失败:', response.data);
        return false;
      }
    } catch (error: any) {
      console.error('❌ 飞书消息发送异常:', error.message);
      return false;
    }
  }

  /**
   * 发送简单文本消息
   */
  public async sendTextMessage(webhookUrl: string, text: string): Promise<boolean> {
    const message: FeishuMessage = {
      msg_type: 'text',
      content: {
        text
      }
    };

    return this.sendMessage(webhookUrl, message);
  }

  /**
   * 发送富文本消息
   */
  public async sendRichMessage(
    webhookUrl: string, 
    title: string, 
    content: Array<Array<{ tag: string; text?: string; href?: string }>>
  ): Promise<boolean> {
    const message: FeishuMessage = {
      msg_type: 'post',
      content: {
        post: {
          zh_cn: {
            title,
            content
          }
        }
      }
    };

    return this.sendMessage(webhookUrl, message);
  }

  /**
   * 发送项目审核统计报告
   */
  public async sendProjectReviewReport(
    webhookUrl: string, 
    projectStats: ReviewStats, 
    reportDate: string
  ): Promise<boolean> {
    try {
      const { projectName, reviewers, totalStats } = projectStats;
      
      // 构建富文本内容
      const content: Array<Array<{ tag: string; text?: string; href?: string }>> = [
        // 标题行
        [
          { tag: 'text', text: `📊 项目：${projectName}` }
        ],
        [
          { tag: 'text', text: `📅 统计日期：${reportDate}` }
        ],
        [
          { tag: 'text', text: '' } // 空行
        ],
        
        // 总体统计
        [
          { tag: 'text', text: '📈 总体统计' }
        ],
        [
          { tag: 'text', text: `• 总提交数：${totalStats.totalCommits}` }
        ],
        [
          { tag: 'text', text: `• 已审核：${totalStats.reviewedCommits}` }
        ],
        [
          { tag: 'text', text: `• 待审核：${totalStats.pendingCommits}` }
        ],
        [
          { tag: 'text', text: `• 审核覆盖率：${totalStats.reviewRate}%` }
        ],
        [
          { tag: 'text', text: '' } // 空行
        ]
      ];

      // 添加每个审核人员的统计
      if (reviewers.length > 0) {
        content.push([
          { tag: 'text', text: '👥 审核人员完成情况' }
        ]);

        reviewers.forEach(reviewer => {
          const statusIcon = parseFloat(reviewer.reviewRate) >= 80 ? '✅' : 
                           parseFloat(reviewer.reviewRate) >= 60 ? '⚠️' : '❌';
          
          content.push([
            { tag: 'text', text: `${statusIcon} ${reviewer.nickname}：${reviewer.reviewedCommits}/${reviewer.totalCommits} (${reviewer.reviewRate}%)` }
          ]);
        });
      }

      // 添加提醒信息
      if (totalStats.pendingCommits > 0) {
        content.push(
          [{ tag: 'text', text: '' }], // 空行
          [{ tag: 'text', text: '⚠️ 请审核人员及时处理待审核提交' }]
        );
      }

      return this.sendRichMessage(
        webhookUrl,
        `📋 GitLab代码审核日报 - ${projectName}`,
        content
      );

    } catch (error: any) {
      console.error('❌ 发送项目审核报告失败:', error.message);
      return false;
    }
  }

  /**
   * 发送多项目汇总报告
   */
  public async sendMultiProjectReport(
    webhookUrl: string,
    allProjectStats: ReviewStats[],
    reportDate: string
  ): Promise<boolean> {
    try {
      // 计算总体统计
      const overallStats = allProjectStats.reduce(
        (acc, project) => ({
          totalCommits: acc.totalCommits + project.totalStats.totalCommits,
          reviewedCommits: acc.reviewedCommits + project.totalStats.reviewedCommits,
          pendingCommits: acc.pendingCommits + project.totalStats.pendingCommits
        }),
        { totalCommits: 0, reviewedCommits: 0, pendingCommits: 0 }
      );

      const overallRate = overallStats.totalCommits > 0 
        ? ((overallStats.reviewedCommits / overallStats.totalCommits) * 100).toFixed(1)
        : '0';

      // 构建富文本内容
      const content: Array<Array<{ tag: string; text?: string; href?: string }>> = [
        [
          { tag: 'text', text: `📅 统计日期：${reportDate}` }
        ],
        [
          { tag: 'text', text: `🏢 项目数量：${allProjectStats.length}` }
        ],
        [
          { tag: 'text', text: '' } // 空行
        ],
        
        // 总体统计
        [
          { tag: 'text', text: '📊 全部项目汇总' }
        ],
        [
          { tag: 'text', text: `• 总提交数：${overallStats.totalCommits}` }
        ],
        [
          { tag: 'text', text: `• 已审核：${overallStats.reviewedCommits}` }
        ],
        [
          { tag: 'text', text: `• 待审核：${overallStats.pendingCommits}` }
        ],
        [
          { tag: 'text', text: `• 整体覆盖率：${overallRate}%` }
        ],
        [
          { tag: 'text', text: '' } // 空行
        ]
      ];

      // 添加各项目概况
      content.push([
        { tag: 'text', text: '📋 各项目详情' }
      ]);

      allProjectStats.forEach(project => {
        const projectRate = parseFloat(project.totalStats.reviewRate);
        const statusIcon = projectRate >= 80 ? '✅' : projectRate >= 60 ? '⚠️' : '❌';
        
        content.push([
          { tag: 'text', text: `${statusIcon} ${project.projectName}：${project.totalStats.reviewedCommits}/${project.totalStats.totalCommits} (${project.totalStats.reviewRate}%)` }
        ]);
      });

      // 添加低覆盖率项目提醒
      const lowCoverageProjects = allProjectStats.filter(p => parseFloat(p.totalStats.reviewRate) < 60);
      if (lowCoverageProjects.length > 0) {
        content.push(
          [{ tag: 'text', text: '' }], // 空行
          [{ tag: 'text', text: '⚠️ 审核覆盖率较低的项目：' }]
        );
        
        lowCoverageProjects.forEach(project => {
          content.push([
            { tag: 'text', text: `• ${project.projectName} (${project.totalStats.reviewRate}%)` }
          ]);
        });
      }

      return this.sendRichMessage(
        webhookUrl,
        '📈 GitLab代码审核日报汇总',
        content
      );

    } catch (error: any) {
      console.error('❌ 发送多项目汇总报告失败:', error.message);
      return false;
    }
  }

  /**
   * 测试飞书webhook连接
   */
  public async testWebhook(webhookUrl: string): Promise<{ success: boolean; message: string }> {
    try {
      const testMessage = `🧪 GitLab Review Helper 连接测试\n时间：${new Date().toLocaleString('zh-CN')}`;
      
      const success = await this.sendTextMessage(webhookUrl, testMessage);
      
      return {
        success,
        message: success ? '飞书webhook连接测试成功' : '飞书webhook连接测试失败'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `飞书webhook测试失败: ${error.message}`
      };
    }
  }
}

export const feishuNotificationService = new FeishuNotificationService();
export { ReviewStats }; 