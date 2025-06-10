# GitLab Review 后端服务

## 📁 数据存储说明

本项目使用 **本地JSON文件** 存储项目配置和审查记录，无需安装数据库。

### 数据文件位置

```
server/
├── data/
│   ├── projects.json    # 项目配置文件
│   └── reviews.json     # 审查记录文件
└── src/
```

### 数据结构

#### projects.json
```json
[
  {
    "id": "项目唯一标识",
    "name": "项目名称",
    "gitlabUrl": "GitLab项目地址",
    "accessToken": "GitLab访问令牌",
    "description": "项目描述",
    "isActive": true,
    "createdBy": "创建者ID",
    "createdAt": "创建时间",
    "updatedAt": "更新时间"
  }
]
```

#### reviews.json
```json
[
  {
    "id": "审查记录唯一标识",
    "commitId": "提交ID",
    "commitMessage": "提交信息",
    "commitAuthor": "提交作者",
    "commitDate": "提交时间",
    "projectId": "所属项目ID",
    "hasReview": "是否已审查",
    "reviewedBy": ["审查者列表"],
    "reviewComments": ["评论列表"],
    "gitlabCommitUrl": "GitLab提交链接",
    "createdAt": "创建时间",
    "updatedAt": "更新时间"
  }
]
```

## 🚀 启动服务

```bash
# 安装依赖
npm install

# 开发模式启动
npm run dev

# 生产模式启动
npm run build
npm start
```

## 📝 特性

- ✅ **零配置存储** - 无需安装数据库
- ✅ **自动创建目录** - 首次运行自动创建 `data` 目录
- ✅ **数据持久化** - 所有配置保存在本地JSON文件
- ✅ **备份简单** - 直接复制 `data` 目录即可备份
- ✅ **版本控制友好** - `data` 目录已加入 `.gitignore`

## 🔧 数据管理

### 备份数据
```bash
# 复制整个data目录
cp -r server/data server/data-backup-$(date +%Y%m%d)
```

### 重置数据
```bash
# 删除data目录（下次启动会重新创建）
rm -rf server/data
```

### 迁移数据
直接复制 `data` 目录到新的服务器即可。

## 🛡️ 安全说明

- GitLab访问令牌存储在本地JSON文件中
- 请确保 `data` 目录的访问权限
- 建议定期备份配置文件
- 生产环境请设置适当的文件权限

## 🔍 故障排除

### 文件权限问题
```bash
# 确保服务有读写权限
chmod 755 server/data
chmod 644 server/data/*.json
```

### 数据文件损坏
```bash
# 删除损坏的文件，服务会重新创建
rm server/data/projects.json
# 或删除所有数据
rm -rf server/data
```

### 查看日志
服务启动时会在控制台输出相关日志信息。 