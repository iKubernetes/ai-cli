import fs from 'fs'
import path from 'path'
import os from 'os'
import readline from 'readline'
import chalk from 'chalk'
import { getCurrentTheme, isValidTheme, getAllThemeMetadata, type ThemeName } from './ui/theme.js'

// 获取主题颜色
function getColors() {
  const theme = getCurrentTheme()
  return {
    primary: theme.primary,
    secondary: theme.secondary,
    success: theme.success,
    error: theme.error,
    warning: theme.warning,
  }
}

// 配置文件路径
export const CONFIG_DIR = path.join(os.homedir(), '.ai-cli')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// 支持的 Provider 列表
const VALID_PROVIDERS = [
  'openai',
  'anthropic',
  'deepseek',
  'google',
  'groq',
  'mistral',
  'cohere',
  'fireworks',
  'together',
] as const

type Provider = (typeof VALID_PROVIDERS)[number]

// 编辑模式
const VALID_EDIT_MODES = ['manual', 'auto'] as const
type EditMode = (typeof VALID_EDIT_MODES)[number]

/**
 * 别名配置接口
 */
export interface AliasConfig {
  prompt: string
  description?: string
}

/**
 * 远程服务器配置接口
 */
export interface RemoteConfig {
  host: string
  user: string
  port: number
  key?: string           // SSH 私钥路径
  password?: boolean     // 是否使用密码认证（密码不存储，每次交互输入）
  workDir?: string       // 默认工作目录
}

/**
 * 远程服务器系统信息缓存
 */
export interface RemoteSysInfo {
  os: string             // 操作系统 (linux, darwin, etc.)
  osVersion: string      // 系统版本
  shell: string          // 默认 shell (bash, zsh, etc.)
  hostname: string       // 主机名
  cachedAt: string       // 缓存时间
}

/**
 * 配置接口
 */
export interface Config {
  apiKey: string
  baseUrl: string
  model: string
  provider: Provider
  shellHook: boolean
  chatHistoryLimit: number
  commandHistoryLimit: number
  shellHistoryLimit: number
  userPreferencesTopK: number          // 用户偏好显示的命令数量（默认 20）
  editMode: EditMode
  theme: ThemeName
  aliases: Record<string, AliasConfig>
  remotes: Record<string, RemoteConfig>  // 远程服务器配置
  defaultRemote?: string                  // 默认远程服务器名称
  systemCacheExpireDays?: number          // 系统信息缓存过期天数（默认 7 天）
  experimental?: Record<string, boolean>  // Feature Flag 配置
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo',
  provider: 'openai',
  shellHook: false,
  chatHistoryLimit: 5,
  commandHistoryLimit: 5,
  shellHistoryLimit: 10,
  userPreferencesTopK: 20,  // 默认显示 Top 20
  editMode: 'manual',
  theme: 'dark',
  aliases: {},
  remotes: {},
  defaultRemote: '',
  systemCacheExpireDays: 7,
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

/**
 * 读取配置
 * 优化：添加缓存，避免重复读取文件
 */
let cachedConfig: Config | null = null

export function getConfig(): Config {
  // 如果已有缓存，直接返回
  if (cachedConfig !== null) {
    return cachedConfig
  }

  ensureConfigDir()

  let config: Config

  if (!fs.existsSync(CONFIG_FILE)) {
    config = { ...DEFAULT_CONFIG }
  } else {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
      config = { ...DEFAULT_CONFIG, ...JSON.parse(content) }
    } catch {
      // 配置文件损坏时，重置为默认配置并警告用户
      console.warn(chalk.hex(getColors().warning)('⚠️  配置文件损坏，已重置为默认配置'))
      config = { ...DEFAULT_CONFIG }
    }
  }

  // 确保 experimental 字段存在
  if (!config.experimental) {
    config.experimental = {}
  }

  cachedConfig = config
  return config
}

/**
 * 保存配置（使用原子写入：先写临时文件再 rename）
 */
export function saveConfig(config: Config): void {
  ensureConfigDir()
  const content = JSON.stringify(config, null, 2)
  const tmpFile = CONFIG_FILE + '.tmp.' + process.pid
  fs.writeFileSync(tmpFile, content, 'utf-8')
  fs.renameSync(tmpFile, CONFIG_FILE)
}

