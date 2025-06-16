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

// 默认API实例 - 普通请求使用30秒超时
const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000, // 增加到30秒
});

// 长时间操作API实例 - 刷新等操作使用10分钟超时
const longRunningApi = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 600000, // 10分钟超时，给首次刷新充足时间
});

// 通用请求拦截器配置
const requestInterceptor = (config: any) => {
  // 从localStorage获取用户信息并添加到请求参数中
  const userData = localStorage.getItem('user');
  if (userData) {
    const user = JSON.parse(userData);
    config.params = { ...config.params, user: user.username };
  }
  
  // 调试信息
  console.log('API请求:', {
    url: config.url,
    baseURL: config.baseURL,
    fullUrl: `${config.baseURL}${config.url}`,
    params: config.params,
    timeout: config.timeout
  });
  
  return config;
};

// 通用响应拦截器配置
const responseInterceptor = {
  success: (response: any) => response,
  error: (error: any) => {
    // 网络错误处理
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('API请求超时:', error);
      const timeoutMessage = error.config?.timeout >= 300000 
        ? '数据同步时间较长，请稍后查看结果' 
        : 'API请求超时，请重试';
      error.message = timeoutMessage;
    } else if (error.code === 'ERR_NETWORK' || !error.response) {
      console.error('网络连接错误，可能的原因:');
      console.error('1. 后端服务未启动');
      console.error('2. API地址配置错误');
      console.error('3. 跨域问题');
      console.error('当前API地址:', getApiBaseUrl());
    }
    
    return Promise.reject(error);
  }
};

// 配置默认API实例的拦截器
api.interceptors.request.use(requestInterceptor, (error) => Promise.reject(error));
api.interceptors.response.use(responseInterceptor.success, responseInterceptor.error);

// 配置长时间操作API实例的拦截器
longRunningApi.interceptors.request.use(requestInterceptor, (error) => Promise.reject(error));
longRunningApi.interceptors.response.use(responseInterceptor.success, responseInterceptor.error);

// 创建API方法，自动选择合适的实例
const createApiMethod = (method: 'get' | 'post' | 'put' | 'delete') => {
  return (url: string, ...args: any[]) => {
    // 判断是否为需要长时间等待的操作
    const isLongRunning = url.includes('/sync') || url.includes('/refresh') || url.includes('/pull');
    
    const apiInstance = isLongRunning ? longRunningApi : api;
    
    if (isLongRunning) {
      console.log(`🔄 使用长时间API实例进行请求: ${url} (超时: ${apiInstance.defaults.timeout}ms)`);
    }
    
    return (apiInstance as any)[method](url, ...args);
  };
};

// 创建API对象，保持原有接口
const apiWrapper = {
  get: createApiMethod('get'),
  post: createApiMethod('post'),
  put: createApiMethod('put'),
  delete: createApiMethod('delete'),
  // 保持原有属性以兼容现有代码
  defaults: api.defaults,
  interceptors: api.interceptors
};

// 导出API基础地址获取函数，供其他地方使用
export const getApiUrl = () => getApiBaseUrl();

export default apiWrapper; 