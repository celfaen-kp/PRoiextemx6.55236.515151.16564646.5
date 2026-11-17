/* Informes de lo facturado por meses (V32.6, Enzo, 17-11-2026: «en Teamleader
 * tengo una sección de informes donde se pueden ver las gráficas y tablas de los
 * ingresos por meses»). Qué cuenta, cómo se compara un año en curso y qué se pinta. */
var F = function (o) { return Object.assign({ tipo: 'factura', estado: 'pagada', pagada: true, entidad: 'Sysefen', entidad_tl_id: 'e1', cliente_nombre: 'Ana', iva: 0, pendiente: 0 }, o); };
var LISTA = [
  F({ id: '1', fecha: '2026-01-10', base: 1000, total: 1210 }),
  F({ id: '2', fecha: '2026-01-20', base: 500, total: 605, cliente_nombre: 'Berta' }),
  F({ id: '3', fecha: '2026-03-05', base: 3000, total: 3630, estado: 'pendiente', pagada: false, pendiente: 3630, vence: '2026-04-05' }),
  F({ id: '4', tipo: 'abono', estado: 'emitido', fecha: '2026-03-20', base: 200, total: 242 }),
  F({ id: '5', fecha: '2026-11-02', base: 800, total: 968, estado: 'pendiente', pagada: false, pendiente: 968, vence: '2026-12-02', entidad: 'Otra SL', entidad_tl_id: 'e2', cliente_nombre: 'Carla' }),
  F({ id: '6', fecha: '2026-11-15', base: 9999, total: 9999, estado: 'borrador', pagada: false }),
  F({ id: '7', fecha: '2025-01-15', base: 400, total: 484 }),
  F({ id: '8', fecha: '2025-06-01', base: 2000, total: 2420 }),
  F({ id: '9', fecha: '2025-12-20', base: 5000, total: 6050 }),
];
titulo('qué cuenta');
var D = infDatos(LISTA, 2026, '', 'base', '2026-11-17');
igual('enero suma sus dos facturas', D.este[0].valor, 1500);
igual('el abono resta en su mes', D.este[2].valor, 2800);
igual('y se cuenta aparte', D.este[2].facturas + '/' + D.este[2].abonos, '1/1');
igual('el borrador no cuenta', D.este[10].valor, 800);
igual('total del año', D.total, 5100);
igual('facturas y abonos del año', D.nFacturas + '/' + D.nAbonos, '4/1');
igual('con IVA, la otra medida', infDatos(LISTA, 2026, '', 'total', '2026-11-17').total, 1210 + 605 + 3630 - 242 + 968);
igual('años con facturas, el más nuevo primero', D.anios.join(','), '2026,2025');
igual('sin decir año, el último', infDatos(LISTA, null, '', 'base', '2026-11-17').anio, 2026);

titulo('comparar con el año anterior');
igual('el año anterior entero', D.totalAntes, 7400);
igual('pero en un año en curso se compara a las mismas fechas (sin diciembre)', D.totalAntesTramo, 2400);
igual('la diferencia sale de ese tramo', D.dif, 112.5);
igual('y se escribe con su signo', infDifTxt(D.dif), '+112,5 %');
var D25 = infDatos(LISTA, 2025, '', 'base', '2026-11-17');
igual('un año cerrado se compara entero; sin año anterior no hay diferencia', D25.dif, null);
igual('y lo dice con una raya', infDifTxt(D25.dif), '—');
igual('media por mes de un año en curso: sobre los meses que lleva', D.media, fac2(5100 / 11));
igual('y de un año cerrado, sobre doce', D25.media, fac2(7400 / 12));
igual('el mejor mes', D.mejor, 2);

titulo('por cobrar, empresas y clientes');
igual('lo emitido sin pagar, con IVA', D.porCobrar, 4598);
igual('de eso, lo vencido', D.vencido + ' en ' + D.nVencidas, '3630 en 1');
var D2 = infDatos(LISTA, 2026, 'e2', 'base', '2026-11-17');
igual('una sola empresa', D2.total + '|' + D2.porCobrar, '800|968');
igual('los clientes del año, de más a menos', D.clientes.map(function (x) { return x.nombre + ':' + x.valor; }).join(' '), 'Ana:3800 Carla:800 Berta:500');
igual('por años, en orden', D.porAnio.map(function (x) { return x.anio + ':' + x.valor; }).join(' '), '2025:7400 2026:5100');

titulo('el eje y los importes');
igual('tope del eje: cuatro saltos redondos que cubren el máximo', [infTope(0), infTope(950), infTope(1000), infTope(12000), infTope(54095), infTope(106152), infTope(260000)].join(','), '1000,1000,1000,12000,60000,120000,300000');
comprueba('importes cortos', /^0\|9\.?500\|22,5 k\|50 k\|1,51 M$/.test([infCorto(0), infCorto(9500), infCorto(22500), infCorto(50000), infCorto(1510000)].join('|')));

titulo('la pantalla');
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }]; V.user = { id: 'u0' }; V.agenda.cargado = true;
V.fac = { lista: LISTA, cargando: false, error: null, buscar: '', filtro: 'todas', sync: null }; V.inf = null;
comprueba('Facturas tiene la entrada a Informes', vFacturas().indexOf('data-a="fac_inf"') > -1);
A.fac('fac_inf', {});
igual('se abre la vista', V.view, 'informes');
var h = vInformes();
comprueba('con sus cuatro indicadores', h.indexOf('Facturado en 2026') > -1 && h.indexOf('mismas fechas') > -1 && h.indexOf('Media por mes') > -1 && h.indexOf('Por cobrar ahora') > -1);
comprueba('la gráfica, con su leyenda de dos años', h.indexOf('<svg') > -1 && h.indexOf(INF_COLOR.este) > -1 && h.indexOf(INF_COLOR.antes) > -1);
comprueba('y la tabla con los doce meses y el total', (h.match(/<tr data-a="fac_infMes"/g) || []).length === 12 && h.indexOf('>Total<') > -1);
comprueba('las dos empresas para elegir', h.indexOf('Todas las empresas') > -1 && h.indexOf('data-k="e2"') > -1);
A.fac('fac_infMes', { m: '2' });
comprueba('al tocar un mes se leen sus números', vInformes().indexOf('Marzo') > -1 && /2\.?800,00/.test(vInformes()) && vInformes().indexOf('1 abono') > -1);
A.fac('fac_infAnio', { y: '2025' });
comprueba('se cambia de año', V.inf.anio === 2025 && vInformes().indexOf('Facturado en 2025') > -1);
A.fac('fac_infMedida', { k: 'total' });
comprueba('y a con IVA', vInformes().indexOf('con IVA') > -1 && /8\.?954/.test(vInformes()));
S.users[0].rol = 'jefe';
A.fac('fac_infAnio', { y: '2026' });
igual('quien no ve facturas no toca nada', V.inf.anio, 2025);
V.user = null; V.view = 'login'; V.inf = null; V.fac = null;
resultado();
