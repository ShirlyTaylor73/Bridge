# 课程数据契约

所有源码路径相对目标仓库，采用 POSIX `/`；说明使用用户语言。出题原则见 [学习设计](learning-design.md)，explore 主题与证据见 [数据契约](data-contract.md)。

所有 ID（课程、能力、课、题、风险）使用 kebab-case，最长 80 字符。下列对象不接受未列出的字段。

## 目录

```text
.bridge/courses/index.json
.bridge/courses/<课程-id>/course.json     题面
.bridge/courses/<课程-id>/key.json        答案键
.bridge/courses/<课程-id>/progress.json   进度，只由脚本写入
.bridge/courses/<课程-id>/probes/         经用户同意运行过的探针脚本
```

出课时只写候选目录（建议 `.bridge/work/<课程-id>-candidate/`），内含 `course.json`、`key.json` 与可选的 `probes/`；其余文件由发布器维护。

题面与答案键分开保存是约定而非访问控制：作答前不向用户展示答案键内容。

## course.json

```json
{
  "version": 1,
  "id": "vit-in-detector",
  "title": "在检测器中引入 ViT",
  "goal": "用户原话",
  "scope": {"in": ["本课程覆盖的内容"], "out": ["明确不学的内容"]},
  "project": {"root": "仓库真实绝对路径", "commit": null, "generatedAt": "ISO 时间"},
  "competencies": [
    {"id": "feature-shapes", "title": "特征图 shape", "desc": "能追踪各层输出尺寸", "dependsOn": [], "decision": "判断新模块的输出能否接到下游"}
  ],
  "lessons": [
    {"id": "backbone-flow", "title": "主干数据流", "competencies": ["feature-shapes"],
     "readings": [{"topic": "model-forward", "evidence": ["backbone-forward"]}],
     "pretest": ["pre-shapes"], "questions": ["q-locate", "q-order", "q-shape"]}
  ],
  "questions": {
    "q-order": {"type": "order", "lesson": "backbone-flow", "competency": "feature-shapes", "prompt": "按调用顺序排列", "items": ["neck", "head", "backbone"]}
  },
  "capstone": {"blueprint": "cap-blueprint", "review": "cap-review"}
}
```

- `project.root`、`project.commit` 等于本次扫描结果。
- `scope.in` 至少一项；`scope.out` 是“不学”清单，可为空数组。
- 能力依赖无环；每课覆盖至少一项能力，每项能力至少被一课覆盖。某能力首次出现的课不得早于其依赖首次出现的课。`decision` 写该能力支撑用户将来做出的审核判断。
- `lessons` 数组顺序即上课顺序。每课至少一条 `readings`，引用已发布主题 ID 与该主题中存在的证据 key；0–2 道 `pretest`，3–5 道 `questions`。课 ID 不能为 `capstone`。
- 每道题恰好归属一处：某课的 `pretest`、某课的 `questions` 或某个结业槽位。`lesson` 填所在课 ID，结业题填 `capstone`。课内题目的 `competency` 属于该课覆盖的能力。
- `capstone.blueprint` 是 `forecast` 题，`capstone.review` 是 `review` 题。

### 题目字段

`{type, lesson, competency, prompt, items?, diff?, probe?}`

| type | 含义 | items / diff |
| --- | --- | --- |
| `locate` | 定位实现位置 | — |
| `order` | 调用或执行顺序 | `items` 必填，至少 2 项且不重复 |
| `predict` | 张量 shape、返回值预测 | — |
| `explain` | 用自己的话解释 | — |
| `design` | 设计取舍 | — |
| `forecast` | 预测一项变更会动哪些文件、接口、shape | `diff` 可选，属于题面（例如给定的起始改动），不得泄露待预测内容 |
| `review` | 审查模拟 diff，找出其中的真实风险 | `diff` 必填 |

`probe` 为 `probes/<文件名>`，指向候选 `probes/` 中实际运行过的脚本。`probes/` 仅放平铺的普通文件，名称以字母或数字开头，只含字母、数字、`.`、`_`、`-`。

### 模拟 diff

`diff` 是一个字符串，内容为 unified diff。它只作为文本保存，不应用到源码。

```text
--- a/src/model.py
+++ b/src/model.py
@@ -10,2 +10,2 @@
     def forward(self, x):
-        return self.backbone(x)
+        return self.encoder(x)
```

- 每个 diff 只修改**一个已存在且在本次扫描中的文件**，可含多个 hunk；文件头为 `--- a/<路径>` 与 `+++ b/<同一路径>`，前面可有 `diff --git`、`index` 行。不支持新建、删除、重命名或多文件。
- hunk 按旧文件行号递增、互不重叠，头部行数与内容一致，新文件起始行号与之前 hunk 的增删累计一致。
- 每个 hunk 至少有一行上下文或删除行，并至少有一处增删。
- 上下文行与 `-` 行去掉首字符后逐字匹配磁盘对应行（含缩进）。空白上下文行保留前导空格。

## key.json

```json
{
  "version": 1,
  "answers": {
    "q-locate": {"answer": {"path": "src/model.py", "start": 10, "end": 14}, "hints": ["方向提示", "缩小范围", "接近答案"]},
    "q-order": {"answer": ["backbone", "neck", "head"], "hints": ["…", "…", "…"]},
    "q-shape": {"answer": "(1, 256, 20, 20)", "hints": ["…", "…", "…"], "verification": "derived", "refs": [{"path": "src/model.py", "start": 10, "end": 14}]},
    "cap-review": {"answer": "参考审查结论", "hints": ["…", "…", "…"], "rubric": ["评分要点"],
      "risks": [{"id": "stride-mismatch", "path": "src/model.py", "line": 11, "desc": "风险及其后果"}]}
  }
}
```

