<div align="center">

# Bridge

**Connecting humans and AI through shared understanding.**

</div>

Bridge 致力于通过建立共同理解，连接人与 AI。

当 AI 越来越深入地参与软件开发，真正的协作障碍不再只是 AI 能否写出代码，也在于人能否理解 AI 将要修改什么、已经改变了什么，以及这些改动为什么发生。Bridge 希望弥合这道理解上的鸿沟，让人与 AI 在相同的代码上下文中协作。

## 为什么需要 Bridge

对齐不应该只有 AI 向人类靠拢这一个方向。

RLHF 等方法让 AI 更好地理解人的意图、价值观与偏好；而在人与 AI 共同开发项目时，人也需要建立足够的代码理解，才能提出清晰的指令、判断修改是否合理，并对结果负责。

这里的“人向 AI 靠拢”，不是要人像AI一样地思考、说话，而是帮助人获得与 AI 协作所需的共同上下文：代码如何组织，功能如何运行，改动会影响什么。

> 先理解仓库，再指挥修改；先共享上下文，再讨论下一步。


## 核心目标

- **理解已有代码**：帮助人类理解代码仓库，快速建立对项目结构、核心模块和主要运行流程的整体认识。
- **理解 AI 的改动**：帮助人理解 AI 每次运行中产生的修改、修改的原因及其影响，让 AI 的行动保持透明。
- **建立共同上下文**：连接人的意图、代码现实与 AI 的行动，使指令、修改和反馈都能建立在共同理解之上。

Bridge 最终希望形成这样的协作闭环：

**理解已有代码 → 指挥 AI 修改 → 理解改动及影响 → 审查、反馈与纠正。**

**更好的理解，成就更好的代码。**

## 安装 Bridge 插件

Bridge 现在以多客户端插件交付：原生客户端使用自带插件管理器，其他客户端使用 `install.sh` / `install.ps1`。插件提供 `bridge`、`explore`、`course`、`tutor` 四个 Skill，共享脚本及页面资产；主题结果、课程与学习进度保存在目标仓库的 `.bridge/`。需要 Node.js 22+。

以 Codex 为例，在任意目录添加远程插件市场并安装，无需手动 clone Bridge：

```sh
codex plugin marketplace add ShirlyTaylor73/Bridge
codex plugin add bridge@bridge-marketplace
```

客户端会直接从 [GitHub 仓库](https://github.com/ShirlyTaylor73/Bridge) 获取插件。

安装后在待分析仓库开启新会话，要求“使用 Bridge 插件分析当前仓库”。完整客户端列表、原生安装命令及兼容脚本见 [安装说明](docs/installation.md)。`bridge` 与 `explore` 的实际验证范围见 [验收记录](docs/bridge_explore_validation.md)；该记录不覆盖 `course` 与 `tutor`。

开发检查：`npm run check`；隔离测试：`npm test`。无需安装 npm 依赖。

## 使用 Bridge

Bridge 提供四个 Skill：`bridge` 建立仓库概览，`explore` 开展主题探索，`course` 按改动目标出课，`tutor` 上课与批改。首次使用时，在**目标仓库**的新会话中运行：

```text
使用 Bridge 的 bridge Skill 建立当前仓库的文件树和职责概览。
```

`bridge` 会生成基础文件树并初始化 Dashboard。概览已经存在时，再次调用会复用已有数据；只有明确要求刷新概览时才重新扫描。

完成初始化后，使用 `explore` 调研具体的调用关系或架构问题：

```text
使用 Bridge 的 explore Skill，调研训练脚本从数据加载到训练循环的整体关系。
```

`explore` 会先读取主题索引。新问题会新增一个使用语义命名的主题，例如 `training-pipeline`；明确追问已有主题时沿用原主题并备份旧结果。相似主题无法判断是否延续时，会列出候选供选择。新增主题只写入自己的结果和索引，不修改基础树、页面资产或其他主题。

### 在让 AI 改代码之前先学会审核

当你打算让 AI 做一项自己还看不懂的改动时，用 `course` 围绕这个目标出课：

```text
使用 Bridge 的 course Skill：我打算让 AI 在这个检测模型里引入 ViT，帮我出一门课，让我能看懂并审核这项改动。
```

课程目标是让你能理解并审核改动，不要求你自己写实现代码。`course` 先从目标推导能力图、课程顺序、“不学”清单和结业任务，经你确认后才生成题目；缺少的讲义按 explore 方式新增为主题。需要运行目标代码来核实答案时，它会先列出命令、依赖和预计耗时，征得同意后才编写并运行探针；未实测的结论会标明按源码推导。

出课后用 `tutor` 上课，随时可以中断，之后从记录的进度继续：

```text
使用 Bridge 的 tutor Skill，开始（或继续）刚才的课程。
```

`tutor` 在对话中逐题出题、批改并给出分级提示。默认达标才进下一课，你也可以明确跳过，或先做跳课测。结业包含一份变更蓝图和一次模拟 diff 审查演练。课程保存在 `.bridge/courses/<课程-id>/`，答案键与题面分开存放，但同在本地磁盘，作答前请勿打开 `key.json`。Dashboard 目前不展示课程。源码变化后，上课前的检查会报告过期题目，可让 `course` 更新课程。

支持命名空间命令的客户端可使用 `/bridge:bridge`、`/bridge:explore`、`/bridge:course`、`/bridge:tutor`；Kimi 对应 `/skill:bridge:bridge`、`/skill:bridge:explore`、`/skill:bridge:course`、`/skill:bridge:tutor`。

页面通过本地 HTTP 服务查看，Skill 会提供访问地址。也可手动启动：

```sh
node /path/to/Bridge/scripts/serve-dashboard.mjs /path/to/target-repository
# 固定端口可追加 --port 8765
```

服务仅绑定 `127.0.0.1`，默认自动选择端口。页面刷新后读取主题索引，选择主题时按需加载独立结果。
