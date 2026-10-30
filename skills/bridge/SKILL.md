---
name: bridge
description: Build or open a Bridge repository overview with a complete classified file tree and file responsibilities. Use for initial repository orientation or an explicitly requested overview refresh. For a specific execution-flow question, use the explore skill in this plugin.
---

# Bridge 仓库概览

为用户指定仓库建立基础文件树与职责概览，生成通过本地 HTTP 服务查看的 Dashboard。

## 资源定位

从本 SKILL.md 的**真实路径**向上两级得到插件根目录 `<plugin>`。兼容安装可能使用目录链接，先用 `realpath` 或 Node.js `fs.realpathSync` 解析本文件，再定位共用 `scripts/`、`assets/` 和 `references/`。目标仓库来自用户指定路径或会话原工作目录。

## 工作流

1. 检查 `<repo>/.bridge/base/tree.json`。若已有概览且用户未要求刷新，直接启动服务查看；明确刷新才重新分析基础树。主题探索交给本插件 `explore`。
2. 阅读 [数据契约](../../references/data-contract.md) 的“基础树”和“扫描”部分。运行 `node "<plugin>/scripts/scan-repository.mjs" "<repo>"`，读取 `.bridge/work/scan.json` 及排除警告。
3. 逐批读取保留的文本文件，为每个文件分类并撰写实际职责，构造完整目录树。保存 `.bridge/work/tree-candidate.json`，格式为 `version: 2`、`project`、`nodes`。本步骤只生成基础目录数据。
4. 运行 `node "<plugin>/scripts/publish-base.mjs" "<repo>" "<repo>/.bridge/work/tree-candidate.json"`。用户明确刷新时增加 `--refresh`；明确升级页面资产时使用 `--upgrade-page`。修正校验错误后重试。
5. 启动 `node "<plugin>/scripts/serve-dashboard.mjs" "<repo>"`，保留服务进程并给出实际输出的本地 URL。在可用浏览器中检查目录展开、文件选中、搜索与窄屏职责抽屉，参考 [页面契约](../../references/prototype-contract.md)。

最终说明访问地址、服务停止方法、文件数和扫描警告，并举例说明如何使用 explore 新增“训练整体流程”等主题。源码保持只读，分析产物位于目标 `.bridge/`。
