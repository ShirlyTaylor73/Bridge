# Bridge 插件交付验收记录

验收日期：2026-10-29（用户时区 America/Los_Angeles）。版本：0.1.0。

## 结果与边界

交付层已实现；自动检查和 macOS 安装生命周期测试通过。真实客户端验收部分通过，**尚未达到原规格的完整发布验收门槛**：Claude 未登录，Kimi 周额度耗尽，浏览器交互和 Windows/Linux 实际运行尚未完成。不能将声明兼容等同于端到端可用。

| 检查层次 | 实际结果 |
| --- | --- |
| 插件声明 | `npm run check` 通过；身份、版本、包内资源和 marketplace 引用一致 |
| Claude 原生声明 | `claude plugin validate` 通过；提示未提供作者和市场描述，不影响安装 |
| Skill frontmatter | skill-creator 的 `quick_validate.py` 通过；PyYAML 仅装入临时 uv 环境 |
| 自动测试 | macOS / Node.js 24.16.0：18 项通过，无额外 npm 依赖 |
| 三系统 CI | 已配置 macOS、Linux、Windows × Node.js 22/24；远端 CI 未运行，不能声称全部通过 |
| 渲染迁移回归 | 使用迁移前 `ab8895a` 的渲染器和新路径渲染器，对同一固定分析数据生成 HTML，逐字节一致 |
| 外部目标定位 | 独立插件副本从不同 cwd 分析外部测试仓库；输出仅在目标 `.bridge/` |

## 真实客户端

| 客户端 | 安装和发现 | 分析与渲染 |
| --- | --- | --- |
| Codex CLI 0.164.0 | 通过原生 `marketplace add` 和 `plugin add` 安装 0.1.0，新会话读取安装缓存中的 Skill | 通过：2 文件、2 源码证据、1 调用视图；外部再次运行校验器通过 |
| Claude Code 2.1.195 | 隔离 `CLAUDE_CONFIG_DIR` 中原生注册市场并安装，插件列表显示 enabled | 未完成：`Not logged in · Please run /login`；默认账户状态也未登录 |
| Kimi Code 2.3.0 | 隔离 `KIMI_CODE_HOME`，在 TUI 使用 `/plugins install`，确认显示 Installed bridge 0.1.0 | 未完成：新会话调用 `/skill:bridge:bridge`，服务端返回 `429 You've reached your weekly (7-day) usage limit` |
| OpenCode 1.17.20 | 兼容安装器创建入口，`opencode debug skill` 实际列出 bridge 与正确路径 | 按本轮验收范围仅检查发现，未执行模型分析 |
| 其他客户端 | 声明/目录映射与自动安装测试覆盖；未运行实际客户端 | 未实测 |

Kimi 在受限环境启动时曾出现文件监听 `EMFILE`，允许正常本机运行后安装成功；该错误不被误判为插件失败。隔离验收只引用已有模型配置与登录凭据，不输出凭据；结束后移除这些临时链接。没有切换模型或购买额度来绕过 429。

## RPent 与页面

- 对此前 `.bridge/independent-complete/rpent` 的已有分析重新校验：489 文件、117 目录节点、36 证据、3 调用视图，通过。
- 上述数据是**历史产物兼容性回归**，不是本轮新客户端重新生成。由于 Kimi 配额阻塞，本轮没有完成原规格要求的 RPent d903f38 新会话再生成及 CLI 17 / Dashboard 29 代码位置验收。
- Codex 新会话尝试浏览器验收未成功。本会话进一步尝试 CUA：没有可用浏览器连接；原生 Chrome 状态在不同窗口间切换，未稳定打开目标报告。因此搜索、展开收起、视图切换和窄屏的本轮真实浏览器验收未完成。
- 模板与分析脚本没有修改，字节一致性回归通过；该证据不能替代完整浏览器验收。VS Code 外部应用跳转未实测。

## 可复验步骤

1. 在三系统 CI 执行 `npm run check` 与 `npm test`。
2. 使用 `docs/installation.md` 的原生命令安装，在新的客户端会话对临时仓库运行 Bridge。
3. Claude 完成登录、Kimi 额度恢复后，补做真实分析，并按 `docs/bridge_skill_spec.md` 完成 RPent 与页面验收。
4. 如实更新平台配置中的 verification 字段；只有实际跑通的层次才标记通过。

测试用插件副本和小样本位于本机 `/tmp/bridge-plugin-acceptance/`（临时路径不保证跨重启存在）。Codex 新增的 bridge 插件和临时 marketplace 已卸载；Claude 隔离插件、OpenCode 测试链接也已卸载。用户原有插件未修改，未提交任何凭据或生成 HTML。
