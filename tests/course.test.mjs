import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { publishBase } from '../scripts/publish-base.mjs';
import { publishExploration } from '../scripts/publish-exploration.mjs';
import { publishCourse } from '../scripts/publish-course.mjs';
import { checkCourse } from '../scripts/check-course.mjs';
import { recordProgress } from '../scripts/record-progress.mjs';
import { parseUnifiedDiff } from '../scripts/lib/validate-course.mjs';
import { readJson, digest } from '../scripts/lib/storage.mjs';
import { packageRoot } from '../scripts/check-package.mjs';
import { temporary, fixture, exploration, candidate } from './helpers.mjs';

const MODEL = [
  'export function backbone(x) {',
  '  return [x, x * 2];',
  '}',
  '',
  'export function head(features) {',
  '  const [low, high] = features;',
  '  return low + high;',
  '}',
  '',
  'export function forward(x) {',
  '  return head(backbone(x));',
  '}',
  '',
].join('\n');
const DIFF = [
  '--- a/src/model.js',
  '+++ b/src/model.js',
  '@@ -1,3 +1,3 @@',
  ' export function backbone(x) {',
  '-  return [x, x * 2];',
  '+  return [x * 2];',
  ' }',
  '@@ -10,3 +10,4 @@',
  ' export function forward(x) {',
  '+  if (!x) return 0;',
  '   return head(backbone(x));',
  ' }',
  '',
].join('\n');

async function setup(t) {
  const root = temporary(t);
  fixture(root, path.join(packageRoot, 'scripts'));
  fs.writeFileSync(path.join(root, 'src/model.js'), MODEL);
  const tree = readJson(path.join(root, '.bridge/work/tree.json'));
  tree.project.fileCount += 1;
  tree.nodes[0].children.push({ id: 'file:src/model.js', name: 'model.js', path: 'src/model.js', kind: 'file', summary: '模型前向流程。', category: 'core' });
  fs.writeFileSync(path.join(root, '.bridge/work/tree.json'), JSON.stringify(tree));
  await publishBase(root, path.join(root, '.bridge/work/tree.json'));
  await publishExploration(root, candidate(root, exploration(root)));
  return root;
}

const hints = () => ['看方向', '缩小范围', '接近结论'];
const refs = () => [{ path: 'src/model.js', start: 5, end: 8 }];

function build(root, id = 'swap-backbone') {
  const question = (type, lesson, competency, extra = {}) => ({ type, lesson, competency, prompt: `${type} 题面`, ...extra });
  const text = (extra = {}) => ({ answer: '参考答案', hints: hints(), ...extra });
  const course = {
    version: 1, id, title: '替换主干', goal: '把主干换成新结构', scope: { in: ['前向数据流'], out: ['训练超参数'] },
    project: { root: fs.realpathSync(root), commit: null, generatedAt: '2026-11-27T00:00:00Z' },
    competencies: [
      { id: 'data-flow', title: '数据流', desc: '追踪前向', dependsOn: [], decision: '判断改动是否接在正确位置' },
      { id: 'interface', title: '接口约定', desc: '特征接口', dependsOn: ['data-flow'], decision: '判断下游是否需要同步' },
    ],
    lessons: [
      { id: 'flow', title: '前向流程', competencies: ['data-flow'], readings: [{ topic: 'greeting-pipeline', evidence: ['entry'] }], pretest: ['pre-flow'], questions: ['q-locate', 'q-order', 'q-predict'] },
      { id: 'contract', title: '特征接口', competencies: ['interface'], readings: [{ topic: 'greeting-pipeline', evidence: ['entry'] }], pretest: [], questions: ['q-explain', 'q-design', 'q-forecast'] },
    ],
    questions: {
      'pre-flow': question('explain', 'flow', 'data-flow'),
      'q-locate': question('locate', 'flow', 'data-flow'),
      'q-order': question('order', 'flow', 'data-flow', { items: ['head', 'backbone'] }),
      'q-predict': question('predict', 'flow', 'data-flow'),
      'q-explain': question('explain', 'contract', 'interface'),
      'q-design': question('design', 'contract', 'interface'),
      'q-forecast': question('forecast', 'contract', 'interface'),
      'cap-blueprint': question('forecast', 'capstone', 'interface'),
      'cap-review': question('review', 'capstone', 'interface', { diff: DIFF }),
    },
    capstone: { blueprint: 'cap-blueprint', review: 'cap-review' },
  };
  const rubric = ['指出关键因果'];
  const key = {
    version: 1,
    answers: {
      'pre-flow': text({ rubric }),
      'q-locate': { answer: { path: 'src/model.js', start: 10, end: 12 }, hints: hints() },
      'q-order': { answer: ['backbone', 'head'], hints: hints() },
      'q-predict': text({ answer: '9', verification: 'derived', refs: refs() }),
      'q-explain': text({ rubric }),
      'q-design': text({ rubric }),
      'q-forecast': text({ rubric }),
      'cap-blueprint': text({ rubric }),
      'cap-review': text({ rubric, risks: [{ id: 'arity', path: 'src/model.js', line: 2, desc: 'head 仍解构两个特征' }] }),
    },
  };
  return { course, key };
}

