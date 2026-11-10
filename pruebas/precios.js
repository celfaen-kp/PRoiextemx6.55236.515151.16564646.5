/* Cambiar a mano los precios de la base (Enzo, 10-11-2026): la aritmética de
 * supabase/functions/presupuestar/precios.js y las rutas que el motor FV pone
 * en cada partida (de dónde sale su coste). */
load(RUTA_TMP + '/formulas.js');
load(RUTA_TMP + '/motor.js');
load(RUTA_TMP + '/fv.js');
load(RUTA_TMP + '/precios.js');

var modelo = JSON.parse(read(RUTA_TARIFAS + '/modelo_fv.json'));
var casos = JSON.parse(read(RUTA_TARIFAS + '/casos_prueba_fv.json').replace(/^﻿/, ''));

titulo('cada partida del motor FV sabe de dónde sale su coste');
var malas = [], conRef = 0, sinRef = {};
var mirar = function (r, etiqueta) {
  r.partidas.forEach(function (x) {
    if (!(x.cantidad > 0)) return;
    if (!x.ref) { if (x.coste_ud > 0) sinRef[x.partida] = true; return; }   // a coste 0 (inversor o cuadro A MEDIDA) no hay de dónde
    if (x.ref.producto) return;
    conRef++;
    var v = leerRutaFV(modelo, x.ref.ruta);
    if (v === undefined) { malas.push(etiqueta + ' · ' + x.partida + ': ruta que no existe ' + x.ref.ruta.join('/')); return; }
    if (v == null) return;   // precio pendiente en el modelo
    if (Math.abs(v * x.ref.factor - x.coste_ud) > 0.0051) malas.push(etiqueta + ' · ' + x.partida + ': ' + (v * x.ref.factor) + ' ≠ ' + x.coste_ud);
  });
};
casos.forEach(function (c) { mirar(calcularFV(c.entrada, modelo), c.id); });
['Fronius', 'Deye', 'Enphase'].forEach(function (sis) { ['Monofásico', 'Trifásico'].forEach(function (sumi) { ['Teja', 'Plana'].forEach(function (cub) {
  [6, 14, 30].forEach(function (n) { mirar(calcularFV({ sis: sis, sumi: sumi, cubierta: cub, paneles_forzado: n, cee: 'Sí', dist_cc: 60 }, modelo), sis + '/' + sumi + '/' + cub + '/' + n); });
}); }); });
comprueba('todas las rutas dan el coste de su partida (' + conRef + ' comprobadas)' + (malas.length ? ': ' + malas.slice(0, 4).join(' | ') : ''), !malas.length && conRef > 500);
igual('sin ruta solo quedan las que son una cuenta', Object.keys(sinRef).sort().join(' | '),
  'Garantía (media jornada + km) | Montaje (oficial + peón) | Pequeño material (3 % del material principal) | Recogida por faltas (previsión)');
var r10 = calcularFV({ paneles_forzado: 10 }, modelo), l10 = lineasPresupuesto(r10, modelo, {})[0];
comprueba('el desglose de la línea guarda la ruta', l10.origen_inputs.desglose.some(function (x) { return x.nombre === 'Perfil G1 4,8 m' && x.ref && x.ref.ruta.join('/') === 'precios/perfil_g1_4m8/coste'; }));
var mInv = conInversoresDelCatalogo(modelo, [{ referencia: 'FRO-V20P', nombre: 'FRONIUS Verto 20.0 Plus', familia: 'inversor', precio_tarifa: 3000, descuento_proveedor: 10 }]);
var rCat = calcularFV({ paneles_forzado: 40, sumi: 'Trifásico', filas: 4 }, mInv, { hibrido: true, jornadaBateria: true });
var pInv = rCat.partidas.filter(function (x) { return x.partida === 'Inversor'; })[0];
igual('un inversor del catálogo apunta a su producto', pInv.ref && pInv.ref.producto, 'FRO-V20P');
comprueba('y su factor deshace descuento y portes', Math.abs(3000 * pInv.ref.factor - pInv.coste_ud) < 0.011);

