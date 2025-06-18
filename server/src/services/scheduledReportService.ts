import { reviewReportService } from './reviewReportService';
import { feishuNotificationService } from './feishuNotificationService';

interface ScheduleConfig {
  enabled: boolean;
  cron: string; // cron expression
  feishuWebhookUrl: string;
  reportType: 'all' | 'individual';
  projects?: string[];
}

class ScheduledReportService {
  private scheduleConfig: ScheduleConfig = {
    enabled: false,
    cron: '0 9 * * *',
    feishuWebhookUrl: '',
    reportType: 'all'
  };

  private timerId: NodeJS.Timeout | null = null;
  private isRunning = false;

  public setScheduleConfig(config: Partial<ScheduleConfig>): void {
    this.scheduleConfig = { ...this.scheduleConfig, ...config };
    console.log('定时报告配置已更新:', this.scheduleConfig);
    this.restart();
  }

  public getScheduleConfig(): ScheduleConfig {
    return { ...this.scheduleConfig };
  }

  public start(): void {
    if (this.isRunning) {
      console.log('定时报告任务已在运行中');
      return;
    }

    if (!this.scheduleConfig.enabled) {
      console.log('定时报告未启用');
      return;
    }

    if (!this.scheduleConfig.feishuWebhookUrl) {
      console.error('飞书webhook地址未配置，无法启动定时报告');
      return;
    }

    try {
      const intervalMs = this.parseCronToInterval(this.scheduleConfig.cron);
      
      console.log(`启动定时报告任务，时间间隔: ${intervalMs}ms`);
      
      this.timerId = setInterval(async () => {
        await this.executeReport();
      }, intervalMs);
      
      this.isRunning = true;
      
      const nextRun = new Date(Date.now() + intervalMs);
      console.log(`下次执行时间: ${nextRun.toLocaleString('zh-CN')}`);
      
    } catch (error: any) {
      console.error('启动定时报告失败:', error.message);
    }
  }

  public stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.isRunning = false;
    console.log('定时报告任务已停止');
  }

  public restart(): void {
    this.stop();
    this.start();
  }

  public getStatus(): { 
    isRunning: boolean; 
    nextRun?: string; 
    config: ScheduleConfig 
  } {
    let nextRun: string | undefined;
    
    if (this.isRunning && this.scheduleConfig.enabled) {
      try {
        const intervalMs = this.parseCronToInterval(this.scheduleConfig.cron);
        const nextRunTime = new Date(Date.now() + intervalMs);
        nextRun = nextRunTime.toLocaleString('zh-CN');
      } catch (error) {
        // ignore error
      }
    }

    return {
      isRunning: this.isRunning,
      nextRun,
      config: this.scheduleConfig
    };
  }

  public async manualExecute(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('手动执行定时报告...');
      return await this.executeReport();
    } catch (error: any) {
      return {
        success: false,
        message: `手动执行失败: ${error.message}`
      };
    }
  }

  private async executeReport(): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`开始执行定时报告 (${new Date().toLocaleString('zh-CN')})`);
      
      if (this.scheduleConfig.reportType === 'all') {
        const result = await reviewReportService.sendAllProjectsReport(
          this.scheduleConfig.feishuWebhookUrl
        );
        
        console.log(`汇总报告执行${result.success ? '成功' : '失败'}: ${result.message}`);
        return result;
        
      } else {
        const projects = this.scheduleConfig.projects || [];
        let successCount = 0;
        let totalCount = projects.length;
        
        for (const projectId of projects) {
          const result = await reviewReportService.sendProjectReviewReport(
            projectId,
            this.scheduleConfig.feishuWebhookUrl
          );
          
          if (result.success) {
            successCount++;
          }
          
          console.log(`项目 ${projectId} 报告: ${result.message}`);
          await this.sleep(1000);
        }
        
        const message = `单独项目报告完成: ${successCount}/${totalCount} 成功`;
        console.log(message);
        
        return {
          success: successCount > 0,
          message
        };
      }
      
    } catch (error: any) {
      const message = `定时报告执行失败: ${error.message}`;
      console.error(message);
      return {
        success: false,
        message
      };
    }
  }

  private parseCronToInterval(cron: string): number {
    const parts = cron.trim().split(/\s+/);
    
    if (parts.length !== 5) {
      throw new Error('无效的cron表达式格式');
    }
    
    const [minute, hour, day, month, weekday] = parts;
    
    // Daily at specific hour: "0 9 * * *"
    if (minute === '0' && hour !== '*' && day === '*' && month === '*' && weekday === '*') {
      const targetHour = parseInt(hour);
      if (isNaN(targetHour) || targetHour < 0 || targetHour > 23) {
        throw new Error('无效的小时值');
      }
      return 24 * 60 * 60 * 1000;
    }
    
    // Every N hours: "0 */6 * * *"
    if (minute === '0' && hour.startsWith('*/') && day === '*' && month === '*' && weekday === '*') {
      const interval = parseInt(hour.substring(2));
      if (isNaN(interval) || interval <= 0) {
        throw new Error('无效的小时间隔');
      }
      return interval * 60 * 60 * 1000;
    }
    
    // Every N minutes: "*/30 * * * *"
    if (minute.startsWith('*/') && hour === '*' && day === '*' && month === '*' && weekday === '*') {
      const interval = parseInt(minute.substring(2));
      if (isNaN(interval) || interval <= 0) {
        throw new Error('无效的分钟间隔');
      }
      return interval * 60 * 1000;
    }
    
    throw new Error(`不支持的cron表达式: ${cron}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const scheduledReportService = new ScheduledReportService(); 