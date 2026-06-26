import { spawn, ChildProcess } from 'child_process'
import readline from 'readline'
import {
  ExecutionContext,
  ExecutionResult,
  PreHook,
  PostHook,
  PipelineConfig,
  PreHookResult,
} from './types.js'
import {
  ExecutionBlockedError,
  ExecutionTimeoutError,
  HookFailureError,
} from './errors.js'

const HOOK_TIMEOUT = 5000 // 每个钩子执行超时 5 秒
const DEFAULT_TIMEOUT = 300_000 // 默认命令超时 5 分钟

/**
 * 是否启用调试日志
 */
function isDebugEnabled(): boolean {
  return process.argv.includes('--debug') || process.env.DEBUG === 'true'
}

function debugLog(...args: any[]): void {
  if (isDebugEnabled()) {
    console.debug('[pipeline]', ...args)
  }
}

/**
 * 带超时的 Promise 包装
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms)
    ),
  ])
}

export class ExecutionPipeline {
  private config: PipelineConfig

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = {
      preHooks: config.preHooks || [],
      postHooks: config.postHooks || [],
      enableDryRun: config.enableDryRun || false,
    }
  }

  /**
   * 添加前置钩子
   */
  usePre(hook: PreHook): this {
    this.config.preHooks.push(hook)
    return this
  }

  /**
   * 添加后置钩子
   */
  usePost(hook: PostHook): this {
    this.config.postHooks.push(hook)
    return this
  }

  /**
   * 核心执行方法
   */
  async execute(ctx: ExecutionContext): Promise<ExecutionResult> {
    // 1. 模拟执行
    if (ctx.isDryRun) {
      debugLog('dry-run 模式，跳过实际执行')
      return this.simulate(ctx)
    }

    // 2. 执行前置钩子
    let command = ctx.command
    for (const hook of this.config.preHooks) {
      const result = await this.runPreHook(hook, { ...ctx, command })
      if (result.action === 'DENY') {
        throw new ExecutionBlockedError(command, result.reason || '前置钩子拒绝执行', result.metadata)
      }
      if (result.action === 'MODIFY' && result.modifiedCommand !== undefined) {
        debugLog(`命令被修改: "${command}" → "${result.modifiedCommand}"`)
        command = result.modifiedCommand
      }
      if (result.action === 'ASK') {
        const allowed = await this.askUser(command, result)
        if (!allowed) {
          throw new ExecutionBlockedError(command, '用户取消执行')
        }
      }
    }

    // 3. 执行命令
    const execResult = await this.runCommand({ ...ctx, command })

    // 4. 执行后置钩子
    for (const hook of this.config.postHooks) {
      await this.runPostHook(hook, { ...ctx, command }, execResult)
    }

    return execResult
  }

  /**
   * 执行单个前置钩子（带超时控制）
   */
  private async runPreHook(hook: PreHook, ctx: ExecutionContext): Promise<PreHookResult> {
    const hookName = hook.name || 'anonymous'
    debugLog(`执行前置钩子: ${hookName}`)

    try {
      const result = await withTimeout(
        hook(ctx),
        HOOK_TIMEOUT,
        `前置钩子 "${hookName}"`
      )
      debugLog(`前置钩子 ${hookName} 结果:`, result.action)
      return result
    } catch (err: any) {
      throw new HookFailureError(hookName, 'pre', err.message, err)
    }
  }

  /**
   * 执行单个后置钩子（带超时控制）
   */
  private async runPostHook(
    hook: PostHook,
    ctx: ExecutionContext,
    result: ExecutionResult
  ): Promise<void> {
    const hookName = hook.name || 'anonymous'
    debugLog(`执行后置钩子: ${hookName}`)

    try {
      const postResult = await withTimeout(
        hook(ctx, result),
        HOOK_TIMEOUT,
        `后置钩子 "${hookName}"`
      )
      debugLog(`后置钩子 ${hookName} 结果:`, postResult)
      // 后置钩子暂不处理重试逻辑，仅记录
    } catch (err: any) {
      throw new HookFailureError(hookName, 'post', err.message, err)
    }
  }

  /**
   * 通过 spawn 执行命令（流式输出）
   */
  private runCommand(ctx: ExecutionContext): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now()
      const command = ctx.command
      const timeout = ctx.timeout || DEFAULT_TIMEOUT

      debugLog(`执行命令: ${command.substring(0, 200)}`)

      // 解析 shell 和参数
      const shell = typeof ctx.shell === 'string' ? ctx.shell : process.env.SHELL || '/bin/sh'
      const shellFlag = ctx.shell === false ? false : '-c'

      let child: ChildProcess

      if (shellFlag === false) {
        // 直接执行，不通过 shell
        const [cmd, ...args] = command.split(/\s+/)
        child = spawn(cmd, args, {
          cwd: ctx.cwd,
          env: ctx.env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      } else {
        // 通过 shell 执行
        child = spawn(shell, [shellFlag, command], {
          cwd: ctx.cwd,
          env: ctx.env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      }

      let stdout = ''
      let stderr = ''

      // 流式输出 stdout
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const text = data.toString()
          stdout += text
          process.stdout.write(data)
        })
      }

      // 流式输出 stderr
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          process.stderr.write(data)
        })
      }

      // 超时控制
      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        // 给进程 3 秒优雅退出，否则强杀
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill('SIGKILL')
          }
        }, 3000)
        reject(new ExecutionTimeoutError(command, timeout))
      }, timeout)

      child.on('close', (exitCode) => {
        clearTimeout(timer)
        const duration = Date.now() - startTime
        debugLog(`命令完成，退出码: ${exitCode}, 耗时: ${duration}ms`)
        resolve({
          command,
          exitCode: exitCode ?? null,
          stdout,
          stderr,
          duration,
          isDryRun: ctx.isDryRun,
        })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  /**
   * 模拟执行（dry-run）
   */
  private async simulate(ctx: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now()
    debugLog(`模拟执行: ${ctx.command.substring(0, 200)}`)

    // 输出模拟信息到 stderr
    const msg = `[模拟执行] ${ctx.command}\n`
    process.stderr.write(msg)

    return {
      command: ctx.command,
      exitCode: 0,
      stdout: '',
      stderr: msg,
      duration: Date.now() - startTime,
      isDryRun: true,
      riskLevel: 'NONE',
    }
  }

  /**
   * 交互式询问用户确认（ASK action）
   */
  private askUser(command: string, result: PreHookResult): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      console.log('')
      if (result.reason) {
        console.log(`⚠️  ${result.reason}`)
      }
      console.log(`  命令: ${command}`)
      rl.question('执行？ [y/N] ', (answer) => {
        rl.close()
        const trimmed = answer.trim().toLowerCase()
        resolve(trimmed === 'y' || trimmed === 'yes')
      })
    })
  }
}