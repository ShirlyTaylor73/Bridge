# Bridge course + tutor（C1）规格

周期划分见 [开发周期](course_tutor_devcycle.md)。本文记录 C1 已确认的决策。

## 目标与非目标

用户给出改动目标（如“在 YOLO 中引入 ViT”），`course` 从目标逆向设计能力图与课程，`tutor` 在对话里逐课出题、批改、给提示、记录进度，以“变更蓝图 + 审查演练”结业，形成“出课 → 对话答题 → 批改 → 结业”的最小闭环。

学习目的是让用户**能理解并审核 AI 将做的改动**，不要求用户写实现代码。

C1 不包括：论文与参考代码资料库、固定学习工作区、纯知识类目标、论文证据校验（C2）；Dashboard 课程视图，本期页面资产不改（C3）；开发流程编排（C4）；编码作业、沙箱 worktree、真实应用 diff、间隔复习调度。

## 前置条件与存储

- 前置条件同 explore：目标仓库须已有 `.bridge/base/tree.json` 与 `explorations/index.json`，否则提示先运行 bridge。
- 存储位于目标仓库：`.bridge/courses/index.json`，以及 `.bridge/courses/<课程-id>/{course.json,key.json,progress.json,probes/}`。课程 ID 用语义 kebab-case，规则同主题 ID。
- 题面与答案分离：`course.json` 放题面（含审查用 diff），`key.json` 放答案、rubric、提示阶梯与 diff 风险点。这是君子协定，tutor 不主动泄露答案键。
- 讲义不重复：课程引用 explore 主题 ID 与证据 key；缺失主题由 course 按 explore 工作流**新增**发布，不修改已有主题。
- 课程发布不得改动 base、explorations、页面资产与其他课程。发布器自身只写 `courses/` 与 `history/courses/`。
- 更新课程须提供旧 course.json 与 key.json 拼接内容的 SHA256，更新前备份到 `history/courses/<id>/<hash>/`。
- 进度只由 `record-progress.mjs` 写入，Agent 不手写 JSON。

## 课程设计

- 大纲（能力图、课程顺序、“不学”清单、结业任务）先经用户确认，再生成题库。
- 每项能力写明它支撑用户将来做出的审核判断。
- 题型共 7 种，全部在对话中作答：`locate` 定位、`order` 调用排序、`predict` 张量或返回值预测、`explain` 自述、`design` 设计取舍、`forecast` 变更预测（会动哪些文件、接口、shape）、`review` 审查演练（模拟 diff 中藏有真实风险）。
- 每课 3–5 道正式题；每课 1–2 道独立于正式题的可选跳课测（pretest），校验器允许 0–2 道。
- 结业必含两题：`forecast` 型“变更蓝图”与 `review` 型完整模拟 diff 审查。
- 模拟 diff 在出课时生成，只作为文本保存，不应用到源码；上下文行与 `-` 行必须逐字匹配磁盘。

## 探针

- 分析目标仓库时只读源码、只向其 `.bridge/` 写产物，约束的是不改源码；运行目标代码是需要用户授权的动作。
- course 在大纲确认时一并列出拟运行的探针（命令、依赖、预计耗时），**征得同意后才写脚本并运行**。
- 探针放在 `probes/`，在目标仓库 `.bridge/work/` 下以 CPU、小输入、超时执行，设置 `PYTHONDONTWRITEBYTECODE=1`，输出只写 `.bridge/`。成功的答案标 `verification: "measured"`。
- 不同意或运行失败时按源码推导，标 `"derived"`；tutor 批改时向用户说明“未实测”。

## 上课与门槛

- tutor 开课前运行 `check-course`，报告过期题目。
- 默认达标才进下一课；一课中任一正式题最新结果为 `missed` 即不达标，可做同证据的变式重练，或由用户显式跳过（记 `skipped`）。
- 跳课测全对且未用提示记 `tested-out`。
- 答错走 3 级提示，第 3 级后仍未答对则揭晓答案并记 `missed`。
- 结业完成后汇报薄弱能力与变更蓝图要点；进度中保存用户的结业原文，供 C4 回填计划。

## Skill 与交付

- 新增可移植 Skill `course`（出课）与 `tutor`（上课）：只用标准 frontmatter（`name`、`description`），不写宿主专用字段、工具名或调用语法；二者与 explore 互不抢触发。
- 沿用仓库约定：解析 SKILL.md 真实路径，上溯两级到插件根目录，引用共享 `scripts/`、`references/`。这与安装器的目录链接方式一致，是对“从 Skill 根目录用相对路径引用”的有意偏离。
- SKILL.md 只留目的、关键约束与路由；数据契约在 [课程契约](../references/course-contract.md)，出题原则在 [学习设计](../references/learning-design.md)。
- 脚本仅用 Node.js 标准库：`publish-course.mjs`、`check-course.mjs`、`record-progress.mjs` 与 `lib/validate-course.mjs`。
- 兼容安装器成组安装四个 Skill，插件版本统一为 0.3.0。

## 验收

- `npm run check`、`npm test` 全部通过。
- 脚本测试：
  - 合法课程发布成功，前后 base、explorations、页面资产与其他课程的哈希不变。
  - 依赖环、未覆盖能力、题与答案键不一致、引用不存在的主题或证据、diff 上下文与磁盘不符、locate 越界均被拒绝，旧结果保持可访问。
  - 更新缺少 hash 或 hash 不符被拒；更新成功产生备份。
  - `record-progress` 拒绝未知题目与非法状态；两次并发写入后作答记录完整。
  - 修改源码后 `check-course` 报告过期题。
- 真实 Skill 调用至少覆盖一个客户端，使用一个小型真实仓库：course 完成目标澄清、大纲确认、缺失主题新增、探针征询（同意并实测一次、拒绝后标注推导一次）与发布；tutor 完成一课跳课测、一次提示阶梯到揭晓、一次显式跳过与结业两题。
- 记录未实际执行的客户端，不声称已验证。实际结果写入 `docs/course_tutor_validation.md`。

## 已知风险

- 出题质量依赖模型，靠学习设计规则与“能力—决策”映射约束；真实验收时人工检查题目是否在考记忆。
- 探针即使获得同意也可能触发重依赖或长耗时，靠超时与降级兜底；目标环境缺依赖时只能推导。
- `quick_validate` 只检查格式，不能证明各宿主触发行为一致；未做真实验收的客户端标为未验证。
- unified diff 校验使用标准库自写解析器，范围限于单文件、多 hunk、按行匹配。