titulo('leer y poner valores del modelo');
igual('un parámetro', leerRutaFV(modelo, ['parametros', 'venta_jornada']), 880);
igual('un coste de material', leerRutaFV(modelo, ['precios', 'perfil_g1_4m8', 'coste']), 36.54);
igual('monofásico y trifásico', leerRutaFV(modelo, ['precios', 'magnetotermico', 'mono']) + '/' + leerRutaFV(modelo, ['precios', 'magnetotermico', 'tri']), '3.44/21.69');
igual('el cable por sección', leerRutaFV(modelo, ['precios', 'cable_solar_por_seccion', 'coste_m', '10']), 1.37);
igual('un inversor, por su modelo', leerRutaFV(modelo, ['inversores', 'Fronius Primo GEN24 SC 3.0']), 807.18);
igual('un cuadro, por su código', leerRutaFV(modelo, ['cuadros_ac', '6427040001']), 150.81);
igual('un precio pendiente es null, no cero', leerRutaFV(modelo, ['precios', 'diferencial_tipo_f', 'coste']), null);
igual('lo que no existe, undefined', String(leerRutaFV(modelo, ['precios', 'no_existe', 'coste'])) + '/' + String(leerRutaFV(modelo, ['parametros', 'mo_venta_tramos'])) + '/' + String(leerRutaFV(modelo, ['precios', '_nota', 'coste'])), 'undefined/undefined/undefined');
var pu = ponerRutaFV(modelo, ['precios', 'perfil_g1_4m8', 'coste'], '38,2');
igual('poner: guarda antes y después y acepta la coma', pu.antes + ' → ' + pu.despues, '36.54 → 38.2');
igual('el modelo que entra no se toca', modelo.precios.perfil_g1_4m8.coste, 36.54);
igual('la copia sí', pu.datos.precios.perfil_g1_4m8.coste, 38.2);
igual('y el motor ya calcula con el precio nuevo', calcularFV({ paneles_forzado: 10 }, pu.datos).partidas.filter(function (x) { return x.partida === 'Perfil G1 4,8 m'; })[0].coste_ud, 38.2);
comprueba('un precio pendiente se puede poner', ponerRutaFV(modelo, ['precios', 'diferencial_tipo_f', 'coste'], 45).despues === 45);
comprueba('no deja un margen del 100 %', !!ponerRutaFV(modelo, ['parametros', 'margen_obj'], 1).error);
comprueba('ni negativos', !!ponerRutaFV(modelo, ['parametros', 'venta_jornada'], -5).error);
comprueba('ni un redondeo a cero', !!ponerRutaFV(modelo, ['parametros', 'redondeo'], 0).error);
comprueba('ni tocar una tabla', !!ponerRutaFV(modelo, ['parametros', 'mo_venta_tramos'], 3).error);
comprueba('ni inventar una ruta', !!ponerRutaFV(modelo, ['precios', 'perfil_g1_4m8', 'proveedor'], 3).error);
igual('del coste corregido en el desglose al valor del modelo (portes de BayWa)', valorDesdeCosteUd({ ruta: ['precios', 'enphase_iq8p', 'coste'], factor: 1.01215 }, 131.5), 129.9215);

titulo('el modelo en lista, para la pantalla de precios');
var lista = listaModeloFV(modelo, { 'precios/perfil_g1_4m8/coste': 'Perfil G1 4,8 m' });
comprueba('todas las filas se pueden leer por su ruta', lista.every(function (x) { return leerRutaFV(modelo, x.ruta) !== undefined; }));
comprueba('no hay rutas repetidas', lista.map(function (x) { return x.ruta.join('/'); }).filter(function (k, i, a) { return a.indexOf(k) !== i; }).length === 0);
igual('lo primero, los precios de venta', lista[0].grupo + ' · ' + lista[0].nombre, 'Precios de venta y margen · Margen objetivo sobre la venta (0,5 = 50 %)');
igual('la jornada a 880', lista.filter(function (x) { return x.ruta.join('/') === 'parametros/venta_jornada'; })[0].valor, 880);
igual('con el nombre de la partida si se lo dan', lista.filter(function (x) { return x.ruta.join('/') === 'precios/perfil_g1_4m8/coste'; })[0].nombre, 'Perfil G1 4,8 m');
comprueba('las tablas (tramos €/W) no salen', !lista.some(function (x) { return x.ruta[1] === 'mo_venta_tramos'; }));
igual('inversores y cuadros', lista.filter(function (x) { return x.ruta[0] === 'inversores'; }).length + '/' + lista.filter(function (x) { return x.ruta[0] === 'cuadros_ac'; }).length, modelo.inversores.length + '/' + modelo.cuadros_ac.length);