function write(root, data, probes = {}) {
  const directory = path.join(root, '.bridge/work', `${data.course.id}-candidate`);
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'course.json'), JSON.stringify(data.course));
  fs.writeFileSync(path.join(directory, 'key.json'), JSON.stringify(data.key));
  for (const [name, contents] of Object.entries(probes)) {
    fs.mkdirSync(path.join(directory, 'probes'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'probes', name), contents);
  }
  return directory;
}
const publish = (root, data, options, probes) => publishCourse(root, write(root, data, probes), options);
const courseFile = (root, name, id = 'swap-backbone') => path.join(root, '.bridge/courses', id, name);
const progressOf = root => readJson(courseFile(root, 'progress.json'));
const hashOf = (root, id = 'swap-backbone') => digest(Buffer.concat(['course.json', 'key.json'].map(name => fs.readFileSync(courseFile(root, name, id)))));

// 返回 .bridge 下除指定前缀外所有文件的摘要。
function snapshot(root, skip = []) {
  const base = path.join(root, '.bridge');
  const result = {};
  const walk = relative => {
    for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (['work', ...skip].some(prefix => name === prefix || name.startsWith(`${prefix}/`))) continue;
      if (entry.isDirectory()) walk(name); else result[name] = digest(fs.readFileSync(path.join(base, name)));
    }
  };
  walk('');
  return result;
}

let sequence = 0;
function eventFile(root, event) {
  const file = path.join(root, '.bridge/work', `event-${sequence += 1}.json`);
  fs.writeFileSync(file, JSON.stringify(event));
  return file;
}
const record = (root, event) => recordProgress(root, 'swap-backbone', eventFile(root, event));
const attempt = (root, qid, result = 'correct', hintsUsed = 0) => record(root, { type: 'attempt', qid, result, hintsUsed });
const status = (root, lesson, value) => record(root, { type: 'lesson-status', lesson, status: value });
async function pass(root, lesson, qids) {
  await status(root, lesson, 'in-progress');
  for (const qid of qids) await attempt(root, qid);
  await status(root, lesson, 'passed');
}

test('合法课程发布成功，base、explorations、页面资产与其他课程保持原样', async t => {
  const root = await setup(t);
  const before = snapshot(root);
  assert.equal(await publish(root, build(root)), 'courses/swap-backbone/course.json');
  assert.deepEqual(snapshot(root, ['courses']), before);
  const first = snapshot(root, ['courses/index.json']);
  await publish(root, build(root, 'second-course'));
  assert.deepEqual(snapshot(root, ['courses/index.json', 'courses/second-course']), first);
  assert.deepEqual(readJson(path.join(root, '.bridge/courses/index.json')).courses.map(item => item.id), ['swap-backbone', 'second-course']);
  const progress = progressOf(root);
  assert.equal(progress.courseDigest, hashOf(root));
  assert.deepEqual(progress.lessons, { flow: { status: 'pending' }, contract: { status: 'pending' } });
  assert.deepEqual(progress.attempts, []);
  assert.deepEqual(Object.keys(readJson(courseFile(root, 'key.json')).snapshots).sort(), ['q-locate', 'q-predict']);
  await assert.rejects(publish(root, build(root)), /课程已存在/);
});

