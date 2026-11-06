/* Aerotermia: el depósito de inercia y el acumulador de ACS elegidos a mano
 * (Enzo, 6-11-2026). El motor por capítulos pone el depósito del kit base y el
 * acumulador de 200/250 l de la ficha; desde el presupuesto se puede elegir
 * otro del catálogo (datos.inercia_ref / datos.acs_ref) y la línea se sustituye
 * con el precio del catálogo y el recargo del motor. */
import { preciosProducto } from './motor.js';

const nombreDe = (p) => String((p && p.nombre) || '');
export const esInercia = (p) => (String((p && p.familia) || '') === 'deposito_inercia' && !/^res\.|resistencia/i.test(nombreDe(p)))
  || /dep[oó]sito de inercia|geostor de inercia/i.test(nombreDe(p));
export const esAcumuladorAcs = (p) => /unistor|acumulador de acs|dep[oó]sito de acs/i.test(nombreDe(p)) && !/captador/i.test(nombreDe(p));
const esLineaInercia = (l) => String(l.origen || '') === 'partida' && /dep[oó]sito de inercia/i.test(String(l.descripcion || ''));
const esLineaAcs = (l) => String(l.origen || '') === 'partida' && (/^ACS_/.test(String((l.origen_inputs || {}).partida || '')) || /unistor|acumulador de acs/i.test(String(l.descripcion || '')));

/** Las listas para los desplegables: [{ref, nombre, venta}] ordenadas por nombre. */
export function opcionesAero(productos, lookup) {
  const fila = (p) => ({ ref: p.referencia, nombre: nombreDe(p), venta: preciosProducto(p.precio_tarifa, p, lookup).venta });
  const orden = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
  const lista = (productos || []).filter((p) => p && p.activo !== false);
  return {
    inercia: lista.filter(esInercia).map(fila).sort(orden),
    acs: lista.filter(esAcumuladorAcs).map(fila).sort(orden),
  };
}

/** Sustituye en `lineas` el depósito y/o el acumulador por los elegidos. `productos`
 *  es un mapa por referencia. Devuelve las líneas nuevas y apunta incidencias. */
export function sustituirEquiposAero(lineas, datos, productos, lookup, incidencias) {
  const d = datos || {};
  let salida = (lineas || []).slice();
  const cambios = [
    { clave: 'inercia_ref', que: 'Depósito de inercia', esLinea: esLineaInercia, seccion: 'Instalación' },
    { clave: 'acs_ref', que: 'Acumulador de ACS', esLinea: esLineaAcs, seccion: 'Equipos' },
  ];
  cambios.forEach((c) => {
    const ref = String(d[c.clave] || '').trim();
    if (!ref) return;
    const p = productos && productos[ref];
    if (!p) { incidencias.push({ nivel: 'aviso', codigo: 'equipo_aero_mano', mensaje: c.que + ' elegido a mano (' + ref + '): no está en el catálogo; se deja el automático.', campo: null }); return; }
    const pr = preciosProducto(p.precio_tarifa, p, lookup);
    const i = salida.findIndex(c.esLinea);
    const antes = i >= 0 ? salida[i] : null;
    const nueva = Object.assign({}, antes || {
      cantidad: 1, unidad: p.unidad || 'ud', dto_linea_pct: 0, iva: p.iva == null ? 21 : Number(p.iva), seccion: c.seccion,
      origen: 'partida', origen_regla_id: null, especificaciones: [], confirmada: true,
    }, {
      producto_ref: p.referencia,
      descripcion: nombreDe(p),
      detalle_tecnico: (antes && antes.detalle_tecnico) || p.detalle_tecnico || null,
      precio_tarifa: pr.venta,
      precio_coste: pr.coste,
      origen_inputs: Object.assign({}, (antes && antes.origen_inputs) || {}, { elegido: ref, antes: antes ? antes.descripcion : null }),
      confirmada: true,
    });
    if (antes) salida[i] = nueva; else salida.push(nueva);
    incidencias.push({ nivel: 'aviso', codigo: 'equipo_aero_mano', mensaje: c.que + ' elegido a mano: ' + nombreDe(p) + (antes ? ' en vez de «' + antes.descripcion + '».' : ' (la ficha no llevaba ninguno).'), campo: null });
  });
  return salida;
}
