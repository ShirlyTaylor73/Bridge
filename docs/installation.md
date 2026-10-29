# 安装与使用 Bridge

Bridge 0.1.0 将同一份 `skills/bridge/` 交付给多个客户端。无需 npm install、构建、MCP 服务或后台进程；分析脚本和兼容安装器使用 Node.js 22+。先在客户端可执行命令的环境中准备 Node.js。

本地安装建议使用干净 checkout，客户端可能复制整个来源目录，不应把评测产物放入安装来源。以下命令均在克隆/下载后的 **Bridge 仓库根目录**执行；安装完成后，在**要分析的仓库**启动新会话并调用 Bridge。插件名和 Skill 名均为 `bridge`。不要将插件安装缓存目录当作分析目标。

## 原生插件安装

使用支持相应插件机制的客户端版本。旧版没有命令时先升级，不使用兼容脚本静默替代。客户端自身负责更新、禁用和卸载。

| 客户端 | 本地安装 | 调用 |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add .`，再 `claude plugin install bridge@bridge-marketplace` | `/bridge:bridge` 或自然语言 |
| Codex CLI | `codex plugin marketplace add .`，再 `codex plugin add bridge@bridge-marketplace`；也可在 `/plugins` 中安装 | 选择 bridge 插件 Skill，或要求“使用 Bridge 插件分析当前仓库” |
| Cursor | Customize → Plugins 中使用支持 Agent Plugins 的安装入口，选择仓库来源 | 选择 Bridge Skill 或自然语言 |
| Copilot CLI | `copilot plugin marketplace add .`，再 `copilot plugin install bridge@bridge-marketplace` | 选择 Bridge Skill 或自然语言 |
| VS Code Copilot | 命令面板执行 `Chat: Install Plugin from Source`，输入本仓库绝对路径 | 在已启用的插件 Skill 中选择 Bridge |
| Gemini CLI | `gemini extensions install .` | 选择 Bridge Skill 或自然语言 |
| Pi Agent | `pi install .` | `/skill:bridge` 或自然语言 |
| OpenClaw | `openclaw plugins install .` | 选择 Bridge Skill 或自然语言 |
| Kimi Code | TUI 中执行 `/plugins install <本仓库绝对路径>`，之后 `/reload` | `/skill:bridge:bridge` |

Codex 支持界面以官方文档为准，不能将 CLI/桌面插件能力等同于 IDE 扩展能力。Kimi 从本地安装后使用托管副本，修改源目录不会自动更新，需重新安装。其他客户端同样按自身更新规则处理缓存。

远程发布后，将本地来源替换为真实 Git URL 或相应客户端支持的 `owner/repo`。本仓库当前没有 remote；文档中的 `<Git URL>` 是占位符，不是现成下载地址。只提供仓库分发，不代表已上架任何官方目录。部分 Cursor 入口受版本、账号或团队 marketplace 策略限制，未实测前不承诺可用。

## 兼容安装脚本

以下客户端使用用户级 Skill 发现目录；不创建运行时 adapter。路径相对于用户主目录：

| 参数 | Skill 入口 |
| --- | --- |
| `opencode` | `.config/opencode/skills/bridge` |
| `antigravity` | `.gemini/antigravity/skills/bridge` |
| `vibe` | `.vibe/skills/bridge` |
| `hermes` | `.hermes/skills/bridge` |
| `cline` | `.cline/skills/bridge` |
| `trae` | `.trae/skills/bridge` |
| `nanobot` | `.nanobot/workspace/skills/bridge` |
| `kiro` | `.kiro/skills/bridge`，另创建 `.kiro/agents/bridge.json` |

macOS / Linux：

```sh
bash ./install.sh opencode --dry-run
bash ./install.sh opencode
bash ./install.sh opencode --source '/absolute/path/Bridge'
bash ./install.sh opencode --uninstall
bash ./install.sh --list
```

Windows PowerShell：

```powershell
.\install.ps1 opencode --dry-run
.\install.ps1 opencode
.\install.ps1 opencode --source 'C:\Projects\Bridge'
.\install.ps1 opencode --uninstall
.\install.ps1 --list
```

PowerShell 执行策略由本机管理，安装器不修改策略；不能执行入口时可使用等价命令 `node scripts/install.mjs opencode`。

脚本默认安装脚本所在仓库，与启动命令时的工作目录无关。Unix 使用软链接，Windows 使用 junction，所以安装后请保留来源目录。Kiro CLI 选择独立 `bridge` agent 使用已注册资源。

安装记录位于 `~/.bridge/installations/<platform>.json`。重复安装可安全重跑；有同名目录、其他工具的链接或用户修改过的 Kiro 配置时停止，不覆盖。来源移动后用新的 `--source` 重新安装；卸载也能清理已登记的断链，不删除来源目录。

Git 来源更新：在来源仓库运行 `git pull --ff-only`，再重启客户端；归档来源原位替换后重装。不提供自动拉取更新器。卸载前先退出正在使用 Bridge 的会话。

`--dry-run` 不写入任何文件；`--help` 显示参数。测试或定制用户目录时可设置 `BRIDGE_INSTALL_HOME`，它只改变本安装器的目录计算，**不会改变客户端自己的发现路径**。例如 OpenCode 的隔离验收还需设置相应 `XDG_CONFIG_HOME`。安装器不读取或修改模型凭据。

## 迁移与开发

旧 `.agents/skills/bridge` 已移除，不再提供项目内重复发现入口。开发也使用原生安装或兼容脚本。以前手工安装的同名 Skill 需先确认来源再手动移除；安装器不会接管未登记入口。已保存的 `.bridge/analysis.json` 与 HTML 数据契约不变。

```sh
npm run check
npm test
```

`npm run check` 校验声明、版本和包内资源；`npm test` 在临时目录测试安装生命周期与独立包渲染。无额外 npm 依赖。三系统 CI 的配置不等于三系统均已实际通过，详见 [验收记录](bridge_plugin_validation.md)。

## 参考资料

平台映射与官方资料链接集中在 `scripts/platforms.json`。适配依据包括参考仓库 `Understand-Anything` 的 `e24fcf6` 快照，以及本轮查阅的官方插件文档；完整覆盖不代表每个平台都完成真实运行验收。
