// Prueba el backend Apps Script en Node con dobles de SpreadsheetApp/CacheService/LockService.
// Uso:  node tests/backend.test.js
// Compara además la salida de doGet con la versión de HEAD (golden master) si existe.
const fs = require('fs'), vm = require('vm'), path = require('path'), { execSync } = require('child_process');
const GS = path.join(__dirname, '..', 'gastosx-backend-standalone.gs');

function makeSheet(rows, globalAnio) {
  const reg = { name: 'Registro', data: [['Fecha','Importe','Categoría','Concepto','Persona','Mes','Semana','ID','Creado']].concat(rows), max: Math.max(1000, rows.length + 1) };
  const cell = (r, c) => (reg.data[r - 1] || [])[c - 1] ?? '';
  const regApi = {
    getMaxRows: () => reg.max,
    getLastRow: () => { for (let i = reg.data.length; i >= 1; i--) if ((reg.data[i - 1] || []).some(v => v !== '' && v != null)) return i; return 0; },
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j))),
      setValue: v => { while (reg.data.length < r) reg.data.push([]); reg.data[r - 1][c - 1] = v; },
      setValues: vs => vs.forEach((row, i) => row.forEach((v, j) => { while (reg.data.length < r + i) reg.data.push([]); reg.data[r + i - 1][c + j - 1] = v; })),
      setFontWeight: () => {}, setNumberFormat: () => {}
    }),
    insertRowsAfter: (_, n) => { reg.max += n; }, setFrozenRows: () => {}
  };
  const ga = globalAnio && { getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => Array.from({ length: nr }, (_, i) => globalAnio[r + i - 11].slice(c - 3, c - 3 + nc)) }) };
  return { reg, ss: { getSheetByName: n => n === 'Registro' ? regApi : n === 'Global Año' ? ga || null : null,
    getSpreadsheetTimeZone: () => 'UTC', getSpreadsheetLocale: () => 'es_ES', insertSheet: () => regApi } };
}

