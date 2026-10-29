#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkPackage, packageRoot } from './check-package.mjs';

export const platforms = JSON.parse(fs.readFileSync(new URL('./platforms.json', import.meta.url), 'utf8'));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const stat = (file) => {
  try { return fs.lstatSync(file); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
};
const linkTarget = (file) => path.resolve(path.dirname(file), fs.readlinkSync(file));

export function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (['--uninstall', '--list', '--dry-run', '--help'].includes(arg)) options[arg.slice(2)] = true;
    else if (arg === '--source') {
      const source = args[++index];
      if (!source || source.startsWith('--')) throw new Error('--source 需要本地目录');
      options.source = source;
    } else if (arg.startsWith('-') || options.platform) throw new Error(`未知或重复参数：${arg}`);
    else options.platform = arg;
  }
  if (options.uninstall && options.source) throw new Error('--uninstall 不接受 --source');
  return options;
}

export function install(options, { home = os.homedir(), log = console.log } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('需要 Node.js 22 或更高版本');
  if (options.help) {
    log('用法：install.sh / install.ps1 <platform> [--source <本地插件目录>] [--dry-run]\n      <platform> --uninstall [--dry-run]\n      --list | --help\n更新：在来源仓库执行 git pull --ff-only；归档原位替换后重装。');
    return;
  }
  if (options.list) {
    platforms.forEach((item) => log(`${item.id}\t${item.mode}\t${item.verification}`));
    return;
  }
  const platform = platforms.find((item) => item.id === options.platform);
  if (!platform) throw new Error('请指定有效客户端；使用 --list 查看全部平台');
  if (platform.mode === 'native') {
    log(`${platform.name} 使用原生插件管理器，本脚本不写入任何配置。\n${platform.instructions}\n更新/卸载使用客户端自身管理器；旧版缺少插件支持时请升级。\n${platform.reference}`);
    return;
  }
  home = path.resolve(home);
  const target = path.join(home, platform.directory, 'bridge');
  const stateDirectory = path.join(home, '.bridge', 'installations');
  const statePath = path.join(stateDirectory, `${platform.id}.json`);
  const agentPath = path.join(home, '.kiro', 'agents', 'bridge.json');
  const lockPath = `${statePath}.lock`;
  let locked = false;
  const undo = [];
  try {
    if (!options['dry-run']) {
      fs.mkdirSync(stateDirectory, { recursive: true });
      try { fs.mkdirSync(lockPath); } catch (error) {
        if (error.code === 'EEXIST') throw new Error(`安装锁存在：${lockPath}。确认无其他安装进程后再清理。`);
        throw error;
      }
      locked = true;
    }
    let state;
    if (stat(statePath)) {
      if (!stat(statePath).isFile() || stat(statePath).isSymbolicLink()) throw new Error(`安装记录不是普通文件：${statePath}`);
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (state.version !== 1 || state.platform !== platform.id || state.target !== target
        || typeof state.source !== 'string' || !path.isAbsolute(state.source)
        || (platform.id === 'kiro' && (state.agent?.path !== agentPath || typeof state.agent.sha256 !== 'string'))) {
        throw new Error(`安装记录损坏，拒绝修改：${statePath}`);
      }
    }
    const existing = stat(target);
    if (existing && (!state || !existing.isSymbolicLink() || linkTarget(target) !== state.source)) {
      throw new Error(`拒绝覆盖或删除非本工具管理的入口：${target}`);
    }
    if (platform.id === 'kiro' && stat(agentPath)) {
      if (!state || !stat(agentPath).isFile() || stat(agentPath).isSymbolicLink()
        || hash(fs.readFileSync(agentPath)) !== state.agent.sha256) {
        throw new Error(`Kiro agent 已存在或已被用户修改，拒绝覆盖：${agentPath}`);
      }
    }
    const removeLink = () => {
      if (!existing) return;
      const old = fs.readlinkSync(target);
      fs.unlinkSync(target);
      undo.push(() => fs.symlinkSync(old, target, process.platform === 'win32' ? 'junction' : 'dir'));
    };
    const removeAgent = () => {
      if (platform.id !== 'kiro' || !stat(agentPath)) return;
      const old = fs.readFileSync(agentPath);
      fs.unlinkSync(agentPath);
      undo.push(() => fs.writeFileSync(agentPath, old, { flag: 'wx' }));
    };
    if (options.uninstall) {
      if (!state) { log('未登记安装，无需卸载。'); return; }
      log(`${options['dry-run'] ? '[dry-run] ' : ''}卸载 ${platform.id}：${target}`);
      if (options['dry-run']) return;
      removeLink();
      removeAgent();
      fs.unlinkSync(statePath);
      undo.length = 0;
      return;
    }
    const sourceRoot = fs.realpathSync(path.resolve(options.source || packageRoot));
    checkPackage(sourceRoot);
    const source = fs.realpathSync(path.join(sourceRoot, 'skills', 'bridge'));
    const agent = `${JSON.stringify({
      name: 'bridge', description: '使用 Bridge Skill 理解仓库并生成静态 HTML 报告。',
      prompt: '使用 bridge Skill 完成用户指定的仓库分析；只向目标仓库 .bridge 写入分析产物。',
      tools: ['read', 'write', 'shell'],
      resources: [`skill://${path.join(target, 'SKILL.md').replaceAll('\\', '/')}`],
    }, null, 2)}\n`;
    const next = { version: 1, platform: platform.id, target, source,
      ...(platform.id === 'kiro' ? { agent: { path: agentPath, sha256: hash(agent) } } : {}) };
    log(`${options['dry-run'] ? '[dry-run] ' : ''}安装 ${platform.id}：${target} → ${source}`);
    if (options['dry-run']) return;
    if (!existing || linkTarget(target) !== source) {
      removeLink();
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.symlinkSync(source, target, process.platform === 'win32' ? 'junction' : 'dir');
      undo.push(() => fs.unlinkSync(target));
    }
    if (platform.id === 'kiro') {
      removeAgent();
      fs.mkdirSync(path.dirname(agentPath), { recursive: true });
      fs.writeFileSync(agentPath, agent, { flag: 'wx' });
      undo.push(() => fs.unlinkSync(agentPath));
    }
    const temporary = path.join(lockPath, 'state.json');
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, statePath);
    undo.length = 0;
    log('安装完成；重启客户端后使用 Bridge。');
  } catch (error) {
    for (const rollback of undo.reverse()) {
      try { rollback(); } catch (rollbackError) { log(`回滚失败：${rollbackError.message}`); }
    }
    throw error;
  } finally {
    if (locked) fs.rmSync(lockPath, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    install(parseArgs(process.argv.slice(2)), { home: process.env.BRIDGE_INSTALL_HOME || os.homedir() });
  } catch (error) {
    console.error(`安装失败：${error.message}`);
    process.exitCode = 1;
  }
}
