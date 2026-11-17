/* El tema claro u oscuro de cada usuario (Enzo, 17-11-2026): «en ajustes de cada
 * usuario que permita cambiar el tema oscuro a claro, que es lo predeterminado
 * ahora». Se elige en Ajustes o en el menú de la foto; va con la persona. */
var raiz = document.documentElement;
var oscuroPuesto = function () { return raiz.getAttribute('data-tema') === 'oscuro'; };
var subidos = [];
Sysefen.db = Object.assign({}, Sysefen.db, { guardarMiTema: function (t) { subidos.push(t); return Promise.resolve(true); } });
var U = function (id, rolDe, tema) {
  S.users = [{ id: 'u0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true }, { id: 'u1', nombre: 'Toni', rol: 'operario', activo: true, tema: 'oscuro' }, { id: 'u2', nombre: 'Marga', rol: 'admin', activo: true }];
  if (tema !== undefined) S.users.find(function (u) { return u.id === id; }).tema = tema;
  V.user = { id: id }; V.agenda.cargado = true;
};

titulo('lo predeterminado es el claro');
localStorage.removeItem('ch_tema');
U('u0', 'presupuestos');
igual('quien no ha elegido', temaPref(), 'claro');
aplicarTema();
comprueba('y la app se queda en claro', !oscuroPuesto());

titulo('cada uno el suyo');
A.ponerTema('oscuro');
comprueba('al elegir oscuro se pone al momento', oscuroPuesto());
igual('queda en su usuario', yo().tema, 'oscuro');
igual('y en el aparato, para pintarlo al abrir', localStorage.getItem('ch_tema'), 'oscuro');
igual('se sube a su ficha', subidos.join(','), 'oscuro');
A.ponerTema('nada');
igual('un valor raro no cambia nada', yo().tema, 'oscuro');
V.user = { id: 'u2' }; aplicarTema();
comprueba('otra persona en el mismo aparato sigue con el suyo (claro)', !oscuroPuesto());
V.user = { id: 'u1' }; aplicarTema();
comprueba('y quien lo tenía en oscuro lo ve en oscuro', oscuroPuesto());
V.user = null; aplicarTema();
comprueba('sin sesión se queda como el último que entró', oscuroPuesto());

titulo('automático: como tenga puesto el aparato');
var sistema = false;
window.matchMedia = function () { return { matches: sistema, addEventListener: function () {} }; };
U('u0', 'presupuestos', 'auto');
aplicarTema();
comprueba('aparato en claro: claro', !oscuroPuesto());
sistema = true; aplicarTema();
comprueba('aparato en oscuro: oscuro', oscuroPuesto());
U('u0', 'presupuestos', 'claro'); aplicarTema();
comprueba('y con «Claro» manda lo elegido aunque el aparato esté en oscuro', !oscuroPuesto());

titulo('dónde se elige');
V.view = 'ajustes';
var aj = vAjustes();
comprueba('en Ajustes, para presupuestos', aj.indexOf('Aspecto') > -1 && (aj.match(/data-a="ponerTema"/g) || []).length === 3);
comprueba('con el elegido marcado', /class="on" data-a="ponerTema" data-t="claro"/.test(aj));
U('u1', 'operario'); aj = vAjustes();
comprueba('y para un operario, en su perfil', (aj.match(/data-a="ponerTema"/g) || []).length === 3 && /class="on" data-a="ponerTema" data-t="oscuro"/.test(aj));
aplicarTema();
comprueba('en oscuro el logotipo de Ajustes es el blanco', logoApp().indexOf('logo-blanco') === 0 && vAjustes().indexOf('logo-blanco') > -1 && vAjustes().indexOf('logo-trans') === -1);
V.sheet = { tipo: 'menuUsuario' };
comprueba('y en el menú de la foto', (sheet().match(/data-a="ponerTema"/g) || []).length === 3);
V.sheet = null;

titulo('viaja con la persona');
var fila = { id: 'e0', nombre: 'Fabrizio', rol: 'presupuestos', activo: true, tema: 'oscuro' };
Sysefen.db = Object.assign({}, Sysefen.db, { listarEmpleados: function () { return Promise.resolve([fila]); } });
// El arranque de la app (que aquí no encuentra sesión) deja V.user vacío un instante después: se espera a que acabe.
var espera = function (n) { return n ? Promise.resolve().then(function () { return espera(n - 1); }) : Promise.resolve(); };
espera(50).then(function () {
  U('u0', 'presupuestos', 'claro'); aplicarTema();
  return cargarMapaEmpleados();
}).then(function () {
  igual('lo elegido en otro aparato llega a este', yo().tema, 'oscuro');
  comprueba('y se aplica', oscuroPuesto());
  yo().tema = 'claro'; yo().temaPend = true; subidos = [];
  fila.tema = 'oscuro';
  return cargarMapaEmpleados();
}).then(function () {
  igual('un cambio de aquí sin subir no se pisa', yo().tema, 'claro');
  igual('y se sube en cuanto se puede', subidos.join(','), 'claro');
  comprueba('ya no queda pendiente', !yo().temaPend);
  V.user = null; V.view = 'login'; localStorage.removeItem('ch_tema');
  resultado();
}).catch(function (e) { print('ERROR: ' + e + '\n' + (e.stack || '')); });
