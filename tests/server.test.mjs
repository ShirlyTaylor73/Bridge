import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { serveDashboard } from '../scripts/serve-dashboard.mjs';
import { publishBase } from '../scripts/publish-base.mjs';
import { packageRoot } from '../scripts/check-package.mjs';
import { temporary, fixture } from './helpers.mjs';

test('本地服务按需加载、无缓存、路径范围与中文文件',async t=>{
  const root=temporary(t);fixture(root,path.join(packageRoot,'scripts'));
  await publishBase(root,path.join(root,'.bridge/work/tree.json'));
  fs.writeFileSync(path.join(root,'.bridge/explorations/中文 空格.json'),'{}');
  const outside=path.join(root,'outside.json');fs.writeFileSync(outside,'secret');
  // Windows 无开发模式时使用目录 junction 检查包外路径。
  const outsideDir=path.join(root,'outside');fs.mkdirSync(outsideDir);fs.writeFileSync(path.join(outsideDir,'file.json'),'secret');
  fs.symlinkSync(outsideDir,path.join(root,'.bridge/assets/escape'),process.platform==='win32'?'junction':'dir');
  const server=await serveDashboard(root);t.after(()=>new Promise(resolve=>server.close(resolve)));
  const port=server.address().port;
  const request=url=>new Promise((resolve,reject)=>{http.get({host:'127.0.0.1',port,path:url},res=>{let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));}).on('error',reject);});
  assert.equal((await request('/')).status,200);
  const tree=await request('/base/tree.json');assert.equal(tree.headers['cache-control'],'no-store');
  assert.equal((await request('/explorations/'+encodeURIComponent('中文 空格.json'))).status,200);
  for(const url of ['/%2e%2e/outside.json','/assets/escape/file.json','/%ZZ','/assets/%5c..%5coutside.json'])assert.equal((await request(url)).status,403,url);
  assert.equal((await request('/work/tree.json')).status,404);
  assert.equal((await request('/explorations/missing.json')).status,404);
});
