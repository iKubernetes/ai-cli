// 执行上下文
export interface ExecutionContext {
  command: string                    // 原始命令字符串
  cwd?: string                       // 工作目录
  env?: NodeJS.ProcessEnv            // 环境变量
  shell?: string | boolean           // shell 类型
  timeout?: number                   // 超时毫秒
  sessionId: string                  // 会话ID（用于审计关联）
  isDryRun: boolean                  // 是否模拟执行
}

// 执行结果
export interface ExecutionResult {
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  duration: number                   // 执行耗时 ms
  isDryRun: boolean
  riskLevel?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
}

// 钩子返回值
export interface PreHookResult {
  action: 'ALLOW' | 'DENY' | 'MODIFY' | 'ASK'
  modifiedCommand?: string           // 如果 action 为 MODIFY，提供修改后的命令
  reason?: string                    // DENY 时的拒绝原因
  metadata?: Record<string, any>     // 供后续钩子使用的元数据
}

export interface PostHookResult {
  shouldRetry?: boolean
  retryCommand?: string
  feedback?: Record<string, any>
}

// 钩子函数类型
export type PreHook = (ctx: ExecutionContext) => Promise<PreHookResult>
export type PostHook = (ctx: ExecutionContext, result: ExecutionResult) => Promise<PostHookResult>

// 管道配置
export interface PipelineConfig {
  preHooks: PreHook[]
  postHooks: PostHook[]
  enableDryRun: boolean
}