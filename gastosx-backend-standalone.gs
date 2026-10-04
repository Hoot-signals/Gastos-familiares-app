/**
 * ============================================================
 *  GASTOS — Backend (Google Apps Script Web App) — STANDALONE
 *  No vinculado a ningún Sheet: cualquier Sheet se "conecta" a
 *  esta API pasando su sheetId en cada petición.
 *
 *  IMPORTANTE: la función personalizada GASTO() NO vive aquí.
 *  Las funciones personalizadas de Sheets solo se pueden invocar
 *  desde un script VINCULADO al Sheet — vive por separado en un
 *  archivo minúsculo dentro de cada Sheet (ver
 *  gastosx-sheet-gasto-function.gs). Ese archivo viaja solo al
 *  duplicar el Sheet cada año, así que no hay que volver a
 *  pegarlo a mano.
 *
 *  CONFIG (una sola vez, en este proyecto):
 *   - Configuración del proyecto -> Propiedades del script:
 *     APP_TOKEN = tu_palabra_secreta (la misma que ya usas)
 *   - Implementar -> Nueva implementación -> Aplicación web
 *     (Ejecutar como: Yo; Quién tiene acceso: Cualquier usuario)
 *   - Copia la URL /exec: esa es la que va en Ajustes -> URL de
 *     la Web App, en TODOS los móviles, y no vuelve a cambiar.
 *   - Tras editar este archivo: Implementar -> Gestionar
 *     implementaciones -> lápiz -> Versión: Nueva versión.
 *     (La URL /exec no cambia.)
 * ============================================================
 */

// ---------- Constantes ----------
var REGISTRO_SHEET = 'Registro';
var TZ = 'Europe/Madrid';

var CATEGORIAS = [
  'Hipoteca/Alquiler','Muebles/Menaje','Alimentación','Niños',
  'Compras/Ropa/Estética','Móvil/Internet','Luz','Gas','Agua','Gato',
  'Gasolina/Transporte','Otros gastos coche','Seguros','Impuestos/Tasas/multas',
  'Matriculas/cuotas','Café/cañas/Desayunos','Comidas/Cenas restaurantes',
  'Viajes/Hoteles','Ocio/Regalos/Juego','Otros gastos','Pérdidas patrimoniales',
  'Varios invitaciones casa','Limpieza',
  'Nóminas','Ingresos extraordinarios'
];
var CATS_INGRESO = ['Nóminas','Ingresos extraordinarios'];

// ============================================================
//  LECTURA (dashboard + previsualización)
//  GET .../exec?token=XXX&sheetId=YYY  -> Registro + año anterior
// ============================================================
function doGet(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('APP_TOKEN');
    if (!token || (e.parameter.token || '') !== token) return json({ ok:false, error:'Token inválido' });
    var sheetId = e.parameter.sheetId;
    if (!sheetId) return json({ ok:false, error:'Falta sheetId' });

    // Acierto de caché: ni se abre el Sheet (de 2-7 s a una fracción de segundo)
    var hit = cacheLeer(sheetId);
    if (hit) return texto(hit);

    // Fallo: se lee CON el lock de escritura, para que un guardado simultáneo no
    // deje en caché datos de antes de él. Sin lock en 5 s, se lee sin cachear.
    var lock = LockService.getScriptLock();
    var conLock = lock.tryLock(5000);
    try {
      if (conLock) { hit = cacheLeer(sheetId); if (hit) return texto(hit); }
      var s = JSON.stringify(leerTodo(sheetId));
      if (conLock) cacheGuardar(sheetId, s);
      return texto(s);
    } finally {
      if (conLock) lock.releaseLock();
    }
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
}

function leerTodo(sheetId) {
    var ss = SpreadsheetApp.openById(sheetId);
    TZ = ss.getSpreadsheetTimeZone();
    var reg = getRegistroSheet(ss);
    var last = reg.getLastRow();   // nativo; las filas sin fecha se saltan abajo
    var rows = [];
    if (last >= 2) {
      var data = reg.getRange(2, 1, last - 1, 9).getValues(); // A..I (una sola lectura)
      for (var i = 0; i < data.length; i++) {
        var f = data[i][0];
        if (f === '' || f === null) continue;
        var d = (f instanceof Date) ? f : new Date(f);
        var cr = data[i][8]; // Creado (timestamp)
        rows.push({
          fecha:     Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
          importe:   Number(data[i][1]) || 0,
          categoria: data[i][2],
          concepto:  data[i][3],
          persona:   data[i][4],
          id:        data[i][7],
          creado:    (cr instanceof Date) ? Utilities.formatDate(cr, TZ, "yyyy-MM-dd'T'HH:mm:ss") : ''
        });
      }
    }
    return {
      ok: true, rows: rows,
      prevYear: totalesMensuales(ss)   // año anterior: pestaña "Global Año" del mismo Sheet
    };
}

