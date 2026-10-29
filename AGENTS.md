# Repository Guidelines

## 项目结构

Bridge 是仓库理解与可视化分析工具，以可移植 Agent Skill 交付。

- `.agents/skills/bridge/scripts/`：扫描、数据校验和 HTML 渲染的 Node.js 脚本。
- `.agents/skills/bridge/assets/dashboard.html`：实际使用的页面模板。
- `.agents/skills/bridge/references/`：分析流程、数据契约和原型约束。
- `prototype/rpent.html`：页面信息架构与交互的参考原型。
- `docs/`：需求规格与调研；修改功能前阅读 `docs/bridge_skill_spec.md`。
- `.bridge/`：扫描、分析和页面生成物，已被 Git 忽略。当前没有独立测试目录。

## 开发与验证命令

脚本仅依赖 Node.js 标准库；无需安装 npm 依赖或启动服务器。从仓库根目录运行：

```sh
node .agents/skills/bridge/scripts/scan-repository.mjs .
node .agents/skills/bridge/scripts/validate-analysis.mjs .
node .agents/skills/bridge/scripts/render-dashboard.mjs .
```

第一条扫描当前仓库。随后按 `references/data-contract.md` 准备 `.bridge/analysis.json`，第二条校验分析数据与源码证据，第三条生成 `.bridge/index.html`。扫描不会自动完成语义分析。直接用浏览器打开生成页面检查效果。

## 编码风格与命名

沿用现有 JavaScript ES modules 风格：两空格缩进、单引号、分号及 `node:` 内置模块导入。变量和函数使用 `camelCase`，常量使用 `UPPER_SNAKE_CASE`，脚本文件采用 `kebab-case.mjs`。保持标准库实现；当前未配置 formatter 或 linter。页面改动遵循既有模板和原型，数据字段遵循契约。

## 测试与验收

当前没有测试框架、统一测试命令或覆盖率门槛。仅为复杂核心逻辑增加聚焦测试，例如扫描排除、路径边界、源码证据校验和非 Git 快照识别；简单文档修改无需测试。

分析数据改动运行校验器；页面改动检查搜索、展开收起、视图切换、窄屏布局及 VS Code URI。发布验收遵循规格中的真实 skill 调用要求；不得把脚本通过当作完整交互验收，也不得声称验证了未实际执行的外部跳转。

## 提交与 Pull Request

遵循历史中的 `feat:`、`fix:`、`refactor:`、`docs:` 前缀，配以简短中文描述，例如 `fix: 修正源码全部收起状态`。每阶段完成后检查 diff 并提交，只暂存本次工作文件。

PR 说明问题、行为变化及验证结果；有关联 issue 时附链接，页面变化附截图。不要提交 `.bridge/`、密钥、临时评测输入或无关修改。

## Agent 协作与安全边界

默认用中文沟通和编写文档。实质修改必须获得明确授权；具体的“实现”“修复”“修改”请求即为对应范围授权，仅询问原因或讨论方案不构成授权。

多文件新功能先从粗到细澄清需求，保存至 `docs/<topic>_spec.md`，再制定计划；计划后和完成后复核规格。大型产品需求拆成周期并记录于 `docs/<topic>_devcycle.md`。先查本地实现，必要时参考最新官方资料。分析目标仓库时只读取源码，仅向其 `.bridge/` 写入产物，保留扫描排除与失败警告。
