const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const mapperDir = path.join(root, 'tools', 'contract-mapper');
const port = Number(process.env.CONTRACT_MAPPER_PORT || 4177);

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = String(req.url || '/');
  let filePath = '';

  if (url === '/' || url === '/index.html') {
    filePath = path.join(mapperDir, 'index.html');
  } else if (url.startsWith('/server/assets/')) {
    filePath = path.join(root, url.replace(/^\//, ''));
  } else {
    filePath = path.join(mapperDir, url.replace(/^\//, ''));
  }

  if (!filePath.startsWith(root)) {
    return send(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, `Not found: ${url}`);
    send(res, 200, data, mime(filePath));
  });
});

server.listen(port, () => {
  console.log(`Contract mapper: http://localhost:${port}`);
});