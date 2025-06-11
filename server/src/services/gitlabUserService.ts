import axios from 'axios';
import { projectStorage } from '../utils/storage';

interface GitlabUser {
  id: number;
  username: string;
  name: string;
  email: string;
  avatar_url: string;
}

interface Project {
  id: string;
  name: string;
  gitlabUrl: string;
  accessToken: string;
  userMappings?: { [username: string]: string };
}

export class GitlabUserService {
  
  /**
   * 获取项目所有成员的用户映射关系
   */
  static async fetchProjectUserMappings(project: Project): Promise<{ [username: string]: string }> {
    try {
      console.log(`开始为项目 ${project.name} 获取用户映射关系...`);
      
      // 验证和标准化GitLab URL
      let gitlabBaseUrl = project.gitlabUrl.replace(/\/$/, '');
      if (!gitlabBaseUrl.startsWith('http://') && !gitlabBaseUrl.startsWith('https://')) {
        gitlabBaseUrl = 'http://' + gitlabBaseUrl;
      }

      const urlParts = new URL(gitlabBaseUrl);
      const cleanGitlabUrl = `${urlParts.protocol}//${urlParts.host}`;
      
      let projectIdentifier = encodeURIComponent(project.name);
      
      // 方案1: 获取项目成员
      const membersUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/members/all`;
      let users: GitlabUser[] = [];
      
      try {
        const membersResponse = await axios.get(membersUrl, {
          headers: {
            'Authorization': `Bearer ${project.accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        if (membersResponse.status === 200 && Array.isArray(membersResponse.data)) {
          users = membersResponse.data;
          console.log(`通过项目成员API获取到 ${users.length} 个用户`);
        }
      } catch (error) {
        console.warn('获取项目成员失败，尝试其他方法...', error);
      }
      
      // 方案2: 如果获取成员失败，从提交记录中提取作者
      if (users.length === 0) {
        try {
          const commitsUrl = `${cleanGitlabUrl}/api/v4/projects/${projectIdentifier}/repository/commits`;
          const commitsResponse = await axios.get(commitsUrl, {
            headers: {
              'Authorization': `Bearer ${project.accessToken}`,
              'Accept': 'application/json'
            },
            params: {
              per_page: 100 // 获取更多提交记录
            },
            timeout: 10000
          });
          
          if (commitsResponse.status === 200 && Array.isArray(commitsResponse.data)) {
            const commits = commitsResponse.data;
            console.log(`从 ${commits.length} 个提交记录中提取用户信息...`);
            
            // 提取所有唯一的作者
            const authorNames = new Set<string>();
            commits.forEach((commit: any) => {
              if (commit.author_name) {
                authorNames.add(commit.author_name);
              }
              if (commit.committer_name) {
                authorNames.add(commit.committer_name);
              }
            });
            
            console.log(`提取到 ${authorNames.size} 个唯一用户名:`, Array.from(authorNames));
            
            // 为每个用户名获取详细信息
            const userPromises = Array.from(authorNames).map(async (username) => {
              try {
                const userUrl = `${cleanGitlabUrl}/api/v4/users?username=${encodeURIComponent(username)}`;
                const userResponse = await axios.get(userUrl, {
                  headers: {
                    'Authorization': `Bearer ${project.accessToken}`,
                    'Accept': 'application/json'
                  },
                  timeout: 5000
                });
                
                if (userResponse.status === 200 && Array.isArray(userResponse.data) && userResponse.data.length > 0) {
                  return userResponse.data[0];
                }
              } catch (error) {
                console.warn(`获取用户 ${username} 详细信息失败:`, error);
              }
              return null;
            });
            
            const userResults = await Promise.all(userPromises);
            users = userResults.filter(user => user !== null);
            console.log(`成功获取到 ${users.length} 个用户的详细信息`);
          }
        } catch (error) {
          console.error('从提交记录提取用户信息失败:', error);
        }
      }
      
      // 构建用户映射关系
      const userMappings: { [username: string]: string } = {};
      
      users.forEach((user: GitlabUser) => {
        if (user.username && user.name) {
          // 只保存username到name的映射
          userMappings[user.username] = user.name;
          // 不再保存name到name的重复映射
        }
      });
      
      console.log(`项目 ${project.name} 的用户映射关系:`, userMappings);
      return userMappings;
      
    } catch (error) {
      console.error(`获取项目 ${project.name} 用户映射关系失败:`, error);
      return {};
    }
  }
  
  /**
   * 更新所有项目的用户映射关系
   */
  static async updateAllProjectUserMappings(): Promise<void> {
    try {
      const projects = projectStorage.findAll();
      console.log(`开始为 ${projects.length} 个项目更新用户映射关系...`);
      
      for (const project of projects) {
        if (project.gitlabUrl && project.accessToken) {
          console.log(`正在处理项目: ${project.name}`);
          const userMappings = await this.fetchProjectUserMappings(project);
          
          // 更新项目的用户映射关系
          projectStorage.updateUserMappings(project.id, userMappings);
          console.log(`项目 ${project.name} 用户映射关系已更新，共 ${Object.keys(userMappings).length} 个用户`);
          
          // 添加延迟以避免API限制
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.log(`跳过项目 ${project.name}: 缺少GitLab配置`);
        }
      }
      
      console.log('所有项目用户映射关系更新完成');
    } catch (error) {
      console.error('更新项目用户映射关系失败:', error);
    }
  }
  
  /**
   * 更新单个项目的用户映射关系
   */
  static async updateProjectUserMappings(projectId: string): Promise<boolean> {
    try {
      const project = projectStorage.findById(projectId);
      if (!project) {
        console.error(`项目 ${projectId} 不存在`);
        return false;
      }
      
      if (!project.gitlabUrl || !project.accessToken) {
        console.error(`项目 ${project.name} 缺少GitLab配置`);
        return false;
      }
      
      console.log(`开始为项目 ${project.name} 更新用户映射关系...`);
      const userMappings = await this.fetchProjectUserMappings(project);
      
      // 更新项目的用户映射关系
      projectStorage.updateUserMappings(project.id, userMappings);
      console.log(`项目 ${project.name} 用户映射关系已更新，共 ${Object.keys(userMappings).length} 个用户`);
      
      return true;
    } catch (error) {
      console.error(`更新项目 ${projectId} 用户映射关系失败:`, error);
      return false;
    }
  }
} 