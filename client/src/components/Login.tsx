import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Title } = Typography;

interface LoginForm {
  username: string;
}

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate(`/dashboard?user=${user.username}`);
    }
  }, [user, navigate]);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    const success = await login(values.username);
    if (success) {
      navigate(`/dashboard?user=${values.username}`);
    }
    setLoading(false);
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={2} style={{ color: '#1890ff' }}>
            GitLab Review工具
          </Title>
          <p style={{ color: '#666' }}>代码review管理平台</p>
        </div>

        <Form
          name="login"
          size="large"
          onFinish={onFinish}
          autoComplete="off"
          initialValues={{ username: '' }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名!' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名" 
            />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              className="login-form-button"
              loading={loading}
              style={{ height: 40 }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
        
        <div style={{ textAlign: 'center', color: '#999', fontSize: '12px' }}>
          输入任意用户名即可登录
        </div>
      </Card>
    </div>
  );
};

export default Login; 