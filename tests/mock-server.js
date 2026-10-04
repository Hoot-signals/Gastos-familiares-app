// Sirve la app + un backend falso en /exec para probar en el navegador sin tocar el Sheet real.
// Uso:  node tests/mock-server.js   →  http://localhost:5174
// Ajustes de prueba: Web App = http://localhost:5174/exec · Sheet = https://docs.google.com/spreadsheets/d/TEST/edit · secreto = tok
// Forzar fallos del GET:  /__mode?get=ok | fail (corta la conexión) | hang (no responde nunca)
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 5174;
let mode = 'ok', seq = 0;
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const now = new Date();
const rows = Array.from({ length: 608 }, (_, i) => {
  const d = new Date(now); d.setDate(d.getDate() - (i % 250));
  return { fecha: iso(d), importe: Math.round(((i * 7.31) % 120 + 1) * 100) / 100, categoria: ['Alimentación', 'Gato', 'Niños', 'Luz'][i % 4],
    concepto: 'Apunte ' + i, persona: 'Miguel', id: 'id-' + i, creado: iso(d) + 'T09:' + pad(i % 60) + ':00' };
});
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (u.pathname === '/__mode') { mode = u.searchParams.get('get') || 'ok'; res.end('mode=' + mode); return; }
  if (u.pathname === '/exec' && req.method === 'GET') {
    if (mode === 'fail') { req.socket.destroy(); return; }
    if (mode === 'hang') return;
    if (u.searchParams.get('token') !== 'tok') { res.writeHead(200, cors); res.end(JSON.stringify({ ok: false, error: 'Token inválido' })); return; }
    res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, rows, prevYear: null })); return;
  }
  if (u.pathname === '/exec' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const p = JSON.parse(b); res.writeHead(200, cors);
      if (p.token !== 'tok') { res.end(JSON.stringify({ ok: false, error: 'Token inválido' })); return; }
      if (p.action === 'quick') {
        const r = { fecha: p.fecha, importe: p.importe, categoria: p.categoria, concepto: p.concepto || '', persona: p.persona, id: 'new-' + (++seq),
          creado: iso(new Date()) + 'T23:59:' + pad(seq % 60) };
        rows.push(r); res.end(JSON.stringify(Object.assign({ ok: true }, r))); return;
      }
      res.end(JSON.stringify({ ok: true }));
    }); return;
  }
  const f = path.join(ROOT, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('mock en http://localhost:' + PORT));
