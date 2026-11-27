---
name: course
description: Design and publish a goal-driven course from an initialized Bridge repository, so the user can understand and review a change they plan to have AI make, such as introducing a new module into a model. Use to create a course or learning path with exercises for such a goal, or to revise or refresh an existing course. Do not use to answer a single code-flow question (use the explore skill in this plugin), or to take lessons, answer course questions, or grade them (use the tutor skill in this plugin).
---

# Bridge 出课

从用户的改动目标逆向设计课程，供本插件 `tutor` 在对话中授课。学习目标是让用户**能理解并审核 AI 将做的改动**，不要求用户写实现代码，不出编码作业。

## 资源与前置条件

解析本 SKILL.md 的真实路径，向上两级得到插件根目录 `<plugin>`，引用其共享 scripts 和 references。目标仓库使用用户路径或会话原工作目录。检查 `.bridge/base/tree.json` 和 `.bridge/explorations/index.json`，缺少时提示先运行 bridge，结束本次出课。

## 关键约束

- 目标仓库源码只读，产物只写入其 `.bridge/`。
- **大纲经用户确认后才生成题库。**
- **运行目标仓库代码须先征得用户同意。** 同意之前不编写也不运行探针脚本。同意仅覆盖列出的命令。
- 缺少讲义时只新增 explore 主题，不修改已有主题。
- 候选写在 `.bridge/work/`，已发布的课程文件与进度只由脚本写入。
- 答案键内容（答案、提示、rubric、风险点）不向用户展示，大纲与汇报中也不透露。

## 工作流

1. **查重与澄清**：读取 `.bridge/courses/index.json`（可能尚不存在）。已有相近课程且意图不明时，让用户选择更新还是新建。结合基础树和相关源码，向用户澄清目标改动、已有基础和结业时应能做出的判断；只问会改变课程内容的问题。`goal` 保存用户原话。
2. **逆向设计**：阅读 [学习设计](../../references/learning-design.md)。从结业任务推导能力图（每项能力对应一种审核判断）、课程顺序和“不学”清单。
3. **确认大纲**：向用户给出能力图、课程顺序与预计时长、“不学”清单、结业任务。同时列出拟运行的探针，逐项说明目的、命令、依赖、预计耗时；没有需要实测的结论就说明无需探针。分别取得对大纲的确认和对探针的同意或拒绝。大纲有实质调整时重新确认。
4. **准备讲义**：读取主题索引，复用覆盖所需代码的已有主题及其证据 key。缺失部分按 [explore 工作流](../explore/SKILL.md) 的调研与发布步骤**新增**主题。已有主题过期或不足时，以细化的新 ID 新增主题。
5. **出题**：阅读 [课程契约](../../references/course-contract.md)，在 `.bridge/work/<课程-id>-candidate/` 写 `course.json` 与 `key.json`。逐题对照当前源码确认答案；模拟 diff 只作为文本写入，不应用到源码。
6. **探针**：仅在用户同意时，把脚本写入候选目录的 `probes/`。在 `.bridge/work/` 下的工作目录运行，仅用 CPU 和小输入，设置超时与 `PYTHONDONTWRITEBYTECODE=1`，确保缓存和输出都落在 `.bridge/` 内。安装依赖、下载数据或权重、访问网络，以及超出已说明范围的命令需另行征得同意。运行成功且结果支撑答案时标 `measured` 并在题目登记 `probe`；拒绝、缺依赖、超时或失败时按源码推导，标 `derived`，不声称实测。
7. **发布**：运行 `node "<plugin>/scripts/publish-course.mjs" "<repo>" "<候选目录>"`。按错误信息只修正本次候选后重试。

## 更新已有课程

先运行 `node "<plugin>/scripts/check-course.mjs" "<repo>" <课程-id>`，记录 `digest`，查看过期题目与讲义。以已发布的 course、key 和需保留的探针为基础写完整候选，将 `project` 更新为当前扫描结果（commit 可取输出中的 `commit.current`）。能力、课程顺序或结业任务变化时重新确认大纲；新增或重新运行探针时重新征得同意。发布时增加 `--update --expected-hash <digest>`；摘要冲突说明课程已变化，重新读取后协调修改。内容变化的题目会清除相应作答记录，发布前告知用户，规则见课程契约。

## 汇报

给出课程 ID、各课主题与时长、新增的 explore 主题、哪些结论已实测或仅按源码推导、扫描警告与未决问题，并说明用本插件 `tutor` 开始或继续这门课（例如“用 Bridge 的 tutor 学习课程 <课程-id>”）。
