import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import contact from './api/contact.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, 'dist');
const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.ttf':'font/ttf', '.txt':'text/plain', '.xml':'application/xml' };
const port = Number(process.env.PORT || 4180);
http.createServer(async (req, res) => {
  for (const header of config.headers[0].headers) res.setHeader(header.key, header.value);
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path === '/api/contact') return await contact(req, res);
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    if (path !== '/' && (path.endsWith('/') || path.endsWith('.html'))) {
      const target = path.replace(/\/$/, '').replace(/\.html$/, '').replace(/^\/index$/, '/') || '/';
      res.writeHead(308, { Location: target }); return res.end();
    }
    let file = resolve(output, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(output + sep)) { res.writeHead(403); return res.end(); }
    if (!extname(file)) file += '.html';
    let code = 200;
    try { if (!(await stat(file)).isFile()) throw new Error(); }
    catch { file = resolve(output, '404.html'); code = 404; }
    const body = await readFile(file);
    res.writeHead(code, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type':'text/plain' });
    res.end('Preview request failed.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Sthara preview: http://127.0.0.1:${port} (local only)`));