titulo('de la venta y el coste de una línea a lo que se guarda en el producto');
var LK_FV = [{ clave: 'recargo_sobre_coste', entrada: 'defecto', valor: 1.3 }, { clave: 'costes_complementarios_pct', entrada: 'defecto', valor: 10 }];
var LK_AERO = [];
var da = function (p, lk) { var q = preciosProducto(p.precio_tarifa, p, lk); return q.venta + '/' + q.coste; };
// Aerotermia: el precio de tarifa es PVP y el coste sale del descuento.
var bomba = { precio_tarifa: 9710, descuento_proveedor: 40, familia: 'bomba_calor', recargo: null, atributos: {} };
var a1 = productoPara(bomba, LK_AERO, 9900, 5800);
igual('aerotermia: tarifa = venta y descuento = 1 − coste ÷ venta', a1.cambios.precio_tarifa + '/' + a1.cambios.descuento_proveedor, '9900/41.41');
comprueba('y el motor da esa venta y ese coste (al céntimo del descuento)', Math.abs(preciosProducto(9900, Object.assign({}, bomba, a1.cambios), LK_AERO).coste - 5800) < 0.6 && a1.queda.venta === 9900);
var a2 = productoPara(bomba, LK_AERO, 9900, '');
igual('sin coste solo cambia la venta', JSON.stringify(a2.cambios), '{"precio_tarifa":9900}');
comprueba('coste mayor que la venta, no', !!productoPara(bomba, LK_AERO, 100, 200).error);
// Fotovoltaica, material sin recargo propio: coste = tarifa × 1,10; venta = coste × 1,30.
var mat = { precio_tarifa: 10, descuento_proveedor: 0, familia: 'material', recargo: null, aplica_cdc: null, atributos: {} };
igual('fotovoltaica hoy: 10 € de tarifa son 11 de coste y 14,30 de venta', da(mat, LK_FV), '14.3/11');
var f1 = productoPara(mat, LK_FV, 20, 12.1);
igual('fotovoltaica: tarifa = coste sin los complementarios y recargo propio = venta ÷ coste', f1.cambios.precio_tarifa + '/' + f1.cambios.recargo, '11/1.652893');
igual('y el motor da 20 de venta y 12,10 de coste', da(Object.assign({}, mat, f1.cambios), LK_FV), '20/12.1');
var f2 = productoPara(mat, LK_FV, 22, null);
igual('solo la venta: recargo propio sobre el coste que ya tenía', da(Object.assign({}, mat, f2.cambios), LK_FV), '22/11');
// Un equipo del distribuidor: recargo propio 1,20 y sin costes complementarios.
var inv = { precio_tarifa: 1000, descuento_proveedor: 0, familia: 'inversor', recargo: 1.2, aplica_cdc: false, atributos: {} };
var f3 = productoPara(inv, LK_FV, 1500, 1100);
igual('equipo sin complementarios', da(Object.assign({}, inv, f3.cambios), LK_FV), '1500/1100');
igual('en aerotermia un producto con recargo propio también va por coste', da(Object.assign({}, inv, productoPara(inv, LK_AERO, 1500, 1100).cambios), LK_AERO), '1500/1100');
// Un trámite del catálogo propio: venta declarada (sin_recargo).
var tram = { precio_tarifa: 300, descuento_proveedor: 0, familia: 'tramite', recargo: null, atributos: { propio: true, sin_recargo: true } };
var f4 = productoPara(tram, LK_FV, 400, 200);
igual('sin_recargo: la tarifa es la venta y el coste va por descuento', f4.cambios.precio_tarifa + '/' + f4.cambios.descuento_proveedor + ' → ' + da(Object.assign({}, tram, f4.cambios), LK_FV), '400/50 → 400/200');
comprueba('sin venta, error', !!productoPara(mat, LK_FV, 0, 5).error);
comprueba('sin coste guardado y sin dar coste, error claro', !!productoPara(Object.assign({}, mat, { precio_tarifa: 0 }), LK_FV, 20, null).error);

