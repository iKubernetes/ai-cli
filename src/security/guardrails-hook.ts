import { PreHook, PreHookResult, ExecutionContext } from '../execution/types.js';
import { detectRisk } from './risk-detector.js';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';

export const guardrailsPreHook: PreHook = async (ctx: ExecutionContext): Promise<PreHookResult> => {
  const { command, isDryRun } = ctx;

  // 如果是 dry-run 模式，跳过交互并直接允许
  if (isDryRun) {
    return { action: 'ALLOW' };
  }

  // 非交互式环境（如 CI），直接允许
  if (!process.stdin.isTTY) {
    return { action: 'ALLOW' };
  }

  const result = detectRisk(command);

  if (result.level === 'NONE') {
    return { action: 'ALLOW' };
  }

  // 构建警告信息
  const levelColor = {
    CRITICAL: chalk.red.bold,
    HIGH: chalk.yellow.bold,
    MEDIUM: chalk.cyan,
    LOW: chalk.gray
  };
  const color = levelColor[result.level] || chalk.white;
  const header = `${chalk.bgRed.white('⚠️  SECURITY ALERT')} ${color(`[${result.level}]`)}`;
  console.log(`\n${header}`);
  console.log(`命令: ${chalk.cyan(command)}`);
  console.log(`风险描述: ${result.description}`);
  if (result.suggestion) {
    console.log(`建议: ${chalk.green(result.suggestion)}`);
  }

  // 根据等级决定行为
  if (result.level === 'CRITICAL') {
    // 强制确认，必须输入 yes
    const rl = createInterface({ input, output });
    const answer = await rl.question(chalk.red('输入 "yes" 确认执行此命令: '));
    rl.close();
    if (answer.trim().toLowerCase() === 'yes') {
      return { action: 'ALLOW', metadata: { confirmed: true } };
    } else {
      return {
        action: 'DENY',
        reason: '用户取消执行高危命令',
        metadata: { riskLevel: result.level }
      };
    }
  } else if (result.level === 'HIGH') {
    const rl = createInterface({ input, output });
    const answer = await rl.question(chalk.yellow('是否继续执行？(y/N): '));
    rl.close();
    if (answer.trim().toLowerCase() === 'y') {
      return { action: 'ALLOW', metadata: { confirmed: true } };
    } else {
      return {
        action: 'DENY',
        reason: '用户拒绝执行高危命令',
        metadata: { riskLevel: result.level }
      };
    }
  } else if (result.level === 'MEDIUM') {
    // 自动允许，但打印提示
    console.log(chalk.yellow('⚠️  中等风险命令，已自动放行，请确认操作意图。'));
    return { action: 'ALLOW', metadata: { warned: true } };
  } else {
    // LOW 直接允许
    return { action: 'ALLOW' };
  }
};