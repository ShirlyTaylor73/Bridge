import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
export const json = (data) => `${JSON.stringify(data, null, 2)}\n`;
export const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
export const topicPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export function topicId(id) {
  if (typeof id !== 'string' || !topicPattern.test(id) || id.length > 80 || ['index', 'base'].includes(id)) throw new Error('主题 ID 须为有语义的 kebab-case，最长 80 字符，且不能为 index/base');
  return id;
}
export function outputRoot(directory) {
  const root = fs.realpathSync(path.resolve(directory));
  const bridge = path.join(root, '.bridge');
  if (fs.existsSync(bridge) && (fs.lstatSync(bridge).isSymbolicLink() || !fs.statSync(bridge).isDirectory())) throw new Error('.bridge 必须为仓库内的真实目录');
  return { root, bridge };
}
export function safeOutput(bridge, relative) {
  const target = path.resolve(bridge, relative);
  const rel = path.relative(bridge, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('输出路径逃逸');
  let current = bridge;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`输出路径包含链接：${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}
export function initialized(bridge) {
  for (const relative of ['base/tree.json', 'base/scan.json', 'explorations/index.json', 'index.html']) {
    if (!fs.existsSync(safeOutput(bridge, relative))) throw new Error('请先运行 bridge 建立基础文件树');
  }
}
export function readIndex(bridge) {
  const index = readJson(safeOutput(bridge, 'explorations/index.json'));
  if (index.version !== 2 || !Array.isArray(index.topics)) throw new Error('主题索引格式无效');
  const seen = new Set();
  for (const item of index.topics) {
    topicId(item.id);
    if (seen.has(item.id) || item.path !== `explorations/${item.id}.json` || typeof item.title !== 'string' || typeof item.summary !== 'string' || !Array.isArray(item.keywords) || item.keywords.some(word => typeof word !== 'string')) throw new Error('主题索引条目无效');
    seen.add(item.id);
  }
  return index;
}
export async function withLock(bridge, action) {
  fs.mkdirSync(bridge, { recursive: true });
  const lock = safeOutput(bridge, '.publish-lock');
  const deadline = Date.now() + 10000;
  while (true) {
    try { fs.mkdirSync(lock); break; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('发布正在进行或遗留锁存在；确认无发布进程后清理 .bridge/.publish-lock');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  try { return await action(lock); } finally { fs.rmSync(lock, { recursive: true, force: true }); }
}
// 同一锁内先准备全部文件，再替换；索引放在最后，失败恢复已替换文件。
export function transaction(bridge, lock, entries) {
  const changes = [];
  try {
    const staged = entries.map(([relative, contents], i) => {
      const target = safeOutput(bridge, relative);
      const before = fs.existsSync(target) ? fs.readFileSync(target) : null;
      const temporary = path.join(lock, `next-${i}`);
      fs.writeFileSync(temporary, contents, { flag: 'wx' });
      return { target, before, temporary, i };
    });
    for (const item of staged) {
      fs.mkdirSync(path.dirname(item.target), { recursive: true });
      fs.renameSync(item.temporary, item.target);
      changes.push(item);
    }
  } catch (error) {
    const failures = [];
    for (const item of changes.reverse()) {
      try {
        if (item.before === null) fs.unlinkSync(item.target);
        else {
          const restore = path.join(lock, `restore-${item.i}`);
          fs.writeFileSync(restore, item.before);
          fs.renameSync(restore, item.target);
        }
      } catch (rollback) { failures.push(rollback.message); }
    }
    if (failures.length) throw new Error(`${error.message}；恢复失败：${failures.join('; ')}`);
    throw error;
  }
}