titulo('y a un concepto de precio fijo de una partida');
var c1 = conceptoPara({ precio_fijo: 280, coste_fijo: null }, LK_AERO, 300, 180);
igual('aerotermia: el precio fijo es la venta y el coste va aparte', c1.cambios.precio_fijo + '/' + c1.cambios.coste_fijo + ' → ' + c1.queda.venta + '/' + c1.queda.coste, '300/180 → 300/180');
var c2 = conceptoPara({ precio_fijo: 110, coste_fijo: null }, LK_FV, 143, null);
igual('fotovoltaica: el fijo se guarda antes del 1,10 × 1,30', c2.cambios.precio_fijo + ' → ' + c2.queda.venta, '100 → 143');
igual('sin coste nuevo se queda el que tenía', conceptoPara({ precio_fijo: 280, coste_fijo: 150 }, LK_AERO, 300, '').queda.coste, 150);
comprueba('coste mayor que la venta, no', !!conceptoPara({ precio_fijo: 280 }, LK_AERO, 100, 300).error);

titulo('la app: la pantalla de precios y los botones de «guardar en la base de datos»');
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }, { id: 'u1', nombre: 'Colabora', rol: 'colaborador', activo: true }, { id: 'u2', nombre: 'Jefe', rol: 'jefe', activo: true }];
V.user = { id: 'u1' };
comprueba('un colaborador no cambia precios', !puedePrecios() && vAjustes().indexOf('data-a="pr_abrir"') < 0);
V.user = { id: 'u2' };
comprueba('un jefe de obra tampoco', !puedePrecios() && vAjustes().indexOf('data-a="pr_abrir"') < 0);
V.user = { id: 'u0' };
comprueba('presupuestos sí, y lo tiene en su perfil', puedePrecios() && vAjustes().indexOf('data-a="pr_abrir"') > 0);
V.precios = null; var pe = prEstado();
pe.coef = [{ categoria: 'solar', clave: 'recargo_sobre_coste', entrada: 'defecto', valor: 1.3 }, { categoria: 'solar', clave: 'costes_complementarios_pct', entrada: 'defecto', valor: 10 }];
// La cuenta de la app es la del motor.
var mismos = [[mat, 'solar', LK_FV], [mat, '', LK_AERO], [inv, 'solar', LK_FV], [bomba, '', LK_AERO], [tram, 'solar', LK_FV]].every(function (c) {
  var a = prPreciosDe(c[0].precio_tarifa, c[0], c[1]), m = preciosProducto(c[0].precio_tarifa, c[0], c[2]);
  return a.venta === m.venta && a.coste === m.coste;
});
comprueba('la previa de la app da lo mismo que el motor', mismos);
pe.fv = listaModeloFV(modelo, {}); pe.fvVersion = 'v2.1';
V.view = 'precios';
var hfv = vPrecios();
comprueba('pestaña fotovoltaica: sale la jornada a 880 y el botón sin cambios', hfv.indexOf('Mano de obra: venta de la jornada de la pareja') > 0 && hfv.indexOf('value="880"') > 0 && hfv.indexOf('Sin cambios') > 0);
var iJ = pe.fv.findIndex(function (x) { return x.ruta.join('/') === 'parametros/venta_jornada'; });
pe.fvEd[iJ] = '900'; pe.fvEd[0] = '0,5';   // el margen se deja igual
igual('solo cuenta lo que cambia de verdad', JSON.stringify(prFvCambios().cambios.map(function (c) { return [c.tipo, c.ruta.join('/'), c.valor]; })), '[["modelo_fv","parametros/venta_jornada",900]]');
comprueba('y el botón lo dice', vPrecios().indexOf('Guardar 1 cambio') > 0);
pe.fvEd[iJ] = 'abc';
igual('un número mal escrito se avisa, no se manda', prFvCambios().malos.length + '/' + prFvCambios().cambios.length, '1/0');
pe.fvEd = {}; pe.filtro = 'perfil';
comprueba('el filtro deja solo lo que se busca', prFvListaHTML().indexOf('Perfil g1') > 0 && prFvListaHTML().indexOf('venta de la jornada') < 0);
pe.filtro = '';
pe.tab = 'catalogo'; pe.buscar = 'weco';
pe.prods = [{ id: 'p1', referencia: 'W-5K3', nombre: 'Batería WECO 5K3', familia: 'bateria', unidad: 'ud', precio_tarifa: 1000, descuento_proveedor: 0, recargo: 2, aplica_cdc: false, atributos: {}, tarifa: { nombre: 'Fotovoltaica 2026' } }];
var hcat = vPrecios();
comprueba('pestaña catálogo: el producto con su venta (coste × recargo) y su tarifa', hcat.indexOf('Batería WECO 5K3') > 0 && hcat.indexOf('2000,00') > 0 && hcat.indexOf('tarifa 1000,00') > 0);
var hs = prProductoSheetHTML({ tipo: 'prProducto', p: pe.prods[0], v: { precio_tarifa: '1000', descuento_proveedor: '0', recargo: '2' } });
comprueba('la hoja del producto enseña venta, coste y margen', hs.indexOf('venta 2000,00') > 0 && hs.indexOf('coste 1000,00') > 0 && hs.indexOf('margen 50 %') > 0);
var prevMat = prPreviaHTML({ familia: 'material', atributos: {}, aplica_cdc: null }, { precio_tarifa: '10', descuento_proveedor: '0', recargo: '' });
comprueba('sin recargo propio distingue fotovoltaica (14,30) de lo demás (10,00)', prevMat.indexOf('En fotovoltaica') > 0 && prevMat.indexOf('14,30') > 0 && prevMat.indexOf('venta 10,00') > 0);
pe.tab = 'fijos';
pe.conceptos = [{ id: 'c1', concepto_libre: 'Punto de radiador de baja temperatura y montaje', precio_fijo: 280, coste_fijo: null, unidad: 'ud', orden: 1, partida: { categoria: 'aerotermia', codigo: 'PUNTO_RADIADOR', nombre: 'Punto de radiador y montaje' } },
  { id: 'c2', concepto_libre: 'Panel fotovoltaico', precio_fijo: 110, coste_fijo: null, unidad: 'ud', orden: 1, partida: { categoria: 'solar', codigo: 'PANEL', nombre: 'Paneles fotovoltaicos' } }];
