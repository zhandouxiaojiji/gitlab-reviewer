import axios from 'axios';

// 动态获取API基础地址
const getApiBaseUrl = () => {
  // 如果设置了环境变量，优先使用
  if (process.env.REACT_APP_API_URL) {
    console.log('使用环境变量API地址:', process.env.REACT_APP_API_URL);
    return process.env.REACT_APP_API_URL;
  }
  
  // 生产环境下的智能检测
  if (process.env.NODE_ENV === 'production') {
    const currentHost = window.location.hostname;
    const currentProtocol = window.location.protocol;
    
    // 如果是localhost或127.0.0.1，使用相对路径
    if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
      console.log('检测到本地访问，使用相对路径');
      return '';
    }
    
    // 否则构建完整的API地址
    const apiUrl = `${currentProtocol}//${currentHost}:3001`;
    console.log('检测到远程访问，使用API地址:', apiUrl);
    return apiUrl;
  }
  
  // 开发环境下，使用localhost
  console.log('开发环境，使用localhost:3001');
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
    
    // 调试信息
    console.log('API请求:', {
      url: config.url,
      baseURL: config.baseURL,
      fullUrl: `${config.baseURL}${config.url}`
    });
    
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
    // 网络错误处理
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('API请求超时:', error);
    } else if (error.code === 'ERR_NETWORK' || !error.response) {
      console.error('网络连接错误，可能的原因:');
      console.error('1. 后端服务未启动');
      console.error('2. API地址配置错误');
      console.error('3. 跨域问题');
      console.error('当前API地址:', getApiBaseUrl());
    }
    
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