---
name: explore
description: Explore a specific code execution flow or architecture question in an initialized Bridge repository and save an independent topic view. Use to investigate training pipelines, data loading, request handling, or deepen an existing exploration. Discover related topics from the index before choosing a new or existing topic.
---

# Bridge 按主题探索

根据用户的问题调研代码调用关系，在已有 Bridge 页面中追加独立主题，或深化用户选择的已有主题。

## 资源与前置条件

解析本 SKILL.md 的真实路径，向上两级得到 `<plugin>`，引用其共享 scripts 和 references。目标仓库使用用户路径或会话原工作目录。检查 `.bridge/base/tree.json` 和 `.bridge/explorations/index.json`，缺少时提示先运行 bridge，结束本次探索。

## 先发现主题

读取 `explorations/index.json`，按标题、摘要、关键词与用户问题匹配：

- 用户明确选择主题或明确延续上一主题：读取该主题文件，沿用 ID。记录原文件 SHA256，供发布时检测并发修改。
- 有相似主题但扩展意图不明确：列出标题、摘要及文件名，确认扩展已有主题还是新增独立主题。
- 新主题：按内容取英文 kebab-case ID，配中文标题，例如 `training-pipeline`（训练整体流程）、`training-data-loading`（训练数据加载）。名称冲突时细化语义。

这一步只查索引；源码调研与检查仅针对用户选定的主题。其他已保存探索保持原样。

## 调研与发布

1. 阅读 [数据契约](../../references/data-contract.md) 和 [探索工作流](../../references/analysis-workflow.md)。扫描输出写到 `.bridge/work/<主题-id>-scan.json`：`node "<plugin>/scripts/scan-repository.mjs" "<repo>" "<repo>/.bridge/work/<主题-id>-scan.json"`。根据本次问题从保留的源码中寻找入口与调用链，可包含基础树之后新增的文件。
2. 保存完整候选到 `.bridge/work/<主题-id>-candidate.json`，包含问题、主题元数据、分析版本、阶段及本主题全部证据。更新主题时保留仍相关的学习主线，并检查候选中的全部源码证据。
3. 新主题：`node "<plugin>/scripts/publish-exploration.mjs" "<repo>" "<candidate>"`。
4. 明确更新：同一命令增加 `--update --expected-hash <读取旧主题时的SHA256>`。可用 Node.js `crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')` 计算。冲突时重新读取用户选中的主题后协调修改。
5. 发布脚本负责验证、备份、主题写入与索引更新。校验失败只修正本次候选。正常新增不调用基础树发布或页面升级命令。
6. 提供运行中服务的 `?view=<主题-id>` URL；需要时启动 `node "<plugin>/scripts/serve-dashboard.mjs" "<repo>"`。刷新网页即可读取新主题。在可用浏览器中核对本次主题和源码展开内容。

最终汇报新建/更新的主题、文件路径、访问 URL、关键发现与分析中的未决问题。仅向目标 `.bridge/` 写入分析产物。
