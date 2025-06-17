import axios from 'axios';
import { projectStorage } from '../utils/storage';
import fs from 'fs';
import path from 'path';

class SchedulerService {
  private readonly DATA_DIR = path.join(process.cwd(), 'data');
  
  // 添加全局锁，防止并发执行
  private globalLock: boolean = false;

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  // 获取全局锁
  private acquireGlobalLock(): boolean {
    if (this.globalLock) {
      return false;
    }
    this.globalLock = true;
    return true;
  }

  // 释放全局锁
  private releaseGlobalLock(): void {
    console.log(`🔓 释放全局锁...`);
    this.globalLock = false;
  }

  // 检查全局锁状态
  private isGlobalLocked(): boolean {
    return this.globalLock;
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService; 