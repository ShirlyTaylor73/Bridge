#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './scan-repository.mjs';
import { validateExploration } from './lib/validation.mjs';
import { readJson, json, outputRoot, initialized, readIndex, withLock, transaction, safeOutput, digest } from './lib/storage.mjs';

export async function publishExploration(directory, candidate, { update = false, expectedHash } = {}) {
  const { root, bridge } = outputRoot(directory);
  initialized(bridge);
  const data = readJson(candidate);
  return withLock(bridge, lock => {
    const index = readIndex(bridge), scan = scanRepository(root);
    validateExploration(root, data, scan);
    const position = index.topics.findIndex(item => item.id === data.id);
    const relative = `explorations/${data.id}.json`, target = safeOutput(bridge, relative);
    if (!update && (position !== -1 || fs.existsSync(target))) throw new Error('主题已存在，请选择更新已有主题或细化新主题名称');
    if (update && position === -1) throw new Error('待更新主题不存在');
    const entries = [];
    if (update) {
      const previous = fs.readFileSync(target);
      if (!expectedHash || expectedHash !== digest(previous)) throw new Error('更新需要 --expected-hash，且须匹配读取的旧主题；请重新读取目标主题');
      const backup = `history/${data.id}/${digest(previous)}.json`;
      if (!fs.existsSync(safeOutput(bridge, backup))) entries.push([backup, previous]);
    }
    const item = { id: data.id, title: data.title, summary: data.summary, keywords: data.keywords, path: relative, updatedAt: data.project.generatedAt };
    if (update) index.topics[position] = item; else index.topics.push(item);
    entries.push([relative, json(data)], ['explorations/index.json', json(index)]);
    transaction(bridge, lock, entries);
    return relative;
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, candidate, ...args] = process.argv.slice(2);
    const update = args[0] === '--update';
    if (!root || !candidate || (args.length && !(args.length === 3 && update && args[1] === '--expected-hash'))) throw new Error('用法：node publish-exploration.mjs <仓库> <候选 JSON> [--update --expected-hash <旧文件 SHA256>]');
    console.log(await publishExploration(root, candidate, { update, expectedHash: args[2] }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
