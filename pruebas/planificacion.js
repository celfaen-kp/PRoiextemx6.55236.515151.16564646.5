/* Planificación diaria (sql/etapa60, etapa C del plan): semanas, días de
 * trabajo, obras sin nadie y a quién proponer para cada obra. */

igual('lunes de un miércoles', lunesDe('2026-10-07'), '2026-10-05');
igual('lunes de un lunes', lunesDe('2026-10-05'), '2026-10-05');
igual('lunes de un domingo', lunesDe('2026-10-11'), '2026-10-05');
igual('cinco días sin fin de semana', planDias('2026-10-05', false).join(','), '2026-10-05,2026-10-06,2026-10-07,2026-10-08,2026-10-09');
igual('siete con fin de semana', planDias('2026-10-05', true).length, 7);
igual('siguiente laborable de un jueves', siguienteLaborable('2026-10-01'), '2026-10-02');
igual('siguiente laborable de un viernes salta al lunes', siguienteLaborable('2026-10-02'), '2026-10-05');
igual('anterior laborable de un lunes es el viernes', anteriorLaborable('2026-10-05'), '2026-10-02');
igual('fin de semana', esFinde('2026-10-03') && esFinde('2026-10-04') && !esFinde('2026-10-05'), true);

var obras = [
  { id: 'a', numero: 10, estado: 'en_curso' }, { id: 'b', numero: 11, estado: 'planificada' },
  { id: 'c', numero: 12, estado: 'cerrada' }, { id: 'd', numero: 13, estado: 'finalizada' },
];
var filas = [{ obra_id: 'a', empleado_id: 'e1', fecha: '2026-10-06' }];
igual('sin nadie ese día: la planificada sin fila; la en curso con fila no; cerradas y finalizadas no cuentan',
  obrasSinPlanificarDia('2026-10-06', filas, obras).map((o) => o.id).join(','), 'b');
igual('otro día: las dos en marcha', obrasSinPlanificarDia('2026-10-07', filas, obras).map((o) => o.id).join(','), 'b,a');

var hist = [
  { obra_id: 'a', empleado_id: 'e1' }, { obra_id: 'a', empleado_id: 'e1' }, { obra_id: 'a', empleado_id: 'e2' },
  { obra_id: 'z', empleado_id: 'e3' },
];
igual('quien más veces fue, primero; los fijos cuentan medio punto', sugerirPersonas('a', hist, ['e4']).join(','), 'e1,e2,e4');
igual('obra sin historial: solo los fijos', sugerirPersonas('q', hist, ['e9']).join(','), 'e9');

// Solo operarios y jefes activos, jefes primero.
empRows = [{ id: 'e1', nombre: 'Pau', rol: 'operario', activo: true }, { id: 'e2', nombre: 'Ana', rol: 'jefe', activo: true }, { id: 'e3', nombre: 'Baja', rol: 'operario', activo: false }, { id: 'e4', nombre: 'Enzo', rol: 'admin', activo: true }, { id: 'e5', nombre: 'Ramón', rol: 'presupuestos', activo: true }];
igual('filas del tablero', planGente().map((r) => r.nombre).join(','), 'Ana,Pau');

resultado();
