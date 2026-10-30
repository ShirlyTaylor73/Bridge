# 安装与使用 Bridge

Bridge 0.2.0 将 `skills/bridge/` 与 `skills/explore/` 交付给多个客户端，复用插件根目录的脚本和资产。Dashboard 使用本地 HTTP 服务；无需 npm install 或构建。分析脚本和兼容安装器使用 Node.js 22+。先在客户端可执行命令的环境中准备 Node.js。

原生插件由客户端直接从远程仓库获取，无需手动 clone，也不要求进入 Bridge 仓库。安装完成后，在**要分析的仓库**启动新会话并调用 Bridge。插件名为 `bridge`，两个 Skill 分别为 `bridge` 和 `explore`。

发布仓库：[ShirlyTaylor73/Bridge](https://github.com/ShirlyTaylor73/Bridge)。以下远程安装命令可直接使用。

## 原生插件安装

使用支持相应插件机制的客户端版本。旧版没有命令时先升级，不使用兼容脚本静默替代。客户端自身负责更新、禁用和卸载。

| 客户端 | 远程安装 | 调用 |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add ShirlyTaylor73/Bridge`，再 `claude plugin install bridge@bridge-marketplace` | `/bridge:bridge`、`/bridge:explore` 或自然语言 |
| Codex CLI | `codex plugin marketplace add ShirlyTaylor73/Bridge`，再 `codex plugin add bridge@bridge-marketplace`；也可在 `/plugins` 中安装 | 选择 bridge 插件 Skill，或要求“使用 Bridge 插件分析当前仓库” |
| Cursor | Customize → Plugins 中使用支持 Agent Plugins 的安装入口，输入远程仓库地址 | 选择 Bridge Skill 或自然语言 |
| Copilot CLI | `copilot plugin marketplace add ShirlyTaylor73/Bridge`，再 `copilot plugin install bridge@bridge-marketplace` | 选择 Bridge Skill 或自然语言 |
| VS Code Copilot | 命令面板执行 `Chat: Install Plugin from Source`，输入远程仓库 URL | 在已启用的插件 Skill 中选择 Bridge |
| Gemini CLI | `gemini extensions install "https://github.com/ShirlyTaylor73/Bridge"` | 选择 Bridge Skill 或自然语言 |
| Pi Agent | `pi install "https://github.com/ShirlyTaylor73/Bridge"` | `/skill:bridge`、`/skill:explore` 或自然语言 |
| OpenClaw | `openclaw plugins install bridge --marketplace "https://github.com/ShirlyTaylor73/Bridge"` | 选择 Bridge Skill 或自然语言 |
| Kimi Code | TUI 中执行 `/plugins install https://github.com/ShirlyTaylor73/Bridge`，之后 `/reload` | `/skill:bridge:bridge`、`/skill:bridge:explore` |

Codex 支持界面以官方文档为准，不能将 CLI/桌面插件能力等同于 IDE 扩展能力。安装后的缓存、更新和卸载遵循各客户端自身规则。

使用远程 Git 仓库分发不代表已上架任何官方目录。部分 Cursor 入口受版本、账号或团队 marketplace 策略限制，实际可用入口以客户端显示为准。

## 兼容安装脚本

以下客户端使用用户级 Skill 发现目录；不创建运行时 adapter。仅这类兼容脚本安装需要先 clone 或下载 Bridge，再进入下载目录运行脚本：

```sh
git clone "https://github.com/ShirlyTaylor73/Bridge" Bridge
cd Bridge
```

脚本需与仓库配套文件一起保留。每个平台同时安装 bridge、explore 两个入口；下表使用 `{bridge,explore}` 表示两个同级目录，路径相对于用户主目录：

| 参数 | Skill 入口 |
| --- | --- |
| `opencode` | `.config/opencode/skills/{bridge,explore}` |
| `antigravity` | `.gemini/antigravity/skills/{bridge,explore}` |
| `vibe` | `.vibe/skills/{bridge,explore}` |
| `hermes` | `.hermes/skills/{bridge,explore}` |
| `cline` | `.cline/skills/{bridge,explore}` |
| `trae` | `.trae/skills/{bridge,explore}` |
| `nanobot` | `.nanobot/workspace/skills/{bridge,explore}` |
| `kiro` | `.kiro/skills/{bridge,explore}`，另创建 `.kiro/agents/bridge.json` |

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

脚本默认安装脚本所在仓库，与启动命令时的工作目录无关。Unix 使用软链接，Windows 使用 junction，所以安装后请保留来源目录。Kiro CLI 选择独立 `bridge` agent 使用两个已注册 Skill。Skill 先解析自身真实路径，再定位共用脚本和资产。

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

旧 `.agents/skills/{bridge,explore}` 已移除，不再提供项目内重复发现入口。开发也使用原生安装或兼容脚本。以前手工安装的同名 Skill 需先确认来源再手动移除；安装器不会接管未登记入口。0.2.0 使用全新安装和初始化：升级前保留旧报告目录，兼容脚本用户先用旧安装器卸载旧入口，再使用新安装器成组安装。原生客户端通过自身插件更新机制更新。

```sh
npm run check
npm test
```

`npm run check` 校验声明、版本和包内资源；`npm test` 在临时目录测试安装生命周期与独立包资源定位、探索发布、服务边界。无额外 npm 依赖。三系统 CI 的配置不等于三系统均已实际通过，详见 [0.2.0 验收记录](bridge_explore_validation.md)。

## 参考资料

平台映射与官方资料链接集中在 `scripts/platforms.json`。适配依据包括参考仓库 `Understand-Anything` 的 `e24fcf6` 快照，以及本轮查阅的官方插件文档；完整覆盖不代表每个平台都完成真实运行验收。

## 建立概览与持续探索

先调用 bridge 建立基础树，再调用 explore 提出具体调研问题；例如“调研训练脚本整体关系”，生成 `training-pipeline.json`。明确“继续深化 training-pipeline”会更新该主题并备份旧版本。Agent 遇到相似但意图不明确的主题会列出候选供选择。新增其他主题保持旧结果和页面资产原样。

Skill 会启动并提供本地页面地址，也可运行：

```sh
node /path/to/Bridge/scripts/serve-dashboard.mjs /path/to/target-repository
```

路径分别指实际插件目录与分析目标。服务绑定 127.0.0.1，默认自动分配端口，可追加 `--port 8765`。刷新页面读取最新主题；再次运行 bridge 默认复用概览，明确要求刷新才重新分析基础树。
