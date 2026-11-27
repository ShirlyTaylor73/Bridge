import { isDeepStrictEqual } from 'node:util';
import { normalizeRelative, readSourceText } from './validate-analysis.mjs';
import { topicPattern, readIndex, readJson, safeOutput, digest } from './storage.mjs';

export const QUESTION_TYPES = ['locate', 'order', 'predict', 'explain', 'design', 'forecast', 'review'];
const OPEN_TYPES = new Set(['explain', 'design', 'forecast', 'review']);
const DIFF_TYPES = new Set(['forecast', 'review']);
const VERIFICATIONS = new Set(['measured', 'derived']);
export const CAPSTONE = 'capstone';
export const probePattern = /^probes\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && Boolean(value.trim());
const isId = value => typeof value === 'string' && value.length <= 80 && topicPattern.test(value);

export const splitLines = text => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
};

// 解析单文件、多 hunk 的 unified diff；格式错误直接抛出。
export function parseUnifiedDiff(text) {
  if (!isText(text)) throw new Error('diff 必须为非空文本');
  const lines = splitLines(text);
  let index = 0;
  while (index < lines.length && /^(diff --git |index )/.test(lines[index])) index += 1;
  const header = (marker, prefix) => {
    const line = lines[index++];
    if (!line?.startsWith(`${marker} ${prefix}`)) throw new Error(`diff 需要 "${marker} ${prefix}<路径>" 文件头（只支持修改已有的单个文件）`);
    return line.slice(marker.length + 1 + prefix.length).split('\t')[0];
  };
  const oldPath = header('---', 'a/'), newPath = header('+++', 'b/');
  if (oldPath !== newPath) throw new Error('diff 不支持重命名，两个文件头路径须一致');
  const hunks = [];
  let delta = 0, previousEnd = 0;
  while (index < lines.length) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[index]);
    if (!match) {
      if (/^(diff --git |--- )/.test(lines[index])) throw new Error('diff 只支持单个文件');
      throw new Error(`diff 第 ${index + 1} 行应为 hunk 头；请检查 hunk 行数与头部是否一致`);
    }
    index += 1;
    const [oldStart, oldCount, newStart, newCount] = [match[1], match[2] ?? '1', match[3], match[4] ?? '1'].map(Number);
    const name = `diff 第 ${hunks.length + 1} 个 hunk`;
    if (oldStart < 1 || oldCount < 1) throw new Error(`${name} 至少需要一行上下文或删除行来对应磁盘内容`);
    if (oldStart <= previousEnd) throw new Error(`${name} 顺序错误或与前一个 hunk 重叠`);
    if (newStart !== oldStart + delta - (newCount === 0 ? 1 : 0)) throw new Error(`${name} 的新文件起始行号与前文增删行数不一致`);
    const body = [];
    let oldLeft = oldCount, newLeft = newCount, changed = false;
    while (oldLeft > 0 || newLeft > 0 || lines[index]?.startsWith('\\')) {
      const line = lines[index++];
      if (line === undefined) throw new Error(`${name} 行数少于头部声明`);
      if (line.startsWith('\\')) continue;
      const tag = line[0];
      if (![' ', '+', '-'].includes(tag)) throw new Error(`${name} 含无效行（须以空格、+ 或 - 开头，空白上下文行保留前导空格）`);
      if (tag !== '+') oldLeft -= 1;
      if (tag !== '-') newLeft -= 1;
      if (tag !== ' ') changed = true;
      if (oldLeft < 0 || newLeft < 0) throw new Error(`${name} 行数与头部声明不一致`);
      body.push({ tag, text: line.slice(1) });
    }
    if (!changed) throw new Error(`${name} 没有任何增删行`);
    hunks.push({ oldStart, oldCount, newStart, newCount, lines: body });
    previousEnd = oldStart + oldCount - 1;
    delta += newCount - oldCount;
  }
  if (!hunks.length) throw new Error('diff 缺少 hunk');
  return { path: oldPath, hunks };
}

