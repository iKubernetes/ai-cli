export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface RiskPattern {
  id: string;
  pattern: RegExp;
  level: RiskLevel;
  description: string;
  suggestion?: string;        // 回滚或替代建议
}

// 静态规则集（按风险等级降序排列）
export const RISK_PATTERNS: RiskPattern[] = [
  // CRITICAL: 数据毁灭性操作
  {
    id: 'rm-rf-root',
    pattern: /rm\s+(-rf| -rf| -r -f)\s+\/\s*$/,
    level: 'CRITICAL',
    description: '递归强制删除根目录，会导致系统崩溃',
    suggestion: '建议使用 `mv` 移动到 /tmp/trash 或明确指定目标目录'
  },
  {
    id: 'rm-rf-etc',
    pattern: /rm\s+(-rf| -rf| -r -f)\s+\/etc\b/,
    level: 'CRITICAL',
    description: '删除 /etc 系统配置目录，导致系统无法启动',
    suggestion: '操作 /etc 前务必备份'
  },
  {
    id: 'dd-disk',
    pattern: /dd\s+.*of=\/dev\/sd[a-z]/,
    level: 'CRITICAL',
    description: '直接写入块设备，会覆盖磁盘数据且不可恢复',
    suggestion: '确认目标设备是否正确，建议先备份'
  },
  {
    id: 'mkfs',
    pattern: /mkfs\..*/,
    level: 'CRITICAL',
    description: '格式化文件系统，会清除所有数据',
    suggestion: '确认目标分区无误，备份重要数据'
  },
  {
    id: 'iptables-flush',
    pattern: /iptables\s+(-F| -F| --flush)/,
    level: 'CRITICAL',
    description: '清空防火墙规则，可能导致网络中断或安全风险',
    suggestion: '先备份当前规则：iptables-save > /tmp/iptables.rules'
  },
  // HIGH: 危险但可恢复
  {
    id: 'chmod-777-root',
    pattern: /chmod\s+777\s+\//,
    level: 'HIGH',
    description: '将根目录权限设为777，导致安全风险',
    suggestion: '避免使用777，使用更细粒度的权限设置'
  },
  {
    id: 'kubectl-delete-all',
    pattern: /kubectl\s+delete\s+--all/,
    level: 'HIGH',
    description: '删除Kubernetes所有资源，可能造成服务中断',
    suggestion: '先使用 --dry-run 查看影响范围'
  },
  {
    id: 'drop-database',
    pattern: /DROP\s+DATABASE/i,
    level: 'HIGH',
    description: '删除数据库，数据将丢失',
    suggestion: '确认数据库名称，先备份'
  },
  // MEDIUM: 需要关注
  {
    id: 'rm-rf-var',
    pattern: /rm\s+(-rf| -rf| -r -f)\s+\/var/,
    level: 'MEDIUM',
    description: '删除 /var 目录可能影响应用数据',
    suggestion: '确认 /var 下是否有重要数据'
  },
  {
    id: 'kill-9',
    pattern: /kill\s+-9/,
    level: 'MEDIUM',
    description: '强制终止进程，可能导致数据丢失或服务异常',
    suggestion: '优先使用 kill -15 优雅终止'
  },
  // LOW: 建议谨慎
  {
    id: 'rm-rf-home',
    pattern: /rm\s+(-rf| -rf| -r -f)\s+~/,
    level: 'LOW',
    description: '删除用户主目录，可能丢失个人文件',
    suggestion: '检查是否误操作'
  }
];