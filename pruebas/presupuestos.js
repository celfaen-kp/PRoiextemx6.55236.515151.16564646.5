/* Motor de presupuestos · la suite con los presupuestos de verdad
 *
 * Los casos salen de presupuestos-historicos-lineas.csv, en la carpeta de
 * tarifas del Drive (SYSEFEN DATA/07-Tarifas para app, fuera del repo):
 * las líneas de los presupuestos cerrados de Sysefen tal como salieron en el
 * PDF. Los descuentos de línea vienen como una línea aparte ("-15% Descuento")
 * justo debajo de la línea a la que se aplican; aquí se vuelven a pegar a su
 * línea como `dto_linea_pct`, que es como los guarda el motor.
 *
 * Lo que se comprueba hoy (paso 3 de MOTOR-PRESUPUESTOS.md):
 *   1. La cadena de precios, con los casos de redondeo que la rompen.
 *   2. El 2026/596 al céntimo: 17.599,06 € sin IVA.
 *   3. Todos los presupuestos: que la cadena reproduce cada descuento de línea
 *      y el subtotal que salió en el PDF.
 *   4. Cobertura de catálogo: qué precios de material de marca se encuentran
 *      en las tarifas cargadas. No cuenta como fallo: dice qué tarifa falta.
 *
 * Cuando esté el motor (paso 2), aquí se añade: ficha de visita -> líneas, y
 * se comparan con las del PDF. */
load(RUTA_TMP + '/cadena.js');

