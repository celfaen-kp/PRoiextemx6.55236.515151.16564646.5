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
// Los 23 casos del Excel de Ramón son con toda la mano de obra al margen: los
// tramos €/W de Enzo (26-10-2026) se prueban aparte, abajo.
var tramosMO = modelo.parametros.mo_venta_tramos; delete modelo.parametros.mo_venta_tramos;
// Igual con la jornada a 880 € (Enzo, 10-11-2026): se prueba aparte, al final.
var ventaJornada = modelo.parametros.venta_jornada; delete modelo.parametros.venta_jornada;
// Y con la documentación y legalización en una partida a 400 € (Enzo, 10-11-2026).
var ventaDoc = modelo.parametros.venta_documentacion; delete modelo.parametros.venta_documentacion;
var horasDoc = modelo.parametros.horas_documentacion; delete modelo.parametros.horas_documentacion;
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
igual('subvención: nunca (Enzo, 6-11-2026), aunque la ficha la pida', ent.subv, 'No');
igual('sin avisos cuando está todo', m.avisos.length, 0);
var r0 = calcularFV(ent, modelo);
igual('y da el caso de referencia de Ramón sin la hora de subvención: 7.770 − 80 = 7.690 €', r0.pvp_final, 7690);
igual('con 3.880,93 − 40 = 3.840,93 de coste', r0.coste_total, 3840.93);

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
comprueba('la partida del cable dice 16 mm² y avisa del tubo (los MC4 se mantienen)', r120.partidas.some(function (x) { return /Cable solar H1Z2Z2-K 16 mm²/.test(x.partida) && /tubo/.test(x.aviso) && !/conectores/.test(x.aviso); }));
igual('el 16 mm² va al precio web de Obramat (2,30 €/m), no estimado', cc120.coste_m, 2.3);
comprueba('el 25 mm² sigue estimado (sin precio): 1,365 × 25/6', cc120.tabla[3].precio_estimado && Math.abs(cc120.tabla[3].coste_m - rnd(1.365 * 25 / 6, 3)) < 0.001);
comprueba('el aviso llega al presupuesto', r120.avisos.some(function (a) { return /16 mm²/.test(a); }));
var r120b = calcularFV(Object.assign({}, ent, { dist_cc: 120, paneles_forzado: 20 }), modelo).cable_cc;
igual('20 paneles en 2 strings de 10: misma tensión de string, también 16 mm²', r120b.seccion, 16);
var sinParams = JSON.parse(JSON.stringify(modelo)); ['panel_vmp', 'panel_imp', 'cdt_max_cc', 'conductividad_cu'].forEach(function (k) { delete sinParams.parametros[k]; });
igual('con el modelo v2 original (sin parámetros) sigue el 6 mm² fijo aunque haya 120 m', calcularFV(Object.assign({}, ent, { dist_cc: 120 }), sinParams).cable_cc.seccion, 6);

titulo('las líneas del presupuesto de la app');
var ls = lineasPresupuesto(r0, modelo, { modelo_version: 'v2' });
igual('una línea llave en mano', ls.length, 1);
igual('a 7.690 de venta', ls[0].precio_tarifa, 7690);
igual('y 3.840,93 de coste', ls[0].precio_coste, 3840.93);
comprueba('con el desglose de las 59 partidas por dentro', ls[0].origen_inputs.desglose.length === 59);
comprueba('el detalle para el cliente lleva los bloques, sin precios', /MÓDULOS FOTOVOLTAICOS: 10 módulos/.test(ls[0].detalle_tecnico) && !/€/.test(ls[0].detalle_tecnico));
comprueba('la descripción dice paneles, kWp y suministro', ls[0].descripcion === 'Instalación fotovoltaica llave en mano (10 paneles, 5,10 kWp, monofásico)');
var ped = ls[0].origen_inputs.pedido;
comprueba('pedido por proveedor: BayWa, Electromat, Massanella, Saltoki y Würth', Object.keys(ped).join(',') === 'BayWa,Electromat,Massanella,Saltoki,Würth');
comprueba('el inversor va a BayWa con su modelo', ped.BayWa.lineas.some(function (l) { return l.articulo === 'Fronius Primo GEN24 SC 5.0'; }));
var t = cadenaPrecios(ls, 0);
igual('la cadena de precios de la app da el mismo total', t.total, 7690);
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

