# Bridge 数据契约

生成 `<仓库>/.bridge/analysis.json`。所有仓库文件路径使用相对根目录的 POSIX 风格 `/`，不能使用绝对路径、`..` 或反斜杠。所有面向读者的说明使用用户语言；代码标识符保持原文。

## 顶层结构

```json
{
  "version": 1,
  "project": {
    "name": "仓库目录名",
    "root": "解析后的绝对仓库路径",
    "commit": "完整 Git commit 或 null",
    "generatedAt": "ISO 8601 时间",
    "fileCount": 1
  },
  "nodes": [],
  "evidence": {},
  "views": []
}
```

`root`、`commit` 和 `fileCount` 必须与扫描结果一致，其中 `fileCount` 也必须等于文件节点数。目标不是 Git 工作树根目录时 `commit` 为 `null`，不能继承外层仓库或根据归档来源猜测 commit。不得收录原型中的示例文件数。

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
- 文件树必须精确覆盖 `scan.json.files`，不能遗漏、添加或重复路径。

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

## 调用视图

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

## scan.json

扫描器生成 `version`、`project.root`、`project.commit`、`files`、`directories`、`warnings` 和 `excluded`。只有目标本身是 Git 工作树根目录时记录其 HEAD；其他情况 `commit` 为 `null`。分析者只消费清单，不手工修改扫描结果来掩盖漏文件。源码在扫描后发生变化时重新扫描并复核证据。
