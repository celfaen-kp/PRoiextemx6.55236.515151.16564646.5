/* Código de obra OB-001 (sql/etapa58, etapa A del plan): el texto que se
 * enseña, el salto a OB-1000, el buscador que entiende «137», «OB-137»,
 * «ob137» y «OB-0137», el orden por número y los estados nuevos frente a los
 * textos antiguos de la base. */

igual('tres cifras con relleno', codigoObra({ numero: 7 }), 'OB-007');
igual('tres cifras justas', codigoObra({ numero: 137 }), 'OB-137');
igual('a partir de mil crece sin más', codigoObra({ numero: 1000 }), 'OB-1000');
igual('sin número (etapa sin ejecutar): vacío', codigoObra({ numero: null }), '');
igual('sin obra: vacío', codigoObra(null), '');

igual('solo el número', numeroBuscado('137'), 137);
igual('con prefijo', numeroBuscado('OB-137'), 137);
igual('prefijo pegado y en minúscula', numeroBuscado('ob137'), 137);
igual('ceros a la izquierda', numeroBuscado('OB-0137'), 137);
igual('con espacios', numeroBuscado(' OB 137 '), 137);
igual('texto: no es número', numeroBuscado('García'), null);
igual('vacío', numeroBuscado(''), null);

igual('nombre completo para correos y PDF', nombreObra({ numero: 137, titulo: 'Casa Can Roca' }), 'OB-137 · Casa Can Roca');
igual('sin número, el nombre de siempre', nombreObra({ numero: null, titulo: 'Casa Can Roca' }), 'Casa Can Roca');

igual('texto antiguo cerrada', estadoObraDeDB('Cerrada'), 'cerrada');
igual('texto antiguo en curso', estadoObraDeDB('En curso'), 'en_curso');
igual('sin estado: en curso', estadoObraDeDB(null), 'en_curso');
igual('valor nuevo se respeta', estadoObraDeDB('planificada'), 'planificada');
igual('etiqueta en castellano', estadoObraTxt({ estado: 'finalizada' }), 'Finalizada');
igual('cerrada es cerrada', obraCerrada({ estado: 'cerrada' }), true);
igual('finalizada no cuenta como cerrada', obraCerrada({ estado: 'finalizada' }), false);

var lista = [{ numero: 999, titulo: 'b' }, { numero: 1000, titulo: 'a' }, { numero: 12, titulo: 'c' }].sort(porNumeroDesc);
igual('orden por el entero: 1000 por encima de 999', lista.map((o) => o.numero).join(','), '1000,999,12');

igual('calle y población', direccionObra({ dir: 'Rosas 34', poblacion: 'Sa Coma' }), 'Rosas 34 · Sa Coma');
igual('sin población', direccionObra({ dir: 'Rosas 34', poblacion: '' }), 'Rosas 34');

// La tarjeta de la lista: código grande, cliente y dirección legibles.
var html = cabeceraObraHTML({ numero: 137, categorias: ['AE', 'FV'], nombre: 'Casa Can Roca', cliente: 'Familia Roca', titulo: 'Casa Can Roca', dir: 'Camí de Son Vich 12', poblacion: 'Esporles', estado: 'en_curso' });
comprueba('la tarjeta lleva el código', html.indexOf('OB-137') !== -1);
comprueba('y los chips de categoría', html.indexOf('>AE<') !== -1 && html.indexOf('>FV<') !== -1);
comprueba('y el cliente', html.indexOf('Familia Roca') !== -1);
comprueba('y la calle con la población', html.indexOf('Camí de Son Vich 12 · Esporles') !== -1);
comprueba('y el estado en castellano', html.indexOf('En curso') !== -1);
var sin = cabeceraObraHTML({ numero: null, categorias: [], nombre: 'Selva', cliente: 'Frank', titulo: 'Selva', dir: '', estado: 'en_curso' });
comprueba('sin número: el nombre hace de título', sin.indexOf('Selva') !== -1 && sin.indexOf('OB-') === -1);

resultado();
