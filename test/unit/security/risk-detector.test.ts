/**
 * 风险检测器单元测试
 * 使用 describe.each 提高代码复用性
 */
import { describe, it, expect } from 'vitest'
import { detectRisk } from '../../../src/security/risk-detector.js'

describe('detectRisk', () => {
  // ========== CRITICAL 等级 ==========
  describe.each([
    ['rm -rf /',                   'CRITICAL', '递归强制删除根目录'],
    ['dd if=/dev/zero of=/dev/sda','CRITICAL', '直接写入块设备'],
    ['mkfs.ext4 /dev/sdb1',        'CRITICAL', '格式化文件系统'],
    ['iptables -F',                'CRITICAL', '清空防火墙规则'],
  ])('CRITICAL 风险: 命令 %s', (command, expectedLevel, expectedDesc) => {
    it(`应返回等级 ${expectedLevel}`, () => {
      const result = detectRisk(command)
      expect(result.level).toBe(expectedLevel)
      expect(result.description).toContain(expectedDesc)
    })
  })

  // ========== HIGH 等级 ==========
  describe.each([
    ['chmod 777 /',                'HIGH', '将根目录权限设为777'],
    ['kubectl delete --all',       'HIGH', '删除Kubernetes所有资源'],
    ['DROP DATABASE testdb',       'HIGH', '删除数据库，数据将丢失'],
  ])('HIGH 风险: 命令 %s', (command, expectedLevel, expectedDesc) => {
    it(`应返回等级 ${expectedLevel}`, () => {
      const result = detectRisk(command)
      expect(result.level).toBe(expectedLevel)
      expect(result.description).toContain(expectedDesc)
    })
  })

  // ========== MEDIUM 等级 ==========
  describe.each([
    ['rm -rf /var/log',            'MEDIUM', '删除 /var 目录'],
    ['kill -9 1234',               'MEDIUM', '强制终止进程'],
  ])('MEDIUM 风险: 命令 %s', (command, expectedLevel, expectedDesc) => {
    it(`应返回等级 ${expectedLevel}`, () => {
      const result = detectRisk(command)
      expect(result.level).toBe(expectedLevel)
      expect(result.description).toContain(expectedDesc)
    })
  })

  // ========== LOW 等级 ==========
  describe.each([
    ['rm -rf ~/test',              'LOW', '删除用户主目录'],
  ])('LOW 风险: 命令 %s', (command, expectedLevel, expectedDesc) => {
    it(`应返回等级 ${expectedLevel}`, () => {
      const result = detectRisk(command)
      expect(result.level).toBe(expectedLevel)
      expect(result.description).toContain(expectedDesc)
    })
  })

  // ========== 多重规则匹配 ==========
  describe('多个规则同时匹配', () => {
    it('同时匹配多个 CRITICAL 规则时返回 CRITICAL', () => {
      const result = detectRisk('rm -rf /etc && mkfs.ext4 /dev/sda1')
      expect(result.level).toBe('CRITICAL')
      expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2)
    })

    it('匹配不同等级规则时返回最高等级（HIGH > MEDIUM）', () => {
      const result = detectRisk('chmod 777 / && kill -9 1234')
      expect(result.level).toBe('HIGH')
      expect(result.matchedPatterns.length).toBeGreaterThanOrEqual(2)
    })

    it('description 包含所有匹配规则的描述', () => {
      const result = detectRisk('rm -rf /var/log && kill -9 1234')
      expect(result.description).toContain('删除 /var 目录')
      expect(result.description).toContain('强制终止进程')
    })

    it('suggestion 取最高优先级规则的建议', () => {
      const result = detectRisk('rm -rf /etc && mkfs.ext4 /dev/sda1')
      expect(result.suggestion).toBeDefined()
    })
  })

  // ========== 无匹配 ==========
  describe('无匹配命令', () => {
    it('安全命令 ls -la 返回 NONE', () => {
      const result = detectRisk('ls -la')
      expect(result.level).toBe('NONE')
      expect(result.description).toBe('未检测到高风险命令')
      expect(result.matchedPatterns).toHaveLength(0)
    })
  })
})