/**
 * 解析点号分隔的嵌套键，从对象中取值
 */
function getNestedValue(obj: Record<string, any>, key: string): any {
  return key.split('.').reduce((current, k) => {
    if (current === null || current === undefined) return undefined
    return current[k]
  }, obj)
}

/**
 * 通过点号分隔的嵌套键设置对象中的值
 */
function setNestedValue(obj: Record<string, any>, key: string, value: any): void {
  const parts = key.split('.')
  let current = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part]
  }
  current[parts[parts.length - 1]] = value
}

/**
 * 检查键是否为嵌套键（包含点号）
 */
function isNestedKey(key: string): boolean {
  return key.includes('.')
}

/**
 * 设置单个配置项（支持点号分隔的嵌套键）
 */
export function setConfigValue(key: string, value: string | boolean | number): Config {
  const config = getConfig()

  // 处理嵌套键（如 experimental.guardrails）
  if (isNestedKey(key)) {
    setNestedValue(config, key, value)
    saveConfig(config)
    cachedConfig = null
    return config
  }

  if (!(key in DEFAULT_CONFIG)) {
    throw new Error(`未知的配置项: ${key}`)
  }

  // 处理特殊类型
  if (key === 'shellHook') {
    config.shellHook = value === 'true' || value === true
  } else if (key === 'chatHistoryLimit' || key === 'commandHistoryLimit' || key === 'shellHistoryLimit' || key === 'userPreferencesTopK' || key === 'systemCacheExpireDays') {
    const num = typeof value === 'number' ? value : parseInt(String(value), 10)
    if (isNaN(num) || num < 1) {
      throw new Error(`${key} 必须是大于 0 的整数`)
    }
    config[key] = num
  } else if (key === 'provider') {
    const strValue = String(value)
    if (!VALID_PROVIDERS.includes(strValue as Provider)) {
      throw new Error(`provider 必须是以下之一: ${VALID_PROVIDERS.join(', ')}`)
    }
    config.provider = strValue as Provider
  } else if (key === 'editMode') {
    const strValue = String(value)
    if (!VALID_EDIT_MODES.includes(strValue as EditMode)) {
      throw new Error(`editMode 必须是以下之一: ${VALID_EDIT_MODES.join(', ')}`)
    }
    config.editMode = strValue as EditMode
  } else if (key === 'theme') {
    const strValue = String(value)
    if (!isValidTheme(strValue)) {
      const allThemes = getAllThemeMetadata()
      const themeNames = allThemes.map((m) => m.name).join(', ')
      throw new Error(`theme 必须是以下之一: ${themeNames}`)
    }
    config.theme = strValue as ThemeName
  } else if (key === 'apiKey' || key === 'baseUrl' || key === 'model' || key === 'defaultRemote') {
    config[key] = String(value)
  }

  saveConfig(config)

  // 清除缓存，下次读取时会重新加载
  cachedConfig = null

  return config
}

/**
 * 获取单个配置项（支持点号分隔的嵌套键）
 * 若键不存在返回 undefined
 */
export function getConfigValue(key: string): any {
  const config = getConfig()
  if (isNestedKey(key)) {
    return getNestedValue(config, key)
  }
  if (key in config) {
    return (config as any)[key]
  }
  return undefined
}

/**
 * 检查配置是否有效
 */
export function isConfigValid(): boolean {
  const config = getConfig()
  return config.apiKey.length > 0
}

/**
 * 隐藏 API Key 中间部分
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 10) return apiKey || '(未设置)'
  return apiKey.slice(0, 6) + '****' + apiKey.slice(-4)
}

/**
 * 显示当前配置
 */
