# Bridge 0.2.0 数据契约

所有源码路径相对目标仓库，采用 POSIX `/`，说明使用用户语言。

## 基础树

候选由 bridge 生成；发布至 `.bridge/base/tree.json`：

```json
{"version":2,"project":{"name":"项目名","root":"仓库真实绝对路径","commit":null,"generatedAt":"2026-10-30T00:00:00Z","fileCount":1},"nodes":[]}
```

project.root、commit 与当前扫描一致，fileCount 等于扫描文件数。目录与文件职责覆盖完整清单。基础树没有 evidence 和 views。

## 独立探索

候选由 explore 生成；发布至 `.bridge/explorations/<id>.json`：

```json
{
  "version": 2,
  "id": "training-pipeline",
  "title": "训练整体流程",
  "summary": "从命令参数到数据加载和训练循环",
  "keywords": ["训练", "train", "数据加载"],
  "question": "训练脚本如何组织整体调用关系？",
  "project": {"root":"仓库真实绝对路径","commit":null,"generatedAt":"2026-10-30T00:00:00Z"},
  "evidence": {},
  "phases": []
}
```

ID 使用有语义的英文 kebab-case，最长 80 字符，避开 base、index。每个文件是一份自包含主题；没有 nodes、views 或 fileCount。phases 与 evidence 规则见下文。commit/root 来自本次扫描，时间使用实际 ISO 时间。同名证据可在不同主题独立使用。

## 索引与更新

`.bridge/explorations/index.json`：`{"version":2,"topics":[{"id":"training-pipeline","title":"训练整体流程","summary":"…","keywords":["训练"],"path":"explorations/training-pipeline.json","updatedAt":"ISO 时间"}]}`。

发布脚本维护索引；Agent 只写候选。新主题新增文件，更新使用 `--update --expected-hash <旧主题SHA256>`，保留 ID 并备份原内容到 history/<id>/。源码校验只覆盖当前候选。

## 扫描

`scan-repository.mjs` 默认写 `.bridge/work/scan.json`，也可显式指定当前主题的工作文件。扫描输出包含 version、project、files、directories、warnings、excluded。只读取保留文件；发布时重新扫描，以实际文件验证本次候选。扫描独立于旧探索数据。

## 文件树节点

`nodes` 是递归数组。目录节点包含 `children`，文件节点不包含：

```json
{
  "id": "file:src/main.py",
  "name": "main.py",
  "path": "src/main.py",
  "kind": "file",
  "summary": "解析命令参数并启动任务。",
  "category": "core",
  "entry": "主入口"
}
```

- `id` 在整棵树唯一，推荐使用 `dir:<path>` 和 `file:<path>`。
- `name` 是路径最后一段；目录 `path` 对应真实父目录，文件 `path` 精确匹配 `scan.json`。
- 每个目录和文件均有具体 `summary`，说明其职责而非复述名称。
- 文件 `category` 只能是 `core`、`adapter`、`data`、`infra`、`utility`、`test`、`docs`。依次表示核心业务、接口适配、数据模型、基础设施、通用工具、测试、文档。选择主要角色，不新增分类。
- `entry` 仅用于真实入口，使用“主入口”“HTTP 入口”“前端入口”等短标签；没有入口时省略。
- 目录可设 `open: true` 让首层默认展开。不要为目录设置 `category` 或 `entry`。
- 基础文件树必须精确覆盖 `本次 scan.json.files`，不能遗漏、添加或重复路径。

## 代码证据

`evidence` 是以稳定 key 为索引的对象。同一真实代码位置可在多个视图复用：

```json
{
  "main-entry": {
    "path": "src/main.py",
    "role": "调用点",
    "symbol": "main()",
    "start": 10,
    "end": 14,
    "highlight": [12, 12],
    "code": "def main():\n    config = load_config()\n    app = App(config)\n    app.run()\n    return 0",
    "annotation": "App 接收已加载的配置，run() 才开始实际任务。"
  }
}
```

- `role` 可为“调用点”“目标定义”“HTTP 客户端”“SSE 路由”“回调绑定”等真实角色。
- `symbol` 写实际类、函数、方法或模块初始化位置，包括必要的 owning class。
- `start`/`end` 是包含首尾的 1-based 行号；`code` 必须逐字等于磁盘上这些行，保持缩进和空行。不要包含行号前缀或省略号。
- `highlight` 是关键行起止范围，必须落在源码范围内。卡片显示其首行内容。
- `annotation` 是独立 Agent 注释，解释对象来源、调用目的、参数、并发或资源语义，不修改源码，不逐行复述。
- 每份证据至少被一个步骤或 `extra` 引用。适量截取能帮助理解的连续源码，不把整个大文件嵌入报告。

## 探索阶段与步骤

以下是内部视图结构示意；独立探索文件只采用其中的 `phases`，主题标题等使用上方字段。

```json
{
  "id": "cli",
  "name": "CLI 任务执行",
  "desc": "从命令入口理解主链路",
  "icon": "play",
  "phases": [
    {
      "title": "入口与初始化",
      "desc": "从参数到应用对象",
      "steps": [
        {"key": "main-entry"},
        {
          "key": "app-run",
          "kind": "calls",
          "via": "app.run()",
          "object": "app: App",
          "extra": ["factory-binding"]
        }
      ]
    }
  ]
}
```

- `id` 唯一且不能为 `base`；`icon` 只能是 `play` 或 `dashboard`。
- `name`/`desc` 来自真实仓库。普通执行流程用 `play`，浏览器监控类视图用 `dashboard`。
- 每个视图至少一个阶段，每个阶段至少一个步骤。阶段按学习任务组织，不为了凑数量拆阶段。
- `key` 引用 `evidence`。阶段第一步通常省略 `via`；其余步骤必须填写 `via`，描述进入该位置的实际调用或流程原因。
- `kind` 默认为 `calls`，可选 `http`、`callback`、`sequence`。直接函数调用和实例调用都用 `calls`，在 `via`/`object` 中明确实例；协议调用用 `http`；注入回调用 `callback`；仅表示执行先后用 `sequence`。
- `object` 写承接调用的变量、属性及可确认类型，如 `planner: ApiAgentLoop`；无法确认时省略，不编造。
- `extra` 是附加证据 key 数组。回调步骤必须提供绑定位置；目标定义应在相邻步骤或附加证据中出现。
- HTTP 客户端、路由和 SSE 应是不同证据位置，不把 URL 字符串当作普通函数调用。

