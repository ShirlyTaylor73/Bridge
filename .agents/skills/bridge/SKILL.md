---
name: bridge
description: Analyze a code repository and generate an interactive Bridge HTML dashboard with a complete classified file tree, source-grounded call-flow views, annotated code evidence, and precise VS Code links. Use when the user wants to understand a repository's structure or execution flow through a visual report.
---

# Bridge

Generate a source-grounded repository understanding dashboard without changing repository source files. Use the fixed dashboard asset; do not redesign the page for each repository.

## Workflow

1. Read [references/analysis-workflow.md](references/analysis-workflow.md) and [references/data-contract.md](references/data-contract.md). Resolve the user-supplied repository path, or use the current working directory. All analysis output belongs in that repository's `.bridge/` directory.
2. Run `scan-repository.mjs` from `scripts/` next to this file, passing the repository root. Read the resulting scan and warnings. Never read files excluded as secrets to make them part of the report.
3. Read actual source and produce `.bridge/analysis.json` following the data contract. Cover every retained text file in the tree. Derive call views from confirmed entry points and execution paths rather than copying example repository names or flows.
4. Run `validate-analysis.mjs`, fix all reported data or evidence errors, then run `render-dashboard.mjs`. Do not edit `assets/dashboard.html` or bypass validation to force output.
5. Open the generated `.bridge/index.html` in a real browser when browser tooling is available. Check the base tree and every call view against [references/prototype-contract.md](references/prototype-contract.md), verify content completeness and interactions, and correct the analysis or implementation before final delivery.

Report the generated HTML path, analyzed file/view counts, and unresolved warnings. The result is a static snapshot, not a proof of complete dynamic call coverage. Do not claim that external VS Code launching was tested unless it was actually exercised.