export function displayConfig(): void {
  const config = getConfig()
  const colors = getColors()
  console.log(chalk.bold('\n当前配置:'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log(`  ${chalk.hex(colors.primary)('apiKey')}:              ${maskApiKey(config.apiKey)}`)
  console.log(`  ${chalk.hex(colors.primary)('baseUrl')}:             ${config.baseUrl}`)
  console.log(`  ${chalk.hex(colors.primary)('provider')}:            ${config.provider}`)
  console.log(`  ${chalk.hex(colors.primary)('model')}:               ${config.model}`)
  console.log(
    `  ${chalk.hex(colors.primary)('shellHook')}:           ${config.shellHook ? chalk.hex(colors.success)('已启用') : chalk.gray('未启用')}`
  )
  console.log(
    `  ${chalk.hex(colors.primary)('editMode')}:            ${
      config.editMode === 'auto' ? chalk.hex(colors.primary)('auto (自动编辑)') : chalk.gray('manual (按E编辑)')
    }`
  )
  console.log(`  ${chalk.hex(colors.primary)('chatHistoryLimit')}:    ${config.chatHistoryLimit} 轮`)
  console.log(`  ${chalk.hex(colors.primary)('commandHistoryLimit')}: ${config.commandHistoryLimit} 条`)
  console.log(`  ${chalk.hex(colors.primary)('shellHistoryLimit')}:   ${config.shellHistoryLimit} 条`)
  console.log(`  ${chalk.hex(colors.primary)('userPreferencesTopK')}: ${config.userPreferencesTopK} 个`)
  if (config.systemCacheExpireDays !== undefined) {
    console.log(`  ${chalk.hex(colors.primary)('systemCacheExpireDays')}: ${config.systemCacheExpireDays} 天`)
  }

  // 动态显示主题信息
  const themeMetadata = getAllThemeMetadata().find((m) => m.name === config.theme)
  const themeLabel = themeMetadata ? `${themeMetadata.name} (${themeMetadata.displayName})` : config.theme
  console.log(`  ${chalk.hex(colors.primary)('theme')}:               ${chalk.hex(colors.primary)(themeLabel)}`)

  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray(`配置文件: ${CONFIG_FILE}\n`))
}

/**
 * 创建 readline 接口
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * 异步提问
 */
function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer)
    })
  })
}

/**
 * 交互式配置向导
 */
