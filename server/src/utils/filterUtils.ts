/**
 * 过滤工具函数
 * 用于根据正则表达式规则过滤commit log
 */

/**
 * 检查commit message是否匹配过滤规则
 * @param commitMessage - commit消息
 * @param filterRules - 过滤规则字符串（每行一个正则表达式）
 * @returns 是否匹配过滤规则（匹配则无需审查）
 */
export function shouldSkipReview(commitMessage: string, filterRules: string): boolean {
  if (!filterRules || !commitMessage) {
    return false;
  }

  // 将过滤规则按行分割，过滤掉空行
  const rules = filterRules
    .split('\n')
    .map(rule => rule.trim())
    .filter(rule => rule.length > 0);

  // 如果没有有效规则，不过滤
  if (rules.length === 0) {
    return false;
  }

  // 检查是否有任何规则匹配
  for (const rule of rules) {
    try {
      const regex = new RegExp(rule, 'i'); // 忽略大小写
      if (regex.test(commitMessage)) {
        // console.log(`Commit "${commitMessage}" 匹配过滤规则: ${rule}`);
        return true;
      }
    } catch (error) {
      console.warn(`无效的正则表达式规则: ${rule}`, error);
      // 忽略无效的正则表达式，继续检查其他规则
    }
  }

  return false;
}

/**
 * 验证过滤规则的有效性
 * @param filterRules - 过滤规则字符串
 * @returns 验证结果
 */
export function validateFilterRules(filterRules: string): { valid: boolean; errors: string[] } {
  if (!filterRules) {
    return { valid: true, errors: [] };
  }

  const rules = filterRules
    .split('\n')
    .map(rule => rule.trim())
    .filter(rule => rule.length > 0);

  const errors: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    try {
      new RegExp(rule, 'i');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      errors.push(`第${i + 1}行规则无效: ${rule} - ${errorMessage}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 获取默认的过滤规则示例
 */
export function getDefaultFilterRules(): string {
  return `^(build|ci|docs|feat|fix|perf|refactor|style|test).*
^Merge branch.*
^Update.*
^Initial commit.*
^.*version bump.*`;
} 