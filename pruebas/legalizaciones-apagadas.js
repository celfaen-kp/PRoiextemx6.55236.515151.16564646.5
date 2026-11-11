/* Legalizaciones apagadas (Enzo, 11-11-2026: «saquemos el apartado de
 * legalizaciones por ahora»). El apartado sigue en el código, con el interruptor
 * LEGALIZACIONES en false: aquí se comprueba que no queda ninguna entrada. */
S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }, { id: 'u2', nombre: 'Admin', rol: 'admin', activo: true }, { id: 'u3', nombre: 'Jefe', rol: 'jefe', activo: true }];

titulo('legalizaciones fuera de la app');
comprueba('el interruptor está apagado', LEGALIZACIONES === false);
V.user = { id: 'u0' };
comprueba('presupuestos: sin pestaña en la barra de abajo', nav('agenda').indexOf('legalizaciones') < 0 && nav('agenda').indexOf('Legaliz') < 0);
comprueba('presupuestos: la barra sigue con Facturas y Obras', /data-v="facturas"/.test(nav('agenda')) && /data-v="obras"/.test(nav('agenda')));
comprueba('presupuestos: nada en su perfil', vAjustes().indexOf('abrirLegalizaciones') < 0 && vAjustes().indexOf('legGuardarEmpresa') < 0);
V.user = { id: 'u3' };
comprueba('jefe: sin tarjeta en Ajustes', vAjustes().indexOf('abrirLegalizaciones') < 0);
V.user = { id: 'u2' };
comprueba('Administración: ni tarjeta ni datos fijos', vAjustes().indexOf('abrirLegalizaciones') < 0 && vAjustes().indexOf('legGuardarEmpresa') < 0 && vAjustes().indexOf('Legalizaciones') < 0);
V.view = 'ajustes'; A.abrirLegalizaciones();
comprueba('la acción no lleva a ninguna parte', V.view === 'ajustes');
comprueba('nadie tiene la vista', !verLegalizaciones());
comprueba('el apartado sigue guardado en el código', typeof vLegalizaciones === 'function' && typeof vLegalizacion === 'function' && typeof A.legEnviar === 'function' && LEGAL_SECCIONES.length > 0);
V.user = null; V.view = 'login';

resultado();
