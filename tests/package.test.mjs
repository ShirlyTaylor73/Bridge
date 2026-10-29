import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkPackage } from '../scripts/check-package.mjs';
import { temporary, copyPackage, node, fixture } from './helpers.mjs';

test('独立插件副本在另一个工作目录中分析外部仓库', (t) => {
  const root = temporary(t);
  const plugin = copyPackage(path.join(root, '插件副本'));
  checkPackage(plugin);
  const target = path.join(root, '目标仓库');
  const scripts = path.join(plugin, 'skills/bridge/scripts');
  fixture(target, scripts);
  node([path.join(scripts, 'validate-analysis.mjs'), target], plugin);
  node([path.join(scripts, 'render-dashboard.mjs'), target], root);
  assert.ok(fs.readFileSync(path.join(target, '.bridge/index.html'), 'utf8').includes('问候入口'));
  assert.ok(!fs.existsSync(path.join(plugin, '.bridge')));
});
test('声明版本漂移和包外资源被拒绝', (t) => {
  const root = temporary(t);
  const plugin = copyPackage(path.join(root, '包'));
  const file = path.join(plugin, 'kimi.plugin.json');
  const data = JSON.parse(fs.readFileSync(file));
  fs.writeFileSync(file, JSON.stringify({ ...data, version: '9.0.0' }));
  assert.throws(() => checkPackage(plugin), /version/);
  fs.writeFileSync(file, JSON.stringify(data));
  const outside = path.join(root, 'outside');
  fs.renameSync(path.join(plugin, 'skills'), outside);
  fs.symlinkSync(outside, path.join(plugin, 'skills'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => checkPackage(plugin), /逃逸/);
});
