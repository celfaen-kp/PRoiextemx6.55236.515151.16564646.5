// =============================================================================
// Sysefen · presupuestar · aire acondicionado: la potencia a mano y varios
// sistemas en un mismo presupuesto (Enzo, 19-11-2026)
//
// Enzo: «a veces sabemos qué aire llevaría, si un 25, un 35… me tocó hacer un
// 2x1 con dos de 25 y un 1x1 de 35: hice primero el 2x1 y luego tuve que
// agregar a mano el 1x1 mirando el catálogo, y aumentar a mano metros de
// cable, tuberías y mano de obra».
//
// DOS COSAS, las dos por estancia (por equipo interior):
//
//   · potencia: '25', '35', '50' o '70', como se dice en el oficio (frigorías
//     en centenas). Si viene, manda sobre los m²: la máquina es de ese tamaño.
//     Sin ella, el motor sigue eligiendo por m² como siempre.
//
//   · exterior: a qué unidad exterior va (1, 2, 3…). Las estancias con el
//     mismo número comparten exterior: dos son un 2x1, tres un 3x1. Una sola
//     en su exterior es un 1x1. Si ninguna lo trae, no cambia nada: vale el
//     «tipo de sistema» de la ficha para todas.
//
// CÓMO: no hay reglas nuevas. Cada sistema se calcula con el motor de siempre,
// como si fuera su propio presupuesto (sus máquinas, su tubería, su cable, su
// mano de obra, su gas), y las líneas se juntan sumando las que son iguales.
// Es lo mismo que hacer dos presupuestos y pasarlos a uno a mano, que era lo
// que tocaba hacer. Lo que solo va una vez (retirar máquinas viejas) se cuenta
// en el primero.
//
// No importa nada: el motor (calcular) y el resumen se le pasan desde fuera,
// así se prueba sin Deno (pruebas/motor-aire.js).
// =============================================================================

/** Las potencias que se pueden elegir y los kW nominales de su máquina (los de
 *  la tabla kw_tamano: 25 → tamaño 9, 35 → 12, 50 → 18, 70 → 24). */
export const POTENCIAS_AIRE = { '25': 2.6, '35': 3.5, '50': 5.3, '70': 7.0 };

