/* El presupuestador de fotovoltaica v2 (el de Ramón, 12-10-2026), traducido en
 * supabase/functions/presupuestar/fv.js.
 *
 * El modelo (modelo_fv.json) y los 23 casos del Excel (casos_prueba_fv.json)
 * están en la carpeta de tarifas del Drive, fuera del repo: llevan costes y
 * márgenes. La regla de Ramón: la integración no está terminada hasta que los
 * 23 casos den lo mismo que el Excel con 0,01 € de tolerancia. */
load(RUTA_TMP + '/fv.js');
load(RUTA_TMP + '/cadena.js');

var modelo = JSON.parse(read(RUTA_TARIFAS + '/modelo_fv.json'));
var casos = JSON.parse(read(RUTA_TARIFAS + '/casos_prueba_fv.json').replace(/^﻿/, ''));
var cerca = function (a, b, tol) { return Math.abs(Number(a) - Number(b)) <= tol; };

titulo('los ' + casos.length + ' casos del Excel de Ramón, al céntimo');
var iguales = 0;
casos.forEach(function (c) {
  var r = calcularFV(c.entrada, modelo), esp = c.esperado, dif = [];
  ['n_pan', 'kwp', 'prod', 'bloqueo', 'coste_total', 'pvp_antes', 'dto_eur', 'pvp_final', 'pvp_iva'].forEach(function (k) {
    if (!cerca(r[k], esp[k], 0.011)) dif.push(k + ': ' + r[k] + ' ≠ ' + esp[k]);
  });
  if (!cerca(r.margen_real, esp.margen_real, 1e-5)) dif.push('margen: ' + r.margen_real.toFixed(6) + ' ≠ ' + esp.margen_real);
  if (r.mod_inv !== esp.mod_inv) dif.push('inversor: ' + r.mod_inv + ' ≠ ' + esp.mod_inv);
  if (!dif.length) iguales++;
  comprueba(c.id + '  coste ' + r.coste_total.toFixed(2) + '  precio ' + r.pvp_final.toFixed(2) + (dif.length ? '  ' + dif.join('; ') : ''), !dif.length);
});
igual('casos iguales al Excel', iguales, casos.length);

titulo('redondeo de Excel');
igual('7 × 1,515 = 10,605 → 10,61 (mitad hacia arriba, sin ruido binario)', rnd(7 * 1.515, 2), 10.61);
igual('2,5 → 3', rnd(2.5, 0), 3);
igual('0,125 a dos decimales → 0,13', rnd(0.125, 2), 0.13);
igual('negativo: −2,5 → −3 (lejos de cero)', rnd(-2.5, 0), -3);
igual('roundup protegido: 0,30000000001 → 1, pero 3,0000000001 → 3', roundup(0.30000000001) + roundup(3.0000000001), 4);
igual('fixed en español', fixed(1234.5, 2), '1.234,50');

titulo('de la ficha de la app a la entrada del modelo');
var m = entradaDesdeDatos({ paneles_manual: 10, inversor_marca: 'fronius', suministro: 'monofasico', tipo_cubierta: 'teja_arabe',
  distancia_cubierta_inversor_m: 20, distancia_inversor_cuadro_m: 20, km_obra: 20, subvencion: true, filas_paneles: [{ paneles: 5 }, { paneles: 5 }] }, modelo);
var ent = m.entrada;
igual('10 paneles forzados', ent.paneles_forzado, 10);
igual('Fronius', ent.sis, 'Fronius');
igual('monofásico', ent.sumi, 'Monofásico');
igual('teja', ent.cubierta, 'Teja');
igual('2 filas', ent.filas, 2);
igual('subvención sí', ent.subv, 'Sí');
igual('sin avisos cuando está todo', m.avisos.length, 0);
var r0 = calcularFV(ent, modelo);
igual('y da el caso de referencia de Ramón: 7.770 €', r0.pvp_final, 7770);
igual('con 3.880,93 de coste', r0.coste_total, 3880.93);

