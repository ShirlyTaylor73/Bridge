# Understand Anything 调研报告：全量扫描、图谱生成与展示

## 1. 结论摘要

**Understand Anything 首次构建时会执行全量文件扫描，并对扫描后保留的全部文件分批做语义分析。** 它不是只从入口出发，也不是只分析用户当前选择的功能或模块。

但需要区分三个“全量”：

1. **全量文件清单**：枚举仓库中所有候选文件，再按 Git、默认规则和用户规则过滤。
2. **全量文件语义分析**：首次构建时，保留清单中的所有文件都会进入批次，交给文件分析器生成节点和边。
3. **完整调用关系**：这一层并不成立。`imports` 是确定性提取的内部依赖；`calls` 主要是 Agent 结合结构信息、import 和符号作出的跨文件判断，不是覆盖所有动态行为的完整调用图。

后续运行不是每次都做全量语义分析，而采用增量更新。不过，**增量模式仍会重新扫描完整文件清单**，只是通常只让 Agent 重析新增和结构变化的文件。

展示层也不能简单概括为“默认画出完整图谱”：当前普通代码结构图已经采用层总览、单层钻取和 1-hop focus；`knowledge` 类型视图才默认渲染全部有效知识节点和边。

## 2. 调研范围与方法

本报告基于本机仓库：

- 路径：`/Users/heavysword/WorkSpace/Pastime/Understand-Anything`
- 提交：`e24fcf6d371bcfa529bc110bacb1bb43de1b8d33`
- 提交时间：2026-10-23
- 远端：`https://github.com/Egonex-AI/Understand-Anything.git`

采用静态源码审查，重点阅读主 Skill、扫描器、批次计算、文件分析器、增量分类器、Dashboard 和 Viewer。本文引用行号均对应该提交。

本次没有重新运行 `/understand` 做性能测量或生成结果对照，因此不对实际耗时、生成质量或大仓库卡顿阈值作量化结论。

## 3. 首次构建是否全量扫描

### 3.1 触发条件明确

主流程规定：

- 指定 `--full`：执行完整分析。
- 没有既有图谱或元数据：执行完整分析。
- 已有图谱且文件发生变化：进入增量准备。

证据：`understand-anything-plugin/skills/understand/SKILL.md:180-224`。

因此，首次使用没有缓存时，必然进入 full analysis，而不是按主题建立局部图。

### 3.2 扫描范围是整个过滤后的仓库清单

完整分析在 Phase 1 调用 project-scanner，要求是发现所有项目文件，包括代码、配置、文档和基础设施文件。扫描结果包含文件列表、分类、行数和内部 import map。

证据：

- `understand-anything-plugin/skills/understand/SKILL.md:259-299`
- `understand-anything-plugin/agents/project-scanner.md:14-19`
- `understand-anything-plugin/agents/project-scanner.md:181-230`

实际枚举由 `scan-project.mjs` 完成：

- Git 仓库优先运行 `git ls-files -z -co --exclude-standard`，即包含 tracked 文件和未被 Git 排除的 untracked 文件。
- 非 Git 场景回退为递归目录遍历。
- 之后应用默认忽略、`.understandignore` 和命令行 `--exclude`。
- 符号链接、非普通文件及读取失败文件不会进入最终清单；读取失败会留下警告。

证据：

- `understand-anything-plugin/skills/understand/scan-project.mjs:481-514`
- `understand-anything-plugin/skills/understand/scan-project.mjs:516-585`
- `understand-anything-plugin/skills/understand/scan-project.mjs:761-839`

所以，“全量”不是硬盘上的所有文件，也不是可达调用链上的文件，而是**完整候选清单经过过滤后保留的所有文件**。

### 3.3 默认过滤与 100 文件提示

默认忽略包括依赖目录、版本库元数据、虚拟环境、构建产物、锁文件、二进制资源、部分生成文件和 IDE 配置等。

证据：`understand-anything-plugin/packages/core/src/ignore-filter.ts:10-72`。

需要注意：

- 超过 100 个文件时，主流程只是提示用户并建议缩小目录，确认后仍可继续；这不是自动截断。
- `.env` 被识别为配置类型，但不在上述硬编码默认忽略列表中。若它被 Git 跟踪或被用户规则重新纳入，就可能进入扫描，不能默认认为 UA 会排除所有密钥文件。

证据：

- `understand-anything-plugin/skills/understand/SKILL.md:299-302`
- `understand-anything-plugin/skills/understand/scan-project.mjs:174-187`
- `understand-anything-plugin/skills/understand/scan-project.mjs:306-319`

