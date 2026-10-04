// critico: cambiar el Sheet en Ajustes mientras hay un refresh en vuelo.
// saveCfg hace DL.clear() + DL.refresh() para "no mezclar con los datos del anterior",
// pero refresh() reutiliza la promesa en vuelo (pedida con el Sheet viejo) y mete
// sus filas en memoria como si fueran del Sheet nuevo.
// Uso: node tests/critico-cambio-sheet.test.js
const fs = require('fs'), path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split(/\r?\n/);
const start = lines.findIndex(l => l.includes('function describeNonJson('));
const end = lines.findIndex((l, i) => i > start && l.trim() === '})();');
const code = lines.slice(start, end + 1).join('\n');
const sheetIdFrom = (url) => { const m = (url || '').match(/\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : ''; };

const ls = {};
const localStorage = { getItem: k => k in ls ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
const cfgObj = { webapp: 'http://x/exec', sheet: 'https://docs.google.com/spreadsheets/d/S2025/edit', token: 'tok' };
let release; const slow = new Promise(r => release = r);
const fakeFetch = async (url) => {
  const rows = url.includes('S2025') ? (await slow, [{ id: 'fila-2025', fecha: '2025-12-31', importe: 9 }])
                                     : [{ id: 'fila-2026', fecha: '2026-01-02', importe: 5 }];
  return { status: 200, text: async () => JSON.stringify({ ok: true, rows, prevYear: null }) };
};
const DL = new Function('localStorage', 'fetch', 'cfgObj', 'sheetIdFrom',
  "const cfg=()=>cfgObj; const localStamp=()=>'2026-01-02T10:00:00';\n" + code + '\nreturn DL;')(localStorage, fakeFetch, cfgObj, sheetIdFrom);

(async () => {
  DL.refresh();                                                     // prefetch de arranque (Sheet 2025), lento
  cfgObj.sheet = 'https://docs.google.com/spreadsheets/d/S2026/edit'; // Ajustes → Guardar con el Sheet de enero
  DL.clear();                                                       // lo que hace saveCfg si sheetCambia
  const p = DL.refresh();                                           // lo que hace saveCfg a continuación
  release();
  const d = await p;
  const ids = d ? d.rows.map(r => r.id) : null;
  const ok = d && d.sheetId === 'S2026' && !ids.includes('fila-2025');
  console.log((ok ? 'OK  ' : 'FAIL') + '  tras cambiar a S2026, DL.refresh() devuelve sheetId=' + (d && d.sheetId) + ' filas=' + JSON.stringify(ids));
  process.exit(ok ? 0 : 1);
})();
