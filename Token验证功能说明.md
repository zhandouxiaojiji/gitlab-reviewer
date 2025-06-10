# GitLab Token验证功能说明

## 功能概述

为了确保GitLab访问令牌的正确性和有效性，系统新增了两个Token验证接口，能够在配置项目时和管理现有项目时测试GitLab连接的可用性。

## 新增接口

### 1. 新建连接测试接口

**接口地址**: `POST /api/projects/test-connection`

**功能**: 在添加新项目前测试GitLab URL和访问令牌的有效性

**请求参数**:
```json
{
  "gitlabUrl": "https://gitlab.com/group/project",
  "accessToken": "glpat-xxxxxxxxxxxxxxxxxxxx"
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "GitLab连接测试完成",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "results": {
    "tokenStatus": "有效",
    "userInfo": {
      "id": 123,
      "username": "testuser",
      "name": "Test User",
      "email": "test@example.com"
    },
    "accessibleProjects": 15,
    "specificProject": {
      "found": true,
      "info": {
        "id": 456,
        "name": "test-project",
        "path": "group/test-project",
        "visibility": "private",
        "lastActivity": "2024-01-01T11:00:00.000Z"
      },
      "permissions": {
        "canRead": true,
        "canWrite": true,
        "canAdmin": false
      },
      "commitsAccessible": true
    }
  },
  "recommendations": []
}
```

### 2. 已保存项目测试接口

**接口地址**: `POST /api/projects/:id/test`

**功能**: 测试已保存项目的GitLab连接状态

**请求参数**: 无（使用项目ID和已保存的配置）

**响应格式**: 与新建连接测试接口相同

## 测试验证内容

### Token有效性验证
- ✅ 验证访问令牌是否有效
- ✅ 获取当前用户信息
- ✅ 检查用户权限级别

### 项目访问权限验证
- ✅ 获取用户可访问的项目列表
- ✅ 验证对特定项目的访问权限
- ✅ 检查读取、写入、管理权限级别

### 功能性验证
- ✅ 测试提交记录访问权限
- ✅ 验证API响应时间和可用性
- ✅ 提供详细的错误信息和建议

## 错误处理

系统能够识别并正确处理以下错误情况：

### Token相关错误
- **401**: GitLab访问令牌无效或已过期
- **403**: GitLab访问令牌权限不足
- **404**: GitLab服务器或项目不存在

### 网络相关错误
- **ECONNREFUSED**: GitLab服务器连接被拒绝
- **ENOTFOUND**: GitLab服务器地址无效，DNS解析失败
- **ECONNABORTED**: 连接超时，GitLab服务器响应缓慢

### 其他错误
- **429**: GitLab API请求频率限制
- **500**: GitLab服务器内部错误

## 建议功能

测试完成后，系统会根据测试结果提供相应建议：

- 🔍 未找到具体项目时，建议确认GitLab URL是否正确
- 🔒 权限不足时，建议检查Token权限级别
- 📝 无法访问提交记录时，建议申请更高权限
- 📋 Token无项目访问权限时，建议检查Token范围

## 测试脚本

项目提供了以下测试脚本：

### Token验证功能测试
```bash
node test-token-validation.js
```

### 清理测试项目
```bash
node cleanup-test-projects.js
```

## 使用建议

### 开发环境测试
1. 使用真实的GitLab访问令牌替换测试脚本中的占位符
2. 确保GitLab URL格式正确（包含完整的项目路径）
3. 定期检查Token的有效期和权限范围

### 生产环境使用
1. 建议在添加新项目前先进行连接测试
2. 定期对已保存项目进行连接测试
3. 关注系统提供的权限和错误建议

## 技术实现

### 验证流程
1. **用户身份验证** - 通过GitLab `/user` API验证Token有效性
2. **项目列表获取** - 获取用户可访问的项目数量
3. **特定项目验证** - 从URL解析项目路径并验证访问权限
4. **功能权限检查** - 测试提交记录等核心功能的访问权限
5. **生成测试报告** - 提供详细的测试结果和改进建议

### 安全特性
- ✅ Token信息不会在日志中暴露
- ✅ 网络请求设置合理的超时时间
- ✅ 详细的错误分类和处理
- ✅ 权限级别精确检查

## 更新日志

**v1.0.0** (2024-01-01)
- ✅ 新增新建连接测试接口
- ✅ 新增已保存项目测试接口
- ✅ 完善错误处理和建议系统
- ✅ 提供完整的测试脚本

---

**注意**: 此功能需要有效的GitLab访问令牌才能完成完整测试。请确保Token具有相应的项目访问权限。 