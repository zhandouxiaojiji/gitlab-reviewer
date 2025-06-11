import axios from 'axios';

// 动态获取API基础地址
const getApiBaseUrl = () => {
  // 如果设置了环境变量，优先使用
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // 生产环境下，使用相对路径（nginx代理）
  if (process.env.NODE_ENV === 'production') {
    return '';  // 使用相对路径，通过nginx代理到后端
  }
  
  // 开发环境下，使用localhost
  return 'http://localhost:3001';
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 10000,
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token过期，清除本地存储并跳转到登录页
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// 导出API基础地址获取函数，供其他地方使用
export const getApiUrl = () => getApiBaseUrl();

export default api; 