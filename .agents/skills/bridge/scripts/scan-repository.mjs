#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { TextDecoder } from 'node:util';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_IGNORE_BYTES = 256 * 1024;

const excludedDirectoryNames = new Map([
  ['.git', 'VCS 元数据'],
  ['.hg', 'VCS 元数据'],
  ['.svn', 'VCS 元数据'],
  ['.bridge', 'Bridge 工作目录'],
  ['node_modules', '依赖目录'],
  ['bower_components', '依赖目录'],
  ['vendor', '依赖目录'],
  ['.venv', '虚拟环境目录'],
  ['venv', '虚拟环境目录'],
  ['__pycache__', '缓存或构建产物'],
  ['.pytest_cache', '缓存或构建产物'],
  ['.mypy_cache', '缓存或构建产物'],
  ['.ruff_cache', '缓存或构建产物'],
  ['.cache', '缓存或构建产物'],
  ['.next', '缓存或构建产物'],
  ['.nuxt', '缓存或构建产物'],
  ['.turbo', '缓存或构建产物'],
  ['.gradle', '缓存或构建产物'],
  ['dist', '缓存或构建产物'],
  ['build', '缓存或构建产物'],
  ['out', '缓存或构建产物'],
  ['target', '缓存或构建产物'],
  ['coverage', '缓存或构建产物'],
]);

const binaryExtensions = new Set([
  '.7z', '.a', '.avi', '.avif', '.bin', '.bmp', '.bz2', '.class', '.db',
  '.dll', '.dmg', '.doc', '.docx', '.dylib', '.eot', '.exe', '.flac',
  '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg', '.m4a', '.m4v', '.mkv',
  '.mov', '.mp3', '.mp4', '.o', '.obj', '.ogg', '.otf', '.pdf', '.pickle',
  '.pkl', '.png', '.ppt', '.pptx', '.pyc', '.pyo', '.rar', '.so', '.sqlite',
  '.sqlite3', '.svgz', '.tar', '.tgz', '.tif', '.tiff', '.ttf', '.wav',
  '.wasm', '.webm', '.webp', '.woff', '.woff2', '.xls', '.xlsx', '.xz',
  '.zip',
]);

const lockFileNames = new Set([
  'bun.lock', 'bun.lockb', 'cargo.lock', 'composer.lock', 'gemfile.lock',
  'gradle.lockfile', 'package-lock.json', 'pipfile.lock', 'pnpm-lock.yaml',
  'poetry.lock', 'uv.lock', 'yarn.lock',
]);

const secretFileNames = new Set([
  '.dockercfg', '.env', '.netrc', '.npmrc', '.pypirc', 'credentials',
  'credentials.json', 'id_dsa', 'id_ecdsa', 'id_ed25519', 'id_rsa',
  'secrets.json', 'secrets.yaml', 'secrets.yml', 'service-account.json',
]);

const secretExtensions = new Set([
  '.jks', '.kdbx', '.key', '.keystore', '.p12', '.pem', '.pfx',
]);

function usage() {
  console.error('用法：node scan-repository.mjs <project-root> [output]');
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function globToRegExp(glob) {
  let source = '';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '\\' && index + 1 < glob.length) {
      index += 1;
      source += escapeRegExp(glob[index]);
    } else if (character === '*') {
      let end = index;
      while (end + 1 < glob.length && glob[end + 1] === '*') end += 1;
      if (end > index) {
        if (glob[end + 1] === '/') {
          source += '(?:.*/)?';
          end += 1;
        } else {
          source += '.*';
        }
        index = end;
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else if (character === '[') {
      let end = index + 1;
      if (glob[end] === '!' || glob[end] === '^') end += 1;
      if (glob[end] === ']') end += 1;
      while (end < glob.length && glob[end] !== ']') end += 1;
      if (end < glob.length) {
        let content = glob.slice(index + 1, end);
        if (content.startsWith('!')) content = `^${content.slice(1)}`;
        source += `[${content.replace(/\\/g, '\\\\')}]`;
        index = end;
      } else {
        source += '\\[';
      }
    } else {
      source += escapeRegExp(character);
    }
  }
  return new RegExp(`^${source}$`);
}

function parseBridgeIgnore(source) {
  const rules = [];
  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) {
      pattern = pattern.slice(1);
    } else if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    if (!pattern) continue;
    const directoryOnly = pattern.endsWith('/');
    if (directoryOnly) pattern = pattern.slice(0, -1);
    const anchored = pattern.startsWith('/');
    if (anchored) pattern = pattern.slice(1);
    if (!pattern) continue;
    const hasSlash = pattern.includes('/');
    rules.push({
      negated,
      directoryOnly,
      anchored,
      hasSlash,
      regex: globToRegExp(pattern),
    });
  }
  return rules;
}