export async function runConfigWizard(): Promise<void> {
  const rl = createReadlineInterface()
  const config = getConfig()
  const colors = getColors()

  console.log(chalk.bold.hex(colors.primary)('\n🔧 AI-CLI 配置向导'))
  console.log(chalk.gray('━'.repeat(50)))
  console.log(chalk.gray('直接回车使用默认值，输入值后回车确认\n'))

  try {
    // 1. Provider
    const providerHint = chalk.gray(`(可选: ${VALID_PROVIDERS.join(', ')})`)
    const providerPrompt = `${chalk.hex(colors.primary)('Provider')} ${providerHint}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.provider)} ${chalk.gray('→')} `
    const provider = await question(rl, providerPrompt)
    if (provider.trim()) {
      if (!VALID_PROVIDERS.includes(provider.trim() as Provider)) {
        console.log(chalk.hex(colors.error)(`\n✗ 无效的 provider，必须是以下之一: ${VALID_PROVIDERS.join(', ')}`))
        console.log()
        rl.close()
        return
      }
      config.provider = provider.trim() as Provider
    }

    // 2. Base URL
    const baseUrlPrompt = `${chalk.hex(colors.primary)('API Base URL')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.baseUrl)} ${chalk.gray('→')} `
    const baseUrl = await question(rl, baseUrlPrompt)
    if (baseUrl.trim()) {
      config.baseUrl = baseUrl.trim()
    }

    // 3. API Key
    const currentKeyDisplay = config.apiKey ? maskApiKey(config.apiKey) : '(未设置)'
    const apiKeyPrompt = `${chalk.hex(colors.primary)('API Key')} ${chalk.gray(`(当前: ${currentKeyDisplay})`)}\n${chalk.gray('→')} `
    const apiKey = await question(rl, apiKeyPrompt)
    if (apiKey.trim()) {
      config.apiKey = apiKey.trim()
    }

    // 4. Model
    const modelPrompt = `${chalk.hex(colors.primary)('Model')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.model)} ${chalk.gray('→')} `
    const model = await question(rl, modelPrompt)
    if (model.trim()) {
      config.model = model.trim()
    }

    // 5. Shell Hook
    const shellHookPrompt = `${chalk.hex(colors.primary)('启用 Shell Hook')} ${chalk.gray('(记录终端命令历史)')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.shellHook ? 'true' : 'false')} ${chalk.gray('→')} `
    const shellHook = await question(rl, shellHookPrompt)
    if (shellHook.trim()) {
      config.shellHook = shellHook.trim() === 'true'
    }

    // 6. Edit Mode
    const editModeHint = chalk.gray('(manual=按E编辑, auto=自动编辑)')
    const editModePrompt = `${chalk.hex(colors.primary)('编辑模式')} ${editModeHint}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.editMode)} ${chalk.gray('→')} `
    const editMode = await question(rl, editModePrompt)
    if (editMode.trim()) {
      if (!VALID_EDIT_MODES.includes(editMode.trim() as EditMode)) {
        console.log(chalk.hex(colors.error)(`\n✗ 无效的 editMode，必须是: manual 或 auto`))
        console.log()
        rl.close()
        return
      }
      config.editMode = editMode.trim() as EditMode
    }

    // 7. Chat History Limit
    const chatHistoryPrompt = `${chalk.hex(colors.primary)('Chat 历史保留轮数')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.chatHistoryLimit)} ${chalk.gray('→')} `
    const chatHistoryLimit = await question(rl, chatHistoryPrompt)
    if (chatHistoryLimit.trim()) {
      const num = parseInt(chatHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.chatHistoryLimit = num
      } else {
        console.log(chalk.hex(colors.warning)('  ⚠️  输入无效，保持原值'))
      }
    }

    // 8. Command History Limit
    const commandHistoryPrompt = `${chalk.hex(colors.primary)('命令历史保留条数')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.commandHistoryLimit)} ${chalk.gray('→')} `
    const commandHistoryLimit = await question(rl, commandHistoryPrompt)
    if (commandHistoryLimit.trim()) {
      const num = parseInt(commandHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.commandHistoryLimit = num
      } else {
        console.log(chalk.hex(colors.warning)('  ⚠️  输入无效，保持原值'))
      }
    }

    // 9. Shell History Limit
    const oldShellHistoryLimit = config.shellHistoryLimit  // 保存旧值
    const shellHistoryPrompt = `${chalk.hex(colors.primary)('Shell 历史保留条数')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.shellHistoryLimit)} ${chalk.gray('→')} `
    const shellHistoryLimit = await question(rl, shellHistoryPrompt)
    if (shellHistoryLimit.trim()) {
      const num = parseInt(shellHistoryLimit.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.shellHistoryLimit = num
      } else {
        console.log(chalk.hex(colors.warning)('  ⚠️  输入无效，保持原值'))
      }
    }

    // 10. User Preferences Top K
    const userPrefsPrompt = `${chalk.hex(colors.primary)('用户偏好显示命令数')}\n${chalk.gray('默认:')} ${chalk.hex(colors.secondary)(config.userPreferencesTopK)} ${chalk.gray('→')} `
    const userPrefsTopK = await question(rl, userPrefsPrompt)
    if (userPrefsTopK.trim()) {
      const num = parseInt(userPrefsTopK.trim(), 10)
      if (!isNaN(num) && num > 0) {
        config.userPreferencesTopK = num
      } else {
        console.log(chalk.hex(colors.warning)('  ⚠️  输入无效，保持原值'))
      }
    }

    saveConfig(config)

    console.log('\n' + chalk.gray('━'.repeat(50)))
    console.log(chalk.hex(getColors().success)('✅ 配置已保存'))
    console.log(chalk.gray(`   ${CONFIG_FILE}`))
    console.log()

    // 如果修改了 shellHistoryLimit，自动重装 hook
    if (oldShellHistoryLimit !== config.shellHistoryLimit) {
      const { reinstallHookForLimitChange } = await import('./shell-hook.js')
      await reinstallHookForLimitChange(oldShellHistoryLimit, config.shellHistoryLimit)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(chalk.hex(getColors().error)(`\n✗ 配置失败: ${message}`))
    console.log()
  } finally {
    rl.close()
  }
}

/**
 * 检查 experimental feature flag 是否启用
 * 若 key 不存在或为 false 返回 false；若 key 存在且为 true 返回 true
 */
export function isExperimentalEnabled(key: string): boolean {
  const config = getConfig()
  return config.experimental?.[key] === true
}

/**
 * 更新配置文件中的 experimental field
 * 使用原子写入（先写临时文件再 rename）确保写入安全
 */
export async function setExperimental(key: string, value: boolean): Promise<void> {
  const config = getConfig()
  if (!config.experimental) {
    config.experimental = {}
  }
  config.experimental[key] = value
  saveConfig(config)
  // 清除缓存，下次读取时会重新加载
  cachedConfig = null
}
