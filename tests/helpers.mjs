import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { packageRoot } from '../scripts/check-package.mjs';

export function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge 中文 '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export function copyPackage(target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['plugin.json', 'package.json', 'kimi.plugin.json', 'gemini-extension.json', '.claude-plugin', '.codex-plugin', '.copilot-plugin', '.agents/plugins', 'skills', 'scripts', 'install.sh', 'install.ps1']) {
    fs.cpSync(path.join(packageRoot, name), path.join(target, name), { recursive: true });
  }
  return target;
}
export function node(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
  return result.stdout;
}
export function fixture(root, scripts) {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'main.js'), 'function greet() { return "hello"; }\ngreet();\n');
  node([path.join(scripts, 'scan-repository.mjs'), root], os.tmpdir());
  const scan = JSON.parse(fs.readFileSync(path.join(root, '.bridge/scan.json')));
  const data = {
    version: 1,
    project: { name: '独立测试仓库', ...scan.project, generatedAt: '2026-01-01T00:00:00Z', fileCount: scan.files.length },
    nodes: [{ id: 'file:main.js', name: 'main.js', path: 'main.js', kind: 'file', summary: '定义问候函数并从模块入口调用。', category: 'core', entry: '主入口' }],
    evidence: { entry: { path: 'main.js', role: '调用点', symbol: 'greet()', start: 1, end: 2, highlight: [2, 2], code: 'function greet() { return "hello"; }\ngreet();', annotation: '模块加载后调用问候函数。' } },
    views: [{ id: 'cli', name: '问候入口', desc: '模块执行过程', icon: 'play', phases: [{ title: '执行', desc: '启动调用', steps: [{ key: 'entry' }] }] }],
  };
  fs.writeFileSync(path.join(root, '.bridge/analysis.json'), JSON.stringify(data));
  return data;
}
