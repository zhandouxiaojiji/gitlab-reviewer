import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Switch,
  message,
  Typography,
  Alert,
  Space,
  Divider,
  Spin,
  Select
} from 'antd';
import {
  NotificationOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  ProjectOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text, Paragraph, Link } = Typography;
const { Option } = Select;

interface FeishuConfig {
  enabled: boolean;
  webhookUrl: string;
}

interface GitLabProject {
  id: string;
  name: string;
  description?: string;
}

const FeishuSettings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');
  
  const [config, setConfig] = useState<FeishuConfig>({
    enabled: false,
    webhookUrl: ''
  });
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('global');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    
    // 确保localStorage中有用户信息
    const userData = localStorage.getItem('user');
    if (!userData) {
      localStorage.setItem('user', JSON.stringify({ username }));
    }
    
    console.log('用户信息:', { username, userData });
    
    loadProjects();
    loadConfig();
  }, [username, navigate]);

  useEffect(() => {
    loadConfig();
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      console.log('开始加载项目列表...');
      console.log('用户名:', username);
      console.log('localStorage用户信息:', localStorage.getItem('user'));
      
      const response = await api.get(`/api/projects?user=${username}`);
      console.log('项目列表响应:', response.data);
      console.log('项目数量:', response.data?.length || 0);
      
      if (response.data && Array.isArray(response.data)) {
        setProjects(response.data);
        console.log('项目列表设置成功:', response.data);
      } else {
        console.warn('项目数据格式异常:', response.data);
        setProjects([]);
      }
    } catch (error: any) {
      console.error('加载项目列表失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
      console.error('请求URL:', error.config?.url);
      message.error('加载项目列表失败: ' + (error.response?.data?.message || error.message));
      setProjects([]); // 确保设置为空数组
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      let response;
      if (selectedProject === 'global') {
        response = await api.get(`/api/feishu/config?user=${username}`);
      } else {
        response = await api.get(`/api/projects/${selectedProject}/feishu-config?user=${username}`);
      }
      
      const data = response.data || { enabled: false, webhookUrl: '' };
      console.log('飞书配置加载成功:', data);
      setConfig(data);
      form.setFieldsValue(data);
    } catch (error: any) {
      console.error('加载飞书配置失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
      message.error('加载飞书配置失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: FeishuConfig) => {
    setSaving(true);
    try {
      if (selectedProject === 'global') {
        await api.post('/api/feishu/config', values);
      } else {
        await api.post(`/api/projects/${selectedProject}/feishu-config`, values);
      }
      
      setConfig(values);
      message.success(`${selectedProject === 'global' ? '全局' : '项目'}飞书通知配置保存成功`);
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存飞书配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const webhookUrl = form.getFieldValue('webhookUrl');
      if (selectedProject === 'global') {
        await api.post('/api/feishu/test');
      } else {
        await api.post('/api/feishu/test', { webhookUrl });
      }
      message.success('飞书通知测试成功！请检查飞书群是否收到测试消息');
    } catch (error: any) {
      message.error(error.response?.data?.message || '飞书通知测试失败');
    } finally {
      setTesting(false);
    }
  };

  const handleProjectChange = (value: string) => {
    setSelectedProject(value);
  };

  if (loading && projects.length === 0) {
    return (
      <MainLayout>
        <Card>
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px' }}>加载配置中...</div>
          </div>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Card>
        <div style={{ marginBottom: '24px' }}>
          <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            <NotificationOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            飞书通知配置
          </Title>
          <Text type="secondary">配置飞书群机器人，接收代码审查状态通知</Text>
        </div>

        {/* 项目选择 */}
        <Card style={{ marginBottom: '24px', backgroundColor: '#fafafa' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <ProjectOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            <Text strong>选择配置范围</Text>
          </div>
          <Select
            value={selectedProject}
            onChange={handleProjectChange}
            style={{ width: '300px' }}
            placeholder="请选择项目或全局配置"
            loading={loading}
          >
            <Option value="global">🌐 全局配置（适用于所有项目）</Option>
            {projects && projects.length > 0 && projects.map(project => (
              <Option key={project.id} value={project.id}>
                📁 {project.name} {project.description && `(${project.description})`}
              </Option>
            ))}
          </Select>
          <div style={{ marginTop: '8px', color: '#999' }}>
            <Text type="secondary">
              {projects.length === 0 
                ? '暂无项目配置，请先添加项目' 
                : `当前选择: ${selectedProject === 'global' ? '全局配置' : projects.find(p => p.id === selectedProject)?.name || '未知项目'}`
              }
            </Text>
          </div>
        </Card>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={config}
        >
          <Form.Item
            label="启用飞书通知"
            name="enabled"
            valuePropName="checked"
          >
            <Switch 
              checkedChildren="开启" 
              unCheckedChildren="关闭" 
            />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => {
              console.log('Form shouldUpdate:', { prevValues, currentValues });
              return prevValues.enabled !== currentValues.enabled;
            }}
          >
            {({ getFieldValue }) => {
              const enabled = getFieldValue('enabled');
              console.log('当前enabled状态:', enabled);
              return (
                <Form.Item
                  label="飞书Webhook地址"
                  name="webhookUrl"
                  rules={[
                    { 
                      required: enabled, 
                      message: '启用通知时必须配置Webhook地址' 
                    },
                    { 
                      pattern: /^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\//, 
                      message: '请输入有效的飞书机器人Webhook地址' 
                    }
                  ]}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    disabled={!enabled}
                  />
                </Form.Item>
              );
            }}
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={saving}
                icon={<NotificationOutlined />}
              >
                保存配置
              </Button>
              <Button 
                onClick={handleTest}
                loading={testing}
                disabled={!config.enabled || !config.webhookUrl}
                icon={<ExperimentOutlined />}
              >
                测试连接
              </Button>
            </Space>
          </Form.Item>
        </Form>

        <Divider />

        <Alert
          message="配置说明"
          description={
            <div>
              <Paragraph>
                <Text strong>1. 配置范围</Text>
                <br />
                • <Text code>全局配置</Text>：适用于所有项目的默认飞书通知设置
                <br />
                • <Text code>项目配置</Text>：为特定项目设置独立的飞书通知，优先级高于全局配置
              </Paragraph>

              <Paragraph>
                <Text strong>2. 创建飞书群机器人</Text>
                <br />
                • 在飞书群中添加"自定义机器人"
                <br />
                • 复制机器人的Webhook地址
                <br />
                • 建议设置机器人名称为"GitLab审查助手"
              </Paragraph>
              
              <Paragraph>
                <Text strong>3. 获取Webhook地址</Text>
                <br />
                • 地址格式：https://open.feishu.cn/open-apis/bot/v2/hook/...
                <br />
                • 确保机器人有发送消息的权限
              </Paragraph>

              <Paragraph>
                <Text strong>4. 通知内容</Text>
                <br />
                • 每日代码审查完成度统计
                <br />
                • 项目审查状态报告
                <br />
                • 审查人员完成情况
              </Paragraph>

              <Paragraph>
                <Text strong>5. 相关文档</Text>
                <br />
                <Link 
                  href="https://open.feishu.cn/document/ukTMukTMukTM/ucTM5YjL3ETO24yNxkjN" 
                  target="_blank"
                >
                  飞书机器人开发文档
                </Link>
              </Paragraph>
            </div>
          }
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />
      </Card>
    </MainLayout>
  );
};

export default FeishuSettings; 