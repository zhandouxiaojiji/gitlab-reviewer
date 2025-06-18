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
  Statistic,
  TimePicker,
  InputNumber
} from 'antd';
import {
  ScheduleOutlined,
  PlayCircleOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  ProjectOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import MainLayout from './MainLayout';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ScheduleConfig {
  enabled: boolean;
  frequency: 'daily' | 'hourly' | 'minutely' | 'custom' | 'weekly' | 'monthly';
  customCron?: string;
  reportType: 'summary' | 'individual' | 'all' | 'project';
  time?: string; // 对于daily频率的具体时间
  dayOfWeek?: number;
  dayOfMonth?: number;
}

interface ScheduleStatus {
  isRunning: boolean;
  lastRun?: string;
  nextRun?: string;
  lastResult?: string;
}

interface GitLabProject {
  id: string;
  name: string;
  description?: string;
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
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('global');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    loadProjects();
    loadConfig();
    loadStatus();
  }, [username, navigate]);

  useEffect(() => {
    loadConfig();
    loadStatus();
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      console.log('开始加载项目列表...');
      const response = await api.get(`/api/projects?user=${username}`);
      console.log('项目列表响应:', response.data);
      console.log('项目数量:', response.data?.length || 0);
      setProjects(response.data || []);
    } catch (error: any) {
      console.error('加载项目列表失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
      message.error('加载项目列表失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      let response;
      if (selectedProject === 'global') {
        response = await api.get('/api/schedule/config');
      } else {
        response = await api.get(`/api/projects/${selectedProject}/schedule-config`);
      }
      
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
      let response;
      if (selectedProject === 'global') {
        response = await api.get('/api/schedule/status');
      } else {
        response = await api.get(`/api/projects/${selectedProject}/schedule-status`);
      }
      setStatus(response.data || { isRunning: false });
    } catch (error) {
      console.error('加载定时任务状态失败:', error);
    }
  };

  const handleSave = async (values: ScheduleConfig) => {
    setSaving(true);
    try {
      if (selectedProject === 'global') {
        await api.post('/api/schedule/config', values);
      } else {
        await api.post(`/api/projects/${selectedProject}/schedule-config`, values);
      }
      
      setConfig(values);
      message.success(`${selectedProject === 'global' ? '全局' : '项目'}定时报告配置保存成功`);
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
      if (selectedProject === 'global') {
        await api.post('/api/schedule/trigger', { reportType });
      } else {
        await api.post(`/api/projects/${selectedProject}/trigger-report`, { reportType });
      }
      message.success('报告发送成功！请检查飞书群是否收到报告');
    } catch (error: any) {
      message.error(error.response?.data?.message || '手动发送报告失败');
    } finally {
      setSending(false);
    }
  };

  const handleProjectChange = (value: string) => {
    setSelectedProject(value);
  };

  const getFrequencyDisplay = (freq: string) => {
    const map: { [key: string]: string } = {
      'daily': '每日',
      'hourly': '每小时',
      'minutely': '每分钟',
      'custom': '自定义',
      'weekly': '每周',
      'monthly': '每月'
    };
    return map[freq] || freq;
  };

  const getReportTypeDisplay = (type: string) => {
    const map: { [key: string]: string } = {
      'summary': '汇总报告',
      'individual': '个别报告',
      'all': '所有项目汇总报告',
      'project': '项目专属报告'
    };
    return map[type] || type;
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
            <ScheduleOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
            定时报告配置
          </Title>
          <Text type="secondary">配置定时任务，自动发送代码审查状态报告到飞书</Text>
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
            noStyle
            shouldUpdate={(prevValues, currentValues) => {
              console.log('Schedule Form shouldUpdate:', { prevValues, currentValues });
              return prevValues.enabled !== currentValues.enabled || prevValues.reportType !== currentValues.reportType;
            }}
          >
            {({ getFieldValue }) => {
              const enabled = getFieldValue('enabled');
              const reportType = getFieldValue('reportType');
              console.log('当前enabled状态:', enabled, 'reportType:', reportType);
              
              if (!enabled) return null;

              return (
                <>
                  <Form.Item
                    label="报告类型"
                    name="reportType"
                    rules={[{ required: true, message: '请选择报告类型' }]}
                  >
                    <Select placeholder="请选择报告类型">
                      {selectedProject === 'global' ? (
                        <>
                          <Option value="all">📊 所有项目汇总报告</Option>
                          <Option value="individual">📋 各项目独立报告</Option>
                        </>
                      ) : (
                        <Option value="project">📁 项目专属报告</Option>
                      )}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label="发送频率"
                    name="frequency"
                    rules={[{ required: true, message: '请选择发送频率' }]}
                  >
                    <Select placeholder="请选择发送频率">
                      <Option value="daily">📅 每日</Option>
                      <Option value="weekly">📆 每周</Option>
                      <Option value="monthly">🗓️ 每月</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label="发送时间"
                    name="time"
                    rules={[{ required: true, message: '请选择发送时间' }]}
                  >
                    <TimePicker 
                      format="HH:mm" 
                      placeholder="请选择时间"
                      style={{ width: '100%' }}
                    />
                  </Form.Item>

                  {getFieldValue('frequency') === 'weekly' && (
                    <Form.Item
                      label="发送日期"
                      name="dayOfWeek"
                      rules={[{ required: true, message: '请选择发送日期' }]}
                    >
                      <Select placeholder="请选择星期几">
                        <Option value={1}>星期一</Option>
                        <Option value={2}>星期二</Option>
                        <Option value={3}>星期三</Option>
                        <Option value={4}>星期四</Option>
                        <Option value={5}>星期五</Option>
                        <Option value={6}>星期六</Option>
                        <Option value={0}>星期日</Option>
                      </Select>
                    </Form.Item>
                  )}

                  {getFieldValue('frequency') === 'monthly' && (
                    <Form.Item
                      label="发送日期"
                      name="dayOfMonth"
                      rules={[
                        { required: true, message: '请输入发送日期' },
                        { pattern: /^([1-9]|[12][0-9]|3[01])$/, message: '请输入1-31之间的数字' }
                      ]}
                    >
                      <InputNumber 
                        min={1} 
                        max={31} 
                        placeholder="请输入1-31"
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  )}
                </>
              );
            }}
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
                <Text strong>1. 配置范围</Text>
                <br />
                • <Text code>全局配置</Text>：为所有项目设置统一的定时报告任务
                <br />
                • <Text code>项目配置</Text>：为特定项目设置独立的定时报告，可以有不同的频率和类型
              </Paragraph>

              <Paragraph>
                <Text strong>2. 执行频率说明</Text>
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
                <Text strong>3. 报告类型说明</Text>
                <br />
                {selectedProject === 'global' ? (
                  <>
                    • <Text code>汇总报告</Text>：发送一条消息包含所有项目的统计数据
                    <br />
                    • <Text code>个别报告</Text>：每个项目单独发送一条消息
                  </>
                ) : (
                  <>
                    • <Text code>项目汇总报告</Text>：发送该项目的统计概要
                    <br />
                    • <Text code>项目详细报告</Text>：包含具体的提交信息和审核详情
                  </>
                )}
              </Paragraph>

              <Paragraph>
                <Text strong>4. 注意事项</Text>
                <br />
                • 请确保已配置飞书通知
                <br />
                • 建议使用每日频率，避免频繁通知
                <br />
                • 项目级配置优先级高于全局配置
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