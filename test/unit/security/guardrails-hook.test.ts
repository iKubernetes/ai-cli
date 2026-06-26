/**
 * Guardrails PreHook 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock readline/promises BEFORE importing the module under test
vi.mock('readline/promises', () => ({
  createInterface: vi.fn(),
}))

import { createInterface } from 'readline/promises'

describe('guardrailsPreHook', () => {
  let mockRl: { question: any; close: any }

  beforeEach(() => {
    // 默认 mock readline 接口
    mockRl = {
      question: vi.fn(),
      close: vi.fn(),
    }
    vi.mocked(createInterface).mockReturnValue(mockRl as any)

    // Mock stdin.isTTY to simulate interactive terminal
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 测试 NONE 情况直接 ALLOW
  describe('无风险命令', () => {
    it('NONE 风险返回 ALLOW', async () => {
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'ls -la',
        sessionId: 'test-1',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
    })

    it('非交互式环境返回 ALLOW', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /',
        sessionId: 'test-2',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
    })

    it('dry-run 模式返回 ALLOW', async () => {
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /',
        sessionId: 'test-3',
        isDryRun: true,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
    })
  })

  // CRITICAL 风险
  describe('CRITICAL 风险', () => {
    it('用户输入 "yes" 返回 ALLOW', async () => {
      mockRl.question.mockResolvedValue('yes')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /',
        sessionId: 'test-4',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
      expect(result.metadata?.confirmed).toBe(true)
      expect(mockRl.close).toHaveBeenCalled()
    })

    it('用户输入其他内容返回 DENY', async () => {
      mockRl.question.mockResolvedValue('no')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /',
        sessionId: 'test-5',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'DENY')
      expect(result.reason).toContain('用户取消执行')
    })

    it('用户直接回车返回 DENY', async () => {
      mockRl.question.mockResolvedValue('')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /etc',
        sessionId: 'test-6',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'DENY')
    })
  })

  // HIGH 风险
  describe('HIGH 风险', () => {
    it('用户输入 "y" 返回 ALLOW', async () => {
      mockRl.question.mockResolvedValue('y')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'chmod 777 /',
        sessionId: 'test-7',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
      expect(result.metadata?.confirmed).toBe(true)
    })

    it('用户输入 "n" 返回 DENY', async () => {
      mockRl.question.mockResolvedValue('n')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'chmod 777 /',
        sessionId: 'test-8',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'DENY')
      expect(result.reason).toContain('用户拒绝执行')
    })

    it('用户直接回车返回 DENY（默认拒绝）', async () => {
      mockRl.question.mockResolvedValue('')
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'kubectl delete --all',
        sessionId: 'test-9',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'DENY')
    })
  })

  // MEDIUM 风险
  describe('MEDIUM 风险', () => {
    it('自动返回 ALLOW 并携带 warned 标记', async () => {
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf /var/log',
        sessionId: 'test-10',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
      expect(result.metadata?.warned).toBe(true)
    })
  })

  // LOW 风险
  describe('LOW 风险', () => {
    it('自动返回 ALLOW', async () => {
      const { guardrailsPreHook } = await import('../../../src/security/guardrails-hook.js')

      const result = await guardrailsPreHook({
        command: 'rm -rf ~/test',
        sessionId: 'test-11',
        isDryRun: false,
      })

      expect(result).toHaveProperty('action', 'ALLOW')
    })
  })
})