#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CAPSTONE } from './lib/validate-course.mjs';
import { outputRoot, initialized, readJson, json, withLock, transaction } from './lib/storage.mjs';
import { loadCourse, readProgress, latestResult, weakCompetencies } from './lib/courses.mjs';

const RESULTS = ['correct', 'partial', 'missed'];
const TRANSITIONS = {
  pending: ['in-progress', 'tested-out', 'skipped'],
  'in-progress': ['passed', 'skipped'],
  skipped: ['in-progress'],
  'tested-out': ['in-progress'],
  passed: [],
};
const FIELDS = {
  attempt: ['type', 'qid', 'result', 'hintsUsed', 'note'],
  'lesson-status': ['type', 'lesson', 'status'],
  capstone: ['type', 'blueprint', 'reviewFindings'],
};
const DONE = new Set(['passed', 'tested-out', 'skipped']);

function applyEvent(course, progress, event) {
  if (!event || !Object.hasOwn(FIELDS, event.type)) throw new Error('事件类型须为 attempt、lesson-status 或 capstone');
  const unknown = Object.keys(event).filter(name => !FIELDS[event.type].includes(name));
  if (unknown.length) throw new Error(`事件包含未知字段：${unknown.join(', ')}`);
  const statusOf = id => progress.lessons[id]?.status;
  const requireFinished = () => {
    const open = course.lessons.filter(lesson => !DONE.has(statusOf(lesson.id))).map(lesson => lesson.id);
    if (open.length) throw new Error(`结业前须完成或跳过全部课：${open.join(', ')}`);
  };
  // 进入一课前，此前各课须已通过、跳课测通过或由用户跳过。
  const requireGate = position => {
    const blocked = course.lessons.slice(0, position).find(lesson => !DONE.has(statusOf(lesson.id)));
    if (blocked) throw new Error(`前一课尚未达标或跳过：${blocked.id}`);
  };

  if (event.type === 'attempt') {
    const { qid, result, hintsUsed, note = '' } = event;
    if (typeof qid !== 'string' || !Object.hasOwn(course.questions, qid)) throw new Error(`未知题目：${qid}`);
    if (!RESULTS.includes(result)) throw new Error(`result 须为 ${RESULTS.join('、')}`);
    if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed > 3) throw new Error('hintsUsed 须为 0–3 的整数');
    if (typeof note !== 'string') throw new Error('note 须为文本');
    const { lesson } = course.questions[qid];
    if (lesson === CAPSTONE) requireFinished();
    else {
      const position = course.lessons.findIndex(item => item.id === lesson);
      if (course.lessons[position].pretest.includes(qid)) {
        if (statusOf(lesson) !== 'pending') throw new Error(`跳课测只能在该课 pending 时作答：${lesson}`);
        requireGate(position);
      } else if (statusOf(lesson) !== 'in-progress') throw new Error(`请先将该课设为 in-progress：${lesson}`);
    }
    progress.attempts.push({ qid, at: new Date().toISOString(), result, hintsUsed, note });
  } else if (event.type === 'lesson-status') {
    const position = course.lessons.findIndex(item => item.id === event.lesson);
    if (position === -1) throw new Error(`未知课：${event.lesson}`);
    const lesson = course.lessons[position], from = statusOf(lesson.id);
    if (!TRANSITIONS[from]?.includes(event.status)) throw new Error(`非法状态转移：${from} → ${event.status}`);
    if (event.status === 'in-progress' || event.status === 'tested-out') requireGate(position);
    if (event.status === 'passed') {
      const open = lesson.questions.filter(qid => !['correct', 'partial'].includes(latestResult(progress.attempts, qid)));
      if (open.length) throw new Error(`尚未达标，以下题目未作答或最近结果为 missed：${open.join(', ')}`);
    }
    if (event.status === 'tested-out') {
      const clean = qid => {
        const attempts = progress.attempts.filter(item => item.qid === qid);
        return attempts.length > 0 && attempts.every(item => item.result === 'correct' && item.hintsUsed === 0);
      };
      if (!lesson.pretest.length || !lesson.pretest.every(clean)) throw new Error('tested-out 要求本课跳课测全部一次答对且未用提示');
    }
    progress.lessons[lesson.id] = { status: event.status };
  } else {
    const fields = ['blueprint', 'reviewFindings'].filter(name => name in event);
    if (!fields.length || fields.some(name => typeof event[name] !== 'string' || !event[name].trim())) throw new Error('capstone 事件须提供非空的 blueprint 或 reviewFindings 原文');
    requireFinished();
    for (const name of fields) progress.capstone[name] = event[name];
  }
  progress.weak = weakCompetencies(course, progress.attempts);
}

export async function recordProgress(directory, id, eventFile) {
  const { bridge } = outputRoot(directory);
  initialized(bridge);
  const event = readJson(eventFile);
  return withLock(bridge, lock => {
    const { course, digest } = loadCourse(bridge, id);
    const progress = readProgress(bridge, id);
    if (progress.courseDigest !== digest) throw new Error('进度与当前课程文件摘要不一致；课程只能通过 publish-course.mjs 更新');
    applyEvent(course, progress, event);
    transaction(bridge, lock, [[`courses/${id}/progress.json`, json(progress)]]);
    return { lessons: progress.lessons, weak: progress.weak };
  });
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const [root, id, event, ...extra] = process.argv.slice(2);
    if (!root || !id || !event || extra.length) throw new Error('用法：node record-progress.mjs <仓库> <课程 ID> <事件 JSON>');
    console.log(JSON.stringify(await recordProgress(root, id, event), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
