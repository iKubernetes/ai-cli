import { RiskPattern, RiskLevel, RISK_PATTERNS } from './risk-patterns.js';

export interface RiskDetectionResult {
  level: RiskLevel;
  matchedPatterns: RiskPattern[];
  description: string;      // 拼接所有匹配规则描述
  suggestion?: string;      // 最高优先级规则的建议
}

export function detectRisk(command: string): RiskDetectionResult {
  const matched: RiskPattern[] = [];
  for (const pattern of RISK_PATTERNS) {
    if (pattern.pattern.test(command)) {
      matched.push(pattern);
    }
  }
  if (matched.length === 0) {
    return {
      level: 'NONE',
      matchedPatterns: [],
      description: '未检测到高风险命令'
    };
  }
  // 按风险等级降序排列，取最高等级
  const sorted = [...matched].sort((a, b) => {
    const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    return (order[b.level] || 0) - (order[a.level] || 0);
  });
  const highest = sorted[0];
  const description = matched.map(p => p.description).join('; ');
  return {
    level: highest.level,
    matchedPatterns: matched,
    description,
    suggestion: highest.suggestion
  };
}