test('未初始化仓库提示先运行 bridge', async t => {
  await assert.rejects(publishCourse(temporary(t), 'missing'), /先运行 bridge/);
});

const invalid = [
  ['能力依赖环', ({ course }) => { course.competencies[0].dependsOn = ['interface']; }, /依赖成环/],
  ['课程顺序违反依赖', ({ course }) => { course.lessons.reverse(); }, /违反依赖/],
  ['未覆盖能力', ({ course }) => { course.competencies.push({ id: 'unused', title: '未用', desc: '未用', dependsOn: [], decision: '无' }); }, /未被任何课覆盖/],
  ['题缺少答案', ({ key }) => { delete key.answers['q-design']; }, /题目缺少答案/],
  ['多余答案', ({ key }) => { key.answers.extra = key.answers['q-design']; }, /没有对应题目/],
  ['原型链名称不算题目', ({ course }) => { course.lessons[0].pretest = ['constructor']; }, /不存在的题目/],
  ['题目归属重复', ({ course }) => { course.lessons[0].pretest = ['q-locate']; }, /归属不唯一/],
  ['题目无归属', ({ course }) => { course.lessons[0].pretest = []; }, /未归属/],
  ['正式题过少', ({ course }) => { course.lessons[1].questions.pop(); }, /数量须为 3–5/],
  ['引用不存在的主题', ({ course }) => { course.lessons[0].readings[0].topic = 'missing-topic'; }, /主题索引中不存在/],
  ['引用不存在的证据', ({ course }) => { course.lessons[0].readings[0].evidence = ['toString']; }, /不存在证据/],
  ['提示不是三级', ({ key }) => { key.answers['q-order'].hints.pop(); }, /数量须为 3–3/],
  ['开放题缺少 rubric', ({ key }) => { delete key.answers['q-explain'].rubric; }, /rubric/],
  ['排序答案不是排列', ({ key }) => { key.answers['q-order'].answer = ['backbone', 'backbone']; }, /排列/],
  ['locate 行号越界', ({ key }) => { key.answers['q-locate'].answer.end = 13; }, /超出 src\/model\.js 的实际行数 12/],
  ['refs 路径不在扫描中', ({ key }) => { key.answers['q-predict'].refs[0].path = '../outside.js'; }, /逃逸/],
  ['predict 缺少验证标记', ({ key }) => { delete key.answers['q-predict'].verification; }, /measured 或 derived/],
  ['measured 没有探针', ({ key }) => { key.answers['q-predict'].verification = 'measured'; }, /须在题目中登记/],
  ['探针文件缺失', ({ course }) => { course.questions['q-predict'].probe = 'probes/missing.py'; }, /探针文件不存在/],
  ['diff 上下文与磁盘不符', ({ course }) => { course.questions['cap-review'].diff = DIFF.replace(' export function forward', ' export function backward'); }, /与磁盘不符/],
  ['diff 删除行与磁盘不符', ({ course }) => { course.questions['cap-review'].diff = DIFF.replace('-  return [x, x * 2];', '-  return [x, x];'); }, /与磁盘不符/],
  ['review 缺少 diff', ({ course }) => { delete course.questions['cap-review'].diff; }, /diff 必须为非空文本/],
  ['风险行落在 diff 外', ({ key }) => { key.answers['cap-review'].risks[0].line = 7; }, /落在 diff hunk 内/],
  ['结业题类型错误', ({ course }) => { course.capstone.blueprint = 'q-design'; course.lessons[1].questions[1] = 'cap-blueprint'; }, /结业题类型须为 forecast/],
  ['缺少结业题', ({ course }) => { delete course.capstone.review; }, /不存在的题目/],
];
test('无效候选被拒绝且已发布课程保持原样', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  const before = snapshot(root), expectedHash = hashOf(root);
  for (const [name, mutate, pattern] of invalid) {
    const data = build(root);
    mutate(data);
    await assert.rejects(publish(root, data, { update: true, expectedHash }), pattern, name);
    const fresh = build(root, 'rejected-course');
    mutate(fresh);
    await assert.rejects(publish(root, fresh), pattern, `新课程：${name}`);
  }
  assert.deepEqual(snapshot(root), before);
  assert.ok(checkCourse(root, 'swap-backbone').ok);
});

