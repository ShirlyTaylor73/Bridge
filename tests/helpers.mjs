import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { packageRoot } from '../scripts/check-package.mjs';

export function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge 中文 '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
export function copyPackage(target) {
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['plugin.json', 'package.json', 'kimi.plugin.json', 'gemini-extension.json', '.claude-plugin', '.codex-plugin', '.copilot-plugin', '.agents/plugins', 'skills', 'scripts', 'assets', 'references', 'install.sh', 'install.ps1']) {
    fs.cpSync(path.join(packageRoot, name), path.join(target, name), { recursive: true });
  }
  return target;
}
export function node(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
  return result.stdout;
}
export function fixture(root, scripts) {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, 'src/nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/nested/main.js'), 'function greet() { return "hello"; }\ngreet();\n');
  node([path.join(scripts, 'scan-repository.mjs'), root]);
  const scan = JSON.parse(fs.readFileSync(path.join(root, '.bridge/work/scan.json')));
  const tree = {
    version: 2,
    project: { name: '独立测试仓库', ...scan.project, generatedAt: '2026-10-30T00:00:00Z', fileCount: scan.files.length },
    nodes: [{ id:'dir:src',name:'src',path:'src',kind:'dir',summary:'源代码',open:true,children:[
      {id:'dir:src/nested',name:'nested',path:'src/nested',kind:'dir',summary:'问候模块',children:[
        {id:'file:src/nested/main.js',name:'main.js',path:'src/nested/main.js',kind:'file',summary:'定义并调用问候函数。',category:'core',entry:'主入口'}
      ]}
    ]}],
  };
  fs.writeFileSync(path.join(root, '.bridge/work/tree.json'), JSON.stringify(tree));
  return tree;
}
export function exploration(root, id = 'greeting-pipeline') {
  return {
    version:2, id, title:'问候整体流程', summary:'模块入口到函数调用', keywords:['问候','调用'],question:'问候入口如何执行？',
    project:{root:fs.realpathSync(root),commit:null,generatedAt:'2026-10-30T00:00:00Z'},
    evidence:{entry:{path:'src/nested/main.js',role:'调用点',symbol:'greet()',start:1,end:2,highlight:[2,2],code:'function greet() { return "hello"; }\ngreet();',annotation:'模块加载时执行函数。'}},
    phases:[{title:'入口',desc:'开始执行',steps:[{key:'entry'}]}],
  };
}
export function candidate(root, data) {
  const file=path.join(root,'.bridge/work',`${data.id}-candidate.json`);
  fs.writeFileSync(file,JSON.stringify(data));
  return file;
}
