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
var MES_NUM = { enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,
                agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12 };

var KEYWORDS = {
  'Hipoteca/Alquiler': ['hipoteca','alquiler','renta','casero','letra piso','mensualidad piso'],
  'Muebles/Menaje': ['ikea','mueble','sofa','menaje','leroy','bricor','ferreteria','silla','mesa','decoracion','vajilla','sabana','toalla','colchon','lampara','estanteria'],
  'Alimentación': ['mercadona','lidl','carrefour','aldi','dia','alcampo','eroski','consum','supermercado','super','compra','fruteria','panaderia','carniceria','pescaderia','alimentacion','pan','leche','verdura','fruta'],
  'Niños': ['nino','hijo','alexia','fabian','panal','guarderia','colegio','cole','juguete','extraescolar','comedor','babero','carrito','chupete'],
  'Compras/Ropa/Estética': ['ropa','zara','primark','hm','camiseta','pantalon','zapato','zapatilla','peluqueria','estetica','maquillaje','perfume','cosmetica','mango','vestido','abrigo','sudadera','manicura'],
  'Móvil/Internet': ['movil','telefono','internet','fibra','movistar','vodafone','orange','yoigo','masmovil','o2','pepephone','digi','tarifa','datos'],
  'Luz': ['luz','electricidad','iberdrola','endesa'],
  'Gas': ['gas','butano','gasnatural','naturgy'],
  'Agua': ['agua','canal','acometida'],
  'Gato': ['gato','gata','veterinario','vet','pienso','arena gato','michi','antipulgas'],
  'Gasolina/Transporte': ['gasolina','gasoil','gasoleo','diesel','repsol','cepsa','bp','galp','shell','combustible','metro','bus','autobus','taxi','uber','cabify','tren','renfe','billete','peaje','parking','aparcamiento','blablacar','transporte','abono transporte'],
  'Otros gastos coche': ['taller','mecanico','itv','neumatico','rueda','revision','coche','recambio','embrague','freno','limpiaparabrisas'],
  'Seguros': ['seguro','poliza','mapfre','mutua','allianz','axa','linea directa','reale','pelayo','zurich','caser'],
  'Impuestos/Tasas/multas': ['impuesto','ibi','multa','tasa','hacienda','dgt','sancion','irpf','tributo'],
  'Matriculas/cuotas': ['matricula','cuota','gimnasio','gym','suscripcion','netflix','spotify','hbo','max','prime','disney','filmin','membresia','abono','colegiado','club'],
  'Café/cañas/Desayunos': ['cafe','cana','desayuno','cerveza','cortado','pincho','tapa','aperitivo','vermut','tostada','churros','merienda'],
  'Comidas/Cenas restaurantes': ['restaurante','cena','almuerzo','menu','mcdonalds','burger','telepizza','glovo','ubereats','justeat','pizza','sushi','kebab','cenar','comer fuera','tapear','asador','marisqueria'],
  'Viajes/Hoteles': ['viaje','hotel','booking','airbnb','vuelo','avion','ryanair','iberia','vueling','hostal','escapada','crucero'],
  'Ocio/Regalos/Juego': ['ocio','cine','teatro','concierto','regalo','juego','loteria','apuesta','museo','entrada','evento','bolos','escape room','videojuego','steam','feria','discoteca'],
  'Otros gastos': [],
  'Pérdidas patrimoniales': ['perdida patrimonial','perdidas patrimoniales'],
  'Varios invitaciones casa': ['invitados','invitacion','invitar','fiesta casa','cumple casa'],
  'Limpieza': ['limpieza','limpiadora','asistenta','detergente','lejia','fairy','productos limpieza','suavizante','friegasuelos'],
  'Nóminas': ['nomina','sueldo','salario','payroll'],
  'Ingresos extraordinarios': ['ingreso','extraordinario','bonus','bonificacion','finiquito','paga extra','dividendo','devolucion renta','devolucion hacienda']
};
var PRIORIDAD = [
  'Nóminas','Ingresos extraordinarios',
  'Hipoteca/Alquiler','Seguros','Luz','Gas','Agua','Móvil/Internet','Gato',
  'Gasolina/Transporte','Otros gastos coche','Impuestos/Tasas/multas',
  'Matriculas/cuotas','Viajes/Hoteles','Niños','Café/cañas/Desayunos',
  'Comidas/Cenas restaurantes','Alimentación','Compras/Ropa/Estética',
  'Muebles/Menaje','Ocio/Regalos/Juego','Limpieza','Varios invitaciones casa',
  'Pérdidas patrimoniales','Otros gastos'
];