// Año anterior: pestaña "Global Año" del mismo Sheet.
// Fila 11 = Ingresos, fila 12 = Gastos, columnas C:N = Enero..Diciembre.
function totalesMensuales(ss) {
  var sh = ss.getSheetByName('Global Año');
  if (!sh) return null;
  var v = sh.getRange(11, 3, 2, 12).getValues();   // filas 11-12 en una sola lectura
  var num = function(x){ return Number(x) || 0; };
  return { gastos: v[1].map(num), ingresos: v[0].map(num) };
}

// ============================================================
//  CACHÉ de la lectura (CacheService, por Sheet)
//  Se invalida en cada escritura de la app. Las ediciones hechas A MANO en el
//  Sheet tardan como mucho CACHE_TTL en verse en la app.
//  Un valor de CacheService admite ~100 KB: el JSON se trocea, y cada versión
//  usa claves propias para que una lectura nunca mezcle trozos de dos versiones.
// ============================================================
var CACHE_TTL = 300;      // segundos
var CACHE_TROZO = 30000;  // caracteres por trozo (margen para tildes/emoji en UTF-8)

function cacheLeer(sheetId) {
  try {
    var c = CacheService.getScriptCache();
    var meta = c.get('get:' + sheetId);          // "<version>:<nº trozos>"
    if (!meta) return null;
    var p = meta.split(':'), n = Number(p[1]), claves = [];
    for (var i = 0; i < n; i++) claves.push('get:' + sheetId + ':' + p[0] + ':' + i);
    var trozos = c.getAll(claves), s = '';
    for (var j = 0; j < n; j++) { if (trozos[claves[j]] == null) return null; s += trozos[claves[j]]; }
    return s;
  } catch (e) { return null; }
}

function cacheGuardar(sheetId, s) {
  try {
    var c = CacheService.getScriptCache();
    var ver = String(Date.now()), obj = {}, n = 0, i = 0;
    do {
      var fin = Math.min(i + CACHE_TROZO, s.length);
      // no partir un emoji (par sustituto UTF-16): media mitad no sobrevive a UTF-8
      var cc = s.charCodeAt(fin - 1);
      if (fin < s.length && cc >= 0xD800 && cc <= 0xDBFF) fin--;
      obj['get:' + sheetId + ':' + ver + ':' + n++] = s.substring(i, fin);
      i = fin;
    } while (i < s.length);
    c.putAll(obj, CACHE_TTL + 60);                // los trozos sobreviven un poco más que el índice
    c.put('get:' + sheetId, ver + ':' + n, CACHE_TTL);
  } catch (e) {}
}

function cacheBorrar(sheetId) {
  try { CacheService.getScriptCache().remove('get:' + sheetId); } catch (e) {}
}