var m2 = entradaDesdeDatos({ kwp_objetivo: 5, inversor_marca: 'deye', suministro: 'trifasico', tipo_cubierta: 'plana_transitable',
  orientacion_panel: 'horizontal', factura_rango: '200_350', certificado_energetico: true, cee_desplaz_h: 1, horas_elevador: 2 }, modelo);
igual('5 kWp a 510 Wp: 10 paneles', m2.entrada.paneles_forzado, 10);
igual('Deye', m2.entrada.sis, 'Deye');
igual('trifásico', m2.entrada.sumi, 'Trifásico');
igual('plana', m2.entrada.cubierta, 'Plana');
igual('horizontal', m2.entrada.orient, 'Horizontal');
igual('tramo de factura traducido', m2.entrada.factura_rango, 'Entre 200 € y 350 €');
igual('certificado energético con 1 h de desplazamiento', m2.entrada.cee + m2.entrada.cee_desplaz_h, 'Sí1');
igual('2 h de elevador pedidas', m2.entrada.horas_elev, 2);
comprueba('avisa de metros y km por defecto', m2.avisos.length === 4 && /metros de paneles/.test(m2.avisos[1]));
var r2 = calcularFV(m2.entrada, modelo);
igual('en plana el elevador son al menos 4 h aunque se pidan 2', r2.horas_elev, 4);
igual('cubierta de chapa: A MEDIDA por defecto', calcularFV(entradaDesdeDatos({ paneles_manual: 10, tipo_cubierta: 'chapa_sandwich' }, modelo).entrada, modelo).bloqueo, 1);
var rc = calcularFV(entradaDesdeDatos({ paneles_manual: 10, tipo_cubierta: 'chapa_sandwich' }, modelo).entrada, modelo, { chapaAMedida: false });
comprueba('con chapaAMedida=false da precio sin estructura (la pone el motor antiguo)', rc.bloqueo === 0 && rc.pvp_final > 0
  && rc.partidas.filter(function (x) { return x.bloque === 'ESTRUCTURA' && x.cantidad > 0; }).length === 1);
var ri = calcularFV(ent, modelo, { inversorFuera: true });
comprueba('con inversorFuera no cuenta inversor ni Smart Meter', ri.partidas.filter(function (x) { return (x.partida === 'Inversor' || x.partida === 'Medidor Fronius Smart Meter') && x.cantidad > 0; }).length === 0
  && ri.coste_total < r0.coste_total);

titulo('cable de continua por caída de tensión (v2.1, 16-10-2026)');
var cc20 = calcularFV(ent, modelo).cable_cc;
igual('con 20 m (25 m por string): 6 mm², como siempre', cc20.seccion, 6);
comprueba('y la caída con 6 mm² cumple el 1,5 %', cc20.tabla[0].cumple && cc20.tabla[0].caida_pct < 1.5);
var r120 = calcularFV(Object.assign({}, ent, { dist_cc: 120 }), modelo), cc120 = r120.cable_cc;
igual('con 120 m (125 por string), 10 paneles en 1 string: 16 mm²', cc120.seccion, 16);
comprueba('6 y 10 no cumplen, 16 sí (' + cc120.tabla.map(function (t) { return t.seccion + ':' + t.caida_pct; }).join(' ') + ')', !cc120.tabla[0].cumple && !cc120.tabla[1].cumple && cc120.tabla[2].cumple);
comprueba('la partida del cable dice 16 mm² y lleva el aviso de precio pendiente y conectores', r120.partidas.some(function (x) { return /Cable solar H1Z2Z2-K 16 mm²/.test(x.partida) && /PENDIENTE/.test(x.aviso) && /conectores/.test(x.aviso); }));
comprueba('el precio estimado del 16 es proporcional al del 6 (1,365 × 16/6)', Math.abs(cc120.coste_m - rnd(1.365 * 16 / 6, 3)) < 0.001);
comprueba('el aviso llega al presupuesto', r120.avisos.some(function (a) { return /16 mm²/.test(a); }));
var r120b = calcularFV(Object.assign({}, ent, { dist_cc: 120, paneles_forzado: 20 }), modelo).cable_cc;
igual('20 paneles en 2 strings de 10: misma tensión de string, también 16 mm²', r120b.seccion, 16);
var sinParams = JSON.parse(JSON.stringify(modelo)); ['panel_vmp', 'panel_imp', 'cdt_max_cc', 'conductividad_cu'].forEach(function (k) { delete sinParams.parametros[k]; });
igual('con el modelo v2 original (sin parámetros) sigue el 6 mm² fijo aunque haya 120 m', calcularFV(Object.assign({}, ent, { dist_cc: 120 }), sinParams).cable_cc.seccion, 6);