const numA = (v) => { const x = Number(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(x) ? x : 0; };
const MURALES = ['split_1x1', 'multisplit'];

/** Las estancias con lo que el motor necesita siempre presente: m², los kW de
 *  la potencia elegida (0 si no se eligió) y su número de exterior (0 = sin decir). */
export function estanciasDeAire(datos) {
  const filas = datos && Array.isArray(datos.estancias) ? datos.estancias : [];
  return filas.map((e) => {
    const f = e && typeof e === 'object' ? e : {};
    const pot = String(f.potencia == null ? '' : f.potencia).trim();
    const ext = Math.floor(numA(f.exterior));
    return Object.assign({}, f, {
      m2: numA(f.m2),
      potencia: POTENCIAS_AIRE[pot] ? pot : '',
      potencia_kw: POTENCIAS_AIRE[pot] || 0,
      exterior: ext > 0 && ext < 100 ? ext : 0,
    });
  });
}

/**
 * Los sistemas del presupuesto, si alguna estancia dice a qué exterior va:
 * [{ exterior, tipo_sistema, estancias }], por número de exterior. null si
 * ninguna lo dice (un solo sistema, el de la ficha).
 * Las que no traen número cuando otras sí van juntas al final, con el tipo de
 * la ficha tal cual.
 */
export function sistemasDeAire(datos) {
  const filas = estanciasDeAire(datos);
  if (!filas.some((e) => e.exterior > 0)) return null;
  const tipo = String((datos && datos.tipo_sistema) || 'split_1x1');
  const grupos = {};
  filas.forEach((e) => { const k = e.exterior > 0 ? e.exterior : 0; (grupos[k] = grupos[k] || []).push(e); });
  const numeros = Object.keys(grupos).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const salida = numeros.map((n) => ({
    exterior: n,
    // Murales: una sola interior en su exterior es un 1x1; dos o más, un multi.
    // Conductos y cassette siempre llevan exterior multi: se quedan como están.
    tipo_sistema: MURALES.includes(tipo) ? (grupos[n].length > 1 ? 'multisplit' : 'split_1x1') : tipo,
    estancias: grupos[n],
  }));
  if (grupos[0]) salida.push({ exterior: 0, tipo_sistema: tipo, estancias: grupos[0] });
  return salida;
}

const redA = (v, d) => { const f = Math.pow(10, d); return Math.round(v * f + 1e-9) / f; };
// Lo que se cobra una sola vez por presupuesto aunque lo pidan varios sistemas:
// la base de la carga de gas (sql/etapa121; los kilos sí se suman).
const UNA_VEZ_AIRE = ['Carga adicional de refrigerante: base'];
const esUnaVez = (l) => UNA_VEZ_AIRE.some((t) => String(l.descripcion || '').indexOf(t) === 0);
const claveLineaAire = (l) => [l.producto_ref || '', l.descripcion || '', l.unidad || '', l.seccion || '',
  l.precio_tarifa, l.precio_coste == null ? '' : l.precio_coste, l.dto_linea_pct || 0, l.iva == null ? '' : l.iva, l.origen || ''].join('|');
// Lo que se suma al juntar sistemas; el resto de variables se quedan con las del primero.
const SUMABLES = ['unidades_interiores', 'unidades_exteriores', 'metros_totales', 'metros_exceso', 'metros_gas_exceso',
  'metros_cuadro', 'kg_gas_extra', 'kw_total', 'n_retirar', 'n_retirar_ext'];

/**
 * El presupuesto de aire. `calcular` es el motor (motor.js) y `resumenDe` su
 * resumen. Con un solo sistema devuelve lo que devuelve el motor; con varios,
 * lo de todos junto, con el mismo formato.
 */
export function calcularAire(datos, cfg, calcular, resumenDe) {
  const base = Object.assign({}, datos, { estancias: estanciasDeAire(datos) });
  const sistemas = sistemasDeAire(datos);
  if (!sistemas) return calcular('aire_acondicionado', base, cfg);

  const partes = sistemas.map((s, i) => calcular('aire_acondicionado', Object.assign({}, base, {
    tipo_sistema: s.tipo_sistema,
    estancias: s.estancias,
    distancias_lineas: [],            // los metros van en cada estancia
    unidades_exteriores_manual: 0,    // las exteriores salen de los grupos
    // Lo que solo pasa una vez en la obra, en el primer sistema.
    equipos_a_retirar_n: i === 0 ? numA(base.equipos_a_retirar_n) : 0,
    exteriores_a_retirar_n: i === 0 ? numA(base.exteriores_a_retirar_n) : 0,
  }), cfg));

  // Las líneas iguales (misma máquina o misma partida, al mismo precio) se suman.
  // Se ordenan por secciones, en el orden en que el motor las fue sacando.
  const lineas = [], porClave = {}, secciones = [];
  partes.forEach((r) => (r.lineas || []).forEach((l) => {
    const k = claveLineaAire(l);
    if (secciones.indexOf(l.seccion || '') < 0) secciones.push(l.seccion || '');
    if (porClave[k]) { if (!esUnaVez(l)) porClave[k].cantidad = redA(numA(porClave[k].cantidad) + numA(l.cantidad), 3); return; }
    porClave[k] = Object.assign({}, l); lineas.push(porClave[k]);
  }));
  const puesto = lineas.map((l, i) => ({ l, i }));
  puesto.sort((a, b) => (secciones.indexOf(a.l.seccion || '') - secciones.indexOf(b.l.seccion || '')) || (a.i - b.i));
  const ordenadas = puesto.map((x, i) => Object.assign(x.l, { orden: i + 1 }));

  const incidencias = [], vistas = {};
  partes.forEach((r) => (r.incidencias || []).forEach((x) => {
    const k = [x.nivel, x.codigo, x.mensaje, x.campo || ''].join('|');
    if (!vistas[k]) { vistas[k] = true; incidencias.push(x); }
  }));

  const variables = Object.assign({}, (partes[0] && partes[0].variables) || {});
  SUMABLES.forEach((k) => {
    if (!partes.some((r) => r.variables && typeof r.variables[k] === 'number')) return;
    variables[k] = redA(partes.reduce((s, r) => s + numA(r.variables && r.variables[k]), 0), 3);
  });
  variables.sistemas = sistemas.map((s, i) => ({
    exterior: s.exterior, tipo_sistema: s.tipo_sistema, interiores: s.estancias.length,
    kw_total: numA(partes[i].variables && partes[i].variables.kw_total),
  }));
  delete variables.tipo_sistema;

  return {
    lineas: ordenadas, incidencias, variables,
    recargo_sobre_coste: partes[0] ? partes[0].recargo_sobre_coste : null,
    motor_version: partes[0] ? partes[0].motor_version : null,
    resumen: resumenDe(ordenadas),
  };
}
