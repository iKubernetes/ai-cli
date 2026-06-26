/**
 * 用户命令偏好统计模块
 *
 * 功能：
 * - 读取和分析 ~/.ai-cli/command_stats.txt
 * - 获取用户最常用的命令
 * - 格式化为 AI 可理解的字符串
 * - 智能过滤非偏好命令（Shell 内置、系统通用命令等）
 */

import fs from 'fs'
import path from 'path'
import { CONFIG_DIR, getConfig } from './config.js'

const STATS_FILE = path.join(CONFIG_DIR, 'command_stats.txt')

/**
 * 命令黑名单：这些命令不算"用户偏好"
 * - Shell 内置命令：cd、export、source 等（必须用的，不是偏好）
 * - 系统基础命令：ls、cat、grep 等（太基础，不反映偏好）
 * - 系统通用命令：clear、exit、history 等（通用命令，不是偏好）
 * - 查询命令：man、which、type 等（查询用途，不是偏好）
 * - 权限命令：sudo、doas 等（权限提升，不是偏好）
 * - pls 自身：pls-dev、pls、please（自引用）
 */
const COMMAND_BLACKLIST = new Set([
  // Shell 内置命令
  'cd', 'pushd', 'popd', 'dirs',
  'export', 'set', 'unset', 'declare', 'local', 'readonly',
  'alias', 'unalias',
  'source', '.',
  'history', 'fc',
  'jobs', 'fg', 'bg', 'disown',
  'eval', 'exec', 'builtin', 'command',
  'true', 'false', ':', 'test', '[',

  // 系统基础命令（太基础，不反映偏好）
  'ls', 'cat', 'grep', 'find', 'head', 'tail',
  'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'touch',
  'chmod', 'chown', 'ln',
  'wc', 'sort', 'uniq', 'cut', 'tr', 'sed', 'awk',

  // 系统通用命令（不算偏好）
  'clear', 'reset',
  'exit', 'logout',
  'pwd',
  'echo', 'printf',
  'sleep', 'wait',
  'kill', 'killall', 'pkill',

  // 查询命令
  'man', 'which', 'type', 'whereis', 'whatis', 'apropos',
  'help', 'info',

  // 权限命令
  'sudo', 'doas', 'su',

  // ai/pls 自身
  'pls', 'pls-dev', 'please', 'ai',
])

/**
 * 命令统计接口
 */
export interface CommandStat {
  command: string
  count: number
}

/**
 * 确保统计文件存在
 */
function ensureStatsFile(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, '', 'utf-8')
  }
}

/**
 * 获取所有命令统计数据
 */
export function getCommandStats(): Record<string, number> {
  ensureStatsFile()

  const content = fs.readFileSync(STATS_FILE, 'utf-8')
  const stats: Record<string, number> = {}

  for (const line of content.split('\n')) {
    if (!line.trim()) continue
    const [cmd, count] = line.split('=')
    if (cmd && count) {
      stats[cmd] = parseInt(count, 10)
    }
  }

  return stats
}

/**
 * 获取使用频率最高的命令（智能过滤版）
 * @param limit 可选的数量限制，不传则使用配置中的 userPreferencesTopK
 */
export function getTopCommands(limit?: number): CommandStat[] {
  const config = getConfig()
  const topK = limit !== undefined ? limit : config.userPreferencesTopK

  const stats = getCommandStats()
  return Object.entries(stats)
    .filter(([command]) => !COMMAND_BLACKLIST.has(command))  // 过滤黑名单
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topK)
}

/**
 * 格式化用户偏好为 AI 可理解的字符串
 *
 * 示例输出：
 * "用户偏好: git(234), eza(156), vim(89), docker(67), pnpm(45)"
 */
export function formatUserPreferences(): string {
  const top = getTopCommands()  // 使用配置中的 topK
  if (top.length === 0) return ''

  const lines = top.map(({ command, count }) => `${command}(${count})`)
  return `用户偏好: ${lines.join(', ')}`
}

/**
 * 清空统计数据
 */
export function clearCommandStats(): void {
  ensureStatsFile()
  fs.writeFileSync(STATS_FILE, '', 'utf-8')
}

/**
 * 获取统计文件路径（用于 CLI 展示）
 */
export function getStatsFilePath(): string {
  return STATS_FILE
}

/**
 * 显示统计信息（用于 CLI）
 */
export function displayCommandStats(): void {
  const config = getConfig()
  const stats = getCommandStats()
  const totalCommands = Object.keys(stats).length
  const totalExecutions = Object.values(stats).reduce((sum, count) => sum + count, 0)

  if (totalCommands === 0) {
    console.log('\n暂无命令统计数据')
    console.log('提示: 安装并启用 Shell Hook 后会自动开始统计\n')
    return
  }

  const displayLimit = config.userPreferencesTopK  // 使用配置项
  const top = getTopCommands(displayLimit)

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊 命令使用统计`)
  console.log(`总命令数: ${totalCommands}, 总执行次数: ${totalExecutions}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`\nTop ${displayLimit} 常用命令（已过滤非偏好命令）:\n`)

  top.forEach(({ command, count }, index) => {
    const percentage = ((count / totalExecutions) * 100).toFixed(1)
    const bar = '█'.repeat(Math.floor(count / top[0].count * 20))
    console.log(`${String(index + 1).padStart(2)}. ${command.padEnd(15)} ${bar} ${count} (${percentage}%)`)
  })

  console.log(`\n统计文件: ${STATS_FILE}\n`)
}
