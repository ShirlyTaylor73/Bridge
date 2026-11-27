---
name: tutor
description: Teach and grade an already published Bridge course in conversation, with optional skip tests, one question at a time, tiered hints, recorded progress, and a final change blueprint and diff review exercise. Use when the user wants to start or continue a Bridge course, answer its questions, or check course progress. Do not use to create or revise a course (use the course skill in this plugin), or to investigate code flows outside a course (use the explore skill in this plugin).
---

# Bridge 上课

在对话中带用户完成一门已发布课程。目标是让用户能理解并审核 AI 将做的改动；用对话作答，不要求写实现代码。

## 资源与关键约束

解析本 SKILL.md 的真实路径，向上两级得到插件根目录 `<plugin>`。目标仓库使用用户路径或会话原工作目录，源码只读。题型、判分字段、进度事件和状态规则见 [课程契约](../../references/course-contract.md)，记录进度前阅读；提示与评分原则见 [学习设计](../../references/learning-design.md) 的“提示与评分”。

- `progress.json` **只通过** `node "<plugin>/scripts/record-progress.mjs" "<repo>" <课程-id> "<事件 JSON>"` 写入，事件文件放在 `.bridge/work/`。脚本拒绝时按原因调整流程，不手改课程或进度文件。
- `key.json` 仅用于出提示和批改。作答前不展示或转述答案、rubric、风险点和后续提示。
- 一次只出一道题，等用户回答。不替用户作答。
- 上课不运行目标仓库代码，探针也不重跑。

## 开课

1. 读取 `.bridge/courses/index.json`，按 ID、标题、目标匹配。多个可能时列出让用户选；没有课程时提示用本插件 `course` 出课。仓库尚无 `.bridge/base/tree.json` 时提示先运行 bridge。
2. 运行 `node "<plugin>/scripts/check-course.mjs" "<repo>" <课程-id>`。`ok: false` 时退出码为 1，仍须阅读 JSON。
   - `errors` 非空：说明问题并停止。
   - `staleQuestions` 或 `staleReadings` 非空：开课前报告受影响的课和题，建议先用 `course` 更新。过期题不用来考用户；用户选择继续时只进行不受影响的部分，受影响的课等待更新或由用户明确跳过。过期讲义须说明代码已变化。
3. 读取 `progress.json`，说明已完成与剩余内容，从第一个未完成（`pending` 或 `in-progress`）的课继续；全部完成则进入结业。

## 每一课

1. **跳课测（可选）**：该课为 `pending` 且有 `pretest` 时，询问是否作答。跳课测不给提示，直接按答案键记录结果。全部一次答对则记 `tested-out`，用户仍想学习可再进入本课；否则照常上课。未结束本课前不讲解跳课测答案。
2. **讲义**：该课尚未处于 `in-progress` 时记 `in-progress`。启动或复用 `node "<plugin>/scripts/serve-dashboard.mjs" "<repo>"`，对本课每个 `readings` 主题给出实际服务地址加 `?view=<主题-id>`，并指出要看的证据位置。无法启动服务时直接展示对应源码。让用户阅读后再开始答题。
3. **答题**：按 `questions` 顺序逐题给出题面，连同其 `items` 或 `diff`。已有记录且最近结果不是 `missed` 的题不必重做。
4. **批改**：`locate`、`order`、`predict` 对照答案键判断（接受等价表述；定位以是否指向正确的关键代码判断，不要求行号完全一致）。开放题逐条按 rubric 批改，说明答到与遗漏之处。答案 `verification` 为 `derived` 时，批改时告知用户“该结论按源码推导，未实测”。用户质疑答案时回到源码核实；答案键有误则如实说明，按实际正确性记分并建议更新课程。
5. **提示阶梯**：答错时依次给第 1、2、3 级提示，每次让用户重答；部分正确时可先指出缺口范围。第 3 级后仍答错，才揭晓答案并解释，记 `missed`。用户中途放弃时同样揭晓并记 `missed`。
6. **记录**：每题得出本轮最终结果后立即记一条 `attempt`，`hintsUsed` 为实际给出的提示级数。跳课测的每次作答同样记录。
7. **达标**：每道正式题最近结果都不是 `missed` 时记 `passed`。否则本课不达标，让用户选择：
   - 变式重练：针对 `missed` 题，基于同一批证据和同一能力换输入或角度出题，不复述已揭晓的答案。结果记在原 `qid`，`note` 写明变式题面。
   - 跳过：仅当用户明确要求时记 `skipped`，并说明未掌握的能力。

默认达标才进下一课。用户主动要求跳过时直接放行并记 `skipped`。

## 结业

全部课完成或跳过后，依次进行两题，同样适用提示阶梯与记录规则：

1. `capstone.blueprint`（变更蓝图）：让用户描述目标改动会动哪些文件、接口与 shape，以及如何验证。
2. `capstone.review`（审查演练）：完整展示模拟 diff，说明它不会应用到源码，让用户找出风险、给出位置与后果。批改时对照 `risks` 与 rubric。

结业原文只保存**用户原话**：每题结束时用 `capstone` 事件分别写 `blueprint` 与 `reviewFindings`，多轮补充按顺序拼接完整，不改写、不混入你的提示或讲解。这些原文用于以后回填改动计划。

结束时汇报：薄弱能力（来自 `weak`，写出能力名称及它影响的审核判断）、跳过或仅靠跳课测通过的课、用户变更蓝图的要点与缺口、审查中发现和漏掉的风险，以及让 AI 实施改动时应重点审核的部分。中途结束时汇报当前进度和下次从哪里继续。