function ruleCandidates(relativePath, isDirectory) {
  const parts = relativePath.split('/');
  const candidates = [];
  const directoryCount = isDirectory ? parts.length : parts.length - 1;
  for (let length = 1; length <= directoryCount; length += 1) {
    candidates.push({ path: parts.slice(0, length).join('/'), directory: true });
  }
  if (!isDirectory) candidates.push({ path: relativePath, directory: false });
  return candidates;
}

function matchesRule(rule, relativePath, isDirectory) {
  return ruleCandidates(relativePath, isDirectory).some((candidate) => {
    if (rule.directoryOnly && !candidate.directory) return false;
    const value = rule.anchored || rule.hasSlash
      ? candidate.path
      : path.posix.basename(candidate.path);
    return rule.regex.test(value);
  });
}

function customExclusion(relativePath, isDirectory, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (matchesRule(rule, relativePath, isDirectory)) ignored = !rule.negated;
  }
  return ignored ? { path: relativePath, reason: '.bridgeignore 规则' } : null;
}

function defaultExclusion(relativePath, isDirectory) {
  const parts = relativePath.split('/');
  for (const part of parts.slice(0, -1)) {
    if (excludedDirectoryNames.has(part)) {
      return { path: relativePath, reason: excludedDirectoryNames.get(part) };
    }
  }
  const basename = parts.at(-1);
  const lowerName = basename.toLowerCase();
  if (isDirectory && excludedDirectoryNames.has(basename)) {
    return { path: relativePath, reason: excludedDirectoryNames.get(basename) };
  }
  if (!isDirectory) {
    if (lockFileNames.has(lowerName)) {
      return { path: relativePath, reason: '锁文件' };
    }
    if (
      secretFileNames.has(lowerName)
      || (lowerName.startsWith('.env.') && !['.env.example', '.env.sample', '.env.template'].includes(lowerName))
      || /^service-account-.+\.json$/.test(lowerName)
      || secretExtensions.has(path.posix.extname(lowerName))
    ) {
      return { path: relativePath, reason: '常见密钥或凭据文件' };
    }
    if (binaryExtensions.has(path.posix.extname(lowerName))) {
      return { path: relativePath, reason: '已知二进制文件类型' };
    }
  }
  return null;
}

function safeRelativePath(value) {
  if (
    !value
    || value.includes('\0')
    || value.includes('\\')
    || path.posix.isAbsolute(value)
    || path.win32.isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
  ) return null;
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value
    || normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
  ) return null;
  return normalized;
}

function readUtf8(buffer) {
  if (buffer.includes(0)) throw new Error('包含 NUL 的二进制文件');
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
}

function loadIgnoreRules(root, warnings) {
  const ignorePath = path.join(root, '.bridgeignore');
  if (!fs.existsSync(ignorePath)) return [];
  try {
    const stat = fs.lstatSync(ignorePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      warnings.push('.bridgeignore 不是普通文件，未应用自定义忽略规则');
      return [];
    }
    if (stat.size > MAX_IGNORE_BYTES) {
      warnings.push('.bridgeignore 超过 256 KiB，未应用自定义忽略规则');
      return [];
    }
    return parseBridgeIgnore(readUtf8(fs.readFileSync(ignorePath)));
  } catch (error) {
    warnings.push(`读取 .bridgeignore 失败：${error.message}`);
    return [];
  }
}

function isGitRepository(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error) {
    if (result.error.code === 'ENOENT') return { git: false, warning: '未找到 git，改用安全递归扫描' };
    throw result.error;
  }
  if (result.status !== 0) return { git: false };
  const topLevel = fs.realpathSync(result.stdout.trim());
  return { git: topLevel === root };
}

function gitFiles(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z', '-co', '--exclude-standard'], {
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`git ls-files 失败：${result.stderr?.toString('utf8').trim() || `退出码 ${result.status}`}`);
  }
  return result.stdout.toString('utf8').split('\0').filter(Boolean);
}

