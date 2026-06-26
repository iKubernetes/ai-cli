# 马哥教育AI学习助手 (ai)

<p align="center">
  <strong>"马哥教育AI学习助手" — 专为马哥教育学员打造的 AI 命令行学习工具</strong>
</p>

> `ai 查看当前目录` — 让 AI 帮你干活，专注学习 Linux 和编程

## 这是啥？

忘了 Shell 命令怎么写？没关系，用人话告诉 `ai` 你想干嘛就行。

我们的命令就叫 `ai`，每次执行都像是在呼唤 AI 助手：

```bash
ai 帮我压缩这个文件夹
ai 找出占用 8080 端口的进程
ai 在服务器上重启 nginx
```

AI 生成命令 → 你确认 → 执行 → 搞定。

## ✨ 命令打错了？直接 `ai` 就行

像 [thefuck](https://github.com/nvbn/thefuck) 一样，命令执行失败后，直接输入 `ai` 让 AI 自动修复：

```bash
❯ python --version
zsh: command not found: python

❯ ai  # ← 就这么简单！
✓ 生成命令: python3 --version
Python 3.9.6
```

```bash
❯ git pus origin main
git: 'pus' is not a git command. See 'git --help'.

❯ ai
✓ 生成命令: git push origin main
Enumerating objects: 5, done.
...
```

不用说"修复上一条命令"，不用重新输入，**直接 `ai`，AI 自动检测失败的命令并生成正确版本**。

## 为什么用这个？

- **命令打错了？** 直接 `ai` 自动修复，像 thefuck 一样方便，但更智能
- 记不住 `tar` 的一堆参数
- 想批量处理文件但懒得写脚本
- 想问问某个命令怎么用

## 能干啥？

**核心特性：**
- **自动修复错误** - 命令失败后直接 `ai`，AI 自动检测并生成正确命令（像 thefuck，但更智能）
- **自然语言转命令** - 生成前让你确认或编辑
- **智能多步任务** - 复杂任务自动拆分，每步基于上一步的结果
- **错误恢复重试** - 命令失败了 AI 会分析原因并调整策略

**高级功能：**
- **学习你的习惯** - 开启 Shell Hook 后，AI 会记住你常用的命令，下次优先用你习惯的工具
- **远程执行** - 通过 SSH 在服务器上跑命令，支持批量（`-r server1,server2,server3`）
- **对话模式** - `ai chat grep 怎么用`，随时问问题
- **命令别名** - 把常用操作存成快捷方式
- **主题系统** - 7 个内置主题 + 自定义主题
- **自动升级** - `ai upgrade` 一键更新

## 安装

注意：目前 ai-cli 在 windows 端可能会有不兼容导致的 bug，如果遇到可以发 issue 反馈，谢谢

**安装方式：一键脚本（无需 Node.js，但是是 bun 打包的，体积比较大）**

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/ikubernetes/ai-cli/main/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/ikubernetes/ai-cli/main/install.ps1 | iex
```

支持平台：Linux (x64/arm64) / macOS (Intel/Apple Silicon) / Windows (x64)

## 快速开始

**第一步：配置 API**

```bash
ai config
```

按提示输入你的 AI API 信息（支持 OpenAI、DeepSeek、Claude 等）

**第二步：开始用**

```bash
ai 查看当前目录
ai 找出大于100MB的文件
ai chat grep 怎么用
```

## 使用示例

### 基础用法

最简单的方式，直接说你想干啥：

```bash
ai 查看当前目录
ai 安装 git
ai 找出占用 8080 端口的进程
ai 删除所有 .DS_Store 文件
```

AI 生成命令，你确认后执行。

### 多步骤任务

复杂的任务 AI 会自动拆分，每步基于上一步的结果：

```bash
ai 找出大于100MB的日志文件并压缩
```

**执行流程：**
1. 步骤 1：`find . -name '*.log' -size +100M` 找到了 `app.log` 和 `system.log`
2. 步骤 2：根据上一步的结果，生成 `tar -czf logs.tar.gz app.log system.log`
3. 完成！

### 引用历史

AI 记得你之前干了啥：

```bash
ai 创建一个 test.txt
ai 删除刚才的文件  # AI 知道你说的是 test.txt

# 或者
mkdir my-project
cd my-project
ai 在这个目录初始化 git 仓库  # AI 知道当前上下文
```

### 错误恢复

命令失败了 AI 会分析并重试：

```bash
ai 把 test.zip 移动到 a、b、c 三个文件夹
```

**执行过程：**
1. `mv test.zip a/` ✓ 成功
2. `mv test.zip b/` ✗ 失败（文件已被移走）
3. AI 分析错误，改用复制：`cp a/test.zip b/ && cp a/test.zip c/` ✓ 成功

### 编辑命令

生成的命令不满意？按 `E` 编辑：

```
┌─ 生成命令 ───────┐
│ ls -la           │
└──────────────────┘

执行？ [回车执行 / E 编辑 / Esc 取消]

# 按 E 后进入编辑
> ls -l█  ← 可以修改

[回车执行 / Esc 返回]
```

或者用 `auto` 模式，自动进入编辑：

```bash
ai config set editMode auto
```

### 对话模式

想问问命令怎么用：

```bash
ai chat tar 命令怎么用
ai chat grep 和 awk 有什么区别
ai chat 刚才那个命令是干嘛的？  # 会解释你最近执行的命令
```

### 远程执行

在服务器上跑命令：

```bash
# 添加服务器
ai remote add myserver root@192.168.1.100

# 远程执行
ai -r myserver 查看磁盘使用情况
ai -r myserver 重启 nginx

# 批量执行（在多台服务器上同时跑）
ai -r web1,web2,web3 查看 nginx 状态
```

### 命令别名

把常用操作存成快捷方式：

```bash
# 添加别名
ai alias add disk "查看磁盘使用情况，按使用率排序"

# 使用
ai disk

# 带参数的别名
ai alias add taillog "查看 {{file}} 的最后 {{lines:20}} 行"
ai taillog --file=/var/log/system.log --lines=50
```

## 更多功能

### 历史记录

```bash
ai history              # 命令历史
ai history chat         # 对话历史
ai history shell        # Shell 历史（需要启用 Shell Hook）

ai history clear        # 清空命令历史
ai history chat clear   # 清空对话历史
```

### Shell Hook

记录你在终端执行的所有命令，让 AI 更了解上下文：

```bash
ai hook install    # 安装 hook
ai hook status     # 查看状态
ai hook uninstall  # 卸载 hook
```

支持 zsh / bash / PowerShell。

**开了 Hook 后，ai 会学习你的命令习惯。** 比如你平时用 `eza` 而不是 `ls`，用 `bat` 而不是 `cat`，AI 生成命令时会优先用你习惯的工具。用得越多，AI 越懂你。

```bash
ai prefs           # 看看 AI 学到了什么
ai prefs clear     # 清空偏好统计
```

### 系统信息

查看当前系统信息（AI 生成命令时会参考这些）：

```bash
ai sysinfo         # 查看系统信息
ai sysinfo refresh # 刷新缓存
```

### 主题

7 个内置主题 + 自定义主题：

```bash
ai theme              # 查看当前主题
ai theme list         # 查看所有主题
ai theme nord         # 切换主题
```

**内置主题：** dark、light、nord、dracula、retro、contrast、monokai

**自定义主题：**

```bash
ai theme create my-theme --display-name "我的主题"
vim ~/.ai/themes/my-theme.json  # 编辑主题配置
ai theme validate ~/.ai/themes/my-theme.json  # 验证
ai theme my-theme  # 应用
```

### 远程执行详细说明

**添加服务器：**

```bash
ai remote add myserver root@192.168.1.100
ai remote add myserver root@192.168.1.100 --key ~/.ssh/my_key
ai remote add myserver root@192.168.1.100 --password  # 密码认证
```

**管理服务器：**

```bash
ai remote                    # 查看所有服务器
ai remote test myserver      # 测试连接
ai remote remove myserver    # 删除
ai remote default myserver   # 设置默认服务器
ai remote workdir myserver /var/www  # 设置工作目录
```

**远程执行：**

```bash
ai -r myserver 查看磁盘使用情况
ai -r 查看当前目录  # 使用默认服务器

# 批量执行
ai -r web1,web2,web3 重启 nginx
```

批量执行会为每个服务器生成适配其环境的命令，并发执行。

**远程历史：**

```bash
ai remote history show myserver        # 查看
ai remote history clear myserver       # 清空
ai remote hook install myserver        # 安装远程 Hook
```

### 配置

查看和修改配置：

```bash
ai config           # 交互式配置
ai config list      # 查看配置
ai config set <key> <value>  # 修改单项
```

主要配置项：
- `apiKey` / `baseUrl` / `provider` / `model` - AI API 配置
- `editMode` - 命令编辑模式（manual / auto）
- `theme` - 界面主题
- `shellHook` - 是否启用 Shell Hook
- `chatHistoryLimit` / `commandHistoryLimit` - 历史条数限制

支持的 Provider：openai、deepseek、anthropic、google、groq、mistral、cohere、fireworks、together

### 升级

```bash
ai upgrade  # 升级到最新版本
```

程序每 24 小时自动检查更新，发现新版本会提示。

## 命令速查

```bash
# 基础
ai <需求>                  # 生成并执行命令
ai -d <需求>               # Debug 模式
ai -v                      # 查看版本

# 配置
ai config                  # 交互式配置
ai config list             # 查看配置
ai config set <key> <val>  # 修改配置

# 历史
ai history                 # 命令历史
ai history chat            # 对话历史
ai history shell           # Shell 历史
ai history clear           # 清空历史

# 对话
ai chat <问题>             # 问问题
ai history chat clear      # 清空对话

# Hook
ai hook install            # 安装
ai hook status             # 状态
ai hook uninstall          # 卸载

# 偏好 & 系统
ai prefs                   # 查看命令偏好
ai sysinfo                 # 查看系统信息

# 主题
ai theme                   # 当前主题
ai theme list              # 所有主题
ai theme <name>            # 切换

# 别名
ai alias                   # 查看
ai alias add <name> "<prompt>"  # 添加
ai alias remove <name>     # 删除

# 远程
ai remote add <name> <user@host>  # 添加服务器
ai remote list             # 查看
ai -r <name> <需求>        # 远程执行
ai -r <n1,n2,n3> <需求>    # 批量执行

# 升级
ai upgrade                 # 升级到最新版本
```

## 技术栈

- **React + Ink** - 终端 UI 组件化
- **Mastra** - AI Agent 框架
- **TypeScript** - 100% 类型安全
- **Commander** - CLI 参数解析

## 开发

```bash
git clone https://github.com/ikubernetes/ai-cli.git
cd ai-cli
pnpm install
pnpm build
pnpm link --global
```

开发模式（热重载）：

```bash
pnpm add -g tsx
pnpm link:dev
ai-dev <命令>  # 代码修改立即生效
```

## 常见问题

**为什么 Chat 会清空终端历史？**

这是 Ink 的设计局限。命令执行使用原生输出保留历史，只有 Chat 模式会清空。

**支持哪些 AI？**

支持 OpenAI、DeepSeek、Claude、Gemini、Groq、Mistral、Cohere 等，只要兼容 OpenAI API 格式就行。

## 许可证

MIT

## 致谢

- [thefuck](https://github.com/nvbn/thefuck) - 启发了自动修复功能，一个超火的命令纠错工具
- [fuckit.sh](https://github.com/faithleysath/fuckit.sh) - 提供了灵感，一个优雅的 AI 命令行工具
- [Ink](https://github.com/vadimdemedes/ink) - 终端 React 渲染器
- [Mastra](https://mastra.ai) - AI Agent 框架

---

**Made with ❤️ and AI**
