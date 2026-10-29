# 安装与使用 Bridge

Bridge 0.1.0 将同一份 `skills/bridge/` 交付给多个客户端。无需 npm install、构建、MCP 服务或后台进程；分析脚本和兼容安装器使用 Node.js 22+。先在客户端可执行命令的环境中准备 Node.js。

原生插件由客户端直接从远程仓库获取，无需手动 clone，也不要求进入 Bridge 仓库。安装完成后，在**要分析的仓库**启动新会话并调用 Bridge。插件名和 Skill 名均为 `bridge`。

下文 `OWNER/REPO` 表示 Bridge 发布仓库的 GitHub 所有者和仓库名，`<Git URL>` 表示完整仓库地址；使用前替换为真实地址。当前仓库未配置 remote，因此这些是占位符，不是已发布地址。

## 原生插件安装

使用支持相应插件机制的客户端版本。旧版没有命令时先升级，不使用兼容脚本静默替代。客户端自身负责更新、禁用和卸载。

| 客户端 | 远程安装 | 调用 |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add OWNER/REPO`，再 `claude plugin install bridge@bridge-marketplace` | `/bridge:bridge` 或自然语言 |
| Codex CLI | `codex plugin marketplace add OWNER/REPO`，再 `codex plugin add bridge@bridge-marketplace`；也可在 `/plugins` 中安装 | 选择 bridge 插件 Skill，或要求“使用 Bridge 插件分析当前仓库” |
| Cursor | Customize → Plugins 中使用支持 Agent Plugins 的安装入口，输入远程仓库地址 | 选择 Bridge Skill 或自然语言 |
| Copilot CLI | `copilot plugin marketplace add OWNER/REPO`，再 `copilot plugin install bridge@bridge-marketplace` | 选择 Bridge Skill 或自然语言 |
| VS Code Copilot | 命令面板执行 `Chat: Install Plugin from Source`，输入远程仓库 URL | 在已启用的插件 Skill 中选择 Bridge |
| Gemini CLI | `gemini extensions install "<Git URL>"` | 选择 Bridge Skill 或自然语言 |
| Pi Agent | `pi install "<Git URL>"` | `/skill:bridge` 或自然语言 |
| OpenClaw | `openclaw plugins install bridge --marketplace "<Git URL>"` | 选择 Bridge Skill 或自然语言 |
| Kimi Code | TUI 中执行 `/plugins install https://github.com/OWNER/REPO`，之后 `/reload` | `/skill:bridge:bridge` |

Codex 支持界面以官方文档为准，不能将 CLI/桌面插件能力等同于 IDE 扩展能力。安装后的缓存、更新和卸载遵循各客户端自身规则。

使用远程 Git 仓库分发不代表已上架任何官方目录。部分 Cursor 入口受版本、账号或团队 marketplace 策略限制，未实测前不承诺可用。

## 兼容安装脚本

以下客户端使用用户级 Skill 发现目录；不创建运行时 adapter。仅这类兼容脚本安装需要先 clone 或下载 Bridge，再进入下载目录运行脚本：

```sh
git clone "<Git URL>" Bridge
cd Bridge
```

当前脚本依赖仓库中的配套文件，不支持只下载单个安装脚本执行。路径相对于用户主目录：

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

## 本地开发与调试

开发者可从本地 checkout 安装正在修改的插件。以下示例在 **Bridge 仓库根目录**执行，`.` 仅代表本地开发来源：

```sh
codex plugin marketplace add .
codex plugin add bridge@bridge-marketplace
```

其他原生客户端可使用其支持的本地目录安装入口。建议使用干净 checkout，避免客户端复制评测产物。Kimi 本地安装使用托管副本，修改源目录后需重新安装。

### 旧入口迁移与检查

旧 `.agents/skills/bridge` 已移除，不再提供项目内重复发现入口。开发也使用原生安装或兼容脚本。以前手工安装的同名 Skill 需先确认来源再手动移除；安装器不会接管未登记入口。已保存的 `.bridge/analysis.json` 与 HTML 数据契约不变。

```sh
npm run check
npm test
```

`npm run check` 校验声明、版本和包内资源；`npm test` 在临时目录测试安装生命周期与独立包渲染。无额外 npm 依赖。三系统 CI 的配置不等于三系统均已实际通过，详见 [验收记录](bridge_plugin_validation.md)。

## 参考资料

平台映射与官方资料链接集中在 `scripts/platforms.json`。适配依据包括参考仓库 `Understand-Anything` 的 `e24fcf6` 快照，以及本轮查阅的官方插件文档；完整覆盖不代表每个平台都完成真实运行验收。
