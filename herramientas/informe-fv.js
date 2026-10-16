/* Sysefen · Informe de prueba del motor de fotovoltaica (lo lanza informe-fv.sh).
 *
 * Mismas medidas en todos los casos: teja, 2 filas, monofásico, 10 m de
 * paneles → inversor, 10 m de inversor → cuadro, 10 m de cuadro → contador,
 * 10 km a la obra, con subvención, sin certificado energético, sin elevador,
 * una planta, escalera, WiFi buena, cuadro bien, tierra existe, con excedentes.
 * Cambian el inversor (Fronius, Deye, Enphase), la batería (ninguna, BYD,
 * Fronius Reserva, Tesla, Enphase, Deye) y el backup; y cada caso se calcula
 * con 10 y con 20 paneles.
 *
 * El cálculo es el de la Edge Function: presupuestarFV (hibrido.js) + la
 * cadena de precios (cadena.js), con el modelo_fv.json y las reglas de la
 * etapa 72 de la carpeta de tarifas. Escribe el HTML por la salida estándar. */

var modelo = JSON.parse(read(RUTA_TARIFAS + '/modelo_fv.json'));
var mod = { id: null, version: String(modelo.version) + ' ' + String(modelo.fecha), datos: modelo };
var fv = JSON.parse(read(RUTA_TARIFAS + '/fotovoltaica-reglas.json'));
var cfg = { variables: fv.variables, lookup: fv.lookup, reglas: fv.reglas, productos: fv.productos, partidas: fv.partidas, manoObra: [], dtoLinea: [] };

var BASE = {
  inversor_marca: 'fronius', suministro: 'monofasico', tipo_cubierta: 'teja_arabe', orientacion_panel: 'vertical', plana_anclaje: 'lastre',
  distancia_cubierta_inversor_m: 10, distancia_inversor_cuadro_m: 10, distancia_cuadro_contador_m: 10, km_obra: 10,
  recorrido_cableado: 'fachada', zanja_m: 0, plantas: 1, medio_elevacion: 'escalera', wifi_inversor: 'buena',
  estado_cuadro: 'bien', toma_tierra: 'existe', excedentes: 'con_excedentes', subvencion: true, cargador_ve: false,
  certificado_energetico: false, cee_desplaz_h: 0, horas_elevador: 0, baterias: 'no', baterias_kwh: 0, bateria_marca: '', backup: false,
  backup_modo: 'automatico', backup_tipo: 'total',
  zona_protegida: false, cargas_previstas: [], tejas_reposicion: 0, perforaciones: 0, excedentes_gestion: 'no', bonificacion_ibi: false,
  inversor_exterior: false, instalacion_existente: false, via_publica: false, fibrocemento: false, wp_manual: 510,
};
var CASOS = [
  ['F · Fronius SC, sin batería', {}],
  ['F+ · Fronius Plus, preparado para baterías', { baterias: 'dejar_preparado' }],
  ['F · Fronius Plus + BYD 10 kWh', { baterias: 'si', baterias_kwh: 10, bateria_marca: 'byd' }],
  ['F · Fronius Plus + BYD 10 kWh + backup automático', { baterias: 'si', baterias_kwh: 10, bateria_marca: 'byd', backup: true, backup_modo: 'automatico' }],
  ['F · Fronius Plus + BYD 10 kWh + backup manual', { baterias: 'si', baterias_kwh: 10, bateria_marca: 'byd', backup: true, backup_modo: 'manual' }],
  ['F · Fronius Plus + Fronius Reserva 10 kWh', { baterias: 'si', baterias_kwh: 10, bateria_marca: 'fronius' }],
  ['F · Tesla Powerwall 3 (sin inversor Fronius)', { baterias: 'si', baterias_kwh: 13.5, bateria_marca: 'tesla' }],
  ['F · Tesla Powerwall 3 + backup', { baterias: 'si', baterias_kwh: 13.5, bateria_marca: 'tesla', backup: true }],
  ['D · Deye híbrido, sin batería', { inversor_marca: 'deye' }],
  ['D · Deye híbrido + batería 10 kWh (a mano)', { inversor_marca: 'deye', baterias: 'si', baterias_kwh: 10 }],
  ['E · Enphase IQ8P, sin batería', { inversor_marca: 'enphase' }],
  ['E · Enphase + IQ Battery 10 kWh', { inversor_marca: 'enphase', baterias: 'si', baterias_kwh: 10, bateria_marca: 'enphase' }],
  ['E · Enphase + IQ Battery 10 kWh + backup', { inversor_marca: 'enphase', baterias: 'si', baterias_kwh: 10, bateria_marca: 'enphase', backup: true }],
  ['E · Enphase + Tesla Powerwall 3', { inversor_marca: 'enphase', baterias: 'si', baterias_kwh: 13.5, bateria_marca: 'tesla' }],
];
var PANELES = [10, 20];