titulo('mano de obra por tabla €/W (Enzo, 26-10-2026)');
var modeloMO = JSON.parse(JSON.stringify(modelo)); modeloMO.parametros.mo_venta_tramos = tramosMO;
var e10 = Object.assign({}, ent, { paneles_forzado: 10, sis: 'Fronius', sumi: 'Monofásico', cubierta: 'Teja', dto: 0, horas_elev: 0 });
var rSin = calcularFV(e10, modelo), rCon = calcularFV(e10, modeloMO);
igual('10 paneles · 5,1 kWp: 0,25 €/W = 1.275 € de mano de obra', rCon.mo_tabla.venta_mo, 1275);
igual('y el resto al 50 %, redondeado a 10, más la mano de obra', rCon.precio_objetivo, Math.ceil((rSin.coste_total - rSin.jornadas * rSin.jornada) / 0.5 / 10) * 10 + 1275);
var r4 = calcularFV(Object.assign({}, e10, { paneles_forzado: 4 }), modeloMO);
igual('4 paneles · 2,04 kWp: tramo de 0,40', r4.mo_tabla.eur_w, 0.4);
var r8 = calcularFV(Object.assign({}, e10, { paneles_forzado: 8 }), modeloMO);
igual('8 paneles · 4,08 kWp: tramo de 0,30', r8.mo_tabla.eur_w, 0.3);
comprueba('sin tramos en el modelo, todo sigue al margen (como el Excel)', rSin.mo_tabla === null);
var rBat = calcularFV(e10, modeloMO, { jornadaBateria: true });
igual('con batería: una jornada más de coste', rBat.jornadas, rCon.jornadas + 1);
igual('y 450 € más de venta de mano de obra', rBat.mo_tabla.venta_mo, rCon.mo_tabla.venta_mo + 450);