### 3.4 import 也在首次构建时全量提取

首次扫描会把完整文件列表传给 `extract-import-map.mjs`。脚本使用 Tree-sitter 和语言特定解析规则，将 import 解析为仓库内部文件路径，外部包被排除。

证据：

- `understand-anything-plugin/agents/project-scanner.md:128-177`
- `understand-anything-plugin/skills/understand/extract-import-map.mjs:5-39`

不传入 `analysisPaths` 时保留完整清单的全量扫描行为；只有显式传入该参数时才选择性读取文件。证据：`extract-import-map.mjs:18-28`、`extract-import-map.mjs:106-151`。

语言支持存在边界：project-scanner 声明支持 TS、JS、Python、Go、Rust、Java、Kotlin、Scala、C#、Ruby、PHP、C、C++ 的 import 解析，其他语言得到空数组，没有 Agent 兜底解析。证据：`project-scanner.md:173-177`。

## 4. 首次构建是否全量生成图谱

### 4.1 所有保留文件都会进入批次

完整分析直接把整个 `scan-result.json` 交给 `compute-batches.mjs`，增量模式才额外传入 `--changed-files`。

证据：`understand-anything-plugin/skills/understand/SKILL.md:306-325`。

批次计算不是从入口做可达性裁剪：

- 代码文件按内部 import 图做 Louvain 社区分组。
- 社区过大时拆分，过小时合并，以减少 Agent 调度成本。
- 非代码文件也按基础设施、CI、迁移和父目录等规则分批。
- 每个批次附带预解析 import 和跨批次邻居信息。

证据：

- `understand-anything-plugin/skills/understand/compute-batches.mjs:394-478`
- `understand-anything-plugin/skills/understand/compute-batches.mjs:523-546`
- `understand-anything-plugin/skills/understand/compute-batches.mjs:569-645`

`MAX_COMMUNITY_SIZE=35`、小批次合并及 `neighborMap` 的 50 条软上限，都是分析上下文和调度控制，不是最终图谱只保留这些文件或关系。

### 4.2 所有批次都会交给文件分析器

完整路径遍历 `batches[]`，最多并发 5 个 file-analyzer；全部批次完成后才合并图谱。

证据：`understand-anything-plugin/skills/understand/SKILL.md:333-395`。

文件分析器对每个文件先运行结构提取，再由 Agent 生成摘要、标签、节点和关系。它要求为结果中的每个文件创建文件级节点，并允许对可读取但被结构解析器跳过的文件补建节点。

证据：`understand-anything-plugin/agents/file-analyzer.md:29-80`、`file-analyzer.md:148-187`。

合并阶段再把各批节点和边组合、规范化、去重并删除悬空边。证据：`SKILL.md:379-395`。

**结论：首次构建的设计目标是全文件覆盖，而非仅生成几条主干调用链。**

### 4.3 全文件覆盖不等于严格完整

以下情况会使实际结果少于理论完整集合：

- 文件被默认或用户规则排除。
- 文件读取失败、符号链接或结构解析不支持。
- 某阶段重试后仍失败时，主流程允许跳过该阶段并保存部分结果，只要求在最终报告中公开错误。
- 合并和展示校验会丢弃无效记录和悬空引用。

证据：

- `understand-anything-plugin/skills/understand/SKILL.md:881-888`
- `understand-anything-plugin/skills/understand/scan-project.mjs:797-839`
- `understand-anything-plugin/packages/core/src/schema.ts:607-673`

因此，更准确的表述是：**首次执行全仓库范围的批处理分析，产出经过校验的仓库级图谱；不保证无任何遗漏。**

## 5. 它生成的是“完整调用图”吗

不是。不同关系的确定性程度不同。

### 5.1 文件和 import

- 文件节点：目标是覆盖所有进入分析结果的文件。
- import：来自确定性脚本，并要求每个已解析内部 import 都产生一条边，不能只挑“重要”的。

证据：`understand-anything-plugin/agents/file-analyzer.md:262-303`。

### 5.2 函数和类节点

函数/类并非全部进入图谱。默认只保留：

- 10 行以上的函数或方法；
- 有 2 个以上方法或 20 行以上的类；
- 所有导出的函数或类。

琐碎函数、类型别名、简单 re-export 和样板代码会被过滤。证据：`file-analyzer.md:241-256`。

### 5.3 calls 和动态行为