const NEW_FILE = '--- /dev/null\n+++ b/src/block.js\n@@ -0,0 +1,2 @@\n+export const block = x => x;\n+export default block;\n';

test('unified diff 解析器支持多文件、新建文件与多 hunk 并核对行数', () => {
  const diff = parseUnifiedDiff(`diff --git a/src/model.js b/src/model.js\nindex 111..222 100644\n${DIFF}diff --git a/src/block.js b/src/block.js\nnew file mode 100644\n${NEW_FILE}`);
  assert.deepEqual(diff.files.map(file => [file.path, file.created]), [['src/model.js', false], ['src/block.js', true]]);
  assert.deepEqual(diff.files[0].hunks.map(hunk => [hunk.oldStart, hunk.oldCount, hunk.newStart, hunk.newCount]), [[1, 3, 1, 3], [10, 3, 10, 4]]);
  assert.throws(() => parseUnifiedDiff(`${DIFF}${DIFF}`), /重复出现/);
  assert.throws(() => parseUnifiedDiff(DIFF.replace('@@ -1,3 +1,3 @@', '@@ -1,4 +1,4 @@')), /无效行|行数|hunk 头/);
  assert.throws(() => parseUnifiedDiff(DIFF.replace('@@ -1,3 +1,3 @@', '@@ -1,2 +1,2 @@')), /hunk 头|行数/);
  assert.throws(() => parseUnifiedDiff(DIFF.replace('@@ -10,3 +10,4 @@', '@@ -2,3 +2,4 @@')), /重叠/);
  assert.throws(() => parseUnifiedDiff(DIFF.replace('@@ -10,3 +10,4 @@', '@@ -10,3 +11,4 @@')), /起始行号/);
  assert.throws(() => parseUnifiedDiff(NEW_FILE.replace('@@ -0,0 +1,2 @@', '@@ -1,0 +1,2 @@')), /新建文件只能/);
  assert.throws(() => parseUnifiedDiff('--- a/a.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-a\n'), /删除文件/);
  assert.throws(() => parseUnifiedDiff('--- a/a.js\n+++ b/b.js\n@@ -1 +1 @@\n-a\n+b\n'), /重命名/);
  assert.throws(() => parseUnifiedDiff('--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n a\n'), /没有任何增删行/);
  assert.throws(() => parseUnifiedDiff('+++ b/a.js\n@@ -1 +1 @@\n-a\n+b\n'), /文件头/);
});

