/* El detalle de la instalación llave en mano, en listado (Enzo, 26-11-2026):
 * «a la partida de instalación fotovoltaica llave en mano lo quiero en listado y
 * no en texto, porque la gente no lo lee». El PDF, la app y la página del
 * cliente leen el mismo texto guardado («BLOQUE: a; b · BLOQUE: c») y lo pintan
 * por bloques, un punto por cosa; así vale también para los ya guardados. */
load(RUTA_TMP + '/fv.js');
var modeloL = JSON.parse(read(RUTA_TARIFAS + '/modelo_fv.json'));
var rL = calcularFV({ paneles_forzado: 10, sis: 'Fronius', sumi: 'Monofásico', cubierta: 'Teja' }, modeloL, {});
var lineaL = lineasPresupuesto(rL, modeloL, { modelo_version: 'prueba' })[0];
var det = lineaL.detalle_tecnico;

titulo('el texto guardado de la partida llave en mano se parte en bloques y puntos');
var gr = detalleEnLista(det);
comprueba('se reconoce', !!gr && gr.length >= 5);
igual('los bloques, en su orden', gr.map(function (b) { return b.titulo; }).slice(0, 5).join(' | '), 'MÓDULOS FOTOVOLTAICOS | INVERSOR | MEDICIÓN Y MONITORIZACIÓN | ESTRUCTURA | MATERIAL ELÉCTRICO');
var bloquesL = lineaL.origen_inputs.bloques;
comprueba('cada bloque trae los mismos puntos que calculó el motor', gr.every(function (b) { return JSON.stringify(b.puntos) === JSON.stringify(bloquesL[b.titulo]); }));
comprueba('el material eléctrico son varios puntos, no una frase', gr.filter(function (b) { return b.titulo === 'MATERIAL ELÉCTRICO'; })[0].puntos.length >= 4);
comprueba('un punto que lleva dos puntos por dentro (la estructura) no se parte', gr.filter(function (b) { return b.titulo === 'ESTRUCTURA'; })[0].puntos[0].indexOf('perfiles, presores y anclajes') > 0);

titulo('lo que no tiene esa forma se queda como texto');
comprueba('una descripción corriente', detalleEnLista('Línea frigorífica de cobre con aislamiento') === null);
comprueba('una lista sin títulos (el cargador de coche)', detalleEnLista('Wallbox Pulsar Plus 7,4 kW · Cuadro de protecciones · Jornada de montaje') === null);
comprueba('un solo bloque', detalleEnLista('ESTRUCTURA: perfiles y anclajes') === null);
comprueba('vacío', detalleEnLista('') === null && detalleEnLista(null) === null && detalleLineaHTML('', 'pdf') === '' && detalleLineaHTML(null, 'app') === '');
comprueba('el texto corriente sale igual que antes, escapado', detalleLineaHTML('Tubo <M25> & grapas', 'pdf').indexOf('Tubo &lt;M25&gt; &amp; grapas') > 0 && detalleLineaHTML('Tubo', 'app').indexOf('class="tiny"') > 0);

titulo('en el PDF y en la app');
var hp = detalleLineaHTML(det, 'pdf'), ha = detalleLineaHTML(det, 'app');
var puntos = gr.reduce(function (s, b) { return s + b.puntos.length; }, 0);
igual('un punto por cosa en el PDF', hp.split('•').length - 1, puntos);
igual('y en la app', ha.split('•').length - 1, puntos);
comprueba('con el título de cada bloque', gr.every(function (b) { return hp.indexOf('>' + b.titulo.replace(/&/g, '&amp;') + '</div>') > 0 && ha.indexOf('>' + b.titulo + '</div>') > 0; }));
comprueba('el PDF va con colores fijos (siempre en claro) y la app con los del tema', hp.indexOf('var(--t2)') < 0 && hp.indexOf('#555') > 0 && ha.indexOf('var(--t2)') > 0 && ha.indexOf('#555') < 0);
comprueba('ya no sale el párrafo seguido', hp.indexOf(' · INVERSOR: ') < 0 && ha.indexOf(' · INVERSOR: ') < 0);
comprueba('traducido también: se lee del texto, no de los nombres de los bloques', (function () { var x = detalleEnLista('PV MODULES: 10 Trina modules (5.10 kWp) · INVERTER: Fronius Primo · WIRING: Solar cable; AC line to the main board'); return !!x && x.length === 3 && x[2].puntos.length === 2; })());

titulo('en la página del cliente (firma.sysefen.es)');
var pagL = read(RUTA_TMP + '/firmar.html');
comprueba('las dos copias de la página son iguales', pagL === read(RUTA_TMP + '/sitio-firma.html'));
var mEsc = /var esc = function[\s\S]*?\n/.exec(pagL), mDet = /var detalle = function \(texto\) \{[\s\S]*?\n  \};/.exec(pagL);
comprueba('la página tiene su función y la usa en cada línea', !!mEsc && !!mDet && pagL.indexOf("detalle(l.detalle_tecnico)") > 0 && pagL.indexOf('.l .dt{') > 0 && pagL.indexOf('.l .dp{') > 0);
var detallePagina = (new Function(mEsc[0] + mDet[0] + '\n return detalle;'))();
var hw = detallePagina(det);
igual('los mismos puntos que el PDF', hw.split('class="dp"').length - 1, puntos);
igual('y los mismos bloques', hw.split('class="dt"').length - 1, gr.length);
comprueba('el texto corriente, como antes', detallePagina('Tubo <M25>') === '<div class="d">Tubo &lt;M25&gt;</div>' && detallePagina('') === '' && detallePagina(null) === '');

resultado();
