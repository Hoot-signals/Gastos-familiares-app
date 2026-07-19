/**
 * ============================================================
 *  GASTOS — función personalizada GASTO() para este Sheet
 *  Este archivo SÍ debe estar vinculado a este Sheet en concreto
 *  (Extensiones -> Apps Script). Es lo único que necesita estarlo:
 *  el resto del backend vive en un proyecto standalone aparte.
 *
 *  Al duplicar este Sheet cada enero ("Archivo -> Hacer una
 *  copia"), este script vinculado SE DUPLICA CON ÉL, así que
 *  GASTO() sigue funcionando en la copia nueva sin tocar nada.
 * ============================================================
 */

var REGISTRO_SHEET = 'Registro';

/**
 * @param {string} categoria
 * @param {number} mes
 * @param {number} semana
 * @return {number}
 * @customfunction
 */
function GASTO(categoria, mes, semana) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var reg = ss.getSheetByName(REGISTRO_SHEET);
  if (!reg) return 0;
  var last = ultimaFilaDatos(reg);
  if (last < 2) return 0;
  var datos = reg.getRange(2, 2, last - 1, 6).getValues(); // B..G
  var total = 0;
  for (var i = 0; i < datos.length; i++) {
    if (datos[i][1] === categoria && datos[i][4] === mes && datos[i][5] === semana) {
      total += Number(datos[i][0]) || 0;
    }
  }
  return Math.round(total * 100) / 100;
}

function ultimaFilaDatos(reg) {
  var maxR = reg.getMaxRows();
  var col = reg.getRange(1, 1, maxR, 1).getValues();
  var last = 1;
  for (var i = 0; i < col.length; i++) if (col[i][0] !== '' && col[i][0] !== null) last = i + 1;
  return last;
}
