/* Juntar dos fichas del mismo cliente y el paso «Facturado» (Enzo, 17-11-2026):
 * «el cliente está duplicado… quiero transferir presupuesto, obra y todo de uno
 * al que ya tiene la factura, que incluso no dice que tenga la factura…
 * debería aparecer al final, luego de obra, que diga facturado». */
var U = function (rolDe) { S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: rolDe, activo: true }]; V.user = { id: 'u0' }; V.agenda.cargado = true; };
U('presupuestos');

titulo('el paso de la factura en el camino');
var conObra = { id: 'a', nombre: 'C.P. PERE MARTELL  21', tipo: 'comunidad', telefono: '627714747', citas: [{ id: 'x' }], visitas: [],
  presupuestos: [{ id: 'q', created_at: '2026-11-17', enviado_cliente_at: '2026-11-17', respuesta_cliente: 'aceptado', obra_id: 'o1' }] };
var conFactura = { id: 'b', nombre: 'C.P. PERE MARTELL 21', tipo: 'particular', telefono: '+34 627 71 47 47', email: 'c@x.es', tl_id: 't2', tl_tipo: 'contact', citas: [], visitas: [], presupuestos: [],
  facturas: [{ id: 'f1', tipo: 'factura', numero: '2026 / 132', estado: 'pendiente', fecha: '2026-11-13', base: 400, total: 484 }] };