// ============================================================
//  LECTURA (dashboard + previsualización)
//  GET .../exec?token=XXX&sheetId=YYY  -> Registro + año anterior
// ============================================================
function doGet(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('APP_TOKEN');
    if (!token || (e.parameter.token || '') !== token) return json({ ok:false, error:'Token inválido' });
    if (!e.parameter.sheetId) return json({ ok:false, error:'Falta sheetId' });

    var ss = SpreadsheetApp.openById(e.parameter.sheetId);
    TZ = ss.getSpreadsheetTimeZone();
    var reg = getRegistroSheet(ss);
    var last = ultimaFilaDatos(reg);
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
    return json({
      ok: true, rows: rows,
      prevYear: totalesMensuales(ss)   // año anterior: pestaña "Global Año" del mismo Sheet
    });
  } catch (err) {
    return json({ ok:false, error:String(err) });
  }
}

// Año anterior: pestaña "Global Año" del mismo Sheet.
// Fila 11 = Ingresos, fila 12 = Gastos, columnas B:M = Enero..Diciembre.
function totalesMensuales(ss) {
  var sh = ss.getSheetByName('Global Año');
  if (!sh) return null;
  var ing = sh.getRange(11, 3, 1, 12).getValues()[0].map(function(v){ return Number(v) || 0; });
  var gas = sh.getRange(12, 3, 1, 12).getValues()[0].map(function(v){ return Number(v) || 0; });
  return { gastos: gas, ingresos: ing };
}

// ============================================================
//  ESCRITURA (app: nuevo, editar, borrar, quick, quick-batch)
// ============================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body  = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();

    var token = props.getProperty('APP_TOKEN');
    if (!token || body.token !== token) return json({ ok:false, error:'Token inválido' });
    if (!body.sheetId) return json({ ok:false, error:'Falta el enlace del Sheet en Ajustes' });

    lock.waitLock(20000);
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

    // --- Nuevo apunte por chat (parser) ---
    var p = parseGasto(body.text);
    var id = Utilities.getUuid();
    var SEP = sepDe(ss);
    var row = siguienteFila(reg);
    if (row > reg.getMaxRows()) reg.insertRowsAfter(reg.getMaxRows(), 1);
    reg.getRange(row, 1, 1, 9).setValues([[ isoToDate(p.fecha), p.importe, p.categoria, p.concepto, body.persona || '',
      formulaMes(row, SEP), formulaSemana(row, SEP), id, new Date() ]]);
    return json({ ok:true, id:id, fecha:p.fecha, importe:p.importe,
                  categoria:p.categoria, concepto:p.concepto, persona:body.persona||'' });

  } catch (err) {
    return json({ ok:false, error:String(err) });
  } finally {
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
//  Parser local (importe, fecha, categoría, concepto)
// ============================================================
function parseGasto(texto) {
  var original = String(texto || '').trim();
  var norm = quitarAcentos(original.toLowerCase());
  var f = detectarFecha(norm);
  var sinFecha = f.match ? norm.replace(f.match, ' ') : norm;
  return {
    importe:   extraerImporte(sinFecha),
    fecha:     f.iso,
    categoria: clasificar(sinFecha),
    concepto:  limpiarConcepto(original)
  };
}

function quitarAcentos(s) {
  var lo = String.fromCharCode(768), hi = String.fromCharCode(879); // marcas diacríticas combinadas (tras NFD)
  return s.normalize('NFD').replace(new RegExp('[' + lo + '-' + hi + ']', 'g'), '');
}
function isoDe(dt) { return Utilities.formatDate(dt, TZ, 'yyyy-MM-dd'); }

function detectarFecha(norm) {
  var hoy = new Date(), y = hoy.getFullYear(), m;

  m = norm.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    var da = +m[1], moa = +m[2], ya = m[3] ? (+m[3] < 100 ? 2000 + (+m[3]) : +m[3]) : y;
    if (da>=1 && da<=31 && moa>=1 && moa<=12) return { iso: isoDe(new Date(ya, moa-1, da)), match: m[0] };
  }
  m = norm.match(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?\b/);
  if (m) {
    var db = +m[1], mob = MES_NUM[m[2]], yb = m[3] ? +m[3] : y;
    if (db>=1 && db<=31) return { iso: isoDe(new Date(yb, mob-1, db)), match: m[0] };
  }
  if (/\bpasado\s+manana\b/.test(norm)) { var d1=new Date(); d1.setDate(d1.getDate()+2); return { iso:isoDe(d1), match:'pasado manana' }; }
  if (/\bmanana\b/.test(norm))          { var d2=new Date(); d2.setDate(d2.getDate()+1); return { iso:isoDe(d2), match:'manana' }; }
  if (/\banteayer\b/.test(norm))        { var d3=new Date(); d3.setDate(d3.getDate()-2); return { iso:isoDe(d3), match:'anteayer' }; }
  if (/\bayer\b/.test(norm))            { var d4=new Date(); d4.setDate(d4.getDate()-1); return { iso:isoDe(d4), match:'ayer' }; }
  if (/\bhoy\b/.test(norm))             { return { iso:isoDe(new Date()), match:'hoy' }; }

  m = norm.match(/\b(?:dia|el)\s+(\d{1,2})\b/);
  if (m) { var dd=+m[1]; if (dd>=1 && dd<=31) return { iso:isoDe(new Date(y, hoy.getMonth(), dd)), match:m[0] }; }

  var dias = { domingo:0, lunes:1, martes:2, miercoles:3, jueves:4, viernes:5, sabado:6 };
  for (var k in dias) {
    var mm = norm.match(new RegExp('\\b(proximo\\s+)?' + k + '(\\s+que\\s+viene)?\\b'));
    if (mm) {
      var dt=new Date(), cur=dt.getDay(), tgt=dias[k], fut=!!(mm[1]||mm[2]), diff;
      if (fut) { diff=(tgt-cur+7)%7; if (diff===0) diff=7; dt.setDate(dt.getDate()+diff); }
      else     { diff=(cur-tgt+7)%7; dt.setDate(dt.getDate()-diff); }
      return { iso:isoDe(dt), match:mm[0] };
    }
  }
  return { iso: isoDe(new Date()), match: null };
}

