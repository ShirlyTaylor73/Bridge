#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '/*__BRIDGE_DATA__*/';

function usage() {
  console.error('用法：node render-dashboard.mjs <project-root> [analysis] [scan] [template] [output]');
  process.exit(1);
}

function serializeForScript(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function render() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 5) usage();
  const root = fs.realpathSync(path.resolve(args[0]));
  if (!fs.statSync(root).isDirectory()) throw new Error('project-root 不是目录');
  const bridgeDirectory = path.join(root, '.bridge');
  const analysisPath = args[1] ? path.resolve(args[1]) : path.join(bridgeDirectory, 'analysis.json');
  const scanPath = args[2] ? path.resolve(args[2]) : path.join(bridgeDirectory, 'scan.json');
  const templatePath = args[3]
    ? path.resolve(args[3])
    : fileURLToPath(new URL('../assets/dashboard.html', import.meta.url));
  const outputPath = args[4] ? path.resolve(args[4]) : path.join(bridgeDirectory, 'index.html');
  const validatorPath = fileURLToPath(new URL('./validate-analysis.mjs', import.meta.url));

  const validation = spawnSync(
    process.execPath,
    [validatorPath, root, analysisPath, scanPath],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  if (validation.error) throw new Error(`调用 validate-analysis.mjs 失败：${validation.error.message}`);
  if (validation.status !== 0) {
    if (validation.stdout) process.stdout.write(validation.stdout);
    if (validation.stderr) process.stderr.write(validation.stderr);
    process.exitCode = 1;
    return;
  }

  const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
  const template = fs.readFileSync(templatePath, 'utf8');
  const firstPlaceholder = template.indexOf(PLACEHOLDER);
  const lastPlaceholder = template.lastIndexOf(PLACEHOLDER);
  if (firstPlaceholder === -1 || firstPlaceholder !== lastPlaceholder) {
    throw new Error(`模板必须且只能包含一次 ${PLACEHOLDER}`);
  }
  const html = template.replace(PLACEHOLDER, () => serializeForScript(analysis));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Dashboard 已生成：${outputPath}`);
}

try {
  render();
} catch (error) {
  console.error(`渲染失败：${error.message}`);
  process.exitCode = 1;
}
