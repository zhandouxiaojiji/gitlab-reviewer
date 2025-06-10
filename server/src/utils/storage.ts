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

// 数据存储路径
const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');

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
      id: generateId(),
      ...projectData,
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