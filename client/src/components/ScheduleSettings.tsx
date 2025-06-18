import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Switch,
  Select,
  message,
  Typography,
  Alert,
  Space,
  Divider,
  Spin,
  Badge,
  Row,
  Col,
  Statistic
} from 'antd';
import {
  ScheduleOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  SendOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'minutely' | 'custom';
  customCron?: string;
  reportType: 'summary' | 'individual';
  time?: string; // 对于daily频率的具体时间
}

interface ScheduleStatus {
  isRunning: boolean;
  lastRun?: string;
  nextRun?: string;
  lastResult?: string;
}

const ScheduleSettings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const username = searchParams.get('user');
  
  const [config, setConfig] = useState<ScheduleConfig>({
    enabled: false,
    frequency: 'daily',
    reportType: 'summary',
    time: '09:00'
  });
  const [status, setStatus] = useState<ScheduleStatus>({
    isRunning: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    loadConfig();
    loadStatus();
  }, [username, navigate]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/schedule/config');
      const data = response.data || {
        enabled: false,
        frequency: 'daily',
        reportType: 'summary',
        time: '09:00'
      };
      setConfig(data);
      form.setFieldsValue(data);
    } catch (error) {
      console.error('加载定时配置失败:', error);
      message.error('加载定时配置失败');
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async () => {
    try {
      const response = await api.get('/api/schedule/status');
      setStatus(response.data || { isRunning: false });
    } catch (error) {
      console.error('加载定时任务状态失败:', error);
    }
  };

  const handleSave = async (values: ScheduleConfig) => {
    setSaving(true);
    try {
      await api.post('/api/schedule/config', values);
      setConfig(values);
      message.success('定时报告配置保存成功');
      // 重新加载状态
      setTimeout(loadStatus, 1000);
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存定时配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleManualSend = async () => {
    setSending(true);
    try {
      const reportType = form.getFieldValue('reportType') || config.reportType;
      await api.post('/api/schedule/trigger', { reportType });
      message.success('报告发送成功！请检查飞书群是否收到报告');
    } catch (error: any) {
      message.error(error.response?.data?.message || '手动发送报告失败');
    } finally {
      setSending(false);
    }
  };

  const getFrequencyDisplay = (freq: string) => {
    const map: { [key: string]: string } = {
      'daily': '每日',
      'hourly': '每小时',
      'minutely': '每分钟',
      'custom': '自定义'
    };
    return map[freq] || freq;
  };

  const getReportTypeDisplay = (type: string) => {
    const map: { [key: string]: string } = {
      'summary': '汇总报告',
      'individual': '个别报告'
    };
    return map[type] || type;
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
            <ScheduleOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            定时报告配置
          </Title>
          <Text type="secondary">配置定时任务，自动发送代码审查状态报告到飞书</Text>
        </div>

        {/* 状态统计 */}
        <Card style={{ marginBottom: '24px' }}>
          <Row gutter={16}>
            <Col span={6}>
              <Statistic
                title="任务状态"
                value={status.isRunning ? '运行中' : '已停止'}
                prefix={
                  <Badge 
                    status={status.isRunning ? 'processing' : 'default'} 
                  />
                }
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="上次执行"
                value={status.lastRun ? new Date(status.lastRun).toLocaleString() : '暂无'}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="下次执行"
                value={status.nextRun ? new Date(status.nextRun).toLocaleString() : '暂无'}
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="执行结果"
                value={status.lastResult || '暂无'}
                valueStyle={{ 
                  color: status.lastResult === '成功' ? '#3f8600' : 
                        status.lastResult === '失败' ? '#cf1322' : '#666'
                }}
              />
            </Col>
          </Row>
        </Card>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={config}
        >
          <Form.Item
            label="启用定时报告"
            name="enabled"
            valuePropName="checked"
          >
            <Switch 
              checkedChildren="开启" 
              unCheckedChildren="关闭" 
            />
          </Form.Item>

          <Form.Item
            label="执行频率"
            name="frequency"
            rules={[{ required: true, message: '请选择执行频率' }]}
          >
            <Select disabled={!form.getFieldValue('enabled')}>
              <Option value="daily">每日</Option>
              <Option value="hourly">每小时</Option>
              <Option value="minutely">每分钟（测试用）</Option>
              <Option value="custom">自定义Cron表达式</Option>
            </Select>
          </Form.Item>

          {form.getFieldValue('frequency') === 'daily' && (
            <Form.Item
              label="执行时间"
              name="time"
              rules={[{ required: true, message: '请选择执行时间' }]}
            >
              <Input
                type="time"
                style={{ width: '200px' }}
                disabled={!form.getFieldValue('enabled')}
              />
            </Form.Item>
          )}

          {form.getFieldValue('frequency') === 'custom' && (
            <Form.Item
              label="Cron表达式"
              name="customCron"
              rules={[
                { required: true, message: '请输入Cron表达式' },
                { 
                  pattern: /^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|3[01])) (\*|([01]?\d)) (\*|([0-6]))$/,
                  message: '请输入有效的Cron表达式（格式：分 时 日 月 周）'
                }
              ]}
              help="格式：分 时 日 月 周，例如：0 9 * * * 表示每天上午9点"
            >
              <Input
                placeholder="0 9 * * *"
                disabled={!form.getFieldValue('enabled')}
              />
            </Form.Item>
          )}

          <Form.Item
            label="报告类型"
            name="reportType"
            rules={[{ required: true, message: '请选择报告类型' }]}
          >
            <Select disabled={!form.getFieldValue('enabled')}>
              <Option value="summary">汇总报告（所有项目统计）</Option>
              <Option value="individual">个别报告（每个项目单独发送）</Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={saving}
                icon={<ScheduleOutlined />}
              >
                保存配置
              </Button>
              <Button 
                onClick={handleManualSend}
                loading={sending}
                icon={<SendOutlined />}
              >
                立即发送报告
              </Button>
              <Button 
                onClick={loadStatus}
                icon={<PlayCircleOutlined />}
              >
                刷新状态
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
                <Text strong>1. 执行频率说明</Text>
                <br />
                • <Text code>每日</Text>：每天在指定时间执行一次
                <br />
                • <Text code>每小时</Text>：每小时的整点执行一次
                <br />
                • <Text code>每分钟</Text>：每分钟执行一次（仅供测试使用）
                <br />
                • <Text code>自定义</Text>：使用Cron表达式自定义执行时间
              </Paragraph>
              
              <Paragraph>
                <Text strong>2. 报告类型说明</Text>
                <br />
                • <Text code>汇总报告</Text>：发送一条消息包含所有项目的统计数据
                <br />
                • <Text code>个别报告</Text>：每个项目单独发送一条消息
              </Paragraph>

              <Paragraph>
                <Text strong>3. 注意事项</Text>
                <br />
                • 请确保已配置飞书通知
                <br />
                • 建议使用每日频率，避免频繁通知
                <br />
                • 可以随时手动发送测试报告
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

export default ScheduleSettings; 