var hfij = vPrecios();
comprueba('pestaña precios fijos: por categoría, y en fotovoltaica dice la venta que sale', hfij.indexOf('Punto de radiador de baja temperatura') > 0 && hfij.indexOf('→ venta 157,30') > 0);
pe.conEd = { c1: { precio_fijo: '300', coste_fijo: '180' }, c2: { precio_fijo: '110' } };
igual('precios fijos: solo el que cambia', JSON.stringify(prConCambios().cambios.map(function (c) { return [c.id, c.campos.precio_fijo, c.campos.coste_fijo]; })), '[["c1",300,180]]');
pe.tab = 'historial';
pe.historial = [{ id: 'h1', creado_en: '2026-11-10T10:00:00Z', nombre: 'Fabrizio', origen: 'modelo_fv', clave: 'parametros/venta_jornada', descripcion: 'Mano de obra: venta de la jornada de la pareja', antes: { ruta: ['parametros', 'venta_jornada'], valor: 880 }, despues: { ruta: ['parametros', 'venta_jornada'], valor: 900 }, desde: 'configuracion', deshecho_en: null },
  { id: 'h2', creado_en: '2026-11-10T11:00:00Z', nombre: 'Fabrizio', origen: 'producto', clave: 'W-5K3', descripcion: 'Batería WECO 5K3', antes: { id: 'p1', precio_tarifa: 1000, recargo: null }, despues: { id: 'p1', precio_tarifa: 1100, recargo: 1.8 }, desde: 'presupuesto', deshecho_en: '2026-11-10T12:00:00Z', deshecho_por: 'Fabrizio' }];
var hhis = vPrecios();
comprueba('pestaña cambios: qué había y qué queda, quién, y deshacer', hhis.indexOf('880 → 900') > 0 && hhis.indexOf('tarifa 1000 → 1100') > 0 && hhis.indexOf('recargo — → 1,8') > 0 && hhis.indexOf('data-a="pr_deshacer" data-id="h1"') > 0 && hhis.indexOf('deshecho por Fabrizio') > 0 && hhis.indexOf('desde un presupuesto') > 0);
comprueba('lo ya deshecho no se puede deshacer otra vez', hhis.indexOf('data-id="h2"') < 0);

