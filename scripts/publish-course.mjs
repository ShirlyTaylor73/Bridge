#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './scan-repository.mjs';
import { validateCourse, sameQuestion, CAPSTONE } from './lib/validate-course.mjs';
import { json, outputRoot, initialized, withLock, transaction, safeOutput, digest } from './lib/storage.mjs';
import { courseId, courseDigest, readCourseIndex, readProbes, loadCourse, readProgress, emptyProgress, weakCompetencies } from './lib/courses.mjs';

// 更新后保留仍然有效的学习记录；内容变化的题目移除作答，依赖它的掌握状态回到 pending。
function carryProgress(before, after, progress, hash) {
  const next = emptyProgress(after.course, hash);
  next.attempts = progress.attempts.filter(item => sameQuestion(before, after, item.qid));
  const unchanged = (previous, lesson, field) => previous[field].length === lesson[field].length
    && lesson[field].every(qid => previous[field].includes(qid) && sameQuestion(before, after, qid));
  for (const lesson of after.course.lessons) {
    const previous = before.course.lessons.find(item => item.id === lesson.id);
    if (!previous) continue;
    let status = progress.lessons[lesson.id]?.status ?? 'pending';
    const formal = unchanged(previous, lesson, 'questions');
    if ((status === 'passed' && !formal) || (status === 'tested-out' && !(formal && unchanged(previous, lesson, 'pretest')))) status = 'pending';
    next.lessons[lesson.id] = { status };
  }
  for (const [field, slot] of [['blueprint', 'blueprint'], ['reviewFindings', 'review']]) {
    const qid = after.course[CAPSTONE][slot];
    if (before.course[CAPSTONE][slot] === qid && sameQuestion(before, after, qid)) next.capstone[field] = progress.capstone[field];
  }
  next.weak = weakCompetencies(after.course, next.attempts);
  return next;
}

export async function publishCourse(directory, candidate, { update = false, expectedHash } = {}) {
  const { root, bridge } = outputRoot(directory);
  initialized(bridge);
  const course = JSON.parse(fs.readFileSync(path.join(candidate, 'course.json'), 'utf8'));
  const key = JSON.parse(fs.readFileSync(path.join(candidate, 'key.json'), 'utf8'));
  const probes = readProbes(path.join(candidate, 'probes'));
  const { issues, snapshots } = validateCourse(root, course, key, { bridge, scan: scanRepository(root), probes: probes.map(item => item.name) });
  if (issues.length) throw new Error(issues.map(item => item.message).join('\n'));
  const id = courseId(course.id);
  const published = { version: key.version, answers: key.answers, snapshots };
  const courseText = json(course), keyText = json(published), hash = courseDigest(courseText, keyText);
  return withLock(bridge, lock => {
    const index = readCourseIndex(bridge);
    const position = index.courses.findIndex(item => item.id === id);
    const base = `courses/${id}`, relative = `${base}/course.json`;
    const occupied = ['course.json', 'key.json', 'progress.json'].some(name => fs.existsSync(safeOutput(bridge, `${base}/${name}`)));
    if (!update && (position !== -1 || occupied)) throw new Error('课程已存在，请更新已有课程或细化新课程名称');
    if (update && position === -1) throw new Error('待更新课程不存在');
    const entries = [];
    let progress = emptyProgress(course, hash), obsolete = [];
    if (update) {
      const previous = loadCourse(bridge, id);
      if (!expectedHash || expectedHash !== previous.digest) throw new Error('更新需要 --expected-hash，且须匹配读取的旧课程；请重新读取目标课程');
      const oldProgress = readProgress(bridge, id);
      const oldProbes = readProbes(safeOutput(bridge, `${base}/probes`));
      // 同一摘要下探针或进度可能不同，已有备份保持原样，差异内容另存。
      const backup = (name, contents) => {
        let file = `history/courses/${id}/${previous.digest}/${name}`;
        if (fs.existsSync(safeOutput(bridge, file))) {
          if (fs.readFileSync(safeOutput(bridge, file)).equals(Buffer.from(contents))) return;
          file = `${file}.${digest(contents).slice(0, 12)}`;
          if (fs.existsSync(safeOutput(bridge, file))) return;
        }
        entries.push([file, contents]);
      };
      backup('course.json', previous.courseBytes);
      backup('key.json', previous.keyBytes);
      backup('progress.json', fs.readFileSync(safeOutput(bridge, `${base}/progress.json`)));
      for (const probe of oldProbes) backup(probe.name, probe.contents);
      progress = carryProgress(previous, { course, key: published }, oldProgress, hash);
      obsolete = oldProbes.filter(old => !probes.some(probe => probe.name === old.name));
    }
    const item = { id, title: course.title, goal: course.goal, path: relative, updatedAt: course.project.generatedAt };
    if (update) index.courses[position] = item; else index.courses.push(item);
    for (const probe of probes) entries.push([`${base}/${probe.name}`, probe.contents]);
    entries.push([relative, courseText], [`${base}/key.json`, keyText], [`${base}/progress.json`, json(progress)], ['courses/index.json', json(index)]);
    transaction(bridge, lock, entries);
    // 新版本不再包含的旧探针已备份，提交成功后移除。
    for (const probe of obsolete) fs.rmSync(safeOutput(bridge, `${base}/${probe.name}`), { force: true });
    return relative;
  });
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [root, candidate, ...args] = process.argv.slice(2);
    const update = args[0] === '--update';
    if (!root || !candidate || (args.length && !(args.length === 3 && update && args[1] === '--expected-hash'))) throw new Error('用法：node publish-course.mjs <仓库> <候选目录> [--update --expected-hash <旧课程 SHA256>]');
    console.log(await publishCourse(root, candidate, { update, expectedHash: args[2] }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
