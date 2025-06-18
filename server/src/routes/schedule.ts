import express from 'express';
import { reviewReportService } from '../services/reviewReportService';
import { getGlobalConfig, setGlobalConfig } from '../utils/storage';

const router = express.Router();

// 获取定时任务配置
router.get('/config', async (req, res) => {
  try {
    const config = getGlobalConfig();
    res.json({
      enabled: config.schedule?.enabled || false,
      frequency: config.schedule?.frequency || 'daily',
      customCron: config.schedule?.customCron || '',
      reportType: config.schedule?.reportType || 'summary',
      time: config.schedule?.time || '09:00'
    });
  } catch (error) {
    console.error('获取定时任务配置失败:', error);
    res.status(500).json({ message: '获取定时任务配置失败' });
  }
});

// 保存定时任务配置
router.post('/config', async (req, res) => {
  try {
    const { enabled, frequency, customCron, reportType, time } = req.body;

    // 验证参数
    if (enabled && !frequency) {
      return res.status(400).json({ message: '启用定时任务时必须选择执行频率' });
    }

    if (enabled && frequency === 'custom' && !customCron) {
      return res.status(400).json({ message: '自定义频率时必须提供Cron表达式' });
    }

    if (enabled && frequency === 'daily' && !time) {
      return res.status(400).json({ message: '每日频率时必须选择执行时间' });
    }

    if (enabled && !reportType) {
      return res.status(400).json({ message: '启用定时任务时必须选择报告类型' });
    }

    // 保存配置
    const config = getGlobalConfig();
    config.schedule = {
      enabled,
      frequency: enabled ? frequency : 'daily',
      customCron: enabled && frequency === 'custom' ? customCron : '',
      reportType: enabled ? reportType : 'summary',
      time: enabled && frequency === 'daily' ? time : '09:00'
    };
    setGlobalConfig(config);

    res.json({ message: '定时任务配置保存成功' });
  } catch (error) {
    console.error('保存定时任务配置失败:', error);
    res.status(500).json({ message: '保存定时任务配置失败' });
  }
});

// 获取定时任务状态
router.get('/status', async (req, res) => {
  try {
    const config = getGlobalConfig();
    
    // 这里应该从实际的定时任务管理器获取状态
    // 暂时返回模拟数据
    res.json({
      isRunning: config.schedule?.enabled || false,
      lastRun: config.schedule?.lastRun || null,
      nextRun: config.schedule?.nextRun || null,
      lastResult: config.schedule?.lastResult || null
    });
  } catch (error) {
    console.error('获取定时任务状态失败:', error);
    res.status(500).json({ message: '获取定时任务状态失败' });
  }
});

// 手动触发报告发送
router.post('/trigger', async (req, res) => {
  try {
    const { reportType = 'summary' } = req.body;

    // 检查飞书配置
    const config = getGlobalConfig();
    if (!config.feishu?.enabled || !config.feishu?.webhookUrl) {
      return res.status(400).json({ message: '请先配置飞书通知' });
    }

    // 触发报告发送
    await reviewReportService.triggerManualReport(reportType, config.feishu.webhookUrl);
    
    // 更新最后执行记录
    config.schedule = config.schedule || {};
    config.schedule.lastRun = new Date().toISOString();
    config.schedule.lastResult = '成功';
    setGlobalConfig(config);

    res.json({ message: '报告发送成功' });
  } catch (error) {
    console.error('手动触发报告失败:', error);
    
    // 更新执行失败记录
    const config = getGlobalConfig();
    config.schedule = config.schedule || {};
    config.schedule.lastRun = new Date().toISOString();
    config.schedule.lastResult = '失败';
    setGlobalConfig(config);

    res.status(500).json({ message: '报告发送失败' });
  }
});

export default router; 