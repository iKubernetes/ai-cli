import { Command } from 'commander'
import { getConfig, setConfigValue, getConfigValue, displayConfig, runConfigWizard } from '../config.js'
import * as console2 from '../utils/console.js'

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('管理配置')

  // list/show 子命令
  cmd
    .command('list')
    .alias('show')
    .description('查看当前配置')
    .action(() => {
      displayConfig()
    })

  // get 子命令
  cmd
    .command('get <key>')
    .description('获取配置项（支持点号分隔的嵌套键，如 experimental.guardrails）')
    .action((key: string) => {
      const value = getConfigValue(key)
      if (value === undefined) {
        console.log('')
        console2.error(`配置项 "${key}" 未设置`)
        console.log('')
        process.exit(1)
      } else {
        console.log('')
        console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
        console.log('')
      }
    })

  // set 子命令
  cmd
    .command('set <key> <value>')
    .description('设置配置项（支持点号分隔的嵌套键，如 experimental.guardrails。value 将自动解析为 JSON/布尔/数字）')
    .action(async (key: string, value: string) => {
      try {
        // 尝试解析值：true/false -> boolean, 数字 -> number, JSON -> object, 否则保持字符串
        let parsedValue: any
        if (value === 'true') {
          parsedValue = true
        } else if (value === 'false') {
          parsedValue = false
        } else if (/^-?\d+(\.\d+)?$/.test(value)) {
          parsedValue = Number(value)
        } else {
          try {
            parsedValue = JSON.parse(value)
          } catch {
            parsedValue = value
          }
        }

        setConfigValue(key, parsedValue)
        console.log('')
        console2.success(`✅ 配置项 "${key}" 已设置为 ${JSON.stringify(parsedValue)}`)
        console.log('')
      } catch (error: any) {
        console.log('')
        console2.error(error.message)
        console.log('')
        process.exit(1)
      }
    })

  // 默认 config 命令（交互式配置向导）
  cmd.action(async () => {
    await runConfigWizard()
  })

  return cmd
}