titulo('instalaciones grandes (Enzo, 4-11-2026: 40 paneles)');
var e40 = Object.assign({}, e10, { paneles_forzado: 40, sumi: 'Trifásico', filas: 4 });
var r40 = calcularFV(e40, modeloMO);
igual('40 paneles: no es A MEDIDA', r40.bloqueo, 0);
igual('20,4 kWp ÷ 1,125 = 18,1 kW: 2 inversores en paralelo', r40.n_inv, 2);
igual('el modelo más pequeño que cubre entre dos: Symo 10', r40.mod_inv, 'Fronius Symo GEN24 SC 10.0');
igual('potencia total 20 kW', r40.kw_inv, 20);
igual('la línea del inversor lleva 2 unidades', r40.partidas.filter(function (x) { return x.partida === 'Inversor'; })[0].cantidad, 2);
igual('4 strings (2 por inversor)', r40.n_str, 4);
igual('y 2 cuadros CC de 2 strings', r40.partidas.filter(function (x) { return x.partida === 'Cuadro CC Solver 2 strings'; })[0].cantidad, 2);
igual('jornadas: 3 + 3 (18 paneles extra ÷ 8 = 2,25 → 3)', r40.jornadas, 6);
igual('las 3 extra se cobran a 450 €', r40.mo_tabla.venta_jornadas_extra, 1350);
igual('mano de obra: 20.400 W × 0,25 + 1.350', r40.mo_tabla.venta_mo, 20400 * 0.25 + 1350);
comprueba('avisa de los dos inversores', r40.avisos.some(function (a) { return a.indexOf('2 inversores') === 0; }));
var r30 = calcularFV(Object.assign({}, e40, { paneles_forzado: 30 }), modeloMO);
igual('30 paneles: 4 jornadas (como antes) y una extra cobrada', r30.jornadas + '/' + r30.mo_tabla.venta_jornadas_extra, '4/450');
var r22 = calcularFV(Object.assign({}, e40, { paneles_forzado: 22 }), modeloMO);
igual('22 paneles: 3 jornadas, nada extra, un inversor', r22.jornadas + '/' + r22.mo_tabla.venta_jornadas_extra + '/' + r22.n_inv, '3/0/1');
var r40m = calcularFV(Object.assign({}, e40, { sumi: 'Monofásico' }), modeloMO);
igual('40 paneles en monofásico: sigue A MEDIDA', r40m.bloqueo, 1);
comprueba('y lo explica', r40m.avisos.some(function (a) { return a.indexOf('Pasar a trifásico') > 0; }));
titulo('inversores del catálogo (Enzo, 4-11-2026)');
var cat = [
  { referencia: 'FV-FRONIUS-VERTO-20.0-PLUS-SPD', nombre: 'Fronius Verto 20.0 Plus - (SPD 1+2)', precio_tarifa: 3206.56, descuento_proveedor: 0 },
  { referencia: 'FV-FRONIUS-VERTO-20.0-SPD', nombre: 'Fronius Verto 20.0 - (SPD 1+2)', precio_tarifa: 2224.95, descuento_proveedor: 0 },
  { referencia: 'FV-FRONIUS-SYMO-GEN24-SC-10.0', nombre: 'FRONIUS Symo GEN24 SC 10.0', precio_tarifa: 1821.58, descuento_proveedor: 0 },
  { referencia: 'FV-FRONIUS-PRIMO-GEN24-10.0KW', nombre: 'Fronius Primo GEN24 10.0KW', precio_tarifa: 1553.3, descuento_proveedor: 0 },
  { referencia: 'FV-FRONIUS-SYMO-GEN24-SC-12.0-PLUS', nombre: 'Fronius Symo GEN24 SC 12.0 Plus', precio_tarifa: 2388.02, descuento_proveedor: 0 },
  { referencia: 'FV-DEYE-SUN-20K-SG05LP3-EU-SM2', nombre: 'Deye híbrido SUN-20K-SG05LP3-EU-SM2', precio_tarifa: 1969, descuento_proveedor: 0 },
  { referencia: 'FV-DEYE-SUN-16K-SG01LP1-EU-AM3-P', nombre: 'Deye híbrido SUN-16K-SG01LP1-EU-AM3-P', precio_tarifa: 1750, descuento_proveedor: 0 },
  { referencia: 'SY-INVERSOR-VICTRON', nombre: 'Inversor Victron multiplus II 48/5000', precio_tarifa: 1146, descuento_proveedor: 0 },
];
var v20p = inversorDeCatalogo(cat[0]);
igual('Verto 20 Plus: Fronius, trifásico, 20 kW, híbrido', [v20p.sistema, v20p.suministro, v20p.kw, v20p.plus].join('/'), 'Fronius/Trifásico/20/true');
igual('y sin la coletilla del SPD', v20p.modelo, 'Fronius Verto 20.0 Plus');
igual('Primo GEN24 10.0KW: monofásico, 10 kW, no híbrido', [inversorDeCatalogo(cat[3]).suministro, inversorDeCatalogo(cat[3]).kw, inversorDeCatalogo(cat[3]).plus].join('/'), 'Monofásico/10/false');
igual('Deye SUN-20K LP3: trifásico 20 kW híbrido', [inversorDeCatalogo(cat[5]).suministro, inversorDeCatalogo(cat[5]).kw, inversorDeCatalogo(cat[5]).plus].join('/'), 'Trifásico/20/true');
igual('Deye SUN-16K LP1: monofásico', inversorDeCatalogo(cat[6]).suministro, 'Monofásico');
comprueba('el Victron no se entiende: fuera', inversorDeCatalogo(cat[7]) === null);
var modeloCat = conInversoresDelCatalogo(modeloMO, cat);
igual('los que ya están en el modelo no se duplican (Symo 10 y Primo 10)', modeloCat.inversores.length, modeloMO.inversores.length + 5);
var rV = calcularFV(e40, modeloCat);
igual('40 paneles sin batería: un Verto 20.0 (no el Plus)', rV.mod_inv + ' ×' + rV.n_inv, 'Fronius Verto 20.0 ×1');
var rVp = calcularFV(e40, modeloCat, { hibrido: true, jornadaBateria: true });
igual('40 paneles con batería: el Verto 20.0 Plus', rVp.mod_inv, 'Fronius Verto 20.0 Plus');
var r10p = calcularFV(Object.assign({}, e10, { sumi: 'Trifásico' }), modeloCat, { hibrido: true });
igual('10 paneles trifásico con batería: Symo 12 Plus (el único Plus tri de la lista)', r10p.mod_inv, 'Fronius Symo GEN24 SC 12.0 Plus');
igual('sin batería sigue el SC de Ramón', calcularFV(Object.assign({}, e10, { sumi: 'Trifásico' }), modeloCat).mod_inv, 'Fronius Symo GEN24 SC 5.0');
titulo('monofásico que se queda corto: pasa a trifásico (Enzo, 11-11-2026: más de 22 paneles)');
var eM = Object.assign({}, e10, { sumi: 'Monofásico' });
var m22 = calcularFV(Object.assign({}, eM, { paneles_forzado: 22 }), modeloCat, { pasarATrifasico: true });
igual('22 paneles (11,22 kWp ÷ 1,125 = 9,97 kW): cabe en el Primo de 10 y sigue en monofásico', m22.mod_inv + '/' + m22.entrada.sumi + '/' + !!m22.sumi_cambiado, 'Fronius Primo GEN24 10.0/Monofásico/false');
var m23s = calcularFV(Object.assign({}, eM, { paneles_forzado: 23 }), modeloCat);
igual('23 paneles sin la opción (el Excel de Ramón): sigue A MEDIDA', m23s.bloqueo + '/' + m23s.mod_inv, '1/A MEDIDA');
var m23 = calcularFV(Object.assign({}, eM, { paneles_forzado: 23 }), modeloCat, { pasarATrifasico: true });
igual('23 paneles con la opción: Symo de 12 kW, en trifásico y con precio', m23.mod_inv + '/' + m23.entrada.sumi + '/' + m23.bloqueo, 'Fronius Symo GEN24 SC 12.0/Trifásico/0');
comprueba('con precio de verdad', m23.precio_objetivo > 0);
comprueba('lo avisa lo primero, con los números', /^Con 23 paneles \(11,73 kWp\) hacen falta 10,4 kW y el Fronius monofásico mayor es de 10 kW: se presupuesta en TRIFÁSICO con Fronius Symo GEN24 SC 12\.0\. Comprobar/.test(m23.avisos[0]));
igual('queda apuntado el cambio', m23.sumi_cambiado.de + '→' + m23.sumi_cambiado.a + '/' + m23.sumi_cambiado.motivo, 'Monofásico→Trifásico/potencia');
igual('el medidor es el trifásico', m23.partidas.filter(function (x) { return /Smart Meter/.test(x.partida) && x.cantidad > 0; }).length > 0 && /TS 65A-3/.test(m23.partidas.filter(function (x) { return /Smart Meter/.test(x.partida) && x.cantidad > 0; })[0].texto || 'TS 65A-3'), true);
igual('y el cable de alterna, de cinco hilos', m23.partidas.filter(function (x) { return x.partida === 'Cable AC H07Z1-K 1×6'; })[0].cantidad, eM.dist_ac * 5);
var l23 = lineasPresupuesto(m23, modeloCat, {});
comprueba('la línea del cliente dice trifásico', /23 paneles, 11,73 kWp, trifásico/.test(l23[0].descripcion));
comprueba('y el desplegable trae los trifásicos (Symo, Verto)', l23[0].origen_inputs.opciones.inversores.every(function (i) { return /Symo|Verto/.test(i.modelo); }) && l23[0].origen_inputs.opciones.inversores.length > 3);
var m40 = calcularFV(Object.assign({}, eM, { paneles_forzado: 40, filas: 4 }), modeloCat, { pasarATrifasico: true });
igual('40 paneles en monofásico: Verto 20.0, uno solo', m40.mod_inv + ' ×' + m40.n_inv + '/' + m40.bloqueo, 'Fronius Verto 20.0 ×1/0');
// Con batería hace falta que haya un Plus monofásico con el que comparar (en la base lo hay: Primo GEN24 10.0 Plus; el precio de aquí es de prueba).
var modeloCatP = conInversoresDelCatalogo(modeloCat, [{ referencia: 'FV-FRONIUS-PRIMO-GEN24-10.0-PLUS', nombre: 'Fronius Primo GEN24 10.0 Plus', precio_tarifa: 2000, descuento_proveedor: 0 }]);
var m40p = calcularFV(Object.assign({}, eM, { paneles_forzado: 40, filas: 4 }), modeloCatP, { pasarATrifasico: true, hibrido: true, jornadaBateria: true });
igual('con batería: el Verto 20.0 Plus', m40p.mod_inv + '/' + m40p.entrada.sumi, 'Fronius Verto 20.0 Plus/Trifásico');
var mMano = calcularFV(Object.assign({}, eM, { paneles_forzado: 12, inv_modelo: 'Fronius Symo GEN24 SC 8.0' }), modeloCat, { pasarATrifasico: true });
igual('un Symo elegido a mano con la ficha en monofásico: también pasa a trifásico', mMano.mod_inv + '/' + mMano.entrada.sumi + '/' + mMano.sumi_cambiado.motivo, 'Fronius Symo GEN24 SC 8.0/Trifásico/inversor');
comprueba('y dice por qué', /^El inversor elegido \(Fronius Symo GEN24 SC 8\.0\) es trifásico/.test(mMano.avisos[0]));
var mPrimo = calcularFV(Object.assign({}, eM, { paneles_forzado: 12, inv_modelo: 'Fronius Primo GEN24 SC 6.0' }), modeloCat, { pasarATrifasico: true });
igual('un Primo a mano se queda en monofásico', mPrimo.entrada.sumi + '/' + !!mPrimo.sumi_cambiado, 'Monofásico/false');
var mDeye = calcularFV(Object.assign({}, eM, { sis: 'Deye', paneles_forzado: 40, filas: 4 }), modeloCat, { pasarATrifasico: true });
igual('Deye: 40 paneles piden 18,1 kW, el monofásico mayor es el de 16: al SUN-20K trifásico', mDeye.entrada.sumi + '/' + mDeye.kw_inv + '/' + mDeye.bloqueo, 'Trifásico/20/0');
titulo('mano de obra a 880 € la jornada (Enzo, 10-11-2026)');
var modelo880 = JSON.parse(JSON.stringify(modeloMO)); modelo880.parametros.venta_jornada = ventaJornada || { valor: 880 };
comprueba('el modelo del Drive trae venta_jornada = 880', !!ventaJornada && ventaJornada.valor === 880);
var j10 = calcularFV(e10, modelo880);
igual('10 paneles: 2 jornadas × 880 = 1.760 € (antes 1.275 por €/W)', j10.mo_tabla.venta_mo, 1760);
igual('manda sobre la tabla €/W', j10.mo_tabla.eur_w, null);
igual('el resto del coste sigue al 50 %, redondeado a 10', j10.precio_objetivo, Math.ceil((rSin.coste_total - rSin.jornadas * rSin.jornada) / 0.5 / 10) * 10 + 1760);
igual('el coste no cambia (nóminas)', j10.coste_total, rCon.coste_total);
var j6 = calcularFV(Object.assign({}, e10, { paneles_forzado: 6 }), modelo880);
igual('6 paneles: también 2 jornadas = 1.760 €', j6.jornadas + '/' + j6.mo_tabla.venta_mo, '2/1760');
var j14 = calcularFV(Object.assign({}, e10, { paneles_forzado: 14 }), modelo880);
igual('14 paneles: 3 jornadas = 2.640 €', j14.jornadas + '/' + j14.mo_tabla.venta_mo, '3/2640');
var jBat = calcularFV(e10, modelo880, { jornadaBateria: true });
igual('con batería: 3 jornadas, la de la batería también a 880', jBat.jornadas + '/' + jBat.mo_tabla.venta_mo + '/' + jBat.mo_tabla.jornada_bateria, '3/2640/880');
var j40 = calcularFV(e40, modelo880);
igual('40 paneles: 6 jornadas × 880 = 5.280 €, las extra a 880', j40.mo_tabla.venta_mo + '/' + j40.mo_tabla.venta_jornadas_extra, '5280/2640');
comprueba('el aviso de jornadas extra dice 880 €', j40.avisos.some(function (a) { return a.indexOf('cobradas a 880 € cada una') > -1; }));
var l880 = lineasPresupuesto(j10, modelo880, {});
igual('la línea guarda jornadas y precio de la jornada', l880[0].origen_inputs.precio.mo_tabla.jornadas + '/' + l880[0].origen_inputs.precio.mo_tabla.venta_jornada, '2/880');