// 影响作答与判分的内容；提示、参考位置与验证标记的修订不使掌握记录失效。
export function questionSubstance(course, key, qid) {
  const question = course.questions[qid], answer = key.answers[qid];
  const pretest = course.lessons.some(lesson => lesson.pretest.includes(qid));
  return [question.type, question.lesson, pretest, question.competency, question.prompt, question.items, question.diff, answer.answer, answer.rubric, answer.risks];
}
export const sameQuestion = (before, after, qid) => Object.hasOwn(before.course.questions, qid) && Object.hasOwn(after.course.questions, qid)
  && isDeepStrictEqual(questionSubstance(before.course, before.key, qid), questionSubstance(after.course, after.key, qid));

// current=false 用于发布后的过期检查：不要求 commit 一致，改为比对发布时的源码快照与讲义证据。
export function validateCourse(root, course, key, { bridge, scan, probes = [], current = true }) {
  const issues = [];
  const snapshots = {};
  const scanFiles = new Set(scan.files.map(file => file.path));
  const probeFiles = new Set(probes);
  const sources = new Map();
  let context = {};
  const fail = (location, message) => issues.push({ ...context, message: `${location}：${message}` });

  function object(value, allowed, location) {
    if (!isObject(value)) { fail(location, '必须是对象'); return false; }
    for (const name of Object.keys(value)) if (!allowed.includes(name)) fail(location, `未知字段 ${name}`);
    return true;
  }
  function text(value, location) {
    if (!isText(value)) fail(location, '必须是非空字符串');
  }
  function list(value, location, { min = 0, max = Infinity } = {}) {
    if (!Array.isArray(value)) { fail(location, '必须是数组'); return []; }
    if (value.length < min || value.length > max) fail(location, max === Infinity ? `至少需要 ${min} 项` : `数量须为 ${min}–${max}`);
    return value;
  }
  function texts(value, location, limits) {
    list(value, location, limits).forEach((item, i) => text(item, `${location}[${i}]`));
  }
  function id(value, location) {
    if (!isId(value)) { fail(location, 'ID 须为 kebab-case，最长 80 字符'); return false; }
    return true;
  }
  function sourceLines(file, location) {
    const pathError = normalizeRelative(file);
    if (pathError) { fail(location, pathError); return null; }
    if (!scanFiles.has(file)) { fail(location, `不在本次扫描文件中：${file}`); return null; }
    if (!sources.has(file)) {
      try { sources.set(file, splitLines(readSourceText(root, file))); }
      catch (error) { fail(location, `读取源文件失败：${error.message}`); return null; }
    }
    return sources.get(file);
  }
  function range(value, location) {
    if (!object(value, ['path', 'start', 'end'], location)) return null;
    const lines = sourceLines(value.path, `${location}.path`);
    if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 1 || value.end < value.start) {
      fail(location, 'start/end 须为正整数且 end 不小于 start');
      return null;
    }
    if (!lines) return null;
    if (value.end > lines.length) { fail(location, `行号超出 ${value.path} 的实际行数 ${lines.length}`); return null; }
    return [value.path, value.start, value.end, lines.slice(value.start - 1, value.end)];
  }

  const finish = () => ({ issues, snapshots });
  if (!object(course, ['version', 'id', 'title', 'goal', 'scope', 'project', 'competencies', 'lessons', 'questions', CAPSTONE], 'course')) return finish();
  if (!object(key, ['version', 'answers', 'snapshots'], 'key')) return finish();
  if (course.version !== 1) fail('course.version', '必须等于 1');
  if (key.version !== 1) fail('key.version', '必须等于 1');
  if (id(course.id, 'course.id') && course.id === 'index') fail('course.id', '不能为 index');
  text(course.title, 'course.title');
  text(course.goal, 'course.goal');
  if (object(course.scope, ['in', 'out'], 'course.scope')) {
    texts(course.scope.in, 'course.scope.in', { min: 1 });
    texts(course.scope.out, 'course.scope.out');
  }
  if (object(course.project, ['root', 'commit', 'generatedAt'], 'course.project')) {
    text(course.project.generatedAt, 'course.project.generatedAt');
    if (current && course.project.root !== root) fail('course.project.root', `必须等于真实项目根目录 ${root}`);
    if (current && course.project.commit !== scan.project.commit) fail('course.project.commit', `必须等于本次扫描 commit ${JSON.stringify(scan.project.commit)}`);
  }

  // 能力图：ID 唯一、依赖存在且无环。
  const competencies = new Map();
  list(course.competencies, 'course.competencies', { min: 1 }).forEach((item, i) => {
    const location = `course.competencies[${i}]`;
    if (!object(item, ['id', 'title', 'desc', 'dependsOn', 'decision'], location)) return;
    for (const name of ['title', 'desc', 'decision']) text(item[name], `${location}.${name}`);
    const dependsOn = list(item.dependsOn, `${location}.dependsOn`);
    if (!id(item.id, `${location}.id`)) return;
    if (competencies.has(item.id)) fail(`${location}.id`, `重复能力 ID ${item.id}`);
    else competencies.set(item.id, dependsOn);
  });
  for (const [name, dependsOn] of competencies) {
    for (const dependency of dependsOn) if (!competencies.has(dependency)) fail(`能力 ${name}.dependsOn`, `未知能力 ${dependency}`);
  }
  const visited = new Map();
  const visit = (name, trail) => {
    if (visited.get(name) === 'done') return;
    if (visited.get(name) === 'active') { fail('course.competencies', `能力依赖成环：${[...trail.slice(trail.indexOf(name)), name].join(' → ')}`); return; }
    visited.set(name, 'active');
    for (const dependency of competencies.get(name)) if (competencies.has(dependency)) visit(dependency, [...trail, name]);
    visited.set(name, 'done');
  };
  for (const name of competencies.keys()) visit(name, []);

  const questions = isObject(course.questions) ? course.questions : {};
  if (!isObject(course.questions)) fail('course.questions', '必须是对象');
  const owners = new Map();
  function own(qid, owner, location) {
    if (typeof qid !== 'string' || !Object.hasOwn(questions, qid)) { fail(location, `引用了不存在的题目 ${qid}`); return; }
    if (owners.has(qid)) fail(location, `题目 ${qid} 归属不唯一，已属于 ${owners.get(qid).lesson}`);
    else owners.set(qid, owner);
  }

  let topics = null;
  const topicData = new Map();
  function loadTopic(name) {
    if (!topicData.has(name)) {
      topics ??= new Map(readIndex(bridge).topics.map(item => [item.id, item]));
      let data = null, error = `主题索引中不存在 ${name}`;
      if (topics.has(name)) {
        try { data = readJson(safeOutput(bridge, topics.get(name).path)); }
        catch (reason) { error = `主题 ${name} 读取失败：${reason.message}`; }
      }
      topicData.set(name, { data, error });
    }
    return topicData.get(name);
  }
  function reading(value, lesson, location) {
    if (!object(value, ['topic', 'evidence'], location)) return;
    const keys = list(value.evidence, `${location}.evidence`, { min: 1 });
    if (!id(value.topic, `${location}.topic`)) return;
    const { data, error } = loadTopic(value.topic);
    if (!data) { context = { lesson, topic: value.topic }; fail(location, error); context = {}; return; }
    for (const name of keys) {
      context = { lesson, topic: value.topic, evidence: name };
      const item = typeof name === 'string' && isObject(data.evidence) && Object.hasOwn(data.evidence, name) ? data.evidence[name] : null;
      if (!item) fail(location, `主题 ${value.topic} 中不存在证据 ${name}`);
      else if (!current) {
        const lines = sourceLines(item.path, `${location}.${name}`);
        // 补回末尾空行，与 explore 证据按 split('\n') 取行的语义一致。
        if (lines && [...lines, ''].slice(item.start - 1, item.end).join('\n') !== String(item.code).replace(/\r\n/g, '\n')) {
          fail(location, `证据 ${name} 与 ${item.path} 第 ${item.start}-${item.end} 行已不一致`);
        }
      }
      context = {};
    }
  }

  // 课程顺序：记录每项能力首次出现的课次。
  const lessons = new Map();
  const firstLesson = new Map();
  list(course.lessons, 'course.lessons', { min: 1 }).forEach((lesson, i) => {
    const location = `course.lessons[${i}]`;
    if (!object(lesson, ['id', 'title', 'competencies', 'readings', 'pretest', 'questions'], location)) return;
    text(lesson.title, `${location}.title`);
    if (id(lesson.id, `${location}.id`)) {
      if (lesson.id === CAPSTONE) fail(`${location}.id`, 'capstone 为结业保留名称');
      if (lessons.has(lesson.id)) fail(`${location}.id`, `重复课程单元 ID ${lesson.id}`);
    }
    const covered = list(lesson.competencies, `${location}.competencies`, { min: 1 });
    for (const name of covered) {
      if (!competencies.has(name)) fail(`${location}.competencies`, `未知能力 ${name}`);
      else if (!firstLesson.has(name)) firstLesson.set(name, i);
    }
    lessons.set(lesson.id, covered);
    list(lesson.readings, `${location}.readings`, { min: 1 }).forEach((item, n) => reading(item, lesson.id, `${location}.readings[${n}]`));
    list(lesson.pretest, `${location}.pretest`, { max: 2 }).forEach(qid => own(qid, { lesson: lesson.id, covered }, `${location}.pretest`));
    list(lesson.questions, `${location}.questions`, { min: 3, max: 5 }).forEach(qid => own(qid, { lesson: lesson.id, covered }, `${location}.questions`));
  });
  for (const [name, dependsOn] of competencies) {
    if (!firstLesson.has(name)) { fail('course.lessons', `能力 ${name} 未被任何课覆盖`); continue; }
    for (const dependency of dependsOn) {
      if (firstLesson.has(dependency) && firstLesson.get(dependency) > firstLesson.get(name)) fail('course.lessons', `课程顺序违反依赖：${dependency} 须先于或同课于 ${name}`);
    }
  }

  if (object(course.capstone, ['blueprint', 'review'], 'course.capstone')) {
    for (const [slot, type] of [['blueprint', 'forecast'], ['review', 'review']]) {
      const qid = course.capstone[slot];
      own(qid, { lesson: CAPSTONE }, `course.capstone.${slot}`);
      if (typeof qid === 'string' && Object.hasOwn(questions, qid) && questions[qid]?.type !== type) fail(`course.capstone.${slot}`, `结业题类型须为 ${type}`);
    }
  }

  const answers = isObject(key.answers) ? key.answers : {};
  if (!isObject(key.answers)) fail('key.answers', '必须是对象');
  for (const qid of Object.keys(answers)) if (!Object.hasOwn(questions, qid)) fail('key.answers', `答案 ${qid} 没有对应题目`);

  function checkDiff(value, location) {
    let diff;
    try { diff = parseUnifiedDiff(value); } catch (error) { fail(location, error.message); return null; }
    const lines = sourceLines(diff.path, location);
    if (!lines) return null;
    for (const hunk of diff.hunks) {
      let number = hunk.oldStart;
      for (const line of hunk.lines.filter(item => item.tag !== '+')) {
        if (lines[number - 1] !== line.text) {
          fail(location, `上下文或删除行与磁盘不符：${diff.path} 第 ${number} 行`);
          return null;
        }
        number += 1;
      }
    }
    return diff;
  }

  for (const [qid, question] of Object.entries(questions)) {
    context = { qid };
    const location = `course.questions.${qid}`;
    id(qid, location);
    if (!owners.has(qid)) fail(location, '题目未归属任何课或结业');
    if (!object(question, ['type', 'lesson', 'competency', 'prompt', 'items', 'diff', 'probe'], location)) continue;
    const { type } = question;
    if (!QUESTION_TYPES.includes(type)) fail(`${location}.type`, `题型须为 ${QUESTION_TYPES.join('、')}`);
    text(question.prompt, `${location}.prompt`);
    const owner = owners.get(qid);
    if (owner && question.lesson !== owner.lesson) fail(`${location}.lesson`, `须等于实际归属 ${owner.lesson}`);
    context = { qid, lesson: owner?.lesson };
    if (!competencies.has(question.competency)) fail(`${location}.competency`, `未知能力 ${question.competency}`);
    else if (owner?.covered && !owner.covered.includes(question.competency)) fail(`${location}.competency`, '须是所在课覆盖的能力');
    if (type === 'order') {
      const items = list(question.items, `${location}.items`, { min: 2 });
      texts(items, `${location}.items`);
      if (new Set(items).size !== items.length) fail(`${location}.items`, '排序项不能重复');
    } else if ('items' in question) fail(`${location}.items`, '仅 order 题使用 items');
    let diff = null;
    if (type === 'review' || (DIFF_TYPES.has(type) && 'diff' in question)) diff = checkDiff(question.diff, `${location}.diff`);
    else if ('diff' in question) fail(`${location}.diff`, '仅 review 与 forecast 题使用 diff');
    if ('probe' in question) {
      if (typeof question.probe !== 'string' || !probePattern.test(question.probe)) fail(`${location}.probe`, '须为 probes/<文件名>');
      else if (!probeFiles.has(question.probe)) fail(`${location}.probe`, `探针文件不存在：${question.probe}`);
    }

    const answerLocation = `key.answers.${qid}`;
    if (!Object.hasOwn(answers, qid)) { fail(answerLocation, '题目缺少答案'); continue; }
    const answer = answers[qid];
    if (!object(answer, ['answer', 'hints', 'rubric', 'refs', 'risks', 'verification'], answerLocation)) continue;
    texts(answer.hints, `${answerLocation}.hints`, { min: 3, max: 3 });
    if (OPEN_TYPES.has(type) || 'rubric' in answer) texts(answer.rubric, `${answerLocation}.rubric`, { min: 1 });
    const ranges = [];
    if (type === 'locate') ranges.push(range(answer.answer, `${answerLocation}.answer`));
    else if (type === 'order') {
      const items = Array.isArray(question.items) ? question.items : [];
      if (!Array.isArray(answer.answer) || !isDeepStrictEqual([...answer.answer].sort(), [...items].sort())) fail(`${answerLocation}.answer`, '须是 items 的一个排列');
    } else text(answer.answer, `${answerLocation}.answer`);
    if ('refs' in answer) list(answer.refs, `${answerLocation}.refs`).forEach((item, i) => ranges.push(range(item, `${answerLocation}.refs[${i}]`)));
    if (type === 'predict' || 'verification' in answer) {
      if (!VERIFICATIONS.has(answer.verification)) fail(`${answerLocation}.verification`, '须为 measured 或 derived');
      if (answer.verification === 'measured' && !('probe' in question)) fail(`${answerLocation}.verification`, 'measured 须在题目中登记实际运行过的 probe');
    }
    if (type === 'review') {
      const seen = new Set();
      list(answer.risks, `${answerLocation}.risks`, { min: 1 }).forEach((risk, i) => {
        const riskLocation = `${answerLocation}.risks[${i}]`;
        if (!object(risk, ['id', 'path', 'line', 'desc'], riskLocation)) return;
        if (id(risk.id, `${riskLocation}.id`)) {
          if (seen.has(risk.id)) fail(`${riskLocation}.id`, '风险 ID 重复');
          seen.add(risk.id);
        }
        text(risk.desc, `${riskLocation}.desc`);
        if (!diff) return;
        if (risk.path !== diff.path) fail(`${riskLocation}.path`, `须等于 diff 文件 ${diff.path}`);
        if (!Number.isInteger(risk.line) || !diff.hunks.some(hunk => risk.line >= hunk.newStart && risk.line < hunk.newStart + hunk.newCount)) {
          fail(`${riskLocation}.line`, '须是落在 diff hunk 内的改动后文件行号');
        }
      });
    } else if ('risks' in answer) fail(`${answerLocation}.risks`, '仅 review 题使用 risks');

    if (ranges.length && ranges.every(Boolean)) {
      snapshots[qid] = digest(JSON.stringify(ranges));
      if (!current && key.snapshots?.[qid] !== snapshots[qid]) fail(answerLocation, '答案引用的源码行内容与发布时不一致');
    }
  }
  context = {};
  return finish();
}