`calls` 的规则是：当本文件函数调用另一个文件的函数时，Agent 可以结合 import 和函数名，在有信心时推断跨文件边。

证据：`file-analyzer.md:258-273`。

Tree-sitter 会提取局部 `callGraph`，但最终跨文件 `calls` 仍包含 Agent 语义判断。该流程没有执行目标程序，也没有做全程序动态跟踪或完整的元编程/类型分析。

所以它最多是**仓库级静态结构图加有依据的语义关系**，不是“所有真实调用都已枚举”的完整调用图。动态分派、反射、运行时依赖注入、字符串路由等情况不能据此保证覆盖。

## 6. 后续是否仍然全量

### 6.1 文件清单会重新全量扫描，语义分析通常不会

增量准备会：

1. 根据上次提交和当前提交计算 Git diff。
2. 重新运行完整文件扫描，得到当前完整 inventory。
3. 对新增和 diff 涉及文件计算结构指纹。
4. 区分新增、删除、结构变化、非结构变化和未变化文件。
5. 生成 `filesToReanalyze`，通常只包含新增和结构变化文件。

证据：

- `understand-anything-plugin/skills/understand/prepare-incremental.mjs:326-379`
- `understand-anything-plugin/skills/understand/prepare-incremental.mjs:494-598`
- `understand-anything-plugin/skills/understand/prepare-incremental.mjs:613-672`

因此，增量模式是“**全量确定性清单刷新 + 选择性 Agent 重析**”，不是完全不再扫描，也不是每次全量调用 Agent。

### 6.2 增量动作分级

分类器的规则为：

| 动作 | 条件 | 语义处理 |
|---|---|---|
| `SKIP` | 无结构变化，可能只有格式/注释变化 | 不调用文件分析器 |
| `PARTIAL_UPDATE` | 少量局部结构变化 | 只重析变化文件，保留架构和 tour |
| `ARCHITECTURE_UPDATE` | 顶层目录变化，或结构变化超过 10 个文件 | 重析变化文件，并重跑架构和 tour |
| `FULL_UPDATE` | 结构变化超过 30 个文件，或超过原文件数 50% | 回到完整流程 |

证据：`understand-anything-plugin/packages/core/src/change-classifier.ts:12-93`。

纯删除可以不调用 Agent；未变化文件从旧图保留。合并时还会校验符号丢失，失败时阻止发布新基线。

证据：`understand-anything-plugin/skills/understand/SKILL.md:399-435`。

### 6.3 import 刷新范围与语义重析范围不同

普通文件编辑只选择性刷新相关 import；新增/删除文件或解析配置变化时，因为内部路径解析结果可能改变，会重新计算完整 import map。

证据：`prepare-incremental.mjs:619-646`。

UA 的 `filesToReanalyze` 并不普遍包含所有直接依赖变化文件的旧文件。也就是说，**不能把它的增量策略描述为“变化文件及所有直接依赖者都重新做语义分析”**。它主要依靠变化文件重析、完整/选择性 import 刷新、旧图裁剪和符号校验来维护结果。

## 7. 图谱如何展示

### 7.1 数据先完整加载

Dashboard 获取 `knowledge-graph.json`，经过 core 校验后写入 store。数据包含 `nodes`、`edges`、`layers` 和 `tour`。

证据：

- `understand-anything-plugin/packages/dashboard/src/App.tsx:144-170`
- `understand-anything-plugin/packages/core/src/types.ts:54-77`
- `understand-anything-plugin/packages/core/src/types.ts:106-115`

因此它确实采用“先准备仓库级数据，再选择展示”的总体路线。

### 7.2 普通代码结构图已有渐进展示

普通结构图初始为 `overview + file`：

- 总览按架构层形成 cluster，并聚合层间边。
- 进入某层后显示该层文件。
- 类级才加入 class，function 还需要额外开关。
- focus 会裁剪为当前层内节点及 1-hop 邻居。
- 只保留可见节点之间的边。

证据：

- `understand-anything-plugin/packages/dashboard/src/store.ts:301-305`
- `understand-anything-plugin/packages/dashboard/src/store.ts:343-356`
- `understand-anything-plugin/packages/dashboard/src/components/GraphView.tsx:271-307`
- `understand-anything-plugin/packages/dashboard/src/components/GraphView.tsx:434-516`

所以，当前版本普通代码结构图并不是“首次打开就把所有文件、函数和调用线全部画出”。

### 7.3 knowledge 视图是例外