// En el presupuesto: las partidas de la instalación.
var oiFV = l10.origen_inputs;
var sFV = { tipo: 'fv2Desglose', modo: 'ajuste', oi: oiFV, ini: fv2CostesBase(oiFV), items: oiFV.desglose.map(function (x) { return Object.assign({}, x); }), nueva: { bloque: 'ESTRUCTURA', nombre: '', cantidad: '1', unidad: 'ud', coste_ud: '' }, titulo: 'FV' };
comprueba('la hoja de partidas ofrece guardar en la base', fv2DesgloseSheetHTML(sFV).indexOf('data-a="pr_fv2Revisar"') > 0);
igual('sin tocar nada no hay nada que guardar', fv2CambiosBD(sFV).lista.length, 0);
var pon = function (nombre, k, v) { sFV.items.forEach(function (x) { if (x.nombre === nombre) x[k] = v; }); };
pon('Perfil G1 4,8 m', 'coste_ud', '38,2'); pon('Perfil G1 4,8 m', 'cantidad', '9');
pon('Panel Trina Vertex S+ 510 Wp', 'cantidad', '12');   // solo cantidad: no es un precio
sFV.items.push({ bloque: 'ESTRUCTURA', nombre: 'Soporte especial', cantidad: 1, unidad: 'ud', coste_ud: 50, coste: 0, texto: 'Soporte especial', manual: true });
var cbd = fv2CambiosBD(sFV);
igual('solo el coste corregido, con lo que había', JSON.stringify(cbd.lista.map(function (x) { return [x.nombre, x.antes, x.coste_ud, x.ref.ruta.join('/')]; })), '[["Perfil G1 4,8 m",36.54,38.2,"precios/perfil_g1_4m8/coste"]]');
pon('Revisión del presupuesto', 'coste_ud', '45');
var cbd2 = fv2CambiosBD(sFV);
comprueba('dos partidas con el mismo precio y costes distintos: se avisa', cbd2.conflictos.length > 0 || cbd2.lista.some(function (x) { return x.ref.ruta.join('/') === 'parametros/eur_h' && x.otras > 0; }));
pon('Revisión del presupuesto', 'coste_ud', '40');
sFV.bd = cbd.lista;
var hbd = fv2DesgloseSheetHTML(sFV);
comprueba('la confirmación dice qué cambia y para quién', hbd.indexOf('36,54 € → <b>38,20 €</b>') > 0 && hbd.indexOf('todos los presupuestos nuevos') > 0 && hbd.indexOf('data-a="pr_fv2Guardar"') > 0 && hbd.indexOf('data-a="fv2DesgloseAplicar"') < 0);
igual('un presupuesto de antes (sin rutas) no tiene de dónde partir', Object.keys(fv2CostesBase({ desglose: oiFV.desglose.map(function (x) { var y = Object.assign({}, x); delete y.ref; return y; }) })).length, 0);
// Una línea suelta.
comprueba('se puede guardar una línea de producto del catálogo', prLineaGuardable({ producto_ref: 'W-5K3', origen: 'manual', origen_inputs: { catalogo: 1000 } }));
comprueba('y un concepto fijo de partida', prLineaGuardable({ producto_ref: null, origen: 'partida', origen_inputs: { partida: 'PUNTO_RADIADOR' } }));
comprueba('la instalación FV no (va por sus partidas)', !prLineaGuardable(l10));
comprueba('ni una partida agrupada, ni una línea escrita a mano', !prLineaGuardable({ producto_ref: 'ESTR_PLANA', origen: 'partida', origen_inputs: { partida: 'ESTR_PLANA', desglose: [] } }) && !prLineaGuardable({ producto_ref: null, origen: 'manual', origen_inputs: null }));
var hl = prLineaSheetHTML({ tipo: 'prLinea', categoria: 'aerotermia', descripcion: 'Punto de radiador', unidad: 'ud', venta: '300', coste: '' });
comprueba('la confirmación de una línea: venta, y el coste no se toca si va en blanco', hl.indexOf('Venta 300,00') > 0 && hl.indexOf('el coste no se toca') > 0);
V.user = { id: 'u1' };
comprueba('un colaborador no ve el botón en la hoja de partidas', fv2DesgloseSheetHTML(Object.assign({}, sFV, { bd: null })).indexOf('pr_fv2Revisar') < 0 && !prLineaGuardable({ producto_ref: 'W-5K3' }));
V.user = null; V.precios = null; V.view = 'login';


resultado();
