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
  Spin
} from 'antd';
import {
  NotificationOutlined,
  ExperimentOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text, Paragraph, Link } = Typography;

interface FeishuConfig {
  enabled: boolean;
  webhookUrl: string;
}

const FeishuSettings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');
  
  const [config, setConfig] = useState<FeishuConfig>({
    enabled: false,
    webhookUrl: ''
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    loadConfig();
  }, [username, navigate]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/feishu/config');
      const data = response.data || { enabled: false, webhookUrl: '' };
      setConfig(data);
      form.setFieldsValue(data);
    } catch (error) {
      console.error('加载飞书配置失败:', error);
      message.error('加载飞书配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: FeishuConfig) => {
    setSaving(true);
    try {
      await api.post('/api/feishu/config', values);
      setConfig(values);
      message.success('飞书通知配置保存成功');
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存飞书配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await api.post('/api/feishu/test');
      message.success('飞书通知测试成功！请检查飞书群是否收到测试消息');
    } catch (error: any) {
      message.error(error.response?.data?.message || '飞书通知测试失败');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
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
            label="飞书Webhook地址"
            name="webhookUrl"
            rules={[
              { 
                required: form.getFieldValue('enabled'), 
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
              disabled={!form.getFieldValue('enabled')}
            />
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
                <Text strong>1. 创建飞书群机器人</Text>
                <br />
                • 在飞书群中添加"自定义机器人"
                <br />
                • 复制机器人的Webhook地址
                <br />
                • 建议设置机器人名称为"GitLab审查助手"
              </Paragraph>
              
              <Paragraph>
                <Text strong>2. 获取Webhook地址</Text>
                <br />
                • 地址格式：https://open.feishu.cn/open-apis/bot/v2/hook/...
                <br />
                • 确保机器人有发送消息的权限
              </Paragraph>

              <Paragraph>
                <Text strong>3. 通知内容</Text>
                <br />
                • 每日代码审查完成度统计
                <br />
                • 项目审查状态报告
                <br />
                • 审查人员完成情况
              </Paragraph>

              <Paragraph>
                <Text strong>4. 相关文档</Text>
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