function datosDe(extra, n) {
  var d = {}; for (var k in BASE) d[k] = BASE[k]; for (var j in extra) d[j] = extra[j];
  d.paneles_manual = n;
  // Dos filas: n/2 por fila (igual que el reparto por defecto del modelo).
  d.filas_paneles = [{ paneles: n / 2 }, { paneles: n / 2 }];
  return d;
}
var escH = function (v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
var fmtEur = function (n) { n = Number(n) || 0; var s = Math.abs(n).toFixed(2).replace('.', ','); var e = s.split(',')[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'); return (n < 0 ? '-' : '') + e + ',' + s.split(',')[1] + ' €'; };
var fmtPct = function (x) { return (Math.round(x * 1000) / 10).toFixed(1).replace('.', ',') + ' %'; };
var fmtNum = function (x) { return String(Math.round(Number(x) * 1000) / 1000).replace('.', ','); };

var resultados = [];
CASOS.forEach(function (c) {
  PANELES.forEach(function (n) {
    var datos = datosDe(c[1], n);
    var res = presupuestarFV(datos, mod, cfg);
    res.lineas.forEach(function (l, i) { l.orden = i + 1; });
    var tot = cadenaPrecios(res.lineas, 0);
    var coste = totalCoste(res.lineas);
    var resumen = resumenDe(res.lineas);
    resultados.push({ titulo: c[0], n: n, datos: datos, res: res, tot: tot, coste: coste, resumen: resumen });
  });
});

var out = [];
var w = function (s) { out.push(s); };
w('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Prueba del motor FV · Sysefen</title>');
w('<style>');
w('body{font:13px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#14170f;margin:0;padding:24px;max-width:1100px;margin:auto}');
w('h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 6px;padding-top:14px;border-top:2px solid #14170f}h3{font-size:14px;margin:18px 0 6px;color:#444;text-transform:uppercase;letter-spacing:.06em}');
w('table{border-collapse:collapse;width:100%;margin:6px 0 12px}th,td{padding:4px 7px;border-bottom:1px solid #e4e4df;text-align:left;vertical-align:top}th{background:#f3f3ee;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em}td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}');
w('.sub{color:#666}.ok{color:#164a1d;font-weight:600}.mal{color:#b3261e;font-weight:600}.aviso{color:#8a5a00}.err{color:#b3261e}.tag{display:inline-block;padding:1px 7px;border-radius:99px;background:#eef;font-size:11px;margin-right:4px}');
w('.caso{page-break-inside:avoid}.resumen{background:#f6f6f1;padding:10px 14px;border-radius:10px;margin:8px 0}');
w('@media print{body{padding:0;font-size:11px}h2{page-break-before:always}h2:first-of-type{page-break-before:auto}.nopb{page-break-before:auto!important}}');
w('</style></head><body>');
w('<h1>Prueba del motor de presupuestos de fotovoltaica</h1>');
w('<div class="sub">Sysefen · ' + escH(FECHA) + ' · modelo FV v2 «' + escH(mod.version) + '» · motor por capítulos ' + escH(fv.reglas.length) + ' reglas · ' + resultados.length + ' presupuestos · USO INTERNO: lleva costes y márgenes</div>');

// --- resumen ---------------------------------------------------------------------
w('<h2 class="nopb" style="border-top:0;padding-top:0;margin-top:24px">1 · Resumen</h2>');
w('<div class="resumen"><b>Medidas iguales en todos:</b> teja árabe, 2 filas de paneles (n/2 por fila), panel vertical, monofásico, 10 m paneles → inversor, 10 m inversor → cuadro, 10 m cuadro → contador, 10 km a la obra, con subvención, sin certificado energético, sin elevador, 1 planta, escalera, WiFi buena, cuadro bien, toma de tierra existe, con excedentes, sin descuento.</div>');
w('<table><tr><th>Caso</th><th class="n">Paneles</th><th>Inversor</th><th class="n">Coste</th><th class="n">Venta sin IVA</th><th class="n">Beneficio</th><th class="n">Margen</th><th class="n">Con IVA</th><th>Avisos</th></tr>');
resultados.forEach(function (x, i) {
  var inv = x.res.fv2.mod_inv;
  var plus = x.res.lineas.filter(function (l) { return /Plus/.test(l.descripcion) && /GEN24/.test(l.descripcion); })[0];
  if (plus) inv = plus.descripcion;
  if (/A MEDIDA/.test(inv)) inv = 'A MEDIDA';
  if (x.datos.bateria_marca === 'tesla' && x.datos.inversor_marca === 'fronius') inv = 'Powerwall 3 (inversor integrado)';
  var m = x.resumen.margen_pct;
  var nErr = x.res.incidencias.filter(function (k) { return k.nivel === 'error'; }).length;
  w('<tr><td><a href="#c' + i + '" style="color:inherit">' + escH(x.titulo) + '</a></td><td class="n">' + x.n + '</td><td>' + escH(inv) + '</td>'
    + '<td class="n">' + fmtEur(x.coste.total) + '</td><td class="n"><b>' + fmtEur(x.tot.total) + '</b></td><td class="n">' + fmtEur(x.resumen.beneficio) + '</td>'
    + '<td class="n ' + (m != null && m >= 0.5 ? 'ok' : 'mal') + '">' + (m == null ? '-' : fmtPct(m)) + '</td><td class="n">' + fmtEur(Math.round(x.tot.total * 1.21 * 100) / 100) + '</td>'
    + '<td class="sub">' + x.res.incidencias.length + (nErr ? ' <span class="err">(' + nErr + ' error)</span>' : '') + (x.coste.lineas_sin_coste ? ' · ' + x.coste.lineas_sin_coste + ' línea(s) sin coste' : '') + '</td></tr>');
});
w('</table>');
w('<p class="sub">El margen en verde es ≥ 50 % (objetivo de Ramón sobre la venta). Donde entra el motor por capítulos (baterías, Plus, backup) el margen baja porque esas líneas llevan su margen de equipos (×1,20), no el 50 %.</p>');

// --- cada caso -------------------------------------------------------------------
resultados.forEach(function (x, i) {
  var r = x.res.fv2, d = x.datos;
  w('<h2 id="c' + i + '" class="caso">' + (i + 2) + ' · ' + escH(x.titulo) + ' · ' + x.n + ' paneles</h2>');
  // entrada
  w('<h3>Datos de entrada</h3><table><tr>');
  var ent = [['Paneles', x.n], ['Inversor', d.inversor_marca], ['Suministro', d.suministro], ['Cubierta', d.tipo_cubierta + ' · ' + d.orientacion_panel + ' · 2 filas'],
    ['Baterías', d.baterias + (d.baterias_kwh ? ' · ' + d.baterias_kwh + ' kWh · ' + d.bateria_marca : '')], ['Backup', d.backup ? 'sí · ' + d.backup_modo : 'no'],
    ['Paneles → inversor', d.distancia_cubierta_inversor_m + ' m'], ['Inversor → cuadro', d.distancia_inversor_cuadro_m + ' m'], ['Cuadro → contador', d.distancia_cuadro_contador_m + ' m'], ['Km a la obra', d.km_obra],
    ['Subvención', d.subvencion ? 'sí' : 'no'], ['Certificado energético', d.certificado_energetico ? 'sí' : 'no'], ['Elevador', d.horas_elevador + ' h']];
  ent.forEach(function (e, k) { if (k && k % 7 === 0) w('</tr><tr>'); w('<td><span class="sub">' + escH(e[0]) + '</span><br><b>' + escH(e[1]) + '</b></td>'); });
  w('</tr></table>');
  // dimensionado v2
  w('<h3>Dimensionado del modelo v2</h3><div class="resumen">' + r.n_pan + ' paneles · ' + fmtNum(r.kwp) + ' kWp · ' + fmtNum(r.prod) + ' kWh/año · ' + r.n_str + ' string(s) · inversor del modelo: <b>' + escH(r.mod_inv) + '</b>'
    + (r.kw_inv ? ' (' + fmtNum(r.kw_inv) + ' kW)' : '') + (r.cuadro_ac ? ' · cuadro AC: ' + escH(r.cuadro_ac.descripcion) : '') + ' · ' + r.jornadas + ' jornadas · ' + r.horas_elev + ' h de elevador'
    + '<br>Coste v2 ' + fmtEur(r.coste_total) + ' → precio objetivo ' + fmtEur(r.precio_objetivo) + ' (÷ 0,5, redondeado a 10 €) · margen real del v2 solo: ' + fmtPct(r.margen_real) + '</div>');
  // líneas del presupuesto
  w('<h3>Líneas del presupuesto (lo que ve la app)</h3><table><tr><th>Sección</th><th>Línea</th><th class="n">Cant.</th><th class="n">Coste ud</th><th class="n">Venta ud</th><th class="n">Importe</th><th class="n">Margen</th><th>Origen</th></tr>');
  x.res.lineas.forEach(function (l, k) {
    var imp = x.tot.lineas[k].total, c = l.precio_coste == null ? null : l.precio_coste * l.cantidad;
    var m = c == null || imp <= 0 ? null : (imp - c) / imp;
    var origen = l.origen_inputs && l.origen_inputs.fv2 ? (l.origen_inputs.elevador ? 'v2 · elevador' : 'v2 · llave en mano') : ('capítulos · ' + (l.producto_ref || l.origen));
    w('<tr><td class="sub">' + escH(l.seccion) + '</td><td>' + escH(l.descripcion) + (l.confirmada === false ? ' <span class="err">(sin confirmar)</span>' : '') + '</td><td class="n">' + fmtNum(l.cantidad) + ' ' + escH(l.unidad) + '</td>'
      + '<td class="n">' + (l.precio_coste == null ? '-' : fmtEur(l.precio_coste)) + '</td><td class="n">' + fmtEur(l.precio_tarifa) + '</td><td class="n"><b>' + fmtEur(imp) + '</b></td><td class="n">' + (m == null ? '-' : fmtPct(m)) + '</td><td class="sub">' + escH(origen) + '</td></tr>');
  });
  w('<tr><th colspan="3">Totales</th><th class="n">' + fmtEur(x.coste.total) + '</th><th></th><th class="n">' + fmtEur(x.tot.total) + '</th><th class="n">' + (x.resumen.margen_pct == null ? '-' : fmtPct(x.resumen.margen_pct)) + '</th><th class="sub">IVA 21 %: ' + fmtEur(Math.round(x.tot.total * 0.21 * 100) / 100) + ' · total ' + fmtEur(Math.round(x.tot.total * 1.21 * 100) / 100) + '</th></tr></table>');
  // incidencias
  if (x.res.incidencias.length) {
    w('<h3>Avisos e incidencias</h3><ul>');
    x.res.incidencias.forEach(function (k) { w('<li class="' + (k.nivel === 'error' ? 'err' : 'aviso') + '">' + escH(k.mensaje) + '</li>'); });
    w('</ul>');
  }
  // desglose v2
  w('<h3>Desglose del modelo v2 (' + r.partidas.filter(function (p) { return p.cantidad > 0; }).length + ' partidas con cantidad)</h3>');
  w('<table><tr><th>Bloque</th><th>Partida</th><th class="n">Cant.</th><th>Ud</th><th class="n">Coste ud</th><th class="n">Coste</th><th>Aviso</th></tr>');
  var bloqueAnt = '';
  r.partidas.forEach(function (p) {
    if (!(p.cantidad > 0) && !(p.coste > 0)) return;
    w('<tr><td class="sub">' + (p.bloque !== bloqueAnt ? escH(p.bloque) : '') + '</td><td>' + escH(p.partida) + '</td><td class="n">' + fmtNum(p.cantidad) + '</td><td>' + escH(p.ud) + '</td><td class="n">' + fmtEur(p.coste_ud) + '</td><td class="n">' + fmtEur(p.coste) + '</td><td class="aviso">' + escH(p.aviso || '') + '</td></tr>');
    bloqueAnt = p.bloque;
  });
  w('<tr><th colspan="5">Coste total del v2</th><th class="n">' + fmtEur(r.coste_total) + '</th><th></th></tr></table>');
  // lo que ve el cliente
  var bl = lineasCliente(r);
  w('<h3>Lo que ve el cliente (sin precios)</h3><ul>');
  ORDEN_BLOQUES.forEach(function (b) { if (bl[b]) w('<li><b>' + escH(b) + ':</b> ' + escH(bl[b].join('; ')) + '</li>'); });
  w('</ul>');
  // pedido
  var ped = pedidoMaterial(r, modelo);
  if (ped) {
    w('<h3>Pedido de material del v2 por proveedor (si acepta)</h3><table><tr><th>Proveedor</th><th class="n">Líneas</th><th class="n">Importe</th><th>Artículos</th></tr>');
    Object.keys(ped).forEach(function (q) { w('<tr><td><b>' + escH(q) + '</b></td><td class="n">' + ped[q].lineas.length + '</td><td class="n">' + fmtEur(ped[q].total) + '</td><td class="sub">' + escH(ped[q].lineas.map(function (l) { return l.cantidad + ' ' + l.articulo; }).join(' · ')) + '</td></tr>'); });
    w('</table>');
  }
});

// --- datos usados ------------------------------------------------------------------
w('<h2>' + (resultados.length + 2) + ' · Datos usados</h2>');
w('<h3>Parámetros del modelo v2</h3><table><tr><th>Parámetro</th><th class="n">Valor</th><th>Ud</th><th>Origen</th></tr>');
Object.keys(modelo.parametros).forEach(function (k) { var p = modelo.parametros[k]; w('<tr><td>' + escH(k) + '</td><td class="n">' + escH(p.valor) + '</td><td>' + escH(p.ud) + '</td><td class="sub">' + escH(p.origen) + '</td></tr>'); });
w('</table>');
w('<h3>Inversores del modelo v2</h3><table><tr><th>Sistema</th><th>Suministro</th><th class="n">kW</th><th>Modelo</th><th class="n">Coste base</th><th>Proveedor</th><th>Se usa</th></tr>');
modelo.inversores.forEach(function (i) { w('<tr><td>' + escH(i.sistema) + '</td><td>' + escH(i.suministro) + '</td><td class="n">' + i.kw + '</td><td>' + escH(i.modelo) + '</td><td class="n">' + fmtEur(i.coste_base) + '</td><td>' + escH(i.proveedor) + '</td><td>' + (i.usar ? 'sí' : 'no') + '</td></tr>'); });
w('</table><p class="sub">BayWa: coste base + portes ' + (modelo.parametros.portes_baywa.valor * 100).toFixed(3).replace('.', ',') + ' %. Rebacas: coste base − ' + (modelo.parametros.dto_rebacas.valor * 100).toFixed(2).replace('.', ',') + ' % + portes ' + (modelo.parametros.portes_rebacas.valor * 100).toFixed(3).replace('.', ',') + ' %.</p>');
w('<h3>Precios del modelo v2</h3><table><tr><th>Clave</th><th class="n">Coste</th><th class="n">Mono</th><th class="n">Tri</th><th>Proveedor</th><th>Nota</th></tr>');
Object.keys(modelo.precios).forEach(function (k) { if (k.charAt(0) === '_') return; var p = modelo.precios[k]; w('<tr><td>' + escH(k) + '</td><td class="n">' + (p.coste != null ? fmtEur(p.coste) : (p.pvp != null ? 'PVP ' + fmtEur(p.pvp) + ' − ' + (p.dto * 100) + ' %' : '')) + '</td><td class="n">' + (p.mono != null ? fmtEur(p.mono) : '') + '</td><td class="n">' + (p.tri != null ? fmtEur(p.tri) : '') + '</td><td>' + escH(p.proveedor) + '</td><td class="sub">' + escH(p.nota || p.ref || '') + '</td></tr>'); });
w('</table>');
w('<h3>Cuadros AC Sölver del modelo v2 (Saltoki, PVP − ' + (modelo.parametros.dto_saltoki.valor * 100) + ' %)</h3><table><tr><th>Suministro</th><th class="n">kW máx</th><th>Código</th><th>Descripción</th><th class="n">PVP</th><th class="n">Coste</th></tr>');
modelo.cuadros_ac.forEach(function (c) { w('<tr><td>' + escH(c.suministro) + '</td><td class="n">' + c.kw_max + '</td><td>' + escH(c.codigo) + '</td><td>' + escH(c.descripcion) + '</td><td class="n">' + fmtEur(c.pvp) + '</td><td class="n">' + fmtEur(Math.round(c.pvp * (1 - modelo.parametros.dto_saltoki.valor) * 100) / 100) + '</td></tr>'); });
w('</table>');
// productos del catálogo usados por el motor por capítulos en estos casos
var usados = {};
resultados.forEach(function (x) { x.res.lineas.forEach(function (l) { if (l.producto_ref && fv.productos[l.producto_ref]) usados[l.producto_ref] = fv.productos[l.producto_ref]; }); });
w('<h3>Productos del catálogo (etapa 72) que han entrado en estos presupuestos</h3><table><tr><th>Referencia</th><th>Nombre</th><th class="n">Coste tarifa</th><th class="n">Recargo</th><th>Familia</th></tr>');
Object.keys(usados).sort().forEach(function (k) { var p = usados[k]; w('<tr><td>' + escH(k) + '</td><td>' + escH(p.nombre) + '</td><td class="n">' + fmtEur(p.precio_tarifa) + '</td><td class="n">' + (p.recargo != null ? '×' + p.recargo : '×1,30 (+10 % CDC)') + '</td><td>' + escH(p.familia) + '</td></tr>'); });
w('</table>');
w('<p class="sub">Generado por herramientas/informe-fv.sh con el mismo código que la función presupuestar (hibrido.js, fv.js, motor.js, cadena.js). Las líneas del motor por capítulos llevan venta = coste × recargo del producto (equipos ×1,20; resto ×1,10 ×1,30); la línea «llave en mano» del v2 lleva venta = coste ÷ 0,5 redondeado a 10 €.</p>');
w('</body></html>');
print(out.join('\n'));
