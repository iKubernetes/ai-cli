/**
 * 执行管道自定义错误类
 */

/**
 * 前置钩子拒绝执行时抛出
 */
export class ExecutionBlockedError extends Error {
  public readonly reason: string
  public readonly command: string
  public readonly metadata?: Record<string, any>

  constructor(command: string, reason: string, metadata?: Record<string, any>) {
    super(`执行被阻止: ${reason}`)
    this.name = 'ExecutionBlockedError'
    this.command = command
    this.reason = reason
    this.metadata = metadata
  }
}

/**
 * 命令执行超时时抛出
 */
export class ExecutionTimeoutError extends Error {
  public readonly command: string
  public readonly timeout: number

  constructor(command: string, timeout: number) {
    super(`命令执行超时 (${timeout}ms): ${command.substring(0, 100)}`)
    this.name = 'ExecutionTimeoutError'
    this.command = command
    this.timeout = timeout
  }
}

/**
 * 钩子函数执行失败时抛出（钩子自身抛异常或超时）
 */
export class HookFailureError extends Error {
  public readonly hookName: string
  public readonly phase: 'pre' | 'post'
  public readonly innerError?: Error

  constructor(hookName: string, phase: 'pre' | 'post', message: string, innerError?: Error) {
    super(`${phase} 钩子 "${hookName}" 失败: ${message}`)
    this.name = 'HookFailureError'
    this.hookName = hookName
    this.phase = phase
    this.innerError = innerError
  }
}

/**
 * 模拟执行失败时抛出
 */
export class SimulationError extends Error {
  constructor(message: string) {
    super(`模拟执行失败: ${message}`)
    this.name = 'SimulationError'
  }
}