function leerCSV(nombre) {
  var txt = read(RUTA_TARIFAS + '/' + nombre).replace(/\r/g, '');
  var filas = [], campo = '', fila = [], dentro = false;
  for (var i = 0; i < txt.length; i++) {
    var c = txt[i];
    if (dentro) {
      if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  var cab = filas.shift();
  return filas.filter(function (f) { return f.length > 1; }).map(function (f) {
    var o = {}; cab.forEach(function (k, j) { o[k] = f[j]; }); return o;
  });
}

var DESCUENTO = /^\s*-?\s*(\d+(?:[.,]\d+)?)\s*%\s*(de\s*)?descuento/i;

/** Las líneas de un presupuesto, con cada descuento pegado a su línea. */
function lineasDe(filas) {
  var out = [];
  filas.forEach(function (r) {
    var m = DESCUENTO.exec(r.descripcion);
    if (m) { out[out.length - 1].dto_linea_pct = Number(m[1].replace(',', '.')); out[out.length - 1].csv_dto = Number(r.importe_linea); return; }
    out.push({ descripcion: r.descripcion, cantidad: Number(r.cantidad), precio_tarifa: Number(r.precio_unitario),
      csv_importe: Number(r.importe_linea), dto_linea_pct: 0, csv_dto: 0 });
  });
  return out;
}

var historico = leerCSV('presupuestos-historicos-lineas.csv');
var presupuestos = {}, orden = [];
historico.forEach(function (r) {
  var k = r.presupuesto + ' · ' + r.fichero;
  if (!presupuestos[k]) { presupuestos[k] = []; orden.push(k); }
  presupuestos[k].push(r);
});
var eur = function (n) { return n.toFixed(2); };

/* ---------------------------------------------------------------- 1 */
titulo('La cadena de precios');
var c = cadenaPrecios([{ cantidad: 1, precio_tarifa: 10235, dto_linea_pct: 15 }], 10);
igual('10.235 −15 % = 8.699,75', eur(c.subtotal), '8699.75');
// 8.699,75 × 0,9 = 7.829,775: en coma flotante se queda en ,77. Tiene que ser ,78.
igual('el −10 % redondea la mitad hacia arriba (7.829,78)', eur(c.total), '7829.78');
igual('cantidades con decimales (2,5 m × 52 €)', eur(cadenaPrecios([{ cantidad: 2.5, precio_tarifa: 52 }], 0).total), '130.00');
igual('sin descuentos, tal cual', eur(cadenaPrecios([{ cantidad: 3, precio_tarifa: 245 }], 0).total), '735.00');
igual('importes con coma ("1.234,56")', aCentimos('1.234,56'), 123456);
var raro = false; try { cadenaPrecios([{ cantidad: 1, precio_tarifa: 10, dto_linea_pct: 130 }], 0); } catch (e) { raro = true; }
comprueba('un descuento de más del 100 % se rechaza', raro);

/* ---------------------------------------------------------------- 2 */
titulo('2026/596 · aerotermia Vaillant 8 kW');
var k596 = orden.filter(function (k) { return k.indexOf('2026/596 ') === 0; })[0];
comprueba('está en el histórico', !!k596);
var l596 = lineasDe(presupuestos[k596]);
igual('12 líneas', l596.length, 12);
var t = cadenaPrecios(l596, 10);
igual('suma a PVP de tarifa', eur(t.total_bruto), '21560.00');
igual('descuentos de línea (−15 %)', eur(t.total_dto_linea), '-2005.50');
igual('subtotal', eur(t.subtotal), '19554.50');
igual('descuento global −10 %', eur(t.total_dto_global), '-1955.44');
igual('TOTAL sin IVA', eur(t.total), '17599.06');
// Y que de verdad hacía falta hacerlo línea a línea:
comprueba('(aplicado al subtotal de una vez daría 17.599,05)', eur(Math.round(19554.50 * 90) / 100) === '17599.05');

/* ---------------------------------------------------------------- 3 */
titulo('Todos los presupuestos del histórico');
var bien = 0, mal = [], pcts = {};
orden.forEach(function (k) {
  var ls = lineasDe(presupuestos[k]);
  var r = cadenaPrecios(ls, 0);
  var okLineas = r.lineas.every(function (x, i) {
    return eur(x.bruto) === eur(ls[i].csv_importe) && eur(x.dto_linea) === eur(ls[i].csv_dto);
  });
  var sumaCSV = presupuestos[k].reduce(function (s, f) { return s + aCentimos(f.importe_linea); }, 0) / 100;
  ls.forEach(function (x) { if (x.dto_linea_pct) pcts[x.dto_linea_pct] = (pcts[x.dto_linea_pct] || 0) + 1; });
  if (okLineas && eur(r.subtotal) === eur(sumaCSV)) bien++; else mal.push(k + ' (cadena ' + eur(r.subtotal) + ', PDF ' + eur(sumaCSV) + ')');
});
igual('presupuestos cuyo subtotal reproduce la cadena', bien + ' de ' + orden.length, orden.length + ' de ' + orden.length);
mal.slice(0, 5).forEach(function (m) { print('        ' + m); });
print('  info  descuentos de línea que aparecen: ' + Object.keys(pcts).sort(function (a, b) { return a - b; })
  .map(function (p) { return p + ' % ×' + pcts[p]; }).join(', '));
print('        (la política de la etapa 38 solo tiene el 15 %; los demás son de marca o de campaña)');

/* ---------------------------------------------------------------- 4 */
titulo('Cobertura de catálogo (informativo, no cuenta como fallo)');
// Se busca en la tarifa DE SU MARCA (por el nombre del fichero del PDF). Buscar
// en todas daba aciertos de casualidad: los 10.235 € del 2026/596 coinciden con
// un pack Saunier, y los 2.035 € con un acumulador Saunier.
var MARCAS = { VAILLANT: 'vaillant-2025', MIDEA: 'midea-2026', SAUNIER: 'saunier-2026' };
var precios = {};
Object.keys(MARCAS).forEach(function (m) {
  precios[m] = {};
  leerCSV(MARCAS[m] + '.csv').forEach(function (p) { precios[m][Number(p.precio_tarifa).toFixed(2)] = p.referencia; });
});
var marcaDe = function (k) { var f = k.toUpperCase(); return Object.keys(MARCAS).filter(function (m) { return f.indexOf(m) > -1; })[0]; };
// El material de marca es el que lleva descuento de línea: es el que tiene que
// salir de una tarifa. El resto (A100, RITE, mano de obra…) va a precio cerrado.
var marca = 0, conPrecio = 0, sinPrecio = {}, sinMarca = 0;
orden.forEach(function (k) {
  var m = marcaDe(k);
  lineasDe(presupuestos[k]).forEach(function (x) {
    if (!x.dto_linea_pct || x.dto_linea_pct >= 100) return;
    if (!m) { sinMarca++; return; }
    marca++;
    if (precios[m][eur(x.precio_tarifa)]) conPrecio++;
    else (sinPrecio[k.split(' · ')[0]] = sinPrecio[k.split(' · ')[0]] || []).push(x.descripcion.slice(0, 40) + ' ' + eur(x.precio_tarifa));
  });
});
print('  info  material de marca con su precio en la tarifa de su marca: ' + conPrecio + ' de ' + marca
  + (sinMarca ? ' (y ' + sinMarca + ' líneas de presupuestos sin marca en el nombre)' : ''));
print('        presupuestos con algún precio que no está: ' + Object.keys(sinPrecio).join(', '));
if (sinPrecio['2026/596']) print('  info  2026/596 · sin tarifa: ' + sinPrecio['2026/596'].join(' · '));
print('        (precio de 2026: la tarifa Vaillant cargada es la de 2025. Hasta tener la de 2026,');
print('         el motor no puede sacar este presupuesto desde el catálogo, solo desde la cadena.)');

resultado();
