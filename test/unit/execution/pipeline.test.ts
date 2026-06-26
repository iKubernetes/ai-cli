/**
 * 执行管道核心单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ExecutionBlockedError,
  ExecutionTimeoutError,
  HookFailureError,
} from '../../../src/execution/errors.js'

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

// Mock readline for ASK tests
import readline from 'readline'
vi.mock('readline', () => ({
  default: { createInterface: vi.fn() },
  createInterface: vi.fn(),
}))

import { spawn } from 'child_process'

const mockSpawn = vi.mocked(spawn)

/**
 * 创建模拟的 ChildProcess
 * 返回 any 类型以避免 mock 辅助方法的 TS 错误
 */
function createMockChildProcess(): any {
  const events: Record<string, Array<(...args: any[]) => void>> = {}
  const stdout = {
    on: vi.fn((event: string, handler: (data: Buffer) => void) => {
      if (!events[`stdout:${event}`]) events[`stdout:${event}`] = []
      events[`stdout:${event}`].push(handler)
      return stdout
    }),
    pipe: vi.fn(),
  }

  const stderr = {
    on: vi.fn((event: string, handler: (data: Buffer) => void) => {
      if (!events[`stderr:${event}`]) events[`stderr:${event}`] = []
      events[`stderr:${event}`].push(handler)
      return stderr
    }),
    pipe: vi.fn(),
  }

  const mock: any = {
    stdout,
    stderr,
    exitCode: null,
    killed: false,
    kill: vi.fn((signal?: string) => {
      mock.killed = true
      setTimeout(() => {
        mock.exitCode = signal === 'SIGKILL' ? 137 : 143
        const handlers = events['close'] || []
        handlers.forEach((h: any) => h(mock.exitCode))
      }, 0)
      return true
    }),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      if (!events[event]) events[event] = []
      events[event].push(handler)
      return mock
    }),
    _emitClose(exitCode: number) {
      mock.exitCode = exitCode
      const handlers = events['close'] || []
      handlers.forEach((h: any) => h(exitCode))
    },
    _emitStdout(data: string) {
      const handlers = events['stdout:data'] || []
      handlers.forEach((h: any) => h(Buffer.from(data)))
    },
    _emitStderr(data: string) {
      const handlers = events['stderr:data'] || []
      handlers.forEach((h: any) => h(Buffer.from(data)))
    },
    _emitError(err: Error) {
      const handlers = events['error'] || []
      handlers.forEach((h: any) => h(err))
    },
  }

  return mock
}

async function resetPipelineModule() {
  vi.resetModules()
  const mod = await import('../../../src/execution/pipeline.js')
  return mod
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DEBUG = 'false'
  // Mock readline.createInterface default (for ASK tests)
  const mockRl = {
    question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('y')),
    close: vi.fn(),
  }
  vi.mocked(readline.createInterface).mockReturnValue(mockRl as any)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * 辅助函数：创建快速成功的模拟命令
 */
function setupQuickSuccess(command: string, stdout = 'success\n', exitCode = 0) {
  const mockChild = createMockChildProcess()
  mockSpawn.mockReturnValue(mockChild)

  // 延迟一帧模拟完成
  setImmediate(() => {
    mockChild._emitStdout(stdout)
    mockChild._emitClose(exitCode)
  })

  return mockChild
}

// ==============================================================================
// 1. 无钩子执行
// ==============================================================================
describe('无钩子执行', () => {
  it('执行结果与直接 spawn 相同', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const mockChild = setupQuickSuccess('echo hello', 'hello\n', 0)

    const result = await pipeline.execute({
      command: 'echo hello',
      sessionId: 'test-session-1',
      isDryRun: false,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('hello\n')
    expect(result.command).toBe('echo hello')
    expect(result.duration).toBeGreaterThanOrEqual(0)
    expect(result.isDryRun).toBe(false)

    // 验证 spawn 被正确调用
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('失败命令返回非零退出码', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    setupQuickSuccess('false', '', 1)

    const result = await pipeline.execute({
      command: 'false',
      sessionId: 'test-session-2',
      isDryRun: false,
    })

    expect(result.exitCode).toBe(1)
    expect(result.isDryRun).toBe(false)
  })

  it('流式输出实时打印 stdout 和 stderr', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild)

    setImmediate(() => {
      mockChild._emitStdout('line1\n')
      mockChild._emitStderr('warning\n')
      mockChild._emitStdout('line2\n')
      mockChild._emitClose(0)
    })

    await pipeline.execute({
      command: 'echo hello',
      sessionId: 'test-session-3',
      isDryRun: false,
    })

    expect(stdoutWrite).toHaveBeenCalledWith(Buffer.from('line1\n'))
    expect(stdoutWrite).toHaveBeenCalledWith(Buffer.from('line2\n'))
    expect(stderrWrite).toHaveBeenCalledWith(Buffer.from('warning\n'))

    stdoutWrite.mockRestore()
    stderrWrite.mockRestore()
  })
})

