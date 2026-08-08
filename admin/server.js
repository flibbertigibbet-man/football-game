/* 管理后台专用服务器 — 端口 8081
   运行: node admin/server.js
   访问: http://localhost:8081/admin */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const ROOT = path.join(__dirname, '..'); // D:\xiaochengxu

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  var urlPath = req.url.split('?')[0];
  if (urlPath === '/' || urlPath === '/admin' || urlPath === '/admin/') {
    urlPath = '/admin/index.html';
  }
  const filePath = path.join(ROOT, urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('🛠️  管理后台已启动');
  console.log('   地址: http://localhost:' + PORT + '/admin');
  console.log('   按 Ctrl+C 停止');
});
