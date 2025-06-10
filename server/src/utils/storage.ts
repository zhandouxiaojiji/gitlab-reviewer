// 内存存储工具（替代数据库）

// 项目存储
export const projects: any[] = [];

// 审查记录存储
export const reviews: any[] = [];

// 生成唯一ID
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 项目操作
export const projectStorage = {
  findAll: () => projects,
  findById: (id: string) => projects.find(p => p.id === id),
  create: (projectData: any) => {
    const project = {
      id: generateId(),
      ...projectData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    projects.push(project);
    return project;
  },
  update: (id: string, updateData: any) => {
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      projects[index] = { ...projects[index], ...updateData, updatedAt: new Date() };
      return projects[index];
    }
    return null;
  },
  delete: (id: string) => {
    const index = projects.findIndex(p => p.id === id);
    if (index !== -1) {
      return projects.splice(index, 1)[0];
    }
    return null;
  }
};

// 审查记录操作
export const reviewStorage = {
  findAll: (filter: any = {}) => {
    let result = reviews;
    if (filter.projectId) {
      result = result.filter(r => r.projectId === filter.projectId);
    }
    return result;
  },
  findById: (id: string) => reviews.find(r => r.id === id),
  findByCommitId: (commitId: string) => reviews.find(r => r.commitId === commitId),
  create: (reviewData: any) => {
    const review = {
      id: generateId(),
      ...reviewData,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    reviews.push(review);
    return review;
  },
  update: (id: string, updateData: any) => {
    const index = reviews.findIndex(r => r.id === id);
    if (index !== -1) {
      reviews[index] = { ...reviews[index], ...updateData, updatedAt: new Date() };
      return reviews[index];
    }
    return null;
  },
  updateByCommitId: (commitId: string, updateData: any) => {
    const index = reviews.findIndex(r => r.commitId === commitId);
    if (index !== -1) {
      reviews[index] = { ...reviews[index], ...updateData, updatedAt: new Date() };
      return reviews[index];
    } else {
      // 如果不存在，创建新记录
      return reviewStorage.create({ commitId, ...updateData });
    }
  },
  delete: (id: string) => {
    const index = reviews.findIndex(r => r.id === id);
    if (index !== -1) {
      return reviews.splice(index, 1)[0];
    }
    return null;
  },
  getStats: (filter: any = {}) => {
    let data = reviews;
    if (filter.projectId) {
      data = data.filter(r => r.projectId === filter.projectId);
    }
    
    const totalCommits = data.length;
    const reviewedCommits = data.filter(r => r.hasReview).length;
    const unReviewedCommits = totalCommits - reviewedCommits;
    const reviewRate = totalCommits > 0 ? (reviewedCommits / totalCommits * 100).toFixed(2) : 0;
    
    return {
      totalCommits,
      reviewedCommits,
      unReviewedCommits,
      reviewRate: `${reviewRate}%`
    };
  }
}; 