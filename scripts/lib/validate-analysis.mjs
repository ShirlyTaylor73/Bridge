#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const categories = new Set(['core', 'adapter', 'data', 'infra', 'utility', 'test', 'docs']);
const nodeKinds = new Set(['dir', 'file']);
const viewIcons = new Set(['play', 'dashboard']);
const stepKinds = new Set(['calls', 'http', 'callback', 'sequence']);

function usage() {
  console.error('用法：node validate-analysis.mjs <project-root> [analysis] [scan]');
  process.exit(1);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createValidator(root, { exploration = false } = {}) {
  const errors = [];
  const scanFiles = new Set();
  const scanDirectories = new Set();
  const treeFiles = new Set();
  const evidenceKeys = new Set();
  const referencedEvidence = new Set();
  const sourceChecks = [];
  let directoryNodeCount = 0;
  let viewCount = 0;
  let expectedFileCount = null;
  let hasScanCommit = false;
  let scanCommit;
  let analysisCommit;

  function fail(location, message) {
    errors.push(`${location}：${message}`);
  }

  function checkKeys(value, allowed, location) {
    if (!isObject(value)) {
      fail(location, '必须是对象');
      return false;
    }
    for (const key of Object.keys(value)) {
      if (!allowed.has(key)) fail(location, `未知字段 ${key}`);
    }
    return true;
  }

  function requiredString(value, key, location) {
    const field = `${location}.${key}`;
    if (typeof value?.[key] !== 'string' || !value[key].trim()) {
      fail(field, '必须是非空字符串');
      return null;
    }
    return value[key];
  }

  function optionalString(value, key, location) {
    if (!(key in value)) return null;
    return requiredString(value, key, location);
  }

  function requiredArray(value, key, location) {
    if (!Array.isArray(value?.[key])) {
      fail(`${location}.${key}`, '必须是数组');
      return null;
    }
    return value[key];
  }

  function normalizeRelative(value) {
    if (typeof value !== 'string' || !value.trim()) return '必须是非空字符串';
    if (
      value.includes('\0')
      || value.includes('\\')
      || path.posix.isAbsolute(value)
      || path.win32.isAbsolute(value)
      || /^[A-Za-z]:/.test(value)
    ) return '必须是安全的 POSIX 相对路径';
    const normalized = path.posix.normalize(value);
    if (
      normalized !== value
      || normalized === '.'
      || normalized === '..'
      || normalized.startsWith('../')
    ) return '路径未规范化或会逃逸项目根目录';
    return null;
  }

  function validateProject(value, location, isScan = false) {
    if (!checkKeys(value, new Set(isScan ? ['root', 'commit'] : ['name', 'root', 'commit', 'generatedAt', 'fileCount']), location)) return;
    const projectRoot = requiredString(value, 'root', location);
    if (projectRoot !== null && projectRoot !== root) {
      fail(`${location}.root`, `必须等于真实项目根目录 ${root}`);
    }
    if ((!isScan || 'commit' in value) && value.commit !== null && (typeof value.commit !== 'string' || !value.commit.trim())) {
      fail(`${location}.commit`, '必须是 null 或非空字符串');
    }
    if (isScan) {
      if ('commit' in value) {
        hasScanCommit = true;
        scanCommit = value.commit;
      }
      return;
    }
    analysisCommit = value.commit;
    requiredString(value, 'name', location);
    requiredString(value, 'generatedAt', location);
    if (!Number.isInteger(value.fileCount) || value.fileCount < 0) {
      fail(`${location}.fileCount`, '必须是非负整数');
    } else {
      expectedFileCount = value.fileCount;
    }
  }

  function validateScan(scan) {
    if (!checkKeys(scan, new Set(['version', 'project', 'files', 'directories', 'warnings', 'excluded']), 'scan')) return;
    if (scan.version !== 1) fail('scan.version', '必须等于 1');
    validateProject(scan.project, 'scan.project', true);
    const files = requiredArray(scan, 'files', 'scan');
    if (files) {
      files.forEach((file, index) => {
        const location = `scan.files[${index}]`;
        if (!checkKeys(file, new Set(['path', 'lines']), location)) return;
        const filePath = requiredString(file, 'path', location);
        const pathError = normalizeRelative(filePath);
        if (pathError) {
          fail(`${location}.path`, pathError);
        } else if (scanFiles.has(filePath)) {
          fail(`${location}.path`, `重复文件路径 ${filePath}`);
        } else {
          scanFiles.add(filePath);
        }
        if (!Number.isInteger(file.lines) || file.lines < 0) {
          fail(`${location}.lines`, '必须是非负整数');
        }
      });
    }
    const directories = requiredArray(scan, 'directories', 'scan');
    if (directories) {
      directories.forEach((directory, index) => {
        const location = `scan.directories[${index}]`;
        if (typeof directory !== 'string' || !directory.trim()) {
          fail(location, '必须是非空字符串');
          return;
        }
        const pathError = normalizeRelative(directory);
        if (pathError) {
          fail(location, pathError);
        } else if (scanDirectories.has(directory)) {
          fail(location, `重复目录路径 ${directory}`);
        } else {
          scanDirectories.add(directory);
        }
      });
    }
    const warnings = requiredArray(scan, 'warnings', 'scan');
    warnings?.forEach((warning, index) => {
      if (typeof warning !== 'string' || !warning.trim()) {
        fail(`scan.warnings[${index}]`, '必须是非空字符串');
      }
    });
    const excluded = requiredArray(scan, 'excluded', 'scan');
    excluded?.forEach((item, index) => {
      const location = `scan.excluded[${index}]`;
      if (!checkKeys(item, new Set(['path', 'reason']), location)) return;
      const itemPath = requiredString(item, 'path', location);
      const pathError = normalizeRelative(itemPath);
      if (pathError) fail(`${location}.path`, pathError);
      requiredString(item, 'reason', location);
    });
  }

  function validateNodes(nodes) {
    if (!Array.isArray(nodes)) {
      fail('analysis.nodes', '必须是数组');
      return;
    }
    const ids = new Set();
    const paths = new Set();

    function visit(node, location, parentPath = '') {
      const allowed = new Set(['id', 'name', 'path', 'kind', 'summary', 'category', 'entry', 'children', 'open']);
      if (!checkKeys(node, allowed, location)) return;
      const id = requiredString(node, 'id', location);
      if (id !== null) {
        if (ids.has(id)) fail(`${location}.id`, `重复节点 id ${id}`);
        ids.add(id);
      }
      requiredString(node, 'name', location);
      requiredString(node, 'summary', location);
      const nodePath = requiredString(node, 'path', location);
      const pathError = normalizeRelative(nodePath);
      if (pathError) {
        fail(`${location}.path`, pathError);
      } else {
        if (paths.has(nodePath)) fail(`${location}.path`, `重复节点路径 ${nodePath}`);
        paths.add(nodePath);
        if (node.name !== path.posix.basename(nodePath)) fail(`${location}.name`, '必须等于路径最后一段');
        const expectedParent = path.posix.dirname(nodePath);
        if ((parentPath || '.') !== expectedParent) fail(`${location}.path`, `必须位于父节点 ${parentPath || '仓库根目录'} 下`);
      }
      if (!nodeKinds.has(node.kind)) {
        fail(`${location}.kind`, '必须是 dir 或 file');
      }
      if ('open' in node && typeof node.open !== 'boolean') {
        fail(`${location}.open`, '必须是布尔值');
      }

      if (node.kind === 'file') {
        if (!categories.has(node.category)) {
          fail(`${location}.category`, '文件节点必须具有有效分类');
        }
        if ('children' in node) fail(`${location}.children`, '文件节点不能有 children');
        if ('open' in node) fail(`${location}.open`, '只有目录节点可以设置 open');
        optionalString(node, 'entry', location);
        if (!pathError) {
          treeFiles.add(nodePath);
          if (!scanFiles.has(nodePath)) fail(`${location}.path`, `不在 scan.files 中：${nodePath}`);
        }
      } else if (node.kind === 'dir') {
        directoryNodeCount += 1;
        if ('category' in node) fail(`${location}.category`, '目录节点不能设置 category');
        if ('entry' in node) fail(`${location}.entry`, '目录节点不能设置 entry');
        if (!pathError && !scanDirectories.has(nodePath)) {
          fail(`${location}.path`, `不在 scan.directories 中：${nodePath}`);
        }
        if (!Array.isArray(node.children)) {
          fail(`${location}.children`, '目录节点必须是子节点数组');
        } else {
          node.children.forEach((child, index) => visit(child, `${location}.children[${index}]`, nodePath));
        }
      } else if ('children' in node && !Array.isArray(node.children)) {
        fail(`${location}.children`, '必须是数组');
      }
    }

    nodes.forEach((node, index) => visit(node, `analysis.nodes[${index}]`));
  }

  function validateEvidence(evidence) {
    if (!isObject(evidence)) {
      fail('analysis.evidence', '必须是对象');
      return;
    }
    const allowed = new Set(['path', 'role', 'symbol', 'start', 'end', 'highlight', 'code', 'annotation']);
    for (const [key, item] of Object.entries(evidence)) {
      const location = `analysis.evidence.${key}`;
      if (!key.trim()) fail(location, '证据 key 不能为空');
      evidenceKeys.add(key);
      if (!checkKeys(item, allowed, location)) continue;
      const evidencePath = requiredString(item, 'path', location);
      const pathError = normalizeRelative(evidencePath);
      if (pathError) {
        fail(`${location}.path`, pathError);
      } else if (!scanFiles.has(evidencePath)) {
        fail(`${location}.path`, `不在 scan.files 中：${evidencePath}`);
      }
      requiredString(item, 'role', location);
      requiredString(item, 'symbol', location);
      requiredString(item, 'code', location);
      requiredString(item, 'annotation', location);
      if (!Number.isInteger(item.start) || item.start < 1) {
        fail(`${location}.start`, '必须是大于等于 1 的整数');
      }
      if (!Number.isInteger(item.end) || item.end < 1) {
        fail(`${location}.end`, '必须是大于等于 1 的整数');
      }
      if (Number.isInteger(item.start) && Number.isInteger(item.end) && item.end < item.start) {
        fail(`${location}.end`, '不能小于 start');
      }
      const highlightValid = Array.isArray(item.highlight)
        && item.highlight.length === 2
        && item.highlight.every((line) => Number.isInteger(line) && line >= 1);
      if (!highlightValid) {
        fail(`${location}.highlight`, '必须是两个正整数组成的 [start, end]');
      } else {
        if (item.highlight[0] > item.highlight[1]) {
          fail(`${location}.highlight`, '高亮起行不能大于高亮止行');
        }
        if (
          Number.isInteger(item.start)
          && Number.isInteger(item.end)
          && (item.highlight[0] < item.start || item.highlight[1] > item.end)
        ) {
          fail(`${location}.highlight`, '高亮范围必须位于证据行号范围内');
        }
      }
      if (
        !pathError
        && scanFiles.has(evidencePath)
        && Number.isInteger(item.start)
        && item.start >= 1
        && Number.isInteger(item.end)
        && item.end >= item.start
        && typeof item.code === 'string'
        && item.code.trim()
      ) {
        sourceChecks.push({ key, path: evidencePath, start: item.start, end: item.end, code: item.code });
      }
    }
  }

  function validateSources() {
    const cache = new Map();
    for (const check of sourceChecks) {
      let source = cache.get(check.path);
      if (source === undefined) {
        try {
          const fullPath = path.resolve(root, ...check.path.split('/'));
          if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error('路径逃逸项目根目录');
          const stat = fs.lstatSync(fullPath);
          if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('不是普通文件或包含符号链接');
          const realPath = fs.realpathSync(fullPath);
          if (!realPath.startsWith(`${root}${path.sep}`)) throw new Error('真实路径逃逸项目根目录');
          source = { text: fs.readFileSync(realPath, 'utf8').replace(/\r\n/g, '\n') };
        } catch (error) {
          source = { error: error.message };
        }
        cache.set(check.path, source);
      }
      const location = `analysis.evidence.${check.key}`;
      if (source.error) {
        fail(`${location}.code`, `读取源文件失败：${source.error}`);
        continue;
      }
      const lines = source.text.split('\n');
      if (check.end > lines.length) {
        fail(`${location}.end`, `超出 ${check.path} 的实际行数 ${lines.length}`);
        continue;
      }
      const expected = lines.slice(check.start - 1, check.end).join('\n');
      const actual = check.code.replace(/\r\n/g, '\n');
      if (actual !== expected) {
        fail(`${location}.code`, `与磁盘文件 ${check.path} 第 ${check.start}-${check.end} 行不完全一致`);
      }
    }
  }

  function validateViews(views) {
    if (!Array.isArray(views)) {
      fail('analysis.views', '必须是数组');
      return;
    }
    const ids = new Set();
    views.forEach((view, viewIndex) => {
      const viewLocation = `analysis.views[${viewIndex}]`;
      if (!checkKeys(view, new Set(['id', 'name', 'desc', 'icon', 'phases']), viewLocation)) return;
      const id = requiredString(view, 'id', viewLocation);
      if (id !== null) {
        if (id === 'base') fail(`${viewLocation}.id`, '调用视图 id 不能是 base');
        if (ids.has(id)) fail(`${viewLocation}.id`, `重复视图 id ${id}`);
        ids.add(id);
      }
      requiredString(view, 'name', viewLocation);
      requiredString(view, 'desc', viewLocation);
      if (!viewIcons.has(view.icon)) fail(`${viewLocation}.icon`, '必须是 play 或 dashboard');
      const phases = requiredArray(view, 'phases', viewLocation);
      if (phases && phases.length === 0) fail(`${viewLocation}.phases`, '每个视图至少需要一个阶段');
      viewCount += 1;
      phases?.forEach((phase, phaseIndex) => {
        const phaseLocation = `${viewLocation}.phases[${phaseIndex}]`;
        if (!checkKeys(phase, new Set(['title', 'desc', 'steps']), phaseLocation)) return;
        requiredString(phase, 'title', phaseLocation);
        requiredString(phase, 'desc', phaseLocation);
        const steps = requiredArray(phase, 'steps', phaseLocation);
        if (steps && steps.length === 0) fail(`${phaseLocation}.steps`, '每个阶段至少需要一个步骤');
        steps?.forEach((step, stepIndex) => {
          const stepLocation = `${phaseLocation}.steps[${stepIndex}]`;
          if (!checkKeys(step, new Set(['key', 'via', 'kind', 'object', 'extra']), stepLocation)) return;
          const key = requiredString(step, 'key', stepLocation);
          if (key !== null) {
            referencedEvidence.add(key);
            if (!evidenceKeys.has(key)) fail(`${stepLocation}.key`, `无效证据引用 ${key}`);
          }
          if (stepIndex > 0 || 'via' in step) requiredString(step, 'via', stepLocation);
          if ('kind' in step && !stepKinds.has(step.kind)) {
            fail(`${stepLocation}.kind`, '必须是 calls、http、callback 或 sequence');
          }
          optionalString(step, 'object', stepLocation);
          let extraCount = 0;
          if ('extra' in step) {
            if (!Array.isArray(step.extra)) {
              fail(`${stepLocation}.extra`, '必须是证据 key 数组');
            } else {
              extraCount = step.extra.length;
              step.extra.forEach((extraKey, extraIndex) => {
                if (typeof extraKey !== 'string' || !extraKey.trim()) {
                  fail(`${stepLocation}.extra[${extraIndex}]`, '必须是非空字符串');
                } else {
                  referencedEvidence.add(extraKey);
                  if (!evidenceKeys.has(extraKey)) {
                    fail(`${stepLocation}.extra[${extraIndex}]`, `无效证据引用 ${extraKey}`);
                  }
                }
              });
            }
          }
          if (step.kind === 'callback' && extraCount === 0) {
            fail(`${stepLocation}.extra`, 'callback 步骤至少需要一项附加证据');
          }
        });
      });
    });
  }

  function finish() {
    for (const filePath of exploration ? [] : scanFiles) {
      if (!treeFiles.has(filePath)) fail('analysis.nodes', `文件树缺少扫描文件 ${filePath}`);
    }
    if (expectedFileCount !== null && expectedFileCount !== scanFiles.size) {
      fail('analysis.project.fileCount', `必须等于 scan 文件数 ${scanFiles.size}`);
    }
    if (hasScanCommit && analysisCommit !== scanCommit) {
      fail('analysis.project.commit', `必须等于 scan.project.commit ${JSON.stringify(scanCommit)}`);
    }
    for (const key of evidenceKeys) {
      if (!referencedEvidence.has(key)) fail(`analysis.evidence.${key}`, '证据未被任何调用视图引用');
    }
    validateSources();
    return {
      errors,
      summary: `校验通过：${scanFiles.size} 个文件，${directoryNodeCount} 个目录节点，${evidenceKeys.size} 条证据，${viewCount} 个调用视图。`,
    };
  }

  function validateAnalysis(analysis) {
    const allowed = new Set(['version', 'project', 'nodes', 'evidence', 'views']);
    if (!checkKeys(analysis, allowed, 'analysis')) return;
    if (analysis.version !== 1) fail('analysis.version', '必须等于 1');
    validateProject(analysis.project, 'analysis.project');
    if (!exploration) validateNodes(analysis.nodes);
    validateEvidence(analysis.evidence);
    validateViews(analysis.views);
  }

  return { validateScan, validateAnalysis, finish };
}
