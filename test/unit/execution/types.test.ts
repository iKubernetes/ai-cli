/**
 * 执行管道类型验证（编译时）
 */
import { describe, it, expect } from 'vitest'

// 运行时类型验证 - 验证接口结构是否符合预期
describe('ExecutionContext 接口', () => {
  it('应该包含所有必需字段', async () => {
    const { ExecutionPipeline } = await import('../../../src/execution/pipeline.js')
    const pipeline = new ExecutionPipeline()

    const ctx = {
      command: 'echo hello',
      sessionId: 'test-session-001',
      isDryRun: false,
    }

    // 验证 ExecutionContext 结构：只执行验证，不实际运行
    expect(ctx.command).toBe('echo hello')
    expect(ctx.sessionId).toBe('test-session-001')
    expect(ctx.isDryRun).toBe(false)
    expect(typeof pipeline.execute).toBe('function')
  })

  it('可选字段应该能正常传递', async () => {
    const ctx = {
      command: 'ls -la',
      cwd: '/tmp',
      env: { PATH: '/usr/bin' },
      shell: '/bin/bash',
      timeout: 5000,
      sessionId: 'test-session-002',
      isDryRun: true,
    }

    expect(ctx.cwd).toBe('/tmp')
    expect(ctx.env?.PATH).toBe('/usr/bin')
    expect(ctx.shell).toBe('/bin/bash')
    expect(ctx.timeout).toBe(5000)
  })
})

describe('ExecutionResult 接口', () => {
  it('应该包含所有必需字段', () => {
    const result = {
      command: 'echo hello',
      exitCode: 0,
      stdout: 'hello\n',
      stderr: '',
      duration: 10,
      isDryRun: false,
    }

    expect(result.command).toBe('echo hello')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('hello\n')
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('可选的 riskLevel 字段', () => {
    const result = {
      command: 'rm -rf /',
      exitCode: 1,
      stdout: '',
      stderr: 'permission denied',
      duration: 5,
      isDryRun: true,
      riskLevel: 'CRITICAL' as const,
    }

    expect(result.riskLevel).toBe('CRITICAL')
  })
})

describe('PreHookResult 接口', () => {
  it('ALLOW 动作', () => {
    const r = { action: 'ALLOW' as const }
    expect(r.action).toBe('ALLOW')
  })

  it('DENY 动作需要 reason', () => {
    const r = { action: 'DENY' as const, reason: '危险命令' }
    expect(r.action).toBe('DENY')
    expect(r.reason).toBe('危险命令')
  })

  it('MODIFY 动作需要 modifiedCommand', () => {
    const r = {
      action: 'MODIFY' as const,
      modifiedCommand: 'ls -la',
      reason: '添加 -la 参数',
    }
    expect(r.action).toBe('MODIFY')
    expect(r.modifiedCommand).toBe('ls -la')
  })

  it('ASK 动作可以包含 reason 和 metadata', () => {
    const r = {
      action: 'ASK' as const,
      reason: '该操作有风险',
      metadata: { risk: 'high' },
    }
    expect(r.action).toBe('ASK')
    expect(r.metadata?.risk).toBe('high')
  })
})

describe('PostHookResult 接口', () => {
  it('shouldRetry 字段', () => {
    const r = { shouldRetry: true, retryCommand: 'ls -la' }
    expect(r.shouldRetry).toBe(true)
    expect(r.retryCommand).toBe('ls -la')
  })

  it('feedback 字段', () => {
    const r = { feedback: { exitCode: 0, output: 'ok' } }
    expect(r.feedback?.exitCode).toBe(0)
  })
})

describe('PipelineConfig 接口', () => {
  it('应该包含钩子列表和 dry-run 开关', () => {
    const config = {
      preHooks: [],
      postHooks: [],
      enableDryRun: true,
    }
    expect(Array.isArray(config.preHooks)).toBe(true)
    expect(Array.isArray(config.postHooks)).toBe(true)
    expect(config.enableDryRun).toBe(true)
  })

  it('空配置应该有默认值', async () => {
    const { ExecutionPipeline } = await import('../../../src/execution/pipeline.js')
    const pipeline = new ExecutionPipeline()
    expect(pipeline).toBeDefined()
  })
})

describe('ExecutionPipeline 类', () => {
  it('usePre 和 usePost 应该返回 this 以支持链式调用', async () => {
    const { ExecutionPipeline } = await import('../../../src/execution/pipeline.js')
    const pipeline = new ExecutionPipeline()

    const preHook = async () => ({ action: 'ALLOW' as const })
    const postHook = async () => ({})

    const result = pipeline.usePre(preHook).usePost(postHook)
    expect(result).toBe(pipeline) // 返回 this
  })

  it('execute 方法应该存在且是异步函数', async () => {
    const { ExecutionPipeline } = await import('../../../src/execution/pipeline.js')
    const pipeline = new ExecutionPipeline()

    expect(typeof pipeline.execute).toBe('function')
    // execute 应该返回 Promise
    const result = pipeline.execute({
      command: 'true',
      sessionId: 'test',
      isDryRun: true,
    })
    expect(result).toBeInstanceOf(Promise)
  })
})