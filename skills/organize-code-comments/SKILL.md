---
name: organize-code-comments
description: 按功能块整理复杂或较长函数，为每块添加整体用途说明，为块内复杂逻辑补充真正的行内注释，并用空行分隔同级和嵌套功能块。适用于用户要求整理代码、补注释、提高审核可读性且保持行为不变的任务；不自动扩展为架构重构或修复逻辑。
---

# 代码分块与注释整理

让读者能先通过块注释看懂执行阶段，再通过行内注释理解关键细节。采用用户指定的分块风格，不把复杂函数变成逐行翻译。

## 整理规则

- 先读完整目标函数及必要的被调用代码，按实际职责划分连续功能块，如校验、初始化、通信、启动、收尾。不要只按固定行数分组。
- 每个功能块前用一行独立注释概括该块整体用途，说明“这一块完成什么”。块说明应覆盖实际代码；代码移出该块时同步修正说明。
- 每个功能块结束后，与下一个功能块之间必须空一行。块注释紧贴所属代码，不在注释与其代码之间插空行。
- 嵌套层级也要分块：若 `with`、`if`、`for`、`try` 等下面开始一个有独立块说明的功能块，在外层语句和内层块说明之间空一行。不要遗漏 `with lock:` 后紧接内层注释的情况。简单短分支不强制人为加块。
- 块内遇到不直观的逻辑，在相关语句末尾添加真正的行内注释，例如 `statement  # Why this matters.`。独占一行的说明不算行内注释，不能只写块注释就声称已完成。
- 行内注释解释原因、语义、边界或不变量，例如终态后线程仍存活、资源归属、游标起点、源码版本绑定；不重复显而易见的赋值或函数名。
- 复合条件或推导式过长时，可以在保持求值顺序和语义的前提下换行，在对应分项后注释；不为塞入注释超出项目行长限制。
- 独立阶段应使用“空行 + 块说明 + 代码”；属于同一块的局部细节使用行内注释。避免连续堆叠几个用途重叠的独立注释。
- 代码注释默认用简短英文，用户明确要求其他语言时遵从；对用户的解释和项目文档遵从当前语言约定。

## 示例

以下示例展示布局；具体职责和注释内容必须依据实际代码，不照搬业务判断。

```python
def start(self, code):
    # Validate the graph before allocating execution resources.
    metadata = self._validate(code)
    self._targets(metadata, metadata["nodes"])

    # Protect the active-job check and registration from concurrent starts.
    with self.cv:  # The lock stays held until the job is registered.

        # Reject startup while an earlier job is active or still stopping.
        self._ensure_open()
        if any(
            job.status not in TERMINAL  # Logical execution has not ended.
            or job.thread.is_alive()  # Cleanup can outlast the terminal status.
            for job in self.jobs.values()
        ):
            raise ValueError("another job is active or still stopping")

        # Create the job with each node's defining source attached.
        nodes = {
            name: {**node, "code": code}  # Keep the original source across later patches.
            for name, node in metadata["nodes"].items()
        }
        job = self._create_job(nodes, metadata["entry"])

        # Initialize feedback tracking at the current ledger boundary.
        job.feedback_calls = len(self.robo._ledger.records)  # Next unread record index.

        # Register the job before returning its initial status.
        self.jobs[job.id] = job
        return self._status(job)
```

## 修改范围与交付检查

1. 限于用户指定的函数或文件。默认只改注释、空行和必要的表达式换行；不自行提取类/函数、改名、调整锁范围、改变异常路径或执行顺序。发现逻辑问题另行报告。
2. 一次检查完整目标范围，确保块说明、真正的行内注释、同级空行、嵌套块空行全部到位，不等待用户逐处指出。
3. 检查 diff，核对注释与实现一致、没有误删内容或无关格式化。纯注释和排版不新增测试，也不运行评测；按项目要求完成必要静态检查。若改动表达式布局，特别检查缩进和语义不变。
4. 遵循仓库的提交规则；不要把个人 skill 或其他仓库文件混入当前项目提交。交付时给出文件位置，简述实际修改和验证，不声称未做过的测试。