// ============================================================
//  ESCRITURA (app: nuevo, editar, borrar, quick, quick-batch)
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  var sheetEscrito = null;
  try {
    var body  = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();

    var token = props.getProperty('APP_TOKEN');
    if (!token || body.token !== token) return json({ ok:false, error:'Token inválido' });
    if (!body.sheetId) return json({ ok:false, error:'Falta el enlace del Sheet en Ajustes' });

    lock.waitLock(20000);
    sheetEscrito = body.sheetId;
    var ss  = SpreadsheetApp.openById(body.sheetId);
    TZ = ss.getSpreadsheetTimeZone(); // usa el huso horario REAL del Sheet, no un valor fijo
    var reg = getRegistroSheet(ss);

    // --- Editar categoría ---
    if (body.action === 'update') {
      if (CATEGORIAS.indexOf(body.categoria) === -1) return json({ ok:false, error:'Categoría no válida' });
      var r1 = findRowById(reg, body.id); if (!r1) return json({ ok:false, error:'No encuentro el apunte' });
      reg.getRange(r1, 3).setValue(body.categoria);
      return json({ ok:true, id:body.id, categoria:body.categoria });
    }
    // --- Editar fecha ---
    if (body.action === 'update-date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha))) return json({ ok:false, error:'Fecha no válida' });
      var r2 = findRowById(reg, body.id); if (!r2) return json({ ok:false, error:'No encuentro el apunte' });
      reg.getRange(r2, 1).setValue(isoToDate(body.fecha));
      return json({ ok:true, id:body.id, fecha:body.fecha });
    }
    // --- Editar importe ---
    if (body.action === 'update-amount') {
      var imp = Number(body.importe);
      if (isNaN(imp)) return json({ ok:false, error:'Importe no válido' });
      var r3 = findRowById(reg, body.id); if (!r3) return json({ ok:false, error:'No encuentro el apunte' });
      reg.getRange(r3, 2).setValue(Math.round(imp * 100) / 100);
      return json({ ok:true, id:body.id, importe:Math.round(imp * 100) / 100 });
    }
    // --- Editar concepto ---
    if (body.action === 'update-concept') {
      var r4 = findRowById(reg, body.id); if (!r4) return json({ ok:false, error:'No encuentro el apunte' });
      reg.getRange(r4, 4).setValue(String(body.concepto || ''));
      return json({ ok:true, id:body.id, concepto:String(body.concepto || '') });
    }
    // --- Borrar: importe a 0 y concepto "(anulado)"; se conservan fila e ID ---
    if (body.action === 'delete') {
      var r5 = findRowById(reg, body.id); if (!r5) return json({ ok:false, error:'No encuentro el apunte' });
      reg.getRange(r5, 2).setValue(0);
      reg.getRange(r5, 4).setValue('(anulado)');
      return json({ ok:true, id:body.id, deleted:true });
    }

    // --- Modo rápido: importe + categoría + fecha directos (sin parser) ---
    if (body.action === 'quick') {
      if (CATEGORIAS.indexOf(body.categoria) === -1) return json({ ok:false, error:'Categoría no válida' });
      var impQ = Number(body.importe);
      if (isNaN(impQ)) return json({ ok:false, error:'Importe no válido' });
      impQ = Math.round(impQ * 100) / 100;
      var fQ = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha)) ? body.fecha
              : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
      var idQ = Utilities.getUuid();
      var SEPq = sepDe(ss);
      var rowQ = siguienteFila(reg);
      if (rowQ > reg.getMaxRows()) reg.insertRowsAfter(reg.getMaxRows(), 1);
      // Una sola escritura A..I (antes eran 5 llamadas sueltas): valores + fórmulas + id + creado.
      // setValues acepta fórmulas como texto ("=...") mezcladas con valores en el mismo array.
      reg.getRange(rowQ, 1, 1, 9).setValues([[ isoToDate(fQ), impQ, body.categoria, String(body.concepto || ''),
        body.persona || '', formulaMes(rowQ, SEPq), formulaSemana(rowQ, SEPq), idQ, new Date() ]]);
      return json({ ok:true, id:idQ, fecha:fQ, importe:impQ, categoria:body.categoria,
                    concepto:String(body.concepto || ''), persona:body.persona || '' });
    }

    // --- Varias cuotas de una vez (cada una con su propia fecha; misma persona) ---
    // Antes: siguienteFila() (escaneo de la columna A) + ~5 escrituras POR CUOTA
    // (con el escaneo repitiéndose y creciendo en cada vuelta). Ahora: un solo
    // escaneo antes del bucle, las filas se calculan en memoria, y se escriben
    // TODAS de una vez con un único setValues multi-fila.
    if (body.action === 'quick-batch') {
      var items = Array.isArray(body.items) ? body.items : [];
      var SEPb = sepDe(ss);
      var resultados = [];
      var filas = [];
      var rowB = siguienteFila(reg);
      for (var bi = 0; bi < items.length; bi++) {
        var it = items[bi] || {};
        if (CATEGORIAS.indexOf(it.categoria) === -1) { resultados.push({ ok:false, error:'Categoría no válida' }); continue; }
        var impB = Number(it.importe);
        if (isNaN(impB)) { resultados.push({ ok:false, error:'Importe no válido' }); continue; }
        impB = Math.round(impB * 100) / 100;
        var fB = /^\d{4}-\d{2}-\d{2}$/.test(String(it.fecha)) ? it.fecha
                : (/^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha)) ? body.fecha : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'));
        var idB = Utilities.getUuid();
        var thisRow = rowB++;
        filas.push([ isoToDate(fB), impB, it.categoria, String(it.concepto || ''), body.persona || '',
          formulaMes(thisRow, SEPb), formulaSemana(thisRow, SEPb), idB, new Date() ]);
        resultados.push({ ok:true, id:idB, fecha:fB, importe:impB, categoria:it.categoria,
                           concepto:String(it.concepto || ''), persona: body.persona || '' });
      }
      if (filas.length) {
        var startRow = rowB - filas.length;
        var finalRow = startRow + filas.length - 1;
        if (finalRow > reg.getMaxRows()) reg.insertRowsAfter(reg.getMaxRows(), finalRow - reg.getMaxRows());
        reg.getRange(startRow, 1, filas.length, 9).setValues(filas);
      }
      return json({ ok:true, resultados: resultados });
    }

    // Acción no reconocida (el parser de texto libre se retiró: la app solo
    // manda acciones explícitas — quick/quick-batch/update*/delete)
    return json({ ok:false, error:'Acción no reconocida: ' + body.action });

  } catch (err) {
    return json({ ok:false, error:String(err) });
  } finally {
    // Todavía con el lock: escribir de verdad y luego invalidar, para que el
    // siguiente doGet no sirva datos de antes de este guardado.
    if (sheetEscrito) {
      try { SpreadsheetApp.flush(); } catch (e3) {}
      cacheBorrar(sheetEscrito);
    }
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// ============================================================
//  Registro: helpers
// ============================================================
// Nota: ya NO se comprueban/rellenan H1 ("ID") / I1 ("Creado") en cada petición.
// Eran una migración de sheets antiguos sin esas columnas; hoy toda la app depende
// de que existan (findRowById, doGet) así que si faltaran ya estaría todo roto —
// la migración quedó completa hace tiempo, y un Sheet duplicado cada enero
// ("Hacer una copia") arrastra la cabecera tal cual, así que no puede volver a faltar.
function getRegistroSheet(ss) {
  var sheet = ss.getSheetByName(REGISTRO_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REGISTRO_SHEET, 0);
    sheet.getRange('A1:I1').setValues([['Fecha','Importe','Categoría','Concepto','Persona','Mes','Semana','ID','Creado']]);
    sheet.getRange('A1:I1').setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A2:A5000').setNumberFormat('dd/mm/yyyy');
  }
  return sheet;
}

