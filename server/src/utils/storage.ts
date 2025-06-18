import fs from 'fs';
import path from 'path';

// 内存存储工具（替代数据库）

// 项目存储
export const projects: any[] = [];

// 审查记录存储
export const reviews: any[] = [];

// 生成唯一ID
const generateId = () => {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

// 生成项目ID（基于GitLab URL + 项目名称）
const generateProjectId = (gitlabUrl: string, projectName: string) => {
  // 清理GitLab URL，移除协议和末尾斜杠
  const cleanUrl = gitlabUrl
    .replace(/^https?:\/\//, '') // 移除协议
    .replace(/\/$/, '') // 移除末尾斜杠
    .replace(/[^a-zA-Z0-9.-]/g, '_'); // 将特殊字符替换为下划线
  
  // 清理项目名称，将特殊字符替换为下划线
  const cleanProject = projectName
    .replace(/[^a-zA-Z0-9.-_]/g, '_')
    .replace(/\/+/g, '_'); // 将斜杠替换为下划线
  
  // 生成项目ID：url_projectname
  return `${cleanUrl}_${cleanProject}`;
};

// 数据存储路径
const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const COMMITS_FILE = path.join(DATA_DIR, 'commits.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 文件操作工具函数
const readJSONFile = (filePath: string, defaultValue: any[] = []): any[] => {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
    return defaultValue;
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    return defaultValue;
  }
};

const writeJSONFile = (filePath: string, data: any[]): void => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`写入文件失败: ${filePath}`, error);
    throw error;
  }
};

// 项目操作
export const projectStorage = {
  findAll: () => {
    return readJSONFile(PROJECTS_FILE);
  },
  
  findById: (id: string) => {
    const projects = readJSONFile(PROJECTS_FILE);
    return projects.find(p => p.id === id);
  },
  
  create: (projectData: any) => {
    const projects = readJSONFile(PROJECTS_FILE);
    const project = {
      id: generateProjectId(projectData.gitlabUrl, projectData.name),
      ...projectData,
      userMappings: {},
      reviewers: projectData.reviewers || [],
      reviewDays: projectData.reviewDays || 7,
      maxCommits: projectData.maxCommits || 100,
      filterRules: projectData.filterRules || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    projects.push(project);
    writeJSONFile(PROJECTS_FILE, projects);
    return project;
  },
  
  update: (id: string, updateData: any) => {
    const projects = readJSONFile(PROJECTS_FILE);
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { 
        ...projects[index], 
        ...updateData, 
        updatedAt: new Date().toISOString() 
      };
      writeJSONFile(PROJECTS_FILE, projects);
      return projects[index];
    }
    return null;
  },
  
  // 更新项目的用户映射关系
  updateUserMappings: (id: string, userMappings: { [username: string]: string }) => {
    const projects = readJSONFile(PROJECTS_FILE);
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { 
        ...projects[index], 
        userMappings,
        updatedAt: new Date().toISOString() 
      };
      writeJSONFile(PROJECTS_FILE, projects);
      return projects[index];
    }
    return null;
  },
  
  delete: (id: string) => {
    const projects = readJSONFile(PROJECTS_FILE);
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      const deletedProject = projects.splice(index, 1)[0];
      writeJSONFile(PROJECTS_FILE, projects);
      return deletedProject;
    }
    return null;
  }
};

// 审查记录操作
export const reviewStorage = {
  findAll: (filter: any = {}) => {
    let reviews = readJSONFile(REVIEWS_FILE);
    if (filter.projectId) {
      reviews = reviews.filter(r => r.projectId === filter.projectId);
    }
    return reviews;
  },
  
  findById: (id: string) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    return reviews.find(r => r.id === id);
  },
  
  findByCommitId: (commitId: string) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    return reviews.find(r => r.commitId === commitId);
  },
  
  create: (reviewData: any) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    const review = {
      id: generateId(),
      ...reviewData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    reviews.push(review);
    writeJSONFile(REVIEWS_FILE, reviews);
    return review;
  },
  
  update: (id: string, updateData: any) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    const index = reviews.findIndex(r => r.id === id);
    if (index !== -1) {
      reviews[index] = { 
        ...reviews[index], 
        ...updateData, 
        updatedAt: new Date().toISOString() 
      };
      writeJSONFile(REVIEWS_FILE, reviews);
      return reviews[index];
    }
    return null;
  },
  
  updateByCommitId: (commitId: string, updateData: any) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    const index = reviews.findIndex(r => r.commitId === commitId);
    if (index !== -1) {
      reviews[index] = { 
        ...reviews[index], 
        ...updateData, 
        updatedAt: new Date().toISOString() 
      };
      writeJSONFile(REVIEWS_FILE, reviews);
      return reviews[index];
    } else {
      // 如果不存在，创建新记录
      return reviewStorage.create({ commitId, ...updateData });
    }
  },
  
  delete: (id: string) => {
    const reviews = readJSONFile(REVIEWS_FILE);
    const index = reviews.findIndex(r => r.id === id);
    if (index !== -1) {
      const deletedReview = reviews.splice(index, 1)[0];
      writeJSONFile(REVIEWS_FILE, reviews);
      return deletedReview;
    }
    return null;
  },
  
  getStats: (filter: any = {}) => {
    const reviews = reviewStorage.findAll(filter);
    const totalCommits = reviews.length;
    const reviewedCommits = reviews.filter(r => r.hasReview).length;
    const pendingCommits = totalCommits - reviewedCommits;
    
    return {
      totalCommits,
      reviewedCommits,
      pendingCommits,
      reviewRate: totalCommits > 0 ? (reviewedCommits / totalCommits * 100).toFixed(1) : '0'
    };
  }
};

// 提交数据操作
export const commitStorage = {
  saveCommitData: (projectId: string, commitData: any) => {
    const commits = readJSONFile(COMMITS_FILE);
    const existingIndex = commits.findIndex((c: any) => c.projectId === projectId);
    
    if (existingIndex !== -1) {
      commits[existingIndex] = commitData;
    } else {
      commits.push(commitData);
    }
    
    writeJSONFile(COMMITS_FILE, commits);
    return commitData;
  },
  
  getCommitData: (projectId: string) => {
    const commits = readJSONFile(COMMITS_FILE);
    return commits.find((c: any) => c.projectId === projectId);
  },
  
  getAllCommitData: () => {
    return readJSONFile(COMMITS_FILE);
  }
};

// 全局配置文件
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// 全局配置操作
export const getGlobalConfig = (): any => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('读取全局配置失败:', error);
    return {};
  }
};

export const setGlobalConfig = (config: any): void => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    console.error('写入全局配置失败:', error);
    throw error;
  }
};

// 统一的存储接口
export const storage = {
  // 项目操作
  getProjects: () => projectStorage.findAll(),
  getProject: (id: string) => projectStorage.findById(id),
  createProject: (data: any) => projectStorage.create(data),
  updateProject: (id: string, data: any) => projectStorage.update(id, data),
  deleteProject: (id: string) => projectStorage.delete(id),
  
  // 审查记录操作
  getReviews: (filter?: any) => reviewStorage.findAll(filter),
  getReview: (id: string) => reviewStorage.findById(id),
  createReview: (data: any) => reviewStorage.create(data),
  updateReview: (id: string, data: any) => reviewStorage.update(id, data),
  deleteReview: (id: string) => reviewStorage.delete(id),
  
  // 提交数据操作
  saveCommitData: (projectId: string, data: any) => commitStorage.saveCommitData(projectId, data),
  getCommitData: (projectId: string) => commitStorage.getCommitData(projectId),
  getAllCommitData: () => commitStorage.getAllCommitData()
}; 