/* Economía de la obra (sql/etapa59, etapa B del plan): el semáforo y el
 * bloque que solo existe para quien ve costes. */

var sem = semaforoEco(null);
igual('sin datos: sin color', sem.txt, 'Sin presupuesto enlazado');
igual('sin presupuesto enlazado', semaforoEco({ venta_presupuestada: null }).txt, 'Sin presupuesto enlazado');
igual('va bien (60 % de las horas)', semaforoEco({ venta_presupuestada: 10000, margen_previsto: 3000, margen_real: 2800, pct_horas: 60 }).color, 'var(--verde)');
igual('al límite (95 %)', semaforoEco({ venta_presupuestada: 10000, margen_previsto: 3000, margen_real: 2500, pct_horas: 95 }).color, 'var(--ambar)');
igual('pasado (110 %)', semaforoEco({ venta_presupuestada: 10000, margen_previsto: 3000, margen_real: 2000, pct_horas: 110 }).color, 'var(--rojo)');
igual('margen por debajo de la mitad: rojo aunque las horas vayan bien', semaforoEco({ venta_presupuestada: 10000, margen_previsto: 3000, margen_real: 1000, pct_horas: 50 }).color, 'var(--rojo)');
igual('con presupuesto pero sin horas previstas: verde', semaforoEco({ venta_presupuestada: 10000, margen_previsto: 3000, margen_real: 2900, pct_horas: null }).txt, 'Dentro del presupuesto');

igual('euros sin decimales', euros2(12345.67).replace(/ /g, ' '), '12.346 €');
igual('euros nulos', euros2(null), '—');
igual('horas con un decimal', horas1(32.456), '32,5 h');

// Quién ve costes: solo Administración y presupuestos.
S.users = [{ id: 'u1', nombre: 'Xavi', rol: 'jefe', activo: true }, { id: 'u2', nombre: 'Enzo', rol: 'admin', activo: true }, { id: 'u3', nombre: 'Ramón', rol: 'presupuestos', activo: true }, { id: 'u4', nombre: 'David', rol: 'operario', activo: true }];
V.user = { id: 'u1' }; igual('jefe no ve costes', veCostes(), false);
V.user = { id: 'u2' }; igual('admin ve costes', veCostes(), true);
V.user = { id: 'u3' }; igual('presupuestos ve costes', veCostes(), true);
V.user = { id: 'u4' }; igual('operario no ve costes', veCostes(), false);
V.user = { id: 'u1' }; igual('el jefe crea obras', puedeObras(), true);
V.user = { id: 'u3' }; igual('presupuestos crea obras', puedeObras(), true);
V.user = { id: 'u4' }; igual('el operario no crea obras', puedeObras(), false);

// El bloque Economía pinta lo que trae la vista.
V.user = { id: 'u2' };
var o = { id: 'o1', numero: 137 };
V.eco.o1 = { eco: { venta_presupuestada: 10000, coste_previsto: 7000, coste_real: 6500, coste_mano_obra_real: 4000, coste_material_real: 2500, margen_previsto: 3000, margen_real: 3500, horas_reales: 80, horas_previstas: 100, pct_horas: 80, dias_sin_coste: 2 }, categorias: [], presupuestos: [{ id: 'p1', categoria: 'solar', total_venta: 10000, visita: { codigo: 'V-2026-0012' } }] };
var html = economiaHTML(o);
comprueba('sale el semáforo en verde', html.indexOf('Va bien') !== -1);
comprueba('sale lo presupuestado', html.indexOf('10.000') !== -1);
comprueba('avisa de las jornadas sin coste', html.indexOf('2 jornadas sin coste') !== -1);
comprueba('lista el presupuesto enlazado', html.indexOf('V-2026-0012') !== -1);
V.eco.o2 = null; V.ecoError.o2 = 'relation "v_obra_economia" does not exist';
comprueba('sin la etapa 59 lo dice', economiaHTML({ id: 'o2' }).indexOf('etapa59') !== -1);

resultado();