`answers` 的键集合与 `course.questions` 完全一致。每项字段：`answer`、`hints`、`rubric?`、`refs?`、`risks?`、`verification?`。

- `hints` 恰好 3 条，由浅到深，均不直接给出答案。
- `answer`：`locate` 为 `{path, start, end}`；`order` 为 `items` 的一个排列；其余题型为非空文本。
- `rubric`：`explain`、`design`、`forecast`、`review` 必填非空字符串数组。
- `refs`：支撑答案的源码位置 `[{path, start, end}]`。路径须在本次扫描中，行号在文件内（`locate` 答案同样要求），行号从 1 开始且包含首尾。
- `risks`：仅 `review` 使用且至少一项，`{id, path, line, desc}`。`path` 等于 diff 文件；`line` 是**改动后文件**的行号，落在某个 hunk 的新行范围内。删除造成的风险指向删除处相邻的保留行。
- `verification`：`predict` 必填，其他题型的答案经探针验证时也可填写。`measured` 表示探针已按用户同意实际运行成功，题目须登记 `probe`；`derived` 表示按源码推导、未实测。
- 发布器写入顶层 `snapshots`，记录 `locate` 答案与 `refs` 所指源码行的摘要，用于过期检查。候选中可省略，带入的旧值会被重新计算。

## 索引

`courses/index.json`：`{"version":1,"courses":[{"id","title","goal","path":"courses/<id>/course.json","updatedAt"}]}`，由发布器维护，`updatedAt` 取 `project.generatedAt`。

## 发布与过期检查

```sh
node "<plugin>/scripts/publish-course.mjs" "<repo>" "<候选目录>"
node "<plugin>/scripts/publish-course.mjs" "<repo>" "<候选目录>" --update --expected-hash <旧课程 SHA256>
node "<plugin>/scripts/check-course.mjs" "<repo>" <课程-id>
```

- 候选目录是完整版本：更新时需要保留的探针也放入候选 `probes/`。
- `--expected-hash` 是已发布 `course.json` 与 `key.json` 原始字节依次拼接的 SHA256，即 `check-course` 输出的 `digest`。读取旧课程时记录它。
- 更新前的 course、key、progress 与探针备份到 `history/courses/<id>/<hash>/`；同名备份内容不同时追加内容摘要后缀。
- `check-course` 输出 JSON：`{id, ok, digest, commit{course,current}, staleQuestions[{qid,lesson,reasons[]}], staleReadings[{lesson,topic,evidence?,reason}], errors[], warnings[]}`。`ok` 为 `false` 时退出码为 1，JSON 仍然完整输出。仅 commit 变化不算过期。命令无法执行时只向标准错误输出原因。
- 过期检查依据 diff 与磁盘的匹配、`snapshots` 以及讲义证据代码。没有 `refs` 的非 `locate`、无 diff 的题目无法检测过期。

更新后的进度：题目的题型、归属、能力、题面、`items`、`diff`、`answer`、`rubric` 或 `risks` 变化视为内容变化，删除其作答记录（旧记录在备份中）。仅改提示、`refs`、`verification`、`probe` 不算。正式题增删或变化使该课 `passed` 回到 `pending`；正式题或跳课测变化使 `tested-out` 回到 `pending`；`in-progress` 与 `skipped` 保留。变化的结业题清空对应结业原文。

## progress.json 与进度事件

```json
{
  "version": 1, "courseId": "vit-in-detector", "courseDigest": "<sha256>",
  "lessons": {"backbone-flow": {"status": "pending"}},
  "attempts": [{"qid": "q-order", "at": "ISO 时间", "result": "correct", "hintsUsed": 0, "note": ""}],
  "weak": [],
  "capstone": {"blueprint": null, "reviewFindings": null}
}
```

只通过脚本写入，一次一个事件。事件文件建议放在 `.bridge/work/`：

```sh
node "<plugin>/scripts/record-progress.mjs" "<repo>" <课程-id> "<事件 JSON>"
```

成功时输出当前 `lessons` 与 `weak`。

| 事件 | 格式 |
| --- | --- |
| 作答 | `{"type":"attempt","qid":"q-order","result":"correct","hintsUsed":0,"note":"可选"}` |
| 课状态 | `{"type":"lesson-status","lesson":"backbone-flow","status":"in-progress"}` |
| 结业原文 | `{"type":"capstone","blueprint":"用户原文"}` 或 `{"type":"capstone","reviewFindings":"用户原文"}`，可同时提供 |

- `result` 为 `correct`、`partial`、`missed`；`hintsUsed` 为 0–3。每道题得出本轮最终结果后记录一条。时间由脚本写入。
- 跳课测题只能在该课 `pending` 且此前各课已完成时记录；正式题只能在该课 `in-progress` 时记录；结业题与结业原文要求全部课为 `passed`、`tested-out` 或 `skipped`。同一结业字段再次提交会覆盖，提交时给出完整原文。

状态转移：

| 从 | 到 | 条件 |
| --- | --- | --- |
| `pending` | `in-progress` | 此前各课均为 `passed`、`tested-out` 或 `skipped` |
| `pending` | `tested-out` | 同上；本课有跳课测，每道都有作答且全部记录为 `correct`、`hintsUsed: 0` |
| `pending`、`in-progress` | `skipped` | 用户明确要求跳过 |
| `in-progress` | `passed` | 每道正式题都有作答，且最近一次结果不是 `missed` |
| `skipped`、`tested-out` | `in-progress` | 用户回来学习；此前各课条件同上 |

`passed` 是终态。变式重练的结果记在原题 `qid` 上，`note` 写明变式题面；最近一次结果决定是否达标。

`weak` 由脚本计算：正式题与结业题中最近结果为 `partial` 或 `missed` 的题目所属能力。跳课测不计入。
