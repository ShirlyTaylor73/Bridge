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

Bridge 现在以多客户端插件交付：原生客户端使用自带插件管理器，其他客户端使用 `install.sh` / `install.ps1`。插件提供 `bridge` 和 `explore` 两个 Skill，共享脚本及页面资产；结果按主题保存在目标仓库的 `.bridge/`。需要 Node.js 22+。

以 Codex 为例，在任意目录添加远程插件市场并安装，无需手动 clone Bridge：

```sh
codex plugin marketplace add ShirlyTaylor73/Bridge
codex plugin add bridge@bridge-marketplace
```

客户端会直接从 [GitHub 仓库](https://github.com/ShirlyTaylor73/Bridge) 获取插件。

安装后在待分析仓库开启新会话，要求“使用 Bridge 插件分析当前仓库”。完整客户端列表、原生安装命令及兼容脚本见 [安装说明](docs/installation.md)，0.2.0 实际验证范围见 [验收记录](docs/bridge_explore_validation.md)。

开发检查：`npm run check`；隔离测试：`npm test`。无需安装 npm 依赖。

## 0.2.0：建立概览，再按主题探索

在目标仓库的新会话中：

1. **建立概览**：“使用 Bridge 的 bridge Skill 建立当前仓库的文件树和职责概览。”
2. **新增主题**：“使用 Bridge 的 explore Skill，调研训练脚本从数据加载到训练循环的整体关系。”
3. **深化主题**：“继续深化 training-pipeline，补充训练循环中的异常处理。”

支持命名空间命令的客户端可使用 `/bridge:bridge`、`/bridge:explore`；Kimi 对应 `/skill:bridge:bridge`、`/skill:bridge:explore`。具体入口见安装说明。

探索使用中文标题与语义文件名，例如 `explorations/training-pipeline.json`。Agent 先查主题索引；相似主题意图不明确时请你选择，明确追问沿用原文件。新增探索保持基础树、页面资产和旧主题原样；显式更新会备份该主题。再次调用 bridge 默认打开已有页面，刷新概览需明确提出。

页面通过本地 HTTP 服务查看，Skill 会提供访问地址。也可手动启动：

```sh
node /path/to/Bridge/scripts/serve-dashboard.mjs /path/to/target-repository
# 固定端口可追加 --port 8765
```

服务仅绑定 `127.0.0.1`，默认自动选择端口。页面刷新后读取主题索引，选择主题时加载独立结果。本版使用全新初始化的 `.bridge/`；旧版报告可先移到其他目录保留。
