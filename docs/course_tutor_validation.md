# Bridge 0.3.0 course / tutor 验收记录

日期：2026-11-27。对应规格：[C1 规格](course_tutor_spec.md)。

## 声明与脚本

- `npm run check`：`插件声明检查通过：bridge 0.3.0`。
- `npm test`：40 项全部通过（macOS、Node.js 24.16.0）。Linux、Windows 与 Node.js 22 未在本地运行。
- skill-creator `quick_validate.py`：`skills/course`、`skills/tutor` 均为 `Skill is valid and portable!`。

## 真实客户端运行

客户端：Codex CLI 0.172.0。安装方式：由 `git archive HEAD` 导出独立副本，改用独立市场名 `bridge-v030-acceptance` 原生安装 0.3.0；运行期间用 `-c` 临时停用已安装的 0.2.0，验收后移除测试插件与市场。

目标仓库：自建的 8 文件小型 Python 仓库 `tinydet`，是只追踪张量形状的单阶段检测器，含 JSON 层表配置、`parse_model` 通道推导、按层号缓存的前向、三尺度 Detect 与 `train.py` 入口。本机没有 torch 和 numpy，所以仓库只用标准库，探针可以真实运行。改动目标为“在 backbone 末端（SPPF 后）引入 ViT block”。

| 步骤 | 客户端行为 | 结果 |
| --- | --- | --- |
| bridge | 生成 8 文件基础树 | 通过；见下方“发现”第 4 条 |
| course 第 1 轮 | 读源码后给出 5 课约 100 分钟的大纲、能力依赖、“不学”清单与结业任务，提出侧重选项，**未生成题库** | 符合“大纲确认后才出题” |
| course 第 2 轮 | 用户确认大纲并要求实测；列出 3 个探针的目的、命令、依赖、耗时与超时，**未编写脚本** | 符合“先征得同意” |
| course 第 3 轮 | 用户同意探针 1、2，拒绝探针 3；新增 explore 主题 `p5-vit-review-flow`，发布 22 题课程 | 只写入并运行了 2 个获准探针；对应题标 `measured` 并登记 `probe`，token 类题标 `derived` |
| tutor 开课 | 运行 `check-course`，报告 0/5，询问是否做跳课测 | 通过 |
| 跳课测 | 部分正确，记 `partial`，未跳课；本课结束后补讲答案 | 通过 |
| 正式题 | `locate` 无提示答对；`predict` 连续答错，给出第 1、2 级提示后用户放弃，揭晓答案并记 `missed`、`hintsUsed: 2`；`order` 答对 | 通过 |
| 未达标处理 | 提供变式重练或跳过；变式题换为 512 输入，答对后记在原题上，本课 `passed`，`weak` 清空 | 通过 |
| 显式跳过 | 用户要求跳过后四课，全部记 `skipped`，并说明对应能力未经确认 | 通过 |
| 结业 | 蓝图经两级提示达标，三轮作答按原话拼接保存；审查题无提示找出全部 3 个登记风险；最后汇报应重点审核的部分 | 通过 |

全过程源码未改动，进度只经 `record-progress.mjs` 写入。Dashboard 服务在 Codex 的 `workspace-write` 沙箱中无法监听端口，tutor 改为直接展示源码讲义，属于 Skill 规定的降级路径；页面跳转未验证。

## 发现与处理

1. **审查 diff 被整文件重新格式化。** 客户端用脚本重写 JSON 生成 diff，229 行里只有 1 行实质改动，学员当场指出格式噪音。已在学习设计中要求保持原格式、只手写必要的 hunk。
2. **结业蓝图泄露审查答案。** 蓝图的 rubric 与审查风险都是“插入层后的层号迁移”，蓝图的提示直接点到了这一点，使审查题变得容易。已在学习设计中要求审查风险与蓝图要点错开，tutor 给蓝图提示时不提审查风险。
3. **单文件 diff 限制了结业审查。** 引入模块的真实改动横跨 `modules.py`、`tasks.py` 与配置，但契约只允许一份 diff 修改一个已有文件，客户端因此只能考配置文件里的引用问题。验收后已改为支持多文件与新建文件的 diff，风险可以指向其中任一文件；删除与重命名仍不支持。
4. **客户端自行提交了 `.bridge/`。** Codex 在 bridge 初始化后把 `.bridge/` 提交进了目标仓库，原因是用户全局 Codex 规则要求每阶段提交，且目标仓库没有忽略 `.bridge/`。这不是 C1 引入的问题，验收中已回退该提交，之后的调用都明确要求不提交。

修正 1–3 后未重新跑客户端。

## 未验证

- Claude Code、Cursor、Copilot CLI、VS Code Copilot、Gemini CLI、Pi、OpenClaw、Kimi、Kiro 等客户端中的 course / tutor 调用。
- course 的已有课程更新流程（`--update`）与课程歧义选择对话，只有脚本测试覆盖。
- 真实深度学习仓库（如 ultralytics）上的出课质量与探针耗时。
