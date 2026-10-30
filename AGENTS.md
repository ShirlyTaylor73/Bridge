# Repository Guidelines

## 项目结构

Bridge 是仓库理解与可视化分析工具，以多客户端插件交付，提供 bridge 与 explore 两个可移植 Agent Skill。

- `scripts/`：扫描、数据校验和 HTML 渲染的 Node.js 脚本。
- `assets/dashboard.html`、`assets/dashboard.css`、`assets/dashboard.js`：实际使用的页面模板。
- `references/`：分析流程、数据契约和原型约束。
- `prototype/rpent.html`：页面信息架构与交互的参考原型。
- `docs/`：需求规格与调研；修改功能前阅读 `docs/bridge_explore_spec.md`。
- `.bridge/`：扫描、分析和页面生成物，已被 Git 忽略。`tests/` 存放 Node.js 内置测试，根目录 `scripts/` 提供安装器和插件校验。

## 开发与验证命令

脚本仅依赖 Node.js 标准库；无需安装 npm 依赖，Dashboard 通过本地 HTTP 服务查看。从仓库根目录运行：

```sh
npm run check
npm test
node scripts/scan-repository.mjs /path/to/repo
node scripts/publish-base.mjs /path/to/repo /path/to/base-candidate.json
node scripts/publish-exploration.mjs /path/to/repo /path/to/topic-candidate.json
node scripts/serve-dashboard.mjs /path/to/repo
```

扫描生成清单；Agent 按 `references/data-contract.md` 提供候选，发布脚本校验后写入。基础树在 `.bridge/base/`，探索在 `.bridge/explorations/`。主题 ID 使用语义 kebab-case。新增探索只新增主题并更新索引；更新已有主题须提供 `--update --expected-hash <旧文件SHA256>`，由发布器备份。普通探索保持基础数据、页面资产及其他主题原样。页面更新通过显式 `--upgrade-page` 执行。

## 编码风格与命名

沿用现有 JavaScript ES modules 风格：两空格缩进、单引号、分号及 `node:` 内置模块导入。变量和函数使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`，脚本文件采用 `kebab-case.mjs`。插件元数据和安装参数以 `scripts/platforms.json` 与 `docs/installation.md` 为准。保持标准库实现；当前未配置 formatter 或 linter。页面改动遵循既有模板和原型，数据字段遵循契约。

## 测试与验收

运行 `npm run check` 检查插件声明，运行 `npm test` 执行隔离测试；无第三方测试框架或覆盖率门槛。仅为复杂核心逻辑增加聚焦测试，例如扫描排除、路径边界、源码证据校验和非 Git 快照识别；简单文档修改无需测试。

分析数据改动运行校验器；页面改动检查搜索、展开收起、视图切换、窄屏布局及 VS Code URI。发布验收遵循规格中的真实 skill 调用要求；不得把脚本通过当作完整交互验收，也不得声称验证了未实际执行的外部跳转。

## 提交与 Pull Request

遵循历史中的 `feat:`、`fix:`、`refactor:`、`docs:` 前缀，配以简短中文描述，例如 `fix: 修正源码全部收起状态`。每阶段完成后检查 diff 并提交，只暂存本次工作文件。

PR 说明问题、行为变化及验证结果；有关联 issue 时附链接，页面变化附截图。不要提交 `.bridge/`、密钥、临时评测输入或无关修改。

## Agent 协作与安全边界

默认用中文沟通和编写文档。实质修改必须获得明确授权；具体的“实现”“修复”“修改”请求即为对应范围授权，仅询问原因或讨论方案不构成授权。

多文件新功能先从粗到细澄清需求，保存至 `docs/<topic>_spec.md`，再制定计划；计划后和完成后复核规格。大型产品需求拆成周期并记录于 `docs/<topic>_devcycle.md`。先查本地实现，必要时参考最新官方资料。分析目标仓库时只读取源码，仅向其 `.bridge/` 写入产物，保留扫描排除与失败警告。