// ==============================================================================
// 2. PreHook DENY
// ==============================================================================
describe('PreHook 返回 DENY', () => {
  it('抛出 ExecutionBlockedError，不执行命令', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => ({
      action: 'DENY' as const,
      reason: '禁止执行危险命令',
    }))

    let err: any
    try {
      await pipeline.execute({
        command: 'rm -rf /',
        sessionId: 'test-session-4',
        isDryRun: false,
      })
      expect.unreachable('应该抛出错误')
    } catch (e) {
      err = e
    }
    expect(err).toHaveProperty('name', 'ExecutionBlockedError')

    // 验证 spawn 没有被调用
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('DENY 错误包含正确的 reason', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => ({
      action: 'DENY' as const,
      reason: '该命令被安全策略禁止',
      metadata: { rule: 'no-rm-rf' },
    }))

    try {
      await pipeline.execute({
        command: 'rm -rf /',
        sessionId: 'test-session-5',
        isDryRun: false,
      })
      expect.unreachable('应该抛出错误')
    } catch (err: any) {
      expect(err).toHaveProperty('name', 'ExecutionBlockedError')
      expect(err.message).toContain('该命令被安全策略禁止')
      expect(err.command).toBe('rm -rf /')
      expect(err.metadata?.rule).toBe('no-rm-rf')
    }
  })
})

// ==============================================================================
// 3. PreHook MODIFY
// ==============================================================================
describe('PreHook 返回 MODIFY', () => {
  it('执行修改后的命令', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => ({
      action: 'MODIFY' as const,
      modifiedCommand: 'ls -la',
    }))

    setupQuickSuccess('ls -la', 'file1\nfile2\n', 0)

    const result = await pipeline.execute({
      command: 'ls',
      sessionId: 'test-session-6',
      isDryRun: false,
    })

    // 验证执行的是修改后的命令
    expect(result.command).toBe('ls -la')
    expect(result.stdout).toBe('file1\nfile2\n')
  })

  it('多个 PreHook 连续修改命令', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async (ctx) => ({
      action: 'MODIFY' as const,
      modifiedCommand: ctx.command + ' -l',
    }))

    pipeline.usePre(async (ctx) => ({
      action: 'MODIFY' as const,
      modifiedCommand: ctx.command + ' -a',
    }))

    setupQuickSuccess('ls -l -a', '. .. file1\n', 0)

    const result = await pipeline.execute({
      command: 'ls',
      sessionId: 'test-session-7',
      isDryRun: false,
    })

    // 第一个钩子: ls → ls -l, 第二个钩子: ls -l → ls -l -a
    expect(result.command).toBe('ls -l -a')
  })
})

