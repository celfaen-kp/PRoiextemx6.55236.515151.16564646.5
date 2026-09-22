/* El evaluador de fórmulas del motor: que calcule bien y, sobre todo, que no
 * ejecute nada que no sea aritmética. Las reglas vienen de filas de la base de
 * datos, así que esto es una frontera de seguridad, no solo una calculadora. */
load(RUTA_TMP + '/formulas.js');

var ambito = {
  unidades_interiores: 3,
  unidades_exteriores: 2,
  tipo_sistema: 'multisplit',
  metros: 41.5,
  estancias: [{ nombre: 'Salón', m2: 30 }, { nombre: 'Dormitorio', m2: 14 }, { nombre: 'Estudio', m2: 11 }],
  falso_techo: true,
};
var ayudas = {
  lookup: function (clave, entrada) { return clave === 'metros_incluidos' ? 3 : 0; },
  faltante: function () {},
};
function ev(f) { return evaluar(f, ambito, ayudas); }

titulo('aritmética y variables');
igual('número suelto', ev('12'), 12);
igual('suma y producto', ev('2 + 3 * 4'), 14);
igual('paréntesis', ev('(2 + 3) * 4'), 20);
igual('decimales', ev('1.5 * 2'), 3);
igual('variable', ev('unidades_interiores'), 3);
igual('cuenta por unidad', ev('245 * unidades_interiores'), 735);
igual('resta negativa', ev('-5 + 2'), -3);

titulo('funciones');
igual('max', ev('max(0, 3 - 9)'), 0);
igual('techo', ev('techo(2.1)'), 3);
igual('redondea a 2', ev('redondea(1.23456, 2)'), 1.23);
igual('cuenta(lista)', ev('cuenta(estancias)'), 3);
igual('suma(lista, campo)', ev('suma(estancias, \'m2\')'), 55);
igual('lookup', ev('lookup(\'metros_incluidos\', \'defecto\')'), 3);
igual('metros de exceso', ev('max(0, metros - lookup(\'metros_incluidos\',\'defecto\') * unidades_interiores)'), 32.5);

titulo('comparaciones y lógica');
igual('texto igual', ev('tipo_sistema = \'multisplit\''), true);
igual('texto distinto', ev('tipo_sistema != \'multisplit\''), false);
igual('si() con texto', ev('si(tipo_sistema = \'split_1x1\', unidades_interiores, 1)'), 1);
igual('y / o', ev('falso_techo y unidades_interiores > 2'), true);
igual('no', ev('no falso_techo'), false);

titulo('lo que falta no rompe');
var faltaron = [];
igual('dato sin rellenar cuenta como 0',
  evaluar('metros_exceso + 5', {}, { faltante: function (n) { faltaron.push(n); } }), 5);
igual('y queda anotado', faltaron.join(','), 'metros_exceso');

titulo('lo que NO puede hacer');
function revienta(f, etiqueta) {
  try { evaluar(f, ambito, ayudas); comprueba(etiqueta + ' — NO dio error', false); }
  catch (e) { comprueba(etiqueta, true); }
}
revienta("constructor('return 1')()", 'llamar a constructor');
revienta("estancias.length", 'leer propiedades con punto');
revienta("fetch('http://x')", 'llamar a fetch');
revienta("1 + ", 'una fórmula a medias');
revienta("5 / 0", 'dividir por cero');
// Un nombre que no está en el ámbito NO es una ventana al mundo: vale vacío.
comprueba('globalThis no filtra el objeto real', evaluar('globalThis', {}, { faltante: function () {} }) === null);
comprueba('process tampoco', evaluar('process', {}, { faltante: function () {} }) === null);
resultado();