titulo('las líneas del presupuesto de la app');
var ls = lineasPresupuesto(r0, modelo, { modelo_version: 'v2' });
igual('una línea llave en mano', ls.length, 1);
igual('a 7.770 de venta', ls[0].precio_tarifa, 7770);
igual('y 3.880,93 de coste', ls[0].precio_coste, 3880.93);
comprueba('con el desglose de las 59 partidas por dentro', ls[0].origen_inputs.desglose.length === 59);
comprueba('el detalle para el cliente lleva los bloques, sin precios', /MÓDULOS FOTOVOLTAICOS: 10 módulos/.test(ls[0].detalle_tecnico) && !/€/.test(ls[0].detalle_tecnico));
comprueba('la descripción dice paneles, kWp y suministro', ls[0].descripcion === 'Instalación fotovoltaica llave en mano (10 paneles, 5,10 kWp, monofásico)');
var ped = ls[0].origen_inputs.pedido;
comprueba('pedido por proveedor: BayWa, Electromat, Massanella, Saltoki y Würth', Object.keys(ped).join(',') === 'BayWa,Electromat,Massanella,Saltoki,Würth');
comprueba('el inversor va a BayWa con su modelo', ped.BayWa.lineas.some(function (l) { return l.articulo === 'Fronius Primo GEN24 SC 5.0'; }));
var t = cadenaPrecios(ls, 0);
igual('la cadena de precios de la app da el mismo total', t.total, 7770);
var rd = calcularFV(Object.assign({}, ent, { horas_elev: 3 }), modelo);
var ld = lineasPresupuesto(rd, modelo, {});
igual('con elevador salen dos líneas', ld.length, 2);
igual('el elevador a 65 €/h', ld[1].precio_tarifa * ld[1].cantidad, 195);
var td = cadenaPrecios(ld, 5);
var rd5 = calcularFV(Object.assign({}, ent, { horas_elev: 3, dto: 0.05 }), modelo);
comprueba('el 5 % al pie línea a línea cuadra con el dto del modelo (' + td.total + ' / ' + rd5.pvp_final + ')', cerca(td.total, rd5.pvp_final, 0.011));
var la = lineasPresupuesto(calcularFV(Object.assign({}, ent, { cubierta: 'Chapa' }), modelo), modelo, {});
comprueba('A MEDIDA: la línea sale a 0 y sin confirmar', la[0].precio_tarifa === 0 && la[0].confirmada === false);

titulo('lo que ve el cliente');
var b = lineasCliente(rd);
comprueba('bloques en orden, con medios auxiliares al final', Object.keys(b).indexOf('MEDIOS AUXILIARES') > -1 && b['MEDIOS AUXILIARES'][0] === 'Elevador de carga (3 h)');
comprueba('los internos no salen', !Object.keys(b).some(function (k) { return k === 'INTERNO'; }));
comprueba('la puesta en marcha sale aunque su cantidad sea 0', !!b['PUESTA EN MARCHA Y MONITORIZACIÓN']);

resultado();
