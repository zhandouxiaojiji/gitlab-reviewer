import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { message } from 'antd';
import api from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth必须在AuthProvider内使用');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查本地存储的用户信息
    const userData = localStorage.getItem('user');
    if (userData) {
      const parsedUser = JSON.parse(userData);
      setUser(parsedUser);
      // 设置全局用户参数
      api.defaults.params = { ...api.defaults.params, user: parsedUser.username };
    }
    setLoading(false);
  }, []);

  const login = async (username: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await api.post('/api/auth/login', { username });
      
      if (response.data.user) {
        const { user: userData } = response.data;
        
        // 保存用户信息
        localStorage.setItem('user', JSON.stringify(userData));
        
        // 设置全局用户参数
        api.defaults.params = { ...api.defaults.params, user: userData.username };
        
        setUser(userData);
        message.success('登录成功！');
        return true;
      }
      return false;
    } catch (error: any) {
      message.error(error.response?.data?.message || '登录失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    // 清除全局用户参数
    if (api.defaults.params) {
      delete api.defaults.params.user;
    }
    setUser(null);
    message.success('已退出登录');
  };

  const value = {
    user,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}; 