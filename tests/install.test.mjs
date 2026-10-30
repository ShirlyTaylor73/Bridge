import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { install, platforms, parseArgs } from '../scripts/install.mjs';
import { packageRoot } from '../scripts/check-package.mjs';
import { temporary, copyPackage } from './helpers.mjs';

const quiet = () => {};
const run = (home, platform, extra = {}) => install({ platform, ...extra }, { home, log: quiet });
for (const platform of platforms.filter((item) => item.mode === 'skill-link')) {
  test(`${platform.id}: 安装、重复安装、卸载与来源保护`, (t) => {
    const home = temporary(t);
    const target = path.join(home, platform.directory, 'bridge');
    run(home, platform.id);
    assert.ok(fs.lstatSync(target).isSymbolicLink());
    assert.equal(fs.realpathSync(target), fs.realpathSync(path.join(packageRoot, 'skills/bridge')));
    run(home, platform.id);
    const explore = path.join(home, platform.directory, 'explore');
    assert.ok(fs.lstatSync(explore).isSymbolicLink());
    const skillRoot=fs.realpathSync(path.join(explore,'SKILL.md'));
    assert.ok(fs.existsSync(path.resolve(path.dirname(skillRoot),'../../scripts/publish-exploration.mjs')));
    if (platform.id === 'kiro') {
      const agent = JSON.parse(fs.readFileSync(path.join(home, '.kiro/agents/bridge.json')));
      assert.equal(agent.name, 'bridge');
      assert.ok(agent.resources[0].endsWith('/bridge/SKILL.md'));
      assert.ok(agent.resources[1].endsWith('/explore/SKILL.md'));
    }
    run(home, platform.id, { uninstall: true });
    run(home, platform.id, { uninstall: true });
    assert.ok(!fs.existsSync(target));
    assert.ok(!fs.existsSync(explore));
    assert.ok(fs.existsSync(path.join(packageRoot, 'skills/bridge/SKILL.md')));
  });
}
test('dry-run、help、list 与原生客户端不写入用户目录', (t) => {
  const root = temporary(t);
  const home = path.join(root, '不存在');
  run(home, 'opencode', { 'dry-run': true });
  run(home, 'kiro', { 'dry-run': true });
  run(home, 'kiro', { uninstall: true, 'dry-run': true });
  for (const item of platforms.filter((item) => item.mode === 'native')) run(home, item.id);
  install({ help: true }, { home, log: quiet });
  install({ list: true }, { home, log: quiet });
  assert.ok(!fs.existsSync(home));
});
test('拒绝覆盖实体目录与未登记链接', (t) => {
  const home = temporary(t);
  const target = path.join(home, '.config/opencode/skills/bridge');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'user.txt'), '保留');
  assert.throws(() => run(home, 'opencode'), /拒绝/);
  assert.equal(fs.readFileSync(path.join(target, 'user.txt'), 'utf8'), '保留');
  fs.rmSync(target, { recursive: true });
  fs.symlinkSync(packageRoot, target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => run(home, 'opencode'), /拒绝/);
  assert.throws(() => run(home, 'opencode', { uninstall: true }), /拒绝/);
  assert.ok(fs.lstatSync(target).isSymbolicLink());
});
test('来源移动、断链修复及断链卸载', (t) => {
  const root = temporary(t);
  const source = copyPackage(path.join(root, '来源 一'));
  const home = path.join(root, 'home');
  const moved = path.join(root, '来源 二');
  run(home, 'opencode', { source });
  fs.renameSync(source, moved);
  run(home, 'opencode', { source: moved });
  const target = path.join(home, '.config/opencode/skills/bridge');
  assert.equal(fs.realpathSync(target), fs.realpathSync(path.join(moved, 'skills/bridge')));
  fs.rmSync(moved, { recursive: true });
  run(home, 'opencode', { uninstall: true });
  assert.throws(() => fs.lstatSync(target), { code: 'ENOENT' });
});
test('入口被替换后卸载拒绝删除其他插件', (t) => {
  const home = temporary(t);
  run(home, 'opencode');
  const target = path.join(home, '.config/opencode/skills/bridge');
  fs.unlinkSync(target);
  fs.symlinkSync(packageRoot, target, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => run(home, 'opencode', { uninstall: true }), /拒绝/);
  assert.equal(fs.realpathSync(target), fs.realpathSync(packageRoot));
});
test('Kiro 冲突预检与用户修改保护', (t) => {
  const home = temporary(t);
  const agent = path.join(home, '.kiro/agents/bridge.json');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, '{"name":"用户配置"}');
  assert.throws(() => run(home, 'kiro'), /拒绝/);
  assert.ok(!fs.existsSync(path.join(home, '.kiro/skills/bridge')));
  fs.unlinkSync(agent);
  run(home, 'kiro');
  fs.appendFileSync(agent, '\n');
  assert.throws(() => run(home, 'kiro', { uninstall: true }), /拒绝/);
  assert.ok(fs.existsSync(path.join(home, '.kiro/skills/bridge')));
});
test('损坏记录和并发锁不被忽略', (t) => {
  const home = temporary(t);
  run(home, 'opencode');
  const state = path.join(home, '.bridge/installations/opencode.json');
  const original = fs.readFileSync(state);
  fs.writeFileSync(state, '{}');
  assert.throws(() => run(home, 'opencode'), /损坏/);
  fs.writeFileSync(state, original);
  fs.mkdirSync(`${state}.lock`);
  assert.throws(() => run(home, 'opencode'), /安装锁/);
});
test('提交状态失败时回滚新链接与 Kiro 配置', (t) => {
  const home = temporary(t);
  t.mock.method(fs, 'renameSync', () => { throw new Error('模拟磁盘失败'); });
  assert.throws(() => run(home, 'kiro'), /模拟磁盘失败/);
  assert.ok(!fs.existsSync(path.join(home, '.kiro/skills/bridge')));
  assert.ok(!fs.existsSync(path.join(home, '.kiro/agents/bridge.json')));
  assert.ok(!fs.existsSync(path.join(home, '.kiro/skills/explore')));
});
test('命令参数及当前系统薄入口', (t) => {
  const home = temporary(t);
  assert.throws(() => parseArgs(['opencode', '--source']), /需要/);
  assert.throws(() => parseArgs(['opencode', '--uninstall', '--source', '.']), /不接受/);
  assert.throws(() => parseArgs(['opencode', '--bad']), /未知/);
  const shell = process.platform === 'win32' ? 'pwsh' : 'bash';
  const entry = process.platform === 'win32' ? ['-NoProfile', '-File', path.join(packageRoot, 'install.ps1')] : [path.join(packageRoot, 'install.sh')];
  const result = spawnSync(shell, [...entry, 'opencode', '--source', packageRoot, '--dry-run'], { cwd: home, encoding: 'utf8', env: { ...process.env, BRIDGE_INSTALL_HOME: path.join(home, 'isolated') } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /dry-run/);
  assert.ok(!fs.existsSync(path.join(home, 'isolated')));
});

test('第二个 Skill 冲突时整组安装与卸载均保持原样', (t) => {
  const home = temporary(t);
  const directory = path.join(home, '.config/opencode/skills');
  const explore = path.join(directory, 'explore');
  fs.mkdirSync(explore, { recursive: true });
  fs.writeFileSync(path.join(explore, 'user.txt'), '用户内容');
  assert.throws(() => run(home, 'opencode'), /拒绝/);
  assert.ok(!fs.existsSync(path.join(directory, 'bridge')));
  assert.equal(fs.readFileSync(path.join(explore, 'user.txt'), 'utf8'), '用户内容');
  fs.rmSync(explore, { recursive: true });
  run(home, 'opencode');
  fs.unlinkSync(explore);
  fs.mkdirSync(explore);
  assert.throws(() => run(home, 'opencode', { uninstall: true }), /拒绝/);
  assert.ok(fs.lstatSync(path.join(directory, 'bridge')).isSymbolicLink());
  assert.ok(fs.lstatSync(explore).isDirectory());
});
