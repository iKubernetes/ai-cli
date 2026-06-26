/**
 * Feature Flag 单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'

// Mock fs 模块
vi.mock('fs', () => {
  const mockFn = () => vi.fn()
  return {
    default: {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      renameSync: vi.fn(),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
  }
})

// Mock os 模块
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/home/testuser'),
  },
}))

// Mock theme 模块
vi.mock('../../src/ui/theme.js', () => ({
  getCurrentTheme: vi.fn(() => ({
    primary: '#007acc',
    secondary: '#6c757d',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
  })),
  isValidTheme: vi.fn(() => true),
  getAllThemeMetadata: vi.fn(() => [
    { name: 'dark', displayName: 'Dark' },
    { name: 'light', displayName: 'Light' },
  ]),
}))

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    bold: Object.assign(vi.fn((s: string) => s), { hex: vi.fn(() => (s: string) => s) }),
    gray: vi.fn((s: string) => s),
    hex: vi.fn(() => (s: string) => s),
    warn: vi.fn((s: string) => s),
  },
}))

// Mock readline
vi.mock('readline', () => ({
  default: { createInterface: vi.fn() },
  createInterface: vi.fn(),
}))

import fs from 'fs'
import os from 'os'

const mockFs = vi.mocked(fs)
const mockOs = vi.mocked(os)

async function resetConfigModule() {
  vi.resetModules()
  const mod = await import('../../src/config.js')
  return mod
}

beforeEach(() => {
  vi.clearAllMocks()
  mockOs.homedir.mockReturnValue('/home/testuser')
  mockFs.existsSync.mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isExperimentalEnabled', () => {
  it('enabled key 返回 true', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: { featureX: true },
    }))

    const { isExperimentalEnabled } = await resetConfigModule()
    expect(isExperimentalEnabled('featureX')).toBe(true)
  })

  it('disabled key (value=false) 返回 false', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: { featureX: false },
    }))

    const { isExperimentalEnabled } = await resetConfigModule()
    expect(isExperimentalEnabled('featureX')).toBe(false)
  })

  it('不存在的 key 返回 false', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: { featureX: true },
    }))

    const { isExperimentalEnabled } = await resetConfigModule()
    expect(isExperimentalEnabled('nonexistent')).toBe(false)
  })

  it('experimental 字段不存在时返回 false', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'sk-test' }))

    const { isExperimentalEnabled } = await resetConfigModule()
    expect(isExperimentalEnabled('featureX')).toBe(false)
  })

  it('空 experimental 对象返回 false', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: {},
    }))

    const { isExperimentalEnabled } = await resetConfigModule()
    expect(isExperimentalEnabled('anyKey')).toBe(false)
  })
})

describe('setExperimental', () => {
  it('设置 key=true 后持久化到配置文件', async () => {
    let writtenContent = ''
    mockFs.writeFileSync.mockImplementation((_path: any, data: any) => {
      writtenContent = String(data)
    })
    mockFs.renameSync.mockImplementation((_tmp: any, _final: any) => {})

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: {},
    }))

    const { setExperimental } = await resetConfigModule()
    await setExperimental('featureY', true)

    const parsed = JSON.parse(writtenContent)
    expect(parsed.experimental.featureY).toBe(true)
  })

  it('设置 key=false 后持久化到配置文件', async () => {
    let writtenContent = ''
    mockFs.writeFileSync.mockImplementation((_path: any, data: any) => {
      writtenContent = String(data)
    })
    mockFs.renameSync.mockImplementation((_tmp: any, _final: any) => {})

    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: { featureY: true },
    }))

    const { setExperimental } = await resetConfigModule()
    await setExperimental('featureY', false)

    const parsed = JSON.parse(writtenContent)
    expect(parsed.experimental.featureY).toBe(false)
  })

  it('experimental 不存在时自动初始化空对象', async () => {
    let writtenContent = ''
    mockFs.writeFileSync.mockImplementation((_path: any, data: any) => {
      writtenContent = String(data)
    })
    mockFs.renameSync.mockImplementation((_tmp: any, _final: any) => {})

    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'sk-test' }))

    const { setExperimental } = await resetConfigModule()
    await setExperimental('featureZ', true)

    const parsed = JSON.parse(writtenContent)
    expect(parsed.experimental).toEqual({ featureZ: true })
  })

  it('使用原子写入（先写临时文件再 rename）', async () => {
    const writeCalls: Array<{ path: string; data: string }> = []
    const renameCalls: Array<{ tmp: string; final: string }> = []
    mockFs.writeFileSync.mockImplementation((p: any, d: any) => {
      writeCalls.push({ path: String(p), data: String(d) })
    })
    mockFs.renameSync.mockImplementation((t: any, f: any) => {
      renameCalls.push({ tmp: String(t), final: String(f) })
    })

    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'sk-test', experimental: {} }))

    const { setExperimental } = await resetConfigModule()
    await setExperimental('featureA', true)

    expect(writeCalls.length).toBeGreaterThanOrEqual(1)
    expect(renameCalls.length).toBeGreaterThanOrEqual(1)

    const tmpFile = writeCalls[0].path
    const finalFile = renameCalls[0].final
    expect(tmpFile).toContain('.tmp.')
    expect(tmpFile).toContain(String(process.pid))
    expect(finalFile).toContain('config.json')
  })

  it('并发写入不损坏文件（原子性验证）', async () => {
    let renameCount = 0
    mockFs.writeFileSync.mockImplementation((_p: any, _d: any) => {})
    mockFs.renameSync.mockImplementation((_t: any, _f: any) => { renameCount++ })

    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'sk-test', experimental: {} }))

    const { setExperimental } = await resetConfigModule()

    await Promise.all([
      setExperimental('flagA', true),
      setExperimental('flagB', true),
    ])

    expect(renameCount).toBe(2)
  })
})

describe('配置文件损坏恢复', () => {
  it('JSON 损坏时返回默认配置', async () => {
    mockFs.existsSync.mockReturnValue(true)
    mockFs.readFileSync.mockReturnValue('{invalid json')

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.provider).toBe('openai')
    expect(config.model).toBe('gpt-4-turbo')
    expect(config.experimental).toEqual({})
  })

  it('JSON 损坏时用默认配置覆盖保存', async () => {
    let savedContent = ''
    mockFs.writeFileSync.mockImplementation((_p: any, data: any) => {
      savedContent = String(data)
    })
    mockFs.renameSync.mockImplementation((_t: any, _f: any) => {})
    mockFs.readFileSync.mockImplementation(() => {
      throw new SyntaxError('Unexpected token')
    })

    const { saveConfig, getConfig } = await resetConfigModule()
    const config = getConfig()
    saveConfig(config)

    const parsed = JSON.parse(savedContent)
    expect(parsed.provider).toBe('openai')
    expect(parsed.experimental).toEqual({})
  })

  it('配置文件不存在时返回默认配置且 experimental 为空对象', async () => {
    mockFs.existsSync.mockReturnValue(false)

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.experimental).toEqual({})
  })
})

describe('向后兼容', () => {
  it('旧配置文件（无 experimental）读取后自动初始化', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'sk-old' }))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.apiKey).toBe('sk-old')
    expect(config.experimental).toEqual({})
  })

  it('已有 experimental 字段不会被覆盖', async () => {
    mockFs.readFileSync.mockReturnValue(JSON.stringify({
      apiKey: 'sk-test',
      experimental: { existingFlag: true },
    }))

    const { getConfig } = await resetConfigModule()
    const config = getConfig()

    expect(config.experimental!.existingFlag).toBe(true)
  })
})