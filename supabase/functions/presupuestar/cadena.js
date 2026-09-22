// =============================================================================
// Sysefen · Motor de presupuestos · La cadena de precios
//
// La última etapa del motor (MOTOR-PRESUPUESTOS.md §2): con las líneas ya
// elegidas y su precio de tarifa, saca los totales.
//
//   suma de líneas a PVP de tarifa
//     − descuento de línea    (el % de su familia: −15 % en material de marca)
//     = subtotal
//     − descuento global      (−10 % habitual)
//     = total sin IVA
//
// Dos cosas que se comprobaron con los presupuestos reales y que no son obvias:
//
//   1. El descuento global NO se aplica al subtotal de una vez: se aplica LÍNEA
//      A LÍNEA y cada línea se redondea al céntimo. En el 2026/596 la diferencia
//      es de un céntimo (17.599,05 contra 17.599,06), y el bueno es el de línea
//      a línea, que es como lo hace Teamleader.
//      Lo que se redondea es el importe que queda en cada línea.
//   2. Todo en céntimos enteros. En coma flotante 7.829,775 se queda en
//      7.829,77 y no en 7.829,78, y el presupuesto ya no cuadra.
//
// Sin nada de Supabase ni de la app: entra una lista, sale una lista. Así lo
// usan igual la Edge Function y las pruebas (pruebas/presupuestos.js).
// =============================================================================

/** Euros (número o texto "1.234,56"/"1234.56") a céntimos enteros. */
export function aCentimos(v) {
  if (typeof v === 'number') return Math.round(v * 100 + (v >= 0 ? 1e-7 : -1e-7));
  let s = String(v == null ? '' : v).trim().replace(/\s|€/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error('importe no válido: ' + v);
  return aCentimos(n);
}

/** Porcentaje (15, "15", "15,5") a centésimas de punto: 15 -> 1500. */
function aPuntosBasicos(p) {
  const n = typeof p === 'number' ? p : Number(String(p == null ? 0 : p).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('porcentaje no válido: ' + p);
  return Math.round(n * 100);
}

/** round(a · pb / 10000) redondeando la mitad hacia arriba (lejos de cero). */
function porcentaje(centimos, pb) {
  const x = centimos * pb;               // entero: cabe de sobra en 2^53
  const q = Math.floor(Math.abs(x) / 10000), r = Math.abs(x) % 10000;
  const v = r * 2 >= 10000 ? q + 1 : q;
  return x < 0 ? -v : v;
}

/**
 * Cantidad × precio al céntimo. La cantidad puede tener decimales (metros):
 * se lleva a milésimas, que es la precisión de presupuesto_lineas.cantidad.
 */
function importeBruto(cantidad, precioC) {
  const milesimas = Math.round(Number(cantidad) * 1000);
  if (!Number.isFinite(milesimas)) throw new Error('cantidad no válida: ' + cantidad);
  const x = milesimas * precioC;
  const q = Math.floor(Math.abs(x) / 1000), r = Math.abs(x) % 1000;
  const v = r * 2 >= 1000 ? q + 1 : q;
  return x < 0 ? -v : v;
}

/**
 * lineas: [{ cantidad, precio_tarifa, dto_linea_pct }]   (precios en euros)
 * dtoGlobalPct: el descuento al pie (10 = −10 %)
 *
 * Devuelve todo en euros con dos decimales y, por línea, cada paso de la
 * cadena, para poder enseñar de dónde sale cada número.
 */
export function cadenaPrecios(lineas, dtoGlobalPct) {
  const g = aPuntosBasicos(dtoGlobalPct || 0);
  let bruto = 0, dtoLinea = 0, dtoGlobal = 0;
  const detalle = (lineas || []).map((l) => {
    const b = importeBruto(l.cantidad == null ? 1 : l.cantidad, aCentimos(l.precio_tarifa));
    const dl = porcentaje(b, aPuntosBasicos(l.dto_linea_pct || 0));
    const neto = b - dl;
    // Lo que se redondea hacia arriba es lo que queda de la línea, no el
    // descuento: 8.699,75 × 0,90 = 7.829,775 -> 7.829,78 (y el descuento, 869,97).
    const dg = neto - porcentaje(neto, 10000 - g);
    bruto += b; dtoLinea += dl; dtoGlobal += dg;
    return { bruto: b / 100, dto_linea: -dl / 100, neto: neto / 100, dto_global: -dg / 100, total: (neto - dg) / 100 };
  });
  return {
    lineas: detalle,
    total_bruto: bruto / 100,
    total_dto_linea: -dtoLinea / 100,
    subtotal: (bruto - dtoLinea) / 100,
    total_dto_global: -dtoGlobal / 100,
    total: (bruto - dtoLinea - dtoGlobal) / 100,
  };
}
