import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { publishBase } from '../scripts/publish-base.mjs';
import { publishExploration } from '../scripts/publish-exploration.mjs';
import { readJson, digest } from '../scripts/lib/storage.mjs';
import { packageRoot } from '../scripts/check-package.mjs';
import { temporary, fixture, exploration, candidate } from './helpers.mjs';
async function setup(t) {
  const root=temporary(t);fixture(root,path.join(packageRoot,'scripts'));
  await publishBase(root,path.join(root,'.bridge/work/tree.json'));
  return root;
}
const topicFile=(root,id)=>path.join(root,'.bridge/explorations',`${id}.json`);
function snapshot(root) {
  const paths=['index.html','assets/dashboard.css','assets/dashboard.js','base/scan.json','base/tree.json'];
  return paths.map(file=>digest(fs.readFileSync(path.join(root,'.bridge',file))));
}
test('基础初始化仅文件树，未初始化探索提示，已有概览默认复用',async t=>{
  const empty=temporary(t);
  await assert.rejects(publishExploration(empty,'missing'),/先运行 bridge/);
  const root=await setup(t);
  assert.deepEqual(readJson(path.join(root,'.bridge/explorations/index.json')).topics,[]);
  const before=snapshot(root);
  await publishBase(root);
  assert.deepEqual(snapshot(root),before);
});
test('新增主题只改自己的文件与索引，旧源码变化与相同证据 ID 独立',async t=>{
  const root=await setup(t),one=exploration(root);
  await publishExploration(root,candidate(root,one));
  const old=fs.readFileSync(topicFile(root,one.id)),before=snapshot(root);
  fs.writeFileSync(path.join(root,'src/nested/main.js'),'changed();\n');
  fs.writeFileSync(path.join(root,'new.js'),'newTask();\n');
  const two=exploration(root,'new-task');
  two.evidence.entry={...two.evidence.entry,path:'new.js',start:1,end:1,highlight:[1,1],code:'newTask();'};
  await publishExploration(root,candidate(root,two));
  assert.deepEqual(snapshot(root),before);
  assert.deepEqual(fs.readFileSync(topicFile(root,one.id)),old);
  assert.equal(readJson(path.join(root,'.bridge/explorations/index.json')).topics.length,2);
});
test('主题冲突、明确更新、备份与乐观锁',async t=>{
  const root=await setup(t),data=exploration(root),file=candidate(root,data);
  await publishExploration(root,file);
  await assert.rejects(publishExploration(root,file),/主题已存在/);
  const old=fs.readFileSync(topicFile(root,data.id));
  data.summary='深化主题';candidate(root,data);
  await assert.rejects(publishExploration(root,file,{update:true,expectedHash:'wrong'}),/expected-hash/);
  await publishExploration(root,file,{update:true,expectedHash:digest(old)});
  assert.equal(readJson(topicFile(root,data.id)).summary,'深化主题');
  assert.deepEqual(fs.readFileSync(path.join(root,'.bridge/history',data.id,`${digest(old)}.json`)),old);
});
test('无效证据和索引替换失败恢复旧结果',async t=>{
  const root=await setup(t),data=exploration(root),file=candidate(root,data);
  await publishExploration(root,file);
  const old=fs.readFileSync(topicFile(root,data.id));
  const oldIndex=fs.readFileSync(path.join(root,'.bridge/explorations/index.json'));
  data.evidence.entry.code='fake';candidate(root,data);
  await assert.rejects(publishExploration(root,file,{update:true,expectedHash:digest(old)}));
  data.evidence.entry.code=exploration(root).evidence.entry.code;data.summary='新摘要';candidate(root,data);
  const rename=fs.renameSync;
  t.mock.method(fs,'renameSync',(from,to)=>{if(to.endsWith('explorations/index.json'))throw new Error('模拟索引失败');return rename(from,to);});
  await assert.rejects(publishExploration(root,file,{update:true,expectedHash:digest(old)}),/模拟索引失败/);
  assert.deepEqual(fs.readFileSync(topicFile(root,data.id)),old);
  assert.deepEqual(fs.readFileSync(path.join(root,'.bridge/explorations/index.json')),oldIndex);
});
test('独立进程并发追加保留全部主题',async t=>{
  const root=await setup(t);
  const run=id=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(packageRoot,'scripts/publish-exploration.mjs'),root,candidate(root,exploration(root,id))]);
    let error='';child.stderr.on('data',part=>error+=part);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));
  });
  await Promise.all(['first-topic','second-topic','third-topic'].map(run));
  assert.equal(readJson(path.join(root,'.bridge/explorations/index.json')).topics.length,3);
});
test('基础树显式刷新保留主题与页面资产',async t=>{
  const root=await setup(t),data=exploration(root);
  await publishExploration(root,candidate(root,data));
  const old=fs.readFileSync(topicFile(root,data.id));
  const tree=readJson(path.join(root,'.bridge/base/tree.json'));tree.nodes[0].summary='刷新后的职责';
  fs.writeFileSync(path.join(root,'.bridge/work/tree.json'),JSON.stringify(tree));
  await publishBase(root,path.join(root,'.bridge/work/tree.json'),{refresh:true});
  assert.deepEqual(fs.readFileSync(topicFile(root,data.id)),old);
});
