// critico: la caché trocea el JSON con substr() por unidades UTF-16. Si un corte cae
// en medio de un emoji (par subrogado), cada trozo lleva medio emoji. CacheService
// guarda bytes (límite de 100 KB medido en UTF-8): un subrogado suelto no tiene
// representación UTF-8 y vuelve como U+FFFD/'?'. Este doble guarda los trozos
// como bytes UTF-8, igual que un almacén real.
// Uso: node tests/critico-emoji-trozo.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gastosx-backend-standalone.gs'), 'utf8');

function sheetCon(rows) {
  const data = [['Fecha','Importe','Categoría','Concepto','Persona','Mes','Semana','ID','Creado']].concat(rows);
  const cell = (r, c) => (data[r - 1] || [])[c - 1] ?? '';
  const reg = {
    getMaxRows: () => data.length, getLastRow: () => data.length,
    getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))) })
  };
  return { getSheetByName: n => n === 'Registro' ? reg : null, getSpreadsheetTimeZone: () => 'UTC' };
}

const store = new Map(), opens = { n: 0 };
const pad = n => String(n).padStart(2, '0');
const ctx = {
  Date, JSON, Math, Number, String, Array, Object,
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'tok' }) },
  SpreadsheetApp: { openById: () => { opens.n++; return ss; }, flush: () => {} },
  CacheService: { getScriptCache: () => ({
    get: k => store.has(k) ? store.get(k).toString('utf8') : null,
    getAll: ks => Object.fromEntries(ks.filter(k => store.has(k)).map(k => [k, store.get(k).toString('utf8')])),
    put: (k, v) => store.set(k, Buffer.from(v, 'utf8')),
    putAll: o => { for (const [k, v] of Object.entries(o)) store.set(k, Buffer.from(v, 'utf8')); },
    remove: k => store.delete(k)
  }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities: { formatDate: d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
};
// Un apunte por fila con un emoji en el concepto (p.ej. "🍕 cena"); 3000 filas => varios trozos
const rows = [];
for (let i = 0; i < 3000; i++) rows.push([new Date(Date.UTC(2026, i % 12, 1 + i % 28)), 10, 'Alimentación', (i === 0 ? 'Mercadona ' : '') + '🍕 cena ' + i, 'Miguel', '', '', 'id-' + i, '']);
const ss = sheetCon(rows);
vm.createContext(ctx); vm.runInContext(SRC, ctx);

const get = () => JSON.parse(ctx.doGet({ parameter: { token: 'tok', sheetId: 'S1' } }).s);
const fresco = get(), cacheado = get();
const malas = cacheado.rows.filter((r, i) => r.concepto !== fresco.rows[i].concepto);
console.log('aperturas del Sheet:', opens.n, '(2ª lectura salió de caché:', opens.n === 1, ')');
console.log('filas con concepto distinto entre Sheet y caché:', malas.length, malas.slice(0, 3).map(r => JSON.stringify(r.concepto)).join(' '));
if (malas.length) { console.log('FALLA: la caché corrompe emojis partidos entre trozos'); process.exit(1); }
console.log('OK'); process.exit(0);