var pasos = function (c) { return caminoCliente(c).map(function (x) { return x.k + ':' + x.estado; }).join(' '); };
igual('quien ve facturas tiene ocho pasos', caminoCliente(conObra).length, 8);
igual('con obra y sin factura: toca facturar', caminoCliente(conObra)[7].estado + ' ' + caminoCliente(conObra)[7].titulo, 'ahora Facturar');
igual('con factura y nada más: todo cubierto y facturado', pasos(conFactura), 'contacto:saltado cita:saltado visita:saltado presupuesto:saltado enviado:saltado respuesta:saltado obra:saltado factura:hecho');
igual('y lo dice', caminoCliente(conFactura)[7].titulo, 'Facturado');
comprueba('un borrador no cuenta como facturado', !clienteFacturado({ facturas: [{ id: 'f', tipo: 'factura', estado: 'borrador' }] }));
comprueba('un abono suelto tampoco', !clienteFacturado({ facturas: [{ id: 'f', tipo: 'abono', estado: 'emitido' }] }));
comprueba('se pinta el octavo', (caminoHTML(conFactura).match(/class="p /g) || []).length === 8 && caminoHTML(conFactura).indexOf('Facturado') > -1);
U('jefe');
igual('quien no ve facturas sigue con siete', caminoCliente(conObra).length, 7);
U('presupuestos');

titulo('las facturas en la ficha del cliente');
var hf = facturasClienteHTML(conFactura);
comprueba('sale con su número, importe y estado', hf.indexOf('2026 / 132') > -1 && /484,00/.test(hf) && hf.indexOf('Por cobrar') > -1);
comprueba('y se abre al tocarla', hf.indexOf('data-a="fac_ver" data-id="f1"') > -1);
igual('sin facturas no hay tarjeta', facturasClienteHTML(conObra), '');
U('jefe'); igual('y quien no ve facturas no la ve', facturasClienteHTML(conFactura), ''); U('presupuestos');

titulo('fichas que parecen el mismo cliente');
var otro = { id: 'c', nombre: 'Ana Ferrer', telefono: '600111222', citas: [], visitas: [] };
var mismoCorreo = { id: 'd', nombre: 'Comunidad P. Martell', email: ' C@X.es ', citas: [], visitas: [] };
V.agenda.clientes = [conObra, conFactura, otro, mismoCorreo];
S.obras = [{ id: 'o1', numero: 29, titulo: 'Pere Martell', cliente: 'C.P. PERE MARTELL, 21', clienteId: 'a', estado: 'planificada', categorias: [] }];
igual('mismo teléfono con y sin +34, mismo nombre con otro espaciado', posiblesDuplicados(conObra).map(function (x) { return x.id; }).join(','), 'b');
igual('y por el correo, sin mirar mayúsculas', posiblesDuplicados(conFactura).map(function (x) { return x.id; }).sort().join(','), 'a,d');
igual('uno que no se parece a nadie', posiblesDuplicados(otro).length, 0);
igual('lo que lleva cada ficha', clienteLlevaTxt(conObra), '1 cita · 1 presupuesto · 1 obra');
igual('y la otra', clienteLlevaTxt(conFactura), '1 factura');
igual('sin nada', clienteLlevaTxt(otro), 'Sin nada colgado');
comprueba('la ficha avisa de que puede estar dos veces', duplicadoAvisoHTML(conObra).indexOf('Puede estar dos veces') > -1 && duplicadoAvisoHTML(conObra).indexOf('data-otro="b"') > -1);
igual('y no avisa si no hay parecidos', duplicadoAvisoHTML(otro), '');

titulo('juntar');
igual('se queda la que tiene la factura', juntarQuedaPorDefecto(conObra, conFactura), 'b');
igual('sin facturas, la que está en Teamleader', juntarQuedaPorDefecto(otro, { id: 'z', tl_id: 't', citas: [], visitas: [] }), 'z');
igual('sin nada que las distinga, la abierta', juntarQuedaPorDefecto(otro, { id: 'z', citas: [], visitas: [] }), 'c');
agJuntarAbrir('a');
comprueba('se abre la hoja con las que se parecen', V.sheet && V.sheet.tipo === 'juntarCliente' && sheet().indexOf('Parecen el mismo') > -1 && sheet().indexOf('data-a="ag_juntarElegir" data-id="b"') > -1);
V.sheet.buscar = 'ana';
comprueba('y deja buscar cualquier otra', juntarListaHTML(V.sheet).indexOf('Ana Ferrer') > -1 && juntarListaHTML(V.sheet).indexOf('data-id="a"') < 0);
agJuntarElegir('b');
igual('al elegirla propone quedarse con la de la factura', V.sheet.queda, 'b');
var h2 = sheet();
comprueba('enseña las dos y cuál se queda', h2.indexOf('Se queda') > -1 && h2.indexOf('Se quita') > -1 && h2.indexOf('1 cita · 1 presupuesto · 1 obra') > -1 && h2.indexOf('1 factura') > -1);
A.ag('ag_juntarQueda', { id: 'a' }); igual('se puede cambiar cuál se queda', V.sheet.queda, 'a');
A.ag('ag_juntarQueda', { id: 'b' });
var llamada = null, cargas = 0;
var cargarAntes = A.cargarAgenda;
visitasDB = {
  fusionarClientes: function (quita, queda) { llamada = quita + '>' + queda; return Promise.resolve({ ok: true }); },
  visitasDeCliente: function () { return Promise.resolve([]); },
  listarDocumentosCliente: function () { return Promise.resolve([]); },
};
sincronizarObras = function () { return Promise.resolve(); };
A.cargarAgenda = function () { cargas++; V.agenda.clientes = [conFactura, otro, mismoCorreo]; return Promise.resolve(); };
V.volverPila = [{ view: 'clienteVer', id: 'a', label: 'Cliente' }];
V.view = 'clienteVer'; V.clienteVerId = 'a';
agJuntarConfirmar().then(function () {
  igual('pasa lo de la que se quita a la que se queda', llamada, 'a>b');
  comprueba('se cierra la hoja y queda abierta la que se queda', !V.sheet && V.clienteVerId === 'b' && cargas === 1);
  igual('y «volver» ya no apunta a la ficha quitada', V.volverPila[0].id, 'b');
  U('jefe'); V.sheet = null; agJuntarAbrir('b');
  comprueba('quien no ve facturas no puede juntar', !V.sheet);
  A.cargarAgenda = cargarAntes; V.volverPila = []; V.sheet = null; V.user = null; V.view = 'login';
  resultado();
}).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
