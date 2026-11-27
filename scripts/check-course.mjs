#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './scan-repository.mjs';
import { validateCourse } from './lib/validate-course.mjs';
import { outputRoot, initialized, safeOutput } from './lib/storage.mjs';
import { loadCourse, readProgress, readProbes } from './lib/courses.mjs';

// 只读：用当前磁盘内容重跑校验，按题目、讲义与课程整体归类问题。
export function checkCourse(directory, id) {
  const { root, bridge } = outputRoot(directory);
  initialized(bridge);
  const { course, key, digest } = loadCourse(bridge, id);
  const progress = readProgress(bridge, id);
  const probes = readProbes(safeOutput(bridge, `courses/${id}/probes`)).map(item => item.name);
  const scan = scanRepository(root);
  const { issues } = validateCourse(root, course, key, { bridge, scan, probes, current: false });
  const stale = new Map();
  const staleReadings = [], errors = [];
  for (const { qid, lesson, topic, evidence, message } of issues) {
    if (qid) {
      if (!stale.has(qid)) stale.set(qid, { qid, lesson, reasons: [] });
      stale.get(qid).reasons.push(message);
    } else if (topic) staleReadings.push({ lesson, topic, ...(evidence ? { evidence } : {}), reason: message });
    else errors.push(message);
  }
  if (progress.courseDigest !== digest) errors.push('进度与当前课程文件摘要不一致');
  return {
    id, ok: !stale.size && !staleReadings.length && !errors.length, digest,
    commit: { course: course.project?.commit ?? null, current: scan.project.commit },
    staleQuestions: [...stale.values()], staleReadings, errors, warnings: scan.warnings,
  };
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [root, id, ...extra] = process.argv.slice(2);
    if (!root || !id || extra.length) throw new Error('用法：node check-course.mjs <仓库> <课程 ID>');
    const report = checkCourse(root, id);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
