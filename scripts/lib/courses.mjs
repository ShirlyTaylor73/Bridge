import fs from 'node:fs';
import path from 'node:path';
import { readJson, safeOutput, digest, topicPattern } from './storage.mjs';
import { CAPSTONE, probePattern } from './validate-course.mjs';

export function courseId(id) {
  if (typeof id !== 'string' || !topicPattern.test(id) || id.length > 80 || id === 'index') throw new Error('课程 ID 须为有语义的 kebab-case，最长 80 字符，且不能为 index');
  return id;
}
// 乐观锁与进度绑定使用同一摘要：course.json 与 key.json 原始字节拼接。
export const courseDigest = (course, key) => digest(Buffer.concat([Buffer.from(course), Buffer.from(key)]));

export function readCourseIndex(bridge) {
  const file = safeOutput(bridge, 'courses/index.json');
  if (!fs.existsSync(file)) return { version: 1, courses: [] };
  const index = readJson(file);
  if (index.version !== 1 || !Array.isArray(index.courses)) throw new Error('课程索引格式无效');
  const seen = new Set();
  for (const item of index.courses) {
    courseId(item.id);
    if (seen.has(item.id) || item.path !== `courses/${item.id}/course.json` || typeof item.title !== 'string' || typeof item.goal !== 'string') throw new Error('课程索引条目无效');
    seen.add(item.id);
  }
  return index;
}

// 读取 probes 目录下的平铺普通文件，返回以 probes/ 开头的相对路径与内容。
export function readProbes(directory) {
  let stat;
  try { stat = fs.lstatSync(directory); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  if (!stat.isDirectory()) throw new Error(`probes 必须为真实目录：${directory}`);
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const name = `probes/${entry.name}`;
    if (!entry.isFile() || !probePattern.test(name)) throw new Error(`probes 仅支持名称规范的普通文件：${entry.name}`);
    return { name, contents: fs.readFileSync(path.join(directory, entry.name)) };
  });
}

export function loadCourse(bridge, id) {
  courseId(id);
  if (!readCourseIndex(bridge).courses.some(item => item.id === id)) throw new Error(`课程不存在：${id}`);
  const courseBytes = fs.readFileSync(safeOutput(bridge, `courses/${id}/course.json`));
  const keyBytes = fs.readFileSync(safeOutput(bridge, `courses/${id}/key.json`));
  return { course: JSON.parse(courseBytes), key: JSON.parse(keyBytes), courseBytes, keyBytes, digest: courseDigest(courseBytes, keyBytes) };
}

export function readProgress(bridge, id) {
  const progress = readJson(safeOutput(bridge, `courses/${id}/progress.json`));
  if (progress.version !== 1 || progress.courseId !== id || !progress.lessons || !Array.isArray(progress.attempts) || !Array.isArray(progress.weak) || !progress.capstone) throw new Error('进度文件格式无效');
  return progress;
}

export function emptyProgress(course, hash) {
  return {
    version: 1, courseId: course.id, courseDigest: hash,
    lessons: Object.fromEntries(course.lessons.map(lesson => [lesson.id, { status: 'pending' }])),
    attempts: [], weak: [], capstone: { blueprint: null, reviewFindings: null },
  };
}

export const latestResult = (attempts, qid) => attempts.findLast(item => item.qid === qid)?.result;

// 正式题与结业题中，最近一次结果仍为 partial 或 missed 的能力视为薄弱；跳课测不计入。
export function weakCompetencies(course, attempts) {
  const formal = new Set([...course.lessons.flatMap(lesson => lesson.questions), course[CAPSTONE].blueprint, course[CAPSTONE].review]);
  const weak = new Set([...formal].filter(qid => ['partial', 'missed'].includes(latestResult(attempts, qid))).map(qid => course.questions[qid].competency));
  return course.competencies.map(item => item.id).filter(id => weak.has(id));
}