// ==============================================================================
// 4. PreHook ASK
// ==============================================================================
describe('PreHook 返回 ASK', () => {
  it('用户确认后执行命令', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    // mock askUser 返回 true
    const mockRl = {
      question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('y')),
      close: vi.fn(),
    }
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any)

    pipeline.usePre(async () => ({
      action: 'ASK' as const,
      reason: '该操作需要确认',
    }))

    setupQuickSuccess('ls', 'ok\n', 0)

    const result = await pipeline.execute({
      command: 'ls',
      sessionId: 'test-session-8',
      isDryRun: false,
    })

    expect(result.exitCode).toBe(0)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })

  it('用户拒绝后抛出 ExecutionBlockedError', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const mockRl = {
      question: vi.fn((_prompt: string, cb: (answer: string) => void) => cb('n')),
      close: vi.fn(),
    }
    vi.mocked(readline.createInterface).mockReturnValue(mockRl as any)

    pipeline.usePre(async () => ({
      action: 'ASK' as const,
      reason: '该操作有风险',
    }))

    let err: any
    try {
      await pipeline.execute({
        command: 'rm -rf /',
        sessionId: 'test-session-9',
        isDryRun: false,
      })
      expect.unreachable('应该抛出错误')
    } catch (e) {
      err = e
    }
    expect(err).toHaveProperty('name', 'ExecutionBlockedError')

    // 用户拒绝后不应执行命令
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

// ==============================================================================
// 5. 多个 PreHook 顺序执行
// ==============================================================================
describe('多个 PreHook 顺序执行', () => {
  it('按添加顺序执行，任一 DENY 即终止', async () => {
    const executionOrder: number[] = []
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => {
      executionOrder.push(1)
      return { action: 'ALLOW' as const }
    })

    pipeline.usePre(async () => {
      executionOrder.push(2)
      return { action: 'DENY' as const, reason: '第二个钩子拒绝' }
    })

    pipeline.usePre(async () => {
      executionOrder.push(3) // 不应该被执行
      return { action: 'ALLOW' as const }
    })

    let err: any
    try {
      await pipeline.execute({
        command: 'test',
        sessionId: 'test-session-10',
        isDryRun: false,
      })
      expect.unreachable('应该抛出错误')
    } catch (e) {
      err = e
    }
    expect(err).toHaveProperty('name', 'ExecutionBlockedError')

    expect(executionOrder).toEqual([1, 2])
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('所有钩子 ALLOW 时正常执行', async () => {
    const executionOrder: number[] = []
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => {
      executionOrder.push(1)
      return { action: 'ALLOW' as const }
    })

    pipeline.usePre(async () => {
      executionOrder.push(2)
      return { action: 'ALLOW' as const }
    })

    setupQuickSuccess('test', 'ok\n', 0)

    await pipeline.execute({
      command: 'test',
      sessionId: 'test-session-11',
      isDryRun: false,
    })

    expect(executionOrder).toEqual([1, 2])
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})

// ==============================================================================
// 6. PostHook
// ==============================================================================
describe('PostHook 执行', () => {
  it('命令成功后执行 PostHook', async () => {
    const postHookCalled: Array<{ exitCode: number | null; command: string }> = []
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePost(async (_ctx, result) => {
      postHookCalled.push({ exitCode: result.exitCode, command: result.command })
      return {}
    })

    setupQuickSuccess('echo ok', 'ok\n', 0)

    await pipeline.execute({
      command: 'echo ok',
      sessionId: 'test-session-12',
      isDryRun: false,
    })

    expect(postHookCalled.length).toBe(1)
    expect(postHookCalled[0].exitCode).toBe(0)
    expect(postHookCalled[0].command).toBe('echo ok')
  })

  it('命令失败后仍然执行 PostHook', async () => {
    let postHookResult: any = null
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePost(async (_ctx, result) => {
      postHookResult = { ...result }
      return {}
    })

    setupQuickSuccess('false', '', 1)

    await pipeline.execute({
      command: 'false',
      sessionId: 'test-session-13',
      isDryRun: false,
    })

    expect(postHookResult).not.toBeNull()
    expect(postHookResult.exitCode).toBe(1)
  })

  it('多个 PostHook 按顺序执行', async () => {
    const order: number[] = []
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePost(async () => { order.push(1); return {} })
    pipeline.usePost(async () => { order.push(2); return {} })
    pipeline.usePost(async () => { order.push(3); return {} })

    setupQuickSuccess('true', '', 0)

    await pipeline.execute({
      command: 'true',
      sessionId: 'test-session-14',
      isDryRun: false,
    })

    expect(order).toEqual([1, 2, 3])
  })
})

// ==============================================================================
// 7. 超时机制
// ==============================================================================
describe('超时机制', () => {
  it('超时后进程被 kill，抛出 ExecutionTimeoutError', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild)

    // 不触发任何 close，模拟挂起进程
    // 设置极短超时
    const resultPromise = pipeline.execute({
      command: 'sleep 100',
      sessionId: 'test-session-15',
      isDryRun: false,
      timeout: 10, // 10ms 超时
    })

    // 等待超时
    let err: any
    try {
      await resultPromise
      expect.unreachable('应该抛出超时错误')
    } catch (e) {
      err = e
    }
    expect(err).toHaveProperty('name', 'ExecutionTimeoutError')

    // 验证 kill 被调用
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('正常完成不会触发超时', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const mockChild = createMockChildProcess()
    mockSpawn.mockReturnValue(mockChild)

    setImmediate(() => {
      mockChild._emitStdout('done\n')
      mockChild._emitClose(0)
    })

    const result = await pipeline.execute({
      command: 'quick-command',
      sessionId: 'test-session-16',
      isDryRun: false,
      timeout: 5000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('done\n')
  })
})

// ==============================================================================
// 8. DryRun 模式
// ==============================================================================
describe('DryRun 模式', () => {
  it('不执行任何命令，返回模拟结果', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const result = await pipeline.execute({
      command: 'rm -rf /',
      sessionId: 'test-session-17',
      isDryRun: true,
    })

    expect(result.isDryRun).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toContain('[模拟执行]')
    expect(mockSpawn).not.toHaveBeenCalled()

    stderrWrite.mockRestore()
  })

  it('DryRun 模式不执行任何钩子', async () => {
    let preHookCalled = false
    let postHookCalled = false
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => {
      preHookCalled = true
      return { action: 'DENY' as const, reason: '测试' }
    })
    pipeline.usePost(async () => {
      postHookCalled = true
      return {}
    })

    await pipeline.execute({
      command: 'test',
      sessionId: 'test-session-18',
      isDryRun: true,
    })

    // dry-run 模式下钩子应该被跳过
    expect(preHookCalled).toBe(false)
    expect(postHookCalled).toBe(false)
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

// ==============================================================================
// 9. 钩子超时
// ==============================================================================
describe('钩子超时', () => {
  it('PreHook 超过 5 秒抛出 HookFailureError', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    pipeline.usePre(async () => {
      await new Promise(resolve => setTimeout(resolve, 10000)) // 长时间挂起
      return { action: 'ALLOW' as const }
    })

    // 钩子超时默认 5 秒
    let err: any
    try {
      await pipeline.execute({
        command: 'test',
        sessionId: 'test-session-19',
        isDryRun: false,
      })
      expect.unreachable('应该抛出钩子失败错误')
    } catch (e) {
      err = e
    }
    expect(err).toHaveProperty('name', 'HookFailureError')
  }, 7000) // 测试本身超时 7 秒
})

// ==============================================================================
// 10. ExecutionPipeline 链式调用
// ==============================================================================
describe('Pipeline 链式调用', () => {
  it('usePre 和 usePost 链式调用', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const pipeline = new ExecutionPipeline()

    expect(pipeline.usePre(async () => ({ action: 'ALLOW' as const }))).toBe(pipeline)
    expect(pipeline.usePost(async () => ({}))).toBe(pipeline)
  })

  it('构造函数接受 Partial<PipelineConfig>', async () => {
    const { ExecutionPipeline } = await resetPipelineModule()
    const preHook = async () => ({ action: 'ALLOW' as const })
    const postHook = async () => ({})

    const pipeline = new ExecutionPipeline({
      preHooks: [preHook],
      postHooks: [postHook],
      enableDryRun: true,
    })
    expect(pipeline).toBeDefined()
  })
})

// ==============================================================================
// 11. 错误类验证
// ==============================================================================
describe('自定义错误类', () => {
  it('ExecutionBlockedError', () => {
    const err = new ExecutionBlockedError('rm -rf /', '禁止执行', { rule: 'no-rm' })
    expect(err.name).toBe('ExecutionBlockedError')
    expect(err.command).toBe('rm -rf /')
    expect(err.reason).toBe('禁止执行')
    expect(err.metadata?.rule).toBe('no-rm')
  })

  it('ExecutionTimeoutError', () => {
    const err = new ExecutionTimeoutError('sleep 100', 5000)
    expect(err.name).toBe('ExecutionTimeoutError')
    expect(err.command).toBe('sleep 100')
    expect(err.timeout).toBe(5000)
    expect(err.message).toContain('超时')
  })

  it('HookFailureError', () => {
    const inner = new Error('hook crashed')
    const err = new HookFailureError('myHook', 'pre', '执行失败', inner)
    expect(err.name).toBe('HookFailureError')
    expect(err.hookName).toBe('myHook')
    expect(err.phase).toBe('pre')
    expect(err.innerError).toBe(inner)
  })
})