function countLines(text) {
  if (!text) return 0;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function inspectFile(root, relativePath) {
  const fullPath = path.join(root, ...relativePath.split('/'));
  const stat = fs.lstatSync(fullPath);
  if (stat.isSymbolicLink()) return { excluded: '符号链接（不跟随）' };
  if (!stat.isFile()) return { excluded: '非普通文件' };
  if (stat.size > MAX_FILE_BYTES) return { excluded: '文件超过 2 MiB' };

  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const descriptor = fs.openSync(fullPath, flags);
  try {
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isFile()) return { excluded: '非普通文件' };
    if (openedStat.size > MAX_FILE_BYTES) return { excluded: '文件超过 2 MiB' };
    const buffer = Buffer.alloc(openedStat.size);
    let offset = 0;
    while (offset < buffer.length) {
      const bytesRead = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const text = readUtf8(buffer.subarray(0, offset));
    return { lines: countLines(text) };
  } finally {
    fs.closeSync(descriptor);
  }
}

function scan() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) usage();
  const root = fs.realpathSync(path.resolve(args[0]));
  if (!fs.statSync(root).isDirectory()) throw new Error('project-root 不是目录');
  const output = args[1]
    ? path.resolve(args[1])
    : path.join(root, '.bridge', 'scan.json');
  const warnings = [];
  const excluded = [];
  const files = [];
  const ignoreRules = loadIgnoreRules(root, warnings);
  const git = isGitRepository(root);
  if (git.warning) warnings.push(git.warning);

  function addFile(relativePath) {
    const safePath = safeRelativePath(relativePath);
    if (!safePath) {
      warnings.push(`跳过不安全路径：${relativePath}`);
      return;
    }
    const fullPath = path.resolve(root, ...safePath.split('/'));
    if (!fullPath.startsWith(`${root}${path.sep}`)) {
      warnings.push(`跳过逃逸项目根目录的路径：${safePath}`);
      return;
    }
    const defaultResult = defaultExclusion(safePath, false);
    if (defaultResult) {
      excluded.push(defaultResult);
      return;
    }
    const customResult = customExclusion(safePath, false, ignoreRules);
    if (customResult) {
      excluded.push(customResult);
      return;
    }
    try {
      const result = inspectFile(root, safePath);
      if (result.excluded) {
        excluded.push({ path: safePath, reason: result.excluded });
      } else {
        files.push({ path: safePath, lines: result.lines });
      }
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TypeError') {
        excluded.push({ path: safePath, reason: '不是有效 UTF-8 文本' });
      } else if (error.message === '包含 NUL 的二进制文件') {
        excluded.push({ path: safePath, reason: error.message });
      } else {
        warnings.push(`读取 ${safePath} 失败：${error.message}`);
      }
    }
  }

  if (git.git) {
    for (const relativePath of gitFiles(root)) addFile(relativePath);
  } else {
    function walk(directory, relativeDirectory = '') {
      let entries;
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true })
          .sort((left, right) => left.name.localeCompare(right.name));
      } catch (error) {
        warnings.push(`读取目录 ${relativeDirectory || '.'} 失败：${error.message}`);
        return;
      }
      for (const entry of entries) {
        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${entry.name}`
          : entry.name;
        const safePath = safeRelativePath(relativePath);
        if (!safePath) {
          warnings.push(`跳过不安全路径：${relativePath}`);
          continue;
        }
        const isDirectory = entry.isDirectory();
        const defaultResult = defaultExclusion(safePath, isDirectory);
        if (defaultResult) {
          excluded.push(defaultResult);
          continue;
        }
        if (entry.isSymbolicLink()) {
          excluded.push({ path: safePath, reason: '符号链接（不跟随）' });
        } else if (isDirectory) {
          walk(path.join(directory, entry.name), safePath);
        } else if (entry.isFile()) {
          addFile(safePath);
        } else {
          excluded.push({ path: safePath, reason: '非普通文件' });
        }
      }
    }
    walk(root);
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  excluded.sort((left, right) => left.path.localeCompare(right.path));
  const directorySet = new Set();
  for (const file of files) {
    const parts = file.path.split('/');
    for (let length = 1; length < parts.length; length += 1) {
      directorySet.add(parts.slice(0, length).join('/'));
    }
  }
  const result = {
    version: 1,
    project: { root },
    files,
    directories: [...directorySet].sort(),
    warnings,
    excluded,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`扫描完成：${files.length} 个文本文件，${excluded.length} 项排除，${warnings.length} 条警告。`);
  console.log(output);
}

try {
  scan();
} catch (error) {
  console.error(`扫描失败：${error.message}`);
  process.exitCode = 1;
}
