#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

export const packageRoot = fileURLToPath(new URL('../', import.meta.url));

export function checkPackage(directory = packageRoot) {
  const root = fs.realpathSync(directory);
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  const inside = (reference) => {
    assert.equal(typeof reference, 'string');
    assert.ok(reference.startsWith('./'), `引用必须以 ./ 开头：${reference}`);
    const resolved = fs.realpathSync(path.resolve(root, reference));
    const relative = path.relative(root, resolved);
    assert.ok(!relative.startsWith('..') && !path.isAbsolute(relative), `引用逃逸插件：${reference}`);
    return resolved;
  };
  const manifest = read('plugin.json');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.equal(manifest.name, 'bridge');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description);
  for (const file of ['.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.copilot-plugin/plugin.json', 'kimi.plugin.json', 'gemini-extension.json', 'package.json']) {
    const data = read(file);
    assert.equal(data.name, manifest.name, `${file}: name`);
    assert.equal(data.version, manifest.version, `${file}: version`);
    if (file !== 'gemini-extension.json' && file !== 'package.json') {
      assert.equal(data.skills, './skills/');
      inside(data.skills);
    }
  }
  const pkg = read('package.json');
  assert.deepEqual(pkg.pi.skills, ['./skills']);
  pkg.pi.skills.forEach(inside);
  for (const file of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
    const data = read(file);
    assert.equal(data.name, 'bridge-marketplace');
    assert.equal(data.plugins.length, 1);
    assert.equal(data.plugins[0].name, manifest.name);
    const source = data.plugins[0].source;
    assert.equal(inside(typeof source === 'string' ? source : source.path), root);
    if (data.plugins[0].version) assert.equal(data.plugins[0].version, manifest.version);
  }
  const skill = fs.readFileSync(inside('./skills/bridge/SKILL.md'), 'utf8');
  assert.match(skill, /^---\r?\nname: bridge\r?\ndescription: .+\r?\n---/);
  for (const name of ['scripts/scan-repository.mjs', 'scripts/validate-analysis.mjs', 'scripts/render-dashboard.mjs', 'assets/dashboard.html', 'references/analysis-workflow.md', 'references/data-contract.md', 'references/prototype-contract.md']) {
    assert.ok(fs.statSync(inside(`./skills/bridge/${name}`)).isFile());
  }
  assert.ok(!fs.existsSync(path.join(root, '.agents/skills/bridge')), '旧 Skill 入口必须移除');
  // 宿主声明的任意 ./ 引用均须存在且留在包内。
  function references(value) {
    if (typeof value === 'string' && value.startsWith('./')) inside(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(references);
  }
  for (const file of ['plugin.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json', '.copilot-plugin/plugin.json', 'kimi.plugin.json', 'gemini-extension.json']) references(read(file));
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const manifest = checkPackage(process.argv[2]);
    console.log(`插件声明检查通过：${manifest.name} ${manifest.version}`);
  } catch (error) {
    console.error(`插件声明检查失败：${error.message}`);
    process.exitCode = 1;
  }
}
