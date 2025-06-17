import express, { Request, Response } from 'express';
import { schedulerService } from '../services/schedulerService';
import { projectStorage } from '../utils/storage';
import crypto from 'crypto';

const router = express.Router();

// 验证GitLab Webhook签名
const verifyWebhookSignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature || !secret) {
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
    
  return signature === expectedSignature;
};

// GitLab Webhook接收端点
router.post('/gitlab', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const payload = req.body.toString('utf8');
    const signature = req.headers['x-gitlab-token'] as string;
    const event = req.headers['x-gitlab-event'] as string;
    
    console.log(`🔔 收到GitLab Webhook: ${event}`);
    
    // 解析payload
    let data;
    try {
      data = JSON.parse(payload);
    } catch (error) {
      console.error('❌ Webhook payload解析失败:', error);
      return res.status(400).json({ error: '无效的JSON格式' });
    }
    
    // 获取项目信息
    const projectPath = data.project?.path_with_namespace;
    if (!projectPath) {
      console.error('❌ Webhook中缺少项目信息');
      return res.status(400).json({ error: '缺少项目信息' });
    }
    
    // 查找对应的项目配置
    const projects = projectStorage.findAll();
    const project = projects.find(p => 
      p.name === projectPath && 
      p.gitlabUrl && 
      data.project?.web_url?.startsWith(p.gitlabUrl)
    );
    
    if (!project) {
      console.log(`⚠️  未找到匹配的项目配置: ${projectPath}`);
      return res.status(404).json({ error: '项目未配置' });
    }
    
    // 验证签名（如果配置了webhook secret）
    if (project.webhookSecret) {
      if (!verifyWebhookSignature(payload, signature, project.webhookSecret)) {
        console.error('❌ Webhook签名验证失败');
        return res.status(401).json({ error: '签名验证失败' });
      }
    }
    
    console.log(`✅ 处理项目 ${project.name} 的 ${event} 事件`);
    
    // 根据事件类型处理
    switch (event) {
      case 'Push Hook':
        await handlePushEvent(project, data);
        break;
        
      case 'Note Hook':
        await handleNoteEvent(project, data);
        break;
        
      case 'Merge Request Hook':
        await handleMergeRequestEvent(project, data);
        break;
        
      default:
        console.log(`ℹ️  忽略事件类型: ${event}`);
    }
    
    res.status(200).json({ 
      status: 'success', 
      message: '事件处理完成',
      event,
      project: project.name
    });
    
  } catch (error) {
    console.error('❌ Webhook处理失败:', error);
    res.status(500).json({ 
      error: '服务器内部错误',
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
});

// 处理Push事件（新的commit）
async function handlePushEvent(project: any, data: any) {
  try {
    const branch = data.ref?.replace('refs/heads/', '');
    const commits = data.commits || [];
    
    console.log(`📝 Push事件: ${commits.length} 个新commit推送到 ${branch} 分支`);
    
    // 如果是默认分支的push，增量更新commit数据
    if (branch && commits.length > 0) {
      console.log(`🔄 增量更新项目 ${project.name} 的commit数据...`);
      await schedulerService.incrementalUpdateCommits(project.id, commits, branch);
    }
    
  } catch (error) {
    console.error('❌ 处理Push事件失败:', error);
  }
}

// 处理Note事件（新的评论）
async function handleNoteEvent(project: any, data: any) {
  try {
    const noteableType = data.object_attributes?.noteable_type;
    const commitId = data.commit?.id;
    
    if (noteableType === 'Commit' && commitId) {
      console.log(`💬 新评论: commit ${commitId.substring(0, 8)} 收到评论`);
      console.log(`   👤 评论者: ${data.user?.name || data.user?.username}`);
      console.log(`   📝 内容: ${data.object_attributes?.note?.substring(0, 100)}...`);
      
      // 增量更新该commit的评论
      await schedulerService.incrementalUpdateCommitComments(project.id, commitId);
    }
    
  } catch (error) {
    console.error('❌ 处理Note事件失败:', error);
  }
}

// 处理MR事件
async function handleMergeRequestEvent(project: any, data: any) {
  try {
    const action = data.object_attributes?.action;
    const mrTitle = data.object_attributes?.title;
    
    console.log(`🔀 MR事件: ${action} - ${mrTitle}`);
    
    // 如果是merge事件，可能需要更新默认分支的commit
    if (action === 'merge') {
      console.log(`🔄 MR合并，更新项目 ${project.name} 数据...`);
      await schedulerService.manualRefreshProject(project.id);
    }
    
  } catch (error) {
    console.error('❌ 处理MR事件失败:', error);
  }
}

// 获取项目的Webhook配置状态
router.get('/status/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    
    const project = projectStorage.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: '项目不存在' });
    }
    
    res.json({
      projectId,
      projectName: project.name,
      webhookConfigured: !!project.webhookSecret,
      webhookUrl: `${req.protocol}://${req.get('host')}/api/webhook/gitlab`,
      supportedEvents: [
        'Push Hook',
        'Note Hook', 
        'Merge Request Hook'
      ]
    });
    
  } catch (error) {
    console.error('❌ 获取Webhook状态失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router; 