test('审查 diff 可跨文件并新建文件，风险可指向其中任一文件', async t => {
  const root = await setup(t);
  const data = build(root);
  data.course.questions['cap-review'].diff = `${DIFF}${NEW_FILE}`;
  data.key.answers['cap-review'].risks.push({ id: 'unused-block', path: 'src/block.js', line: 1, desc: '新模块未被前向调用' });
  await publish(root, data);
  assert.ok(checkCourse(root, 'swap-backbone').ok);
  for (const [name, mutate, pattern] of [
    ['新建文件已存在', item => { item.course.questions['cap-review'].diff = `${DIFF}${NEW_FILE.replace('b/src/block.js', 'b/src/nested/main.js')}`; }, /新建文件已存在：src\/nested\/main\.js/],
    ['新建文件路径逃逸', item => { item.course.questions['cap-review'].diff = `${DIFF}${NEW_FILE.replace('b/src/block.js', 'b/../block.js')}`; }, /逃逸|路径/],
    ['新建文件位于 .bridge', item => { item.course.questions['cap-review'].diff = `${DIFF}${NEW_FILE.replace('b/src/block.js', 'b/.bridge/block.js')}`; }, /\.git 或 \.bridge/],
    ['风险文件不在 diff 中', item => { item.key.answers['cap-review'].risks[0].path = 'src/other.js'; }, /须是 diff 中的文件/],
    ['风险行超出新文件 hunk', item => { item.key.answers['cap-review'].risks.at(-1).line = 3; }, /落在 diff hunk 内/],
  ]) {
    const fresh = build(root, 'cross-file');
    fresh.course.questions['cap-review'].diff = `${DIFF}${NEW_FILE}`;
    fresh.key.answers['cap-review'].risks.push({ id: 'unused-block', path: 'src/block.js', line: 1, desc: '新模块未被前向调用' });
    mutate(fresh);
    await assert.rejects(publish(root, fresh), pattern, name);
  }
  // 新建文件在发布后出现于磁盘（例如改动已被实施），课程应报告过期。
  fs.writeFileSync(path.join(root, 'src/block.js'), 'export default 1;\n');
  const report = checkCourse(root, 'swap-backbone');
  assert.equal(report.ok, false);
  assert.ok(report.staleQuestions.some(item => item.qid === 'cap-review'));
});

test('更新需要匹配的摘要，成功后备份并只保留仍有效的学习记录', async t => {
  const root = await setup(t);
  const initial = build(root);
  initial.course.questions['q-predict'].probe = 'probes/shape.mjs';
  initial.key.answers['q-predict'].verification = 'measured';
  await publish(root, initial, undefined, { 'shape.mjs': 'console.log(9);\n' });
  await pass(root, 'flow', ['q-locate', 'q-order', 'q-predict']);
  await pass(root, 'contract', ['q-explain', 'q-design', 'q-forecast']);
  await attempt(root, 'cap-blueprint', 'partial');
  await attempt(root, 'cap-review');
  await record(root, { type: 'capstone', blueprint: '我的蓝图', reviewFindings: '我的审查发现' });

  const next = build(root);
  next.course.questions['q-predict'].prompt = '换一个输入后的返回值';
  next.course.questions['cap-review'].prompt = '重新审查';
  next.key.answers['q-explain'].hints[0] = '仅修订提示';
  const old = Object.fromEntries(['course.json', 'key.json', 'progress.json'].map(name => [name, fs.readFileSync(courseFile(root, name))]));
  const expectedHash = hashOf(root), before = snapshot(root);
  await assert.rejects(publish(root, next, { update: true }), /expected-hash/);
  await assert.rejects(publish(root, next, { update: true, expectedHash: 'wrong' }), /expected-hash/);
  await assert.rejects(publish(root, build(root, 'absent-course'), { update: true, expectedHash }), /不存在/);
  assert.deepEqual(snapshot(root), before);

  await publish(root, next, { update: true, expectedHash });
  const history = path.join(root, '.bridge/history/courses/swap-backbone', expectedHash);
  for (const [name, contents] of Object.entries(old)) assert.deepEqual(fs.readFileSync(path.join(history, name)), contents);
  assert.equal(fs.readFileSync(path.join(history, 'probes/shape.mjs'), 'utf8'), 'console.log(9);\n');
  assert.ok(!fs.existsSync(courseFile(root, 'probes/shape.mjs')));
  const progress = progressOf(root);
  assert.equal(progress.courseDigest, hashOf(root));
  assert.deepEqual(progress.lessons, { flow: { status: 'pending' }, contract: { status: 'passed' } });
  assert.deepEqual(progress.attempts.map(item => item.qid), ['q-locate', 'q-order', 'q-explain', 'q-design', 'q-forecast', 'cap-blueprint']);
  assert.deepEqual(progress.capstone, { blueprint: '我的蓝图', reviewFindings: null });
  assert.deepEqual(progress.weak, ['interface']);
});

test('写入失败时恢复旧课程与进度', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  const expectedHash = hashOf(root), next = build(root);
  next.course.title = '新标题';
  const directory = write(root, next);
  const names = ['courses/index.json', 'courses/swap-backbone/course.json', 'courses/swap-backbone/key.json', 'courses/swap-backbone/progress.json'];
  const old = names.map(name => fs.readFileSync(path.join(root, '.bridge', name)));
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to.endsWith(path.join('courses', 'index.json'))) throw new Error('模拟索引失败');
    return rename(from, to);
  });
  await assert.rejects(publishCourse(root, directory, { update: true, expectedHash }), /模拟索引失败/);
  names.forEach((name, i) => assert.deepEqual(fs.readFileSync(path.join(root, '.bridge', name)), old[i]));
});

test('拒绝链接形式的课程输出目录与候选探针', async t => {
  const root = await setup(t);
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  const link = process.platform === 'win32' ? 'junction' : 'dir';
  const directory = write(root, build(root));
  fs.symlinkSync(outside, path.join(directory, 'probes'), link);
  await assert.rejects(publishCourse(root, directory), /真实目录/);
  fs.symlinkSync(outside, path.join(root, '.bridge/courses'), link);
  await assert.rejects(publish(root, build(root)), /链接/);
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('进度脚本拒绝未知题目、非法状态与未达标的通过', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  const untouched = fs.readFileSync(courseFile(root, 'progress.json'));
  await assert.rejects(attempt(root, 'unknown'), /未知题目/);
  await assert.rejects(attempt(root, 'constructor'), /未知题目/);
  await assert.rejects(attempt(root, 'q-locate'), /in-progress/);
  await assert.rejects(attempt(root, 'pre-flow', 'great'), /result/);
  await assert.rejects(attempt(root, 'pre-flow', 'correct', 4), /hintsUsed/);
  await assert.rejects(attempt(root, 'cap-review'), /结业前/);
  await assert.rejects(record(root, { type: 'capstone', blueprint: '过早' }), /结业前/);
  await assert.rejects(record(root, { type: 'delete' }), /事件类型/);
  await assert.rejects(record(root, { type: 'attempt', qid: 'pre-flow', result: 'correct', hintsUsed: 0, at: 'x' }), /未知字段/);
  await assert.rejects(status(root, 'unknown', 'skipped'), /未知课/);
  await assert.rejects(status(root, 'flow', 'passed'), /非法状态转移/);
  await assert.rejects(status(root, 'flow', 'done'), /非法状态转移/);
  await assert.rejects(status(root, 'flow', 'tested-out'), /跳课测/);
  await assert.rejects(status(root, 'contract', 'in-progress'), /尚未达标或跳过/);
  assert.deepEqual(fs.readFileSync(courseFile(root, 'progress.json')), untouched);

  await status(root, 'flow', 'in-progress');
  await assert.rejects(attempt(root, 'pre-flow'), /pending/);
  await attempt(root, 'q-locate');
  await attempt(root, 'q-order', 'partial', 1);
  await assert.rejects(status(root, 'flow', 'passed'), /q-predict/);
  await attempt(root, 'q-predict', 'missed', 3);
  await assert.rejects(status(root, 'flow', 'passed'), /missed/);
  assert.deepEqual(progressOf(root).weak, ['data-flow']);
  await record(root, { type: 'attempt', qid: 'q-predict', result: 'correct', hintsUsed: 0, note: '变式重练：换输入' });
  await attempt(root, 'q-order');
  await status(root, 'flow', 'passed');
  await assert.rejects(status(root, 'flow', 'skipped'), /非法状态转移/);
  assert.deepEqual(progressOf(root).weak, []);
  assert.equal(progressOf(root).attempts.length, 5);

  await status(root, 'contract', 'skipped');
  await attempt(root, 'cap-blueprint', 'partial');
  await attempt(root, 'cap-review', 'missed', 3);
  await record(root, { type: 'capstone', blueprint: '蓝图原文' });
  await record(root, { type: 'capstone', reviewFindings: '审查原文' });
  await assert.rejects(record(root, { type: 'capstone' }), /原文/);
  assert.deepEqual(progressOf(root).capstone, { blueprint: '蓝图原文', reviewFindings: '审查原文' });
  assert.deepEqual(progressOf(root).weak, ['interface']);
});

test('跳课测全对且未用提示记 tested-out，用过提示则不可', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  await attempt(root, 'pre-flow');
  await status(root, 'flow', 'tested-out');
  await status(root, 'flow', 'in-progress');
  const other = await setup(t);
  await publish(other, build(other));
  await attempt(other, 'pre-flow', 'correct', 1);
  await attempt(other, 'pre-flow');
  await assert.rejects(status(other, 'flow', 'tested-out'), /未用提示/);
});