当图谱 `kind` 为 `knowledge` 时，Dashboard 进入专门的知识图谱视图。该视图默认保留全部有效知识节点及两端可见的边，选中/focus 主要用于高亮邻居和淡化其他元素，而不是裁成局部子图。

证据：

- `understand-anything-plugin/packages/dashboard/src/App.tsx:171-174`
- `understand-anything-plugin/packages/dashboard/src/components/KnowledgeGraphView.tsx:153-170`
- `understand-anything-plugin/packages/dashboard/src/components/KnowledgeGraphView.tsx:257-344`

评估 UA 的“图谱复杂”问题时，应区分普通代码结构图与知识图谱视图，不能混用结论。

### 7.4 自制代码预览，未复用 VS Code

Dashboard 的 `CodeViewer` 通过 `/file-content.json` 读取源码并做行高亮，使用 Prism 和 Markdown 渲染。Viewer/本地服务从磁盘读取当前文件，而不是通过 VS Code 打开。

证据：

- `understand-anything-plugin/packages/dashboard/src/components/CodeViewer.tsx:28-31`
- `understand-anything-plugin/packages/dashboard/src/components/CodeViewer.tsx:149-190`
- `understand-anything-plugin/packages/dashboard/src/components/CodeViewer.tsx:305-343`
- `understand-anything-plugin/packages/dashboard/vite.config.ts:125-187`
- `understand-anything-plugin/packages/viewer/bin/viewer.mjs:144-198`

在所查 Dashboard、core 和 viewer 范围内，没有发现 VS Code 扩展、`vscode://` 跳转或 `code` 命令集成。Prism 的 `vsDark` 只是配色名称，不代表 VS Code 集成。

## 8. 对 Bridge 第一期的直接启示

1. **“首次全量数据、后续局部展示”符合 UA 的实际路线。** 用户提出新主题时，不应默认重新扫描和重析整个仓库，而应复用已有数据筛选视角。
2. **Bridge 不应把 UA 的图数据原样搬过来。** UA 同时包含文件、函数、类、架构层、tour 和 26 种边；Bridge 当前目标是文件树理解，保留文件级节点及少量可靠关系即可。
3. **全量文件覆盖与完整调用图必须分开承诺。** 可以要求每个纳入文件都有分类和摘要；不能保证所有动态调用都被发现。`imports`、`calls` 和其他语义关系应区分来源与可信度。
4. **增量更新仍有全量清单刷新成本。** 若 Bridge 采用相同策略，应明确这是确定性扫描，不等于全量 Agent 分析。
5. **不要把 UA 的增量策略误写为直接依赖者全部重析。** 是否扩大重析范围是 Bridge 自己的准确性/成本取舍，需要单独决定。
6. **展示复杂度高不能简单归因于“没有渐进展示”。** UA 普通结构图已经有层级和 1-hop。Bridge 的差异化更准确地落在：以文件树为主心智模型、默认不画线、按选中节点或学习主题显示局部跨枝关系、代码阅读交给 VS Code。
7. **忽略和失败必须透明。** 扫描范围、排除文件、解析失败及部分结果都应可见；密钥文件需要 Bridge 自己制定明确边界，不能假定参考实现已经妥善处理。

## 9. 主要源码索引

以下链接固定到本次调研提交：

- [主分析流程 SKILL.md](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/skills/understand/SKILL.md)
- [文件扫描 scan-project.mjs](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/skills/understand/scan-project.mjs)
- [import 提取 extract-import-map.mjs](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/skills/understand/extract-import-map.mjs)
- [批次计算 compute-batches.mjs](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/skills/understand/compute-batches.mjs)
- [文件分析器 file-analyzer.md](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/agents/file-analyzer.md)
- [增量准备 prepare-incremental.mjs](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/skills/understand/prepare-incremental.mjs)
- [增量分类 change-classifier.ts](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/packages/core/src/change-classifier.ts)
- [默认忽略 ignore-filter.ts](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/packages/core/src/ignore-filter.ts)
- [普通结构图 GraphView.tsx](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/packages/dashboard/src/components/GraphView.tsx)
- [知识图谱 KnowledgeGraphView.tsx](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/packages/dashboard/src/components/KnowledgeGraphView.tsx)
- [代码预览 CodeViewer.tsx](https://github.com/Egonex-AI/Understand-Anything/blob/e24fcf6d371bcfa529bc110bacb1bb43de1b8d33/understand-anything-plugin/packages/dashboard/src/components/CodeViewer.tsx)