function load(src, sheet) {
  const stats = { opens: 0, cacheErrors: 0 };
  // Como el CacheService real: guarda bytes UTF-8 (una mitad de emoji suelta vuelve como U+FFFD)
  const store = new Map(), utf8 = s => Buffer.byteLength(s, 'utf8');
  const cache = { has: k => store.has(k), get: k => store.has(k) ? store.get(k).toString('utf8') : undefined,
    set: (k, v) => store.set(k, Buffer.from(v, 'utf8')), delete: k => store.delete(k), keys: () => store.keys() };
  const pad = n => String(n).padStart(2, '0');
  const ctx = {
    console, Date, JSON, Math, Number, String, Array, Object, isNaN,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => k === 'APP_TOKEN' ? 'tok' : null }) },
    SpreadsheetApp: { openById: () => { stats.opens++; return sheet.ss; }, flush: () => {} },
    CacheService: { getScriptCache: () => ({
      get: k => cache.get(k) ?? null,
      getAll: ks => Object.fromEntries(ks.filter(k => cache.has(k)).map(k => [k, cache.get(k)])),
      put: (k, v) => { if (utf8(v) > 100 * 1024) { stats.cacheErrors++; throw new Error('Argument too large'); } cache.set(k, v); },
      putAll: o => { for (const [k, v] of Object.entries(o)) { if (utf8(v) > 100 * 1024) { stats.cacheErrors++; throw new Error('Argument too large'); } } for (const [k, v] of Object.entries(o)) cache.set(k, v); },
      remove: k => cache.delete(k)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    Utilities: {
      formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
        : `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2),
      parseDate: s => new Date(s.replace(' ', 'T') + 'Z')
    }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, stats, cache };
}

const CATS = ['Alimentación', 'Café/cañas/Desayunos', 'Niños', 'Nóminas', 'Gato'];
function rows(n, emoji) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i === 7) { out.push(['', '', '', '', '', '', '', '', '']); continue; }   // fila vacía en medio
    const d = new Date(Date.UTC(2026, i % 12, 1 + (i % 28)));
    out.push([d, (i * 3.17) % 200, CATS[i % CATS.length], (emoji ? '🛒😀 ' : '') + 'Compra nº' + i + ' «año»', i % 2 ? 'Miguel' : 'Maribel',
      '=MONTH()', '=WEEK()', 'id-' + i, new Date(Date.UTC(2026, i % 12, 1 + (i % 28), 10, 20, 30))]);
  }
  return out;
}
const GA = [Array.from({ length: 12 }, (_, i) => 3000 + i), Array.from({ length: 12 }, (_, i) => 2000 + i * 10)];
const get = (b, token = 'tok', id = 'S1') => JSON.parse(b.ctx.doGet({ parameter: { token, sheetId: id } }).s);
const post = (b, body) => JSON.parse(b.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);

let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'OK   ' : 'FALLA') + ' ' + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };
const NEW = fs.readFileSync(GS, 'utf8');

// 1) Golden master contra HEAD
let OLD = null;
try { OLD = execSync('git show HEAD:gastosx-backend-standalone.gs', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) {}
if (OLD && OLD !== NEW) {
  const data = rows(608);
  const a = get(load(OLD, makeSheet(data, GA))), b = get(load(NEW, makeSheet(data, GA)));
  check('doGet nuevo == doGet de HEAD (608 filas, fila vacía, Global Año)', JSON.stringify(a) === JSON.stringify(b), `filas=${b.rows.length}`);
  const a2 = get(load(OLD, makeSheet(data, null))), b2 = get(load(NEW, makeSheet(data, null)));
  check('sin pestaña Global Año: prevYear null igual que HEAD', a2.prevYear === null && JSON.stringify(a2) === JSON.stringify(b2));
} else console.log('—    golden master omitido (sin cambios respecto a HEAD)');

// 2) Caché: fallo, acierto, sin reabrir el Sheet
{ const b = load(NEW, makeSheet(rows(608), GA));
  const r1 = get(b), o1 = b.stats.opens, r2 = get(b);
  check('1ª lectura abre el Sheet', o1 === 1);
  check('2ª lectura sale de caché (no abre el Sheet)', b.stats.opens === 1 && JSON.stringify(r1) === JSON.stringify(r2));
  // 3) token malo con caché caliente
  check('token inválido no recibe datos aunque haya caché', get(b, 'mal').error === 'Token inválido');
  // 4) escritura invalida
  const w = post(b, { token: 'tok', sheetId: 'S1', action: 'quick', importe: 12.5, categoria: 'Gato', fecha: '2026-10-04', persona: 'Miguel', concepto: 'pienso' });
  const r3 = get(b);
  check('tras guardar, la lectura trae el apunte nuevo', w.ok && r3.rows.some(r => r.id === w.id) && b.stats.opens === 3, `opens=${b.stats.opens}`);
  const r4 = get(b);
  check('y vuelve a cachear', b.stats.opens === 3 && JSON.stringify(r3) === JSON.stringify(r4));
  // 5) escritura rechazada no invalida
  post(b, { token: 'mal', sheetId: 'S1', action: 'quick' }); get(b);
  check('POST con token malo no invalida la caché', b.stats.opens === 3);
  // 6) borrar / editar invalidan
  post(b, { token: 'tok', sheetId: 'S1', action: 'delete', id: w.id }); const r5 = get(b);
  const del = r5.rows.find(r => r.id === w.id);
  check('borrar invalida y se ve "(anulado)"', del && del.concepto === '(anulado)' && del.importe === 0);
  // 7) otro Sheet no comparte caché
  const antes = b.stats.opens, r6 = get(b, 'tok', 'S2');
  check('otro sheetId no reutiliza la caché de S1', b.stats.opens === antes + 1 && r6.ok);
}

// 8) Volumen grande con emoji: se trocea sin pasar de 100 KB por valor
{ const b = load(NEW, makeSheet(rows(4000, true), GA));
  const r1 = get(b), r2 = get(b);
  const metas = [...b.cache.keys()].filter(k => /^get:S1$/.test(k));
  check('4000 filas con emoji: cachea troceado sin errores', b.stats.cacheErrors === 0 && metas.length === 1 && b.stats.opens === 1, `trozos=${[...b.cache.keys()].length - 1}`);
  check('4000 filas: lo cacheado es idéntico a lo leído', JSON.stringify(r1) === JSON.stringify(r2) && r1.rows.length === 3999);
}

console.log(fails ? `\n${fails} FALLO(S)` : '\nTodo OK');
process.exit(fails ? 1 : 0);
