import express from 'express';
import { feishuNotificationService } from '../services/feishuNotificationService';
import { scheduledReportService } from '../services/scheduledReportService';
import { reviewReportService } from '../services/reviewReportService';

const router = express.Router();

// 获取飞书配置
router.get('/feishu', (req, res) => {
  try {
    const config = reviewReportService.getCurrentGlobalConfig();
    res.json({
      success: true,
      data: {
        feishuWebhookUrl: config.feishuWebhookUrl || '',
        enabled: !!config.feishuWebhookUrl
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 设置飞书配置
router.post('/feishu', async (req, res) => {
  try {
    const { feishuWebhookUrl, enabled } = req.body;
    
    if (!feishuWebhookUrl) {
      return res.status(400).json({
        success: false,
        message: '飞书webhook地址不能为空'
      });
    }

    // 保存配置
    const currentConfig = reviewReportService.getCurrentGlobalConfig();
    reviewReportService.setGlobalConfig({
      ...currentConfig,
      feishuWebhookUrl: enabled ? feishuWebhookUrl : ''
    });

    res.json({
      success: true,
      message: '飞书配置已保存'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 测试飞书webhook连接
router.post('/feishu/test', async (req, res) => {
  try {
    const { feishuWebhookUrl } = req.body;
    
    if (!feishuWebhookUrl) {
      return res.status(400).json({
        success: false,
        message: '飞书webhook地址不能为空'
      });
    }

    const result = await feishuNotificationService.testWebhook(feishuWebhookUrl);
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取定时任务配置
router.get('/schedule', (req, res) => {
  try {
    const config = scheduledReportService.getScheduleConfig();
    const status = scheduledReportService.getStatus();
    
    res.json({
      success: true,
      data: {
        ...config,
        status: {
          isRunning: status.isRunning,
          nextRun: status.nextRun
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 设置定时任务配置
router.post('/schedule', (req, res) => {
  try {
    const { enabled, cron, feishuWebhookUrl, reportType, projects } = req.body;
    
    // 验证cron表达式
    if (enabled && cron) {
      try {
        // 简单验证cron格式
        const parts = cron.trim().split(/\s+/);
        if (parts.length !== 5) {
          throw new Error('无效的cron表达式格式');
        }
      } catch (error: any) {
        return res.status(400).json({
          success: false,
          message: `cron表达式无效: ${error.message}`
        });
      }
    }

    scheduledReportService.setScheduleConfig({
      enabled,
      cron,
      feishuWebhookUrl,
      reportType,
      projects
    });

    res.json({
      success: true,
      message: '定时任务配置已更新'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 启动定时任务
router.post('/schedule/start', (req, res) => {
  try {
    scheduledReportService.start();
    
    res.json({
      success: true,
      message: '定时任务已启动'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 停止定时任务
router.post('/schedule/stop', (req, res) => {
  try {
    scheduledReportService.stop();
    
    res.json({
      success: true,
      message: '定时任务已停止'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 手动执行报告
router.post('/schedule/execute', async (req, res) => {
  try {
    const result = await scheduledReportService.manualExecute();
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 发送项目报告
router.post('/report/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { feishuWebhookUrl } = req.body;
    
    if (!feishuWebhookUrl) {
      return res.status(400).json({
        success: false,
        message: '飞书webhook地址不能为空'
      });
    }

    const result = await reviewReportService.sendProjectReviewReport(
      projectId,
      feishuWebhookUrl
    );
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 发送所有项目汇总报告
router.post('/report/all', async (req, res) => {
  try {
    const { feishuWebhookUrl } = req.body;
    
    if (!feishuWebhookUrl) {
      return res.status(400).json({
        success: false,
        message: '飞书webhook地址不能为空'
      });
    }

    const result = await reviewReportService.sendAllProjectsReport(feishuWebhookUrl);
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取项目审核统计
router.get('/report/stats/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    
    const stats = await reviewReportService.getProjectReviewStats(projectId);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 获取所有项目审核统计
router.get('/report/stats', async (req, res) => {
  try {
    const stats = await reviewReportService.getAllProjectsReviewStats();
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router; 