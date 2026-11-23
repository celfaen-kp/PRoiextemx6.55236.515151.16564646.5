/* El número del presupuesto (Enzo, 23-11-2026: «en los presupuestos que envío no
 * se manda el número; lo necesito en todos»). Lo da Teamleader en el nombre de
 * la oferta («Presupuesto 895») o, si se lo cambiaron, en la referencia de su
 * oportunidad. Aquí, lo que lo saca; y que la app lo ponga en el PDF, en el
 * nombre del archivo y no deje mandar un presupuesto sin él. */
load(RUTA_TMP + '/numero-presupuesto.js');
var numeroDeNombre = NUMERO.numeroDeNombre, numerosDeOportunidad = NUMERO.numerosDeOportunidad;

titulo('del nombre de la oferta en Teamleader');
igual('Presupuesto 895', numeroDeNombre('Presupuesto 895'), '895');
igual('otra oferta de la oportunidad', numeroDeNombre('Presupuesto 864-1'), '864-1');
igual('en alemán', numeroDeNombre('Angebot 846-1'), '846-1');
igual('en inglés', numeroDeNombre(' Quotation 844 '), '844');
igual('con algo escrito detrás ya no es el nombre de Teamleader', numeroDeNombre('Presupuesto 795-FV Deye'), '');
igual('nombre puesto a mano', numeroDeNombre('Presupuesto aislada 5 kw 15KWH BATERIAS'), '');
igual('otro nombre', numeroDeNombre('Batería Sonnen sB10 - 5.5kWh'), '');
igual('un decimal no es un número de oferta', numeroDeNombre('Presupuesto 7,14'), '');
igual('vacío', numeroDeNombre(null), '');

titulo('y si no, de la oportunidad, sin repetir');
var of = function (id, name, f) { return { id: id, name: name, created_at: '2026-11-' + f + 'T10:00:00+00:00' }; };
igual('una sola, con el nombre cambiado: la referencia', numerosDeOportunidad('845', [of('a', 'Batería Sonnen', '01')]).a, '845');
var tres = numerosDeOportunidad('795', [of('c', 'Presupuesto 795-FV Tesla', '03'), of('a', 'Presupuesto 795-FV Deye', '01'), of('b', 'Presupuesto 795-FV Fronius', '02')]);
igual('tres con el nombre cambiado: por orden de creación', [tres.a, tres.b, tres.c].join(' '), '795 795-1 795-2');
var mez = numerosDeOportunidad('439', [of('a', 'Instalación de 12 kWp', '01'), of('b', 'Presupuesto 439', '02'), of('c', 'Instalación con batería', '03')]);
igual('el nombre de Teamleader manda y los demás no lo repiten', [mez.a, mez.b, mez.c].join(' '), '439-1 439 439-2');
var dup = numerosDeOportunidad('500', [of('a', 'Presupuesto 500', '01'), of('b', 'Presupuesto 500', '02')]);
igual('dos con el mismo nombre: la segunda cambia', [dup.a, dup.b].join(' '), '500 500-1');
igual('sin referencia, solo las que lo llevan en el nombre', JSON.stringify(numerosDeOportunidad(null, [of('a', 'Presupuesto 12', '01'), of('b', 'Otra', '02')])), '{"a":"12"}');
igual('una referencia rara no vale', JSON.stringify(numerosDeOportunidad('A-12', [of('a', 'Otra', '01')])), '{}');

titulo('la app');
igual('el número de un presupuesto', numPresu({ tl_numero: ' 895 ' }), '895');
igual('sin número', numPresu({}), '');
igual('el archivo lleva el número', nombrePdfPresu({ titulo: 'Ana Riera · Fotovoltaica 5 kWp', tl_numero: '895' }), 'Presupuesto 895 · Ana Riera · Fotovoltaica 5 kWp.pdf');
igual('sin repetir «Presupuesto»', nombrePdfPresu({ titulo: 'Presupuesto Ana Riera', tl_numero: '864-1' }), 'Presupuesto 864-1 · Ana Riera.pdf');
igual('en alemán', nombrePdfPresu({ titulo: 'Ana Riera', tl_numero: '846' }, 'de'), 'Angebot 846 · Ana Riera.pdf');
igual('sin número, como antes', nombrePdfPresu({ titulo: 'Ana Riera' }), 'Presupuesto Ana Riera.pdf');
igual('«Nº» en los cuatro idiomas del PDF', ['es', 'en', 'ca', 'de'].map(function (k) { return idiomas.PDF[k].num; }).join(' '), 'Nº No. Núm. Nr.');
var fuente = read(RUTA_TMP + '/app.js');
comprueba('el PDF lleva el número en la cabecera', fuente.indexOf("esc(T.presupuesto)}${numPresu(d) ? ' · ' + esc(T.num || 'Nº') + ' ' + esc(numPresu(d)) : ''}") > 0);
comprueba('no se manda al cliente sin número', fuente.indexOf('no tiene número y no se manda sin él') > 0 && fuente.indexOf('await presuAsegurarNumero(d)') > 0);
comprueba('al subir, primero la oferta y después el PDF con su número', fuente.indexOf('primera = await visitasDB.presupuestoATeamleader(id, false, null)') > 0);