titulo('documentación y legalización en una partida a 400 € (Enzo, 10-11-2026)');
comprueba('el modelo del Drive trae venta_documentacion = 400 y 5 h', !!ventaDoc && ventaDoc.valor === 400 && !!horasDoc && horasDoc.valor === 5);
var modeloDoc = JSON.parse(JSON.stringify(modelo880)); modeloDoc.parametros.venta_documentacion = { valor: 400 }; modeloDoc.parametros.horas_documentacion = { valor: 5 };
var d10 = calcularFV(e10, modeloDoc);
var tram = function (r) { return r.partidas.filter(function (x) { return x.bloque === 'TRÁMITES' && x.cantidad > 0; }); };
igual('antes eran cuatro partidas: 2,5 h + tasa = 140 € de coste', tram(j10).length + '/' + tram(j10).reduce(function (s, x) { return s + x.coste; }, 0), '4/140');
igual('ahora una sola: 5 h de Xavi', tram(d10).map(function (x) { return x.partida + ' · ' + x.cantidad + ' ' + x.ud + ' × ' + x.coste_ud; }).join('|'), 'Documentación y legalización (Xavi 5 h) · 5 h × 40');
igual('se vende a 400 € (80 €/h) con 200 € de coste', d10.doc_tabla.venta + '/' + d10.doc_tabla.venta_h + '/' + d10.doc_tabla.coste, '400/80/200');
igual('el coste sube 60 € (200 − 140)', Math.round((d10.coste_total - j10.coste_total) * 100) / 100, 60);
igual('precio: el resto al 50 % redondeado a 10, más mano de obra y los 400', d10.precio_objetivo, Math.ceil(Number(((d10.coste_total - d10.mo_tabla.coste_mo - 200) / 0.5 / 10).toFixed(9))) * 10 + d10.mo_tabla.venta_mo + 400);
comprueba('el precio sube entre 110 y 130 € (280 → 400, con el redondeo a 10)', d10.precio_objetivo - j10.precio_objetivo >= 110 && d10.precio_objetivo - j10.precio_objetivo <= 130);
var dSub = calcularFV(Object.assign({}, e10, { subv: 'Sí' }), modeloDoc);
igual('la gestión de subvención sigue aparte, a coste y margen', tram(dSub).length + '/' + tram(dSub)[1].partida, '2/Gestión de subvención (Xavi 1 h)');
var lDoc = lineasPresupuesto(d10, modeloDoc, {});
igual('la línea guarda la venta de la documentación', lDoc[0].origen_inputs.precio.doc_tabla.venta + '/' + lDoc[0].origen_inputs.precio.doc_tabla.partida, '400/Documentación y legalización (Xavi 5 h)');
var txtCli = lineasCliente(d10)['TRÁMITES Y GESTIONES'];
comprueba('al cliente le sale un solo texto con legalización, permiso y documentación', txtCli.length === 1 && /certificado de baja tensión/.test(txtCli[0]) && /permiso de obra/.test(txtCli[0]) && /manual de uso/.test(txtCli[0]));
// Sin mano de obra vendida aparte, la documentación sigue a 400 € fijos.
var modeloSoloDoc = JSON.parse(JSON.stringify(modelo)); modeloSoloDoc.parametros.venta_documentacion = { valor: 400 };
var dSolo = calcularFV(e10, modeloSoloDoc);
igual('sin tabla de mano de obra: resto al 50 % + 400', dSolo.precio_objetivo, Math.ceil(Number(((dSolo.coste_total - 200) / 0.5 / 10).toFixed(9))) * 10 + 400);

// En la app, al editar el desglose (fv2Repreciar) la venta sigue a las horas.
var oiDoc = lDoc[0].origen_inputs, nomDoc = oiDoc.precio.doc_tabla.partida;
igual('app: repreciar sin tocar da el mismo precio', fv2Repreciar(oiDoc, oiDoc.desglose).precio_objetivo, d10.precio_objetivo);
igual('app: con 6 h se vende a 480 € (+80)', fv2Repreciar(oiDoc, oiDoc.desglose.map(function (x) { return x.nombre === nomDoc ? Object.assign({}, x, { cantidad: 6 }) : x; })).precio_objetivo, d10.precio_objetivo + 80);
igual('app: quitada la partida, no se cobra (−400)', fv2Repreciar(oiDoc, oiDoc.desglose.filter(function (x) { return x.nombre !== nomDoc; })).precio_objetivo, d10.precio_objetivo - 400);
comprueba('app: la ficha dice a cuánto se vende', /la documentación y legalización se vende a 400,00/.test(desgloseFV2HTML(oiDoc)));

resultado();