function extraerImporte(norm) {
  norm = norm.replace(/\bmenos\s+/g, '-');
  var re = /(-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)/g;
  var m, cs = [];
  while ((m = re.exec(norm)) !== null) cs.push({ raw:m[1], idx:m.index, len:m[0].length });
  if (!cs.length) return 0;
  var elegido = null;
  for (var i=0; i<cs.length; i++) {
    var c = cs[i];
    var antes = norm.slice(Math.max(0, c.idx - 2), c.idx);
    var desp  = norm.slice(c.idx + c.len, c.idx + c.len + 8);
    if (antes.indexOf('€') !== -1 || /^\s*(€|eur|euro)/.test(desp)) { elegido = c; break; }
  }
  if (!elegido) {
    elegido = cs.map(function(c){ return { c:c, v:aNumero(c.raw) }; })
                .sort(function(a,b){ return Math.abs(b.v) - Math.abs(a.v); })[0].c;
  }
  return aNumero(elegido.raw);
}

function aNumero(raw) {
  var neg = false, s = raw;
  if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
  if (s.indexOf('.')!==-1 && s.indexOf(',')!==-1) s = s.replace(/\./g,'').replace(',','.');
  else if (s.indexOf(',')!==-1) s = s.replace(',','.');
  else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.','');
  var n = parseFloat(s);
  if (isNaN(n)) return 0;
  n = Math.round(n * 100) / 100;
  return neg ? -n : n;
}

function clasificar(norm) {
  var mejor = 'Otros gastos', mejorScore = 0, mejorPrio = 999;
  for (var cat in KEYWORDS) {
    var kws = KEYWORDS[cat], score = 0;
    for (var i = 0; i < kws.length; i++) {
      var kw = quitarAcentos(kws[i]).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('\\b' + kw + 's?\\b').test(norm)) score++;
    }
    if (score > 0) {
      var prio = PRIORIDAD.indexOf(cat);
      if (score > mejorScore || (score === mejorScore && prio < mejorPrio)) {
        mejor = cat; mejorScore = score; mejorPrio = prio;
      }
    }
  }
  return mejor;
}

function limpiarConcepto(original) {
  var s = ' ' + original + ' ';
  s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ');
  s = s.replace(/-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g, ' ');
  s = s.replace(/€|euros?|eur\b/gi, ' ');
  s = s.replace(/\b(menos|hoy|ayer|anteayer|manana|mañana|pasado)\b/gi, ' ');
  s = s.replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi, ' ');
  s = s.replace(/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|proximo|próximo|viene)\b/gi, ' ');
  s = s.replace(/\b(de|del|el|la|los|las|un|una|unos|unas|que|dia|día)\b/gi, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return 'Gasto';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
//  Utilidad de respuesta
// ============================================================
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