function sepDe(ss) {
  return /^en/i.test(String(ss.getSpreadsheetLocale() || '')) ? ',' : ';';
}

function formulaMes(row, SEP) {
  return '=IF(A' + row + '=""' + SEP + '""' + SEP + 'MONTH(A' + row + '))';
}
function formulaSemana(row, SEP) {
  return '=IF(A' + row + '=""' + SEP + '""' + SEP +
         'INT((DAY(A' + row + ')-1+WEEKDAY(DATE(YEAR(A' + row + ')' + SEP +
         'MONTH(A' + row + ')' + SEP + '1)' + SEP + '3))/7)+1)';
}

function ultimaFilaDatos(reg) {
  var maxR = reg.getMaxRows();
  var col = reg.getRange(1, 1, maxR, 1).getValues();
  var last = 1;
  for (var i = 0; i < col.length; i++) if (col[i][0] !== '' && col[i][0] !== null) last = i + 1;
  return last;
}
function siguienteFila(reg) { return ultimaFilaDatos(reg) + 1; }

function findRowById(reg, id) {
  if (!id) return null;
  var last = ultimaFilaDatos(reg);
  if (last < 2) return null;
  var ids = reg.getRange(2, 8, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return null;
}

function isoToDate(s) {
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date();
  return Utilities.parseDate(m[1]+'-'+m[2]+'-'+m[3]+' 00:00:00', TZ, 'yyyy-MM-dd HH:mm:ss');
}

// ============================================================
//  Utilidad de respuesta
// ============================================================
function json(obj) {
  return texto(JSON.stringify(obj));
}
function texto(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
