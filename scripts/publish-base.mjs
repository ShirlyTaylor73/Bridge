#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './scan-repository.mjs';
import { validateBase } from './lib/validation.mjs';
import { outputRoot, safeOutput, readJson, json, withLock, transaction } from './lib/storage.mjs';

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
export async function publishBase(directory, candidate, { refresh = false, upgradePage = false } = {}) {
  const { root, bridge } = outputRoot(directory);
  return withLock(bridge, lock => {
    const exists = fs.existsSync(safeOutput(bridge, 'base/tree.json'));
    if (exists && !refresh && !upgradePage) return '基础树已存在，可启动服务查看；显式刷新使用 --refresh';
    const entries = [];
    if (!exists || refresh) {
      if (!candidate) throw new Error('初始化/刷新需要基础树候选 JSON');
      const tree = readJson(candidate), scan = scanRepository(root);
      validateBase(root, tree, scan);
      entries.push(['base/scan.json', json(scan)], ['base/tree.json', json(tree)]);
    }
    if (!exists || upgradePage) {
      entries.push(['index.html', fs.readFileSync(path.join(assets, 'dashboard.html'))]);
      for (const file of ['dashboard.css', 'dashboard.js']) entries.push([`assets/${file}`, fs.readFileSync(path.join(assets, file))]);
    }
    if (!exists) entries.push(['explorations/index.json', json({ version: 2, topics: [] })]);
    transaction(bridge, lock, entries);
    return '基础树/页面已发布';
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flags = args.filter(arg => arg.startsWith('--')), positional = args.filter(arg => !arg.startsWith('--'));
  try {
    if (!positional[0] || positional.length > 2 || flags.some(flag => !['--refresh', '--upgrade-page'].includes(flag))) throw new Error('用法：node publish-base.mjs <仓库> [候选 JSON] [--refresh] [--upgrade-page]');
    console.log(await publishBase(positional[0], positional[1], { refresh: flags.includes('--refresh'), upgradePage: flags.includes('--upgrade-page') }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