test('进度与课程文件不一致时拒绝记录', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  fs.appendFileSync(courseFile(root, 'key.json'), '\n');
  await assert.rejects(attempt(root, 'pre-flow'), /摘要不一致/);
  assert.match(checkCourse(root, 'swap-backbone').errors.join(), /摘要不一致/);
});

test('独立进程并发记录保留全部作答', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  await status(root, 'flow', 'in-progress');
  const run = qid => new Promise((resolve, reject) => {
    const file = eventFile(root, { type: 'attempt', qid, result: 'correct', hintsUsed: 0 });
    const child = spawn(process.execPath, [path.join(packageRoot, 'scripts/record-progress.mjs'), root, 'swap-backbone', file]);
    let error = '';
    child.stderr.on('data', part => { error += part; });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(error))));
  });
  const qids = ['q-locate', 'q-order', 'q-predict', 'q-locate', 'q-order', 'q-predict'];
  await Promise.all(qids.map(run));
  assert.deepEqual(progressOf(root).attempts.map(item => item.qid).sort(), [...qids].sort());
});

test('修改源码后 check-course 报告过期题与过期讲义，且保持只读', async t => {
  const root = await setup(t);
  await publish(root, build(root));
  const script = path.join(packageRoot, 'scripts/check-course.mjs');
  const run = () => spawnSync(process.execPath, [script, root, 'swap-backbone'], { encoding: 'utf8' });
  const clean = run();
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(JSON.parse(clean.stdout).digest, hashOf(root));

  // 在文件开头插入一行：行号仍在范围内，源码快照与 diff 均须发现偏移。
  fs.writeFileSync(path.join(root, 'src/model.js'), `// moved\n${MODEL}`);
  const before = snapshot(root);
  const shifted = run();
  assert.equal(shifted.status, 1);
  const report = JSON.parse(shifted.stdout);
  assert.deepEqual(report.staleQuestions.map(item => item.qid).sort(), ['cap-review', 'q-locate', 'q-predict']);
  assert.deepEqual(report.staleReadings, []);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(snapshot(root), before);

  fs.writeFileSync(path.join(root, 'src/model.js'), MODEL);
  assert.ok(checkCourse(root, 'swap-backbone').ok);
  fs.writeFileSync(path.join(root, 'src/nested/main.js'), 'changed();\n');
  const reading = checkCourse(root, 'swap-backbone');
  assert.deepEqual(reading.staleQuestions, []);
  assert.deepEqual(reading.staleReadings.map(item => [item.lesson, item.topic, item.evidence]), [['flow', 'greeting-pipeline', 'entry'], ['contract', 'greeting-pipeline', 'entry']]);

  fs.rmSync(path.join(root, 'src/model.js'));
  assert.ok(checkCourse(root, 'swap-backbone').staleQuestions.some(item => item.qid === 'cap-review'));
  assert.throws(() => checkCourse(root, 'missing-course'), /课程不存在/);
});

test('课程脚本参数错误时给出用法', () => {
  for (const [name, args] of [['publish-course', []], ['publish-course', ['a', 'b', '--update']], ['check-course', ['a']], ['record-progress', ['a', 'b']]]) {
    const result = spawnSync(process.execPath, [path.join(packageRoot, 'scripts', `${name}.mjs`), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 1, name);
    assert.match(result.stderr, /用法/);
  }
});
