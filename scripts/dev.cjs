const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const routes = { '/api/session': require('../api/session.js'), '/api/analyze': require('../api/analyze.js') };
http.createServer(async (req, res) => {
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };
  const route = new URL(req.url, 'http://localhost').pathname;
  if (routes[route]) {
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 2048) return res.status(413).json({ error: 'Request too large.' }); }
    req.body = body;
    return routes[route](req, res);
  }
  const file = { '/': 'index.html', '/index.html': 'index.html', '/connection.js': 'connection.js' }[route];
  if (!file) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(fs.readFileSync(path.join(root, 'public', file)));
}).listen(3000, '127.0.0.1', () => console.log('BenefitsIQ: http://127.0.0.1:3000'));
