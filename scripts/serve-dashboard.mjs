#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { outputRoot, initialized } from './lib/storage.mjs';

export async function serveDashboard(directory, port = 0) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('端口须为 0–65535 的整数');
  const { bridge } = outputRoot(directory);
  initialized(bridge);
  const base = fs.realpathSync(bridge);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  const server = http.createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    try {
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const decoded = decodeURIComponent(request.url.split('?')[0]);
      if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) throw new Error('unsafe');
      const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
      if (!(relative === 'index.html' || /^(assets|base|explorations)\//.test(relative))) { response.writeHead(404).end(); return; }
      const file = fs.realpathSync(path.resolve(base, relative));
      const rel = path.relative(base, file);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('unsafe');
      if (!fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
      if (request.method === 'HEAD') { response.end(); return; }
      const stream = fs.createReadStream(file);
      stream.on('error', () => response.destroy()); stream.pipe(response);
    } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 403).end('文件不可访问'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [root, flag, value, ...extra] = process.argv.slice(2);
    if (!root || extra.length || (flag && (flag !== '--port' || !value))) throw new Error('用法：node serve-dashboard.mjs <仓库> [--port <端口>]');
    const server = await serveDashboard(root, value === undefined ? 0 : Number(value));
    console.log(`Bridge: http://127.0.0.1:${server.address().port}/`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
