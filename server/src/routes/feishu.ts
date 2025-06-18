import express from 'express';
import { feishuNotificationService } from '../services/feishuNotificationService';
import { getGlobalConfig, setGlobalConfig } from '../utils/storage';

const router = express.Router();

// 获取飞书配置
router.get('/config', async (req, res) => {
  try {
    const config = getGlobalConfig();
    res.json({
      enabled: config.feishu?.enabled || false,
      webhookUrl: config.feishu?.webhookUrl || ''
    });
  } catch (error) {
    console.error('获取飞书配置失败:', error);
    res.status(500).json({ message: '获取飞书配置失败' });
  }
});

// 保存飞书配置
router.post('/config', async (req, res) => {
  try {
    const { enabled, webhookUrl } = req.body;

    // 验证参数
    if (enabled && !webhookUrl) {
      return res.status(400).json({ message: '启用通知时必须提供Webhook地址' });
    }

    if (enabled && !webhookUrl.startsWith('https://open.feishu.cn/open-apis/bot/v2/hook/')) {
      return res.status(400).json({ message: '请提供有效的飞书机器人Webhook地址' });
    }

    // 保存配置
    const config = getGlobalConfig();
    config.feishu = {
      enabled,
      webhookUrl: enabled ? webhookUrl : ''
    };
    setGlobalConfig(config);

    res.json({ message: '飞书配置保存成功' });
  } catch (error) {
    console.error('保存飞书配置失败:', error);
    res.status(500).json({ message: '保存飞书配置失败' });
  }
});

// 测试飞书连接
router.post('/test', async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    let testWebhookUrl = webhookUrl;
    
    // 如果没有传入webhook地址，则使用全局配置
    if (!testWebhookUrl) {
      const config = getGlobalConfig();
      
      if (!config.feishu?.enabled) {
        return res.status(400).json({ message: '飞书通知未启用' });
      }

      if (!config.feishu?.webhookUrl) {
        return res.status(400).json({ message: '飞书Webhook地址未配置' });
      }
      
      testWebhookUrl = config.feishu.webhookUrl;
    }

    // 验证webhook地址格式
    if (!testWebhookUrl.startsWith('https://open.feishu.cn/open-apis/bot/v2/hook/')) {
      return res.status(400).json({ message: '请提供有效的飞书机器人Webhook地址' });
    }

    // 发送测试消息
    await feishuNotificationService.testWebhook(testWebhookUrl);
    
    res.json({ message: '飞书通知测试成功' });
  } catch (error) {
    console.error('飞书通知测试失败:', error);
    res.status(500).json({ message: '飞书通知测试失败' });
  }
});

export default router; 