// =============================================================================
// Sysefen · Motor de presupuestos · El cálculo
//
// Entra la ficha de una visita y la configuración vigente (variables, reglas,
// partidas, mano de obra, catálogo); salen las líneas del presupuesto y las
// incidencias de lo que no cuadró.
//
// El orden es el de MOTOR-PRESUPUESTOS.md §6:
//   datos → variables_derivadas (en orden) → reglas (por prioridad)
//         → partidas → mano de obra → precios
//
// Aquí NO se habla con Supabase ni con la app: entra un objeto, sale otro. Así
// se puede probar contra los presupuestos de verdad sin tocar nada (pruebas/).
//
// Dos principios que vienen del diseño y conviene no perder:
//   · Cada línea recuerda de dónde salió (`origen`, `origen_regla_id`,
//     `origen_inputs`). Un presupuesto raro se explica solo.
//   · Lo que el motor no sabe NO se inventa: se anota como incidencia y la
//     línea sale marcada para que la confirme una persona.
// =============================================================================

import { evaluar, evaluarNumero, numero, verdad } from './formulas.js';

const MOTOR_VERSION = '1.4';

/** ¿Se cumple una condición {campo: valor} contra el ámbito? */
function cumple(condicion, ambito) {
  if (!condicion || typeof condicion !== 'object') return true;
  return Object.keys(condicion).every((k) => {
    const esperado = condicion[k];
    const real = ambito[k];
    if (Array.isArray(esperado)) return esperado.some((v) => mismo(v, real));
    return mismo(esperado, real);
  });
}
function mismo(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') return verdad(a) === verdad(b);
  if (typeof a === 'number' || typeof b === 'number') return numero(a) === numero(b);
  return String(a == null ? '' : a) === String(b == null ? '' : b);
}

/**
 * config = {
 *   variables: [{codigo, formula, orden, etiqueta, unidad}],
 *   lookup:    [{clave, entrada, valor}],
 *   reglas:    [{id, tipo, variable, minimo, maximo, condicion, producto_ref,
 *                partida_id, formula_cantidad, seccion, prioridad, notas,
 *                por_cada}],
 *     por_cada: nombre de una lista de la ficha ('estancias'). La regla se
 *     aplica una vez POR ELEMENTO, viendo sus campos (m2, metros…) además de
 *     los de la visita. Así cada estancia lleva su máquina. `variable` puede
 *     ser una fórmula ('m2 * lookup(...)'), no solo un nombre.
 *   partidas:  { <partida_id>: { codigo, nombre, items: [{producto_ref,
 *                concepto_libre, detalle_tecnico, precio_fijo, formula_cantidad, orden}] } },
 *   manoObra:  [{concepto, formula_horas, precio_fijo, precio_hora, condicion}],
 *   productos: { <referencia>: {referencia, nombre, familia, unidad, precio_tarifa,
 *                descuento_proveedor, detalle_tecnico, especificaciones, iva, atributos} },
 *
 *   PRECIOS (desde la 1.2): cada línea sale con `precio_coste` (lo que le cuesta
 *   a Sysefen) y `precio_tarifa` (lo que ve el cliente, antes de descuentos).
 *   · Si la categoría tiene el coeficiente `recargo_sobre_coste` en sus tablas
 *     (fotovoltaica: 1,30), el precio del catálogo y el fijo de las partidas se
 *     toman como COSTE y el de venta es coste × recargo, redondeado al céntimo,
 *     UNA vez por línea. Un producto con atributos.sin_recargo (los trámites,
 *     que ya vienen como precio de venta) se queda como está.
 *   · Sin ese coeficiente (aerotermia, aire) todo sigue como antes: el precio
 *     del catálogo es PVP y el coste es PVP × (1 − descuento de proveedor).
 *   · Un producto a 0 € no es gratis: es un precio PENDIENTE. La línea sale sin
 *     confirmar y con su incidencia, y no se inventa nada.
 *   · `costes_complementarios_pct` (1.3): al coste del MATERIAL se le suma ese
 *     % (consumibles, mermas, pequeño material) antes del recargo. No se aplica
 *     a mano de obra, trámites, transporte ni medios.
 *
 *   PARTIDAS AGRUPADAS (1.3): una partida con `agrupada: true` sale como UNA
 *   línea (su nombre × la cantidad de la regla) cuyo coste unitario es la suma
 *   de sus renglones entre esa cantidad. El desglose (qué lleva y cuánto) va en
 *   origen_inputs.desglose, para la versión interna; el cliente ve una línea.
 *   dtoLinea:  [{familia, descuento_pct}]      (puede ir vacío: sin descuentos)
 * }
 *
 *   MARGEN POR PRODUCTO (1.4): un producto puede traer su propio `recargo`
 *   (multiplicador sobre coste; null = el de la categoría) y `aplica_cdc`
 *   (false = sin costes complementarios aunque sea material). Así el panel
 *   va a 80 → 115 (×1,4375, sin CDC), los equipos del distribuidor a coste
 *   ×1,20 sin CDC y el resto sigue a coste ×1,10 ×1,30. Una partida agrupada
 *   suma coste y venta renglón a renglón, así que hereda el margen de cada uno.
 *   Cada línea sale con `beneficio_ud` y `margen_pct` (sobre venta), y el
 *   resultado con `resumen` (coste, venta, beneficio, margen y el descuento
 *   máximo que aguanta cada margen). TODO ESO ES INTERNO: la app lo enseña por
 *   dentro y el PDF del cliente no lo lleva jamás.
 */
export function calcular(categoria, datos, config) {
  const cfg = config || {};
  const incidencias = [];
  const avisar = (nivel, codigo, mensaje, campo) =>
    incidencias.push({ nivel, codigo, mensaje, campo: campo || null });

  const ambito = Object.assign({}, datos || {});
  // Las listas se copian: las variables por elemento escriben en ellas y la
  // ficha que llegó no debe cambiar.
  Object.keys(ambito).forEach((k) => {
    if (Array.isArray(ambito[k])) ambito[k] = ambito[k].map((x) => (x && typeof x === 'object' ? Object.assign({}, x) : x));
  });
  const faltantes = new Set();
  const ayudas = {
    faltante: (n) => faltantes.add(n),
    lookup: (clave, entrada) => {
      const f = (cfg.lookup || []).find((x) => x.clave === clave && String(x.entrada) === String(entrada));
      if (f) return numero(f.valor);
      const porDefecto = (cfg.lookup || []).find((x) => x.clave === clave && x.entrada === 'defecto');
      if (porDefecto) {
        avisar('aviso', 'coeficiente_por_defecto',
          'No hay coeficiente para «' + entrada + '» en ' + clave + ': se usa el de por defecto.');
        return numero(porDefecto.valor);
      }
      avisar('error', 'coeficiente_ausente', 'Falta el coeficiente ' + clave + ' / ' + entrada + '.');
      return 0;
    },
  };

  // El recargo sobre coste de esta categoría, si lo tiene (ver cabecera).
  const recargoFila = (cfg.lookup || []).find((x) => x.clave === 'recargo_sobre_coste' && x.entrada === 'defecto');
  const recargo = recargoFila && numero(recargoFila.valor) > 0 ? numero(recargoFila.valor) : 1;
  const alCentimo = (n) => Math.round(numero(n) * 100 + 1e-7) / 100;
  const cdcFila = (cfg.lookup || []).find((x) => x.clave === 'costes_complementarios_pct' && x.entrada === 'defecto');
  const cdc = cdcFila ? numero(cdcFila.valor) : 0;
  const SIN_CDC = ['mano_obra', 'tramite', 'transporte', 'medios', 'servicio'];
  // De un precio base (catálogo o fijo) a {coste, venta}. `p` es el producto
  // (o un sucedáneo {familia} para los precios fijos): su familia decide si
  // lleva costes complementarios (material sí, salvo aplica_cdc = false) y su
  // `recargo`, si lo trae, manda sobre el de la categoría. Con sin_recargo, o
  // sin recargo ninguno (aerotermia, aire), el precio base es PVP: venta = base.
  const preciosDe = (base, p) => {
    const atr = p && p.atributos && typeof p.atributos === 'object' ? p.atributos : {};
    const propio = p && p.recargo != null && p.recargo !== '' && numero(p.recargo) > 0 ? numero(p.recargo) : null;
    const rec = verdad(atr.sin_recargo) ? 1 : (propio != null ? propio : recargo);
    let coste = numero(base) * (1 - numero(p && p.descuento_proveedor) / 100);
    if (rec !== 1) {
      const familia = String((p && p.familia) || '');
      if (cdc && !SIN_CDC.includes(familia) && !(p && p.aplica_cdc === false)) coste *= 1 + cdc / 100;
      coste = alCentimo(coste);
      // venta_exacta: sin redondear, para que una partida agrupada sume sus
      // renglones sin perder céntimos en los de precio pequeño (0,28 €/m × 22).
      return { coste, venta: alCentimo(coste * rec), venta_exacta: coste * rec };
    }
    return { coste: alCentimo(coste), venta: alCentimo(base), venta_exacta: numero(base) };
  };

  /* --- 1 · variables derivadas, en su orden ------------------------------- */
  // Una variable suele mirar dos sitios: el dato de la visita o el que se
  // escribe a mano en el presupuesto suelto (carga_termica_kw o potencia_kw).
  // Solo falta un dato si la variable se queda en cero; si uno de los dos
  // caminos dio valor, el otro no se echa de menos. Antes avisaba de
  // «potencia_kw» en todos los presupuestos de visita.
  const variables = {};
  (cfg.variables || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).forEach((v) => {
    // Una variable «por cada estancia» se calcula elemento a elemento y se
    // guarda EN el elemento (estancia.kw_nominal): así una regla por_cada la ve
    // como un campo más, y suma(estancias, 'kw_nominal') la suma.
    if (v.por_cada) {
      const lista = ambito[v.por_cada];
      if (!Array.isArray(lista)) return;
      lista.forEach((el) => {
        if (!el || typeof el !== 'object') return;
        try { el[v.codigo] = evaluar(v.formula, Object.assign({}, ambito, el), ayudas); }
        catch (e) { avisar('error', 'formula_rota', 'La variable ' + v.codigo + ' no se pudo calcular: ' + e.message, v.codigo); el[v.codigo] = 0; }
      });
      variables[v.codigo] = lista.map((el) => (el && typeof el === 'object' ? el[v.codigo] : null));
      return;
    }
    try {
      const suyos = new Set();
      const valor = evaluar(v.formula, ambito, Object.assign({}, ayudas, { faltante: (n) => suyos.add(n) }));
      if (!verdad(valor)) suyos.forEach((n) => faltantes.add(n));
      ambito[v.codigo] = valor;
      variables[v.codigo] = valor;
    } catch (e) {
      avisar('error', 'formula_rota', 'La variable ' + v.codigo + ' no se pudo calcular: ' + e.message, v.codigo);
      ambito[v.codigo] = 0; variables[v.codigo] = 0;
    }
  });

  /* --- 2 · las líneas ------------------------------------------------------ */
  const lineas = [];
  const mete = (l) => { if (l && numero(l.cantidad) > 0) lineas.push(l); };

  const deProducto = (ref, cantidad, extra) => {
    const p = (cfg.productos || {})[ref];
    // «Split mural 3,5 kW — Salón»: la estancia va en el concepto, que es lo
    // que lee el cliente; el campo `elemento` se queda para el motor.
    const conDonde = (nombre) => (extra && extra.elemento ? nombre + ' — ' + extra.elemento : nombre);
    if (!p) {
      avisar('error', 'producto_desconocido', 'No está en el catálogo la referencia ' + ref + '.');
      return Object.assign({
        producto_ref: ref, descripcion: conDonde(ref + ' (no está en la tarifa)'), cantidad,
        unidad: 'ud', precio_tarifa: 0, precio_coste: 0, dto_linea_pct: 0, iva: 21, confirmada: false,
      }, extra);
    }
    const dto = (cfg.dtoLinea || []).find((d) => d.familia === p.familia);
    const pr = preciosDe(p.precio_tarifa, p);
    // Sin precio no hay precio: la línea sale, con su cantidad, pero sin
    // confirmar y avisando. Así el presupuesto enseña lo que falta por cotizar.
    const pendiente = !(numero(p.precio_tarifa) > 0);
    if (pendiente) {
      avisar('aviso', 'precio_pendiente', 'Falta el precio de ' + p.referencia + ' · ' + p.nombre + ': pendiente de confirmar.');
    }
    return Object.assign({
      producto_ref: p.referencia,
      descripcion: conDonde(p.nombre),
      detalle_tecnico: p.detalle_tecnico || null,
      especificaciones: p.especificaciones || [],
      cantidad,
      unidad: p.unidad || 'ud',
      precio_tarifa: pr.venta,
      precio_coste: pr.coste,
      dto_linea_pct: dto ? numero(dto.descuento_pct) : 0,
      iva: p.iva == null ? 21 : numero(p.iva),
      confirmada: !pendiente,
    }, extra);
  };

  const aplicaPartida = (partidaId, veces, regla) => {
    const partida = (cfg.partidas || {})[partidaId];
    if (!partida) {
      avisar('error', 'partida_desconocida', 'Una regla apunta a una partida que no existe.');
      return;
    }
    const items = (partida.items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    if (partida.agrupada) {
      // Una sola línea: el nombre de la partida × veces, al coste y la venta de
      // lo que lleva (renglón a renglón: cada uno con su margen).
      const desglose = [];
      let costeTotal = 0, ventaTotal = 0, pendiente = false;
      items.forEach((item) => {
        let cantidad;
        try { cantidad = evaluarNumero(item.formula_cantidad || '1', ambito, ayudas); }
        catch (e) { avisar('error', 'formula_rota', 'La partida ' + partida.codigo + ' tiene una fórmula que falla: ' + e.message); return; }
        if (cantidad <= 0) return;
        const p = item.producto_ref ? (cfg.productos || {})[item.producto_ref] : null;
        if (item.producto_ref && !p) { avisar('error', 'producto_desconocido', 'No está en el catálogo la referencia ' + item.producto_ref + '.'); pendiente = true; return; }
        const base = p ? p.precio_tarifa : item.precio_fijo;
        if (!(numero(base) > 0)) { pendiente = true; avisar('aviso', 'precio_pendiente', 'Falta el precio de ' + (item.producto_ref || item.concepto_libre) + ' (dentro de ' + partida.nombre + '): pendiente de confirmar.'); }
        const pr = preciosDe(base, p || { familia: 'material' });
        costeTotal += pr.coste * cantidad;
        ventaTotal += pr.venta_exacta * cantidad;
        desglose.push({ ref: item.producto_ref || null, nombre: p ? p.nombre : item.concepto_libre, cantidad: Math.round(cantidad * 1000) / 1000, unidad: item.unidad || (p && p.unidad) || 'ud', coste_ud: pr.coste, coste: alCentimo(pr.coste * cantidad), venta_ud: pr.venta, venta: alCentimo(pr.venta * cantidad) });
      });
      if (!desglose.length) return;
      const costeUd = alCentimo(costeTotal / veces);
      const ventaUd = alCentimo(ventaTotal / veces);
      mete({
        producto_ref: partida.codigo, descripcion: partida.nombre, detalle_tecnico: partida.detalle_tecnico || null, especificaciones: [],
        cantidad: veces, unidad: 'ud',
        precio_tarifa: ventaUd, precio_coste: costeUd,
        dto_linea_pct: 0, iva: 21, confirmada: !pendiente,
        seccion: (regla && regla.seccion) || partida.nombre, origen: 'partida', origen_regla_id: (regla && regla.id) || null,
        origen_inputs: { partida: partida.codigo, veces, desglose, coste_total: alCentimo(costeTotal), venta_total: alCentimo(ventaTotal) },
      });
      return;
    }
    items.forEach((item) => {
      let cantidad;
      try { cantidad = evaluarNumero(item.formula_cantidad || '1', ambito, ayudas); }
      catch (e) {
        avisar('error', 'formula_rota', 'La partida ' + partida.codigo + ' tiene una fórmula que falla: ' + e.message);
        return;
      }
      cantidad *= veces;
      const comun = {
        seccion: (regla && regla.seccion) || partida.nombre,
        origen: 'partida',
        origen_regla_id: (regla && regla.id) || null,
        origen_inputs: { partida: partida.codigo, formula: item.formula_cantidad, cantidad },
      };
      if (item.producto_ref) { mete(deProducto(item.producto_ref, cantidad, comun)); return; }
      mete(Object.assign({
        producto_ref: null,
        descripcion: item.concepto_libre,
        detalle_tecnico: item.detalle_tecnico || null,
        especificaciones: [],
        cantidad,
        // La unidad de la partida (etapa 51): m para la tubería, kg para el gas.
        unidad: item.unidad || 'ud',
        precio_tarifa: preciosDe(item.precio_fijo, { familia: 'material' }).venta,
        precio_coste: preciosDe(item.precio_fijo, { familia: 'material' }).coste,
        dto_linea_pct: 0,
        iva: 21,
        confirmada: true,
      }, comun));
    });
  };

  const aplicaRegla = (r, scope, elemento) => {
    if (!cumple(r.condicion, scope)) return;

    // Las de selección solo entran si la variable cae en su tramo. Un aviso
    // con variable, igual: «más de 10 kW de inversor» es un tramo.
    if (r.tipo === 'seleccion' || (r.tipo === 'aviso' && r.variable)) {
      let v;
      try { v = evaluarNumero(r.variable, scope, ayudas); }
      catch (e) { avisar('error', 'formula_rota', 'La variable de una regla falla: ' + e.message); return; }
      if (r.minimo != null && v < numero(r.minimo)) return;
      if (r.maximo != null && v > numero(r.maximo)) return;
      if (!v && r.variable && /^[a-z_][a-z0-9_]*$/i.test(r.variable) && !elemento) {
        avisar('aviso', 'variable_vacia',
          'La regla de ' + r.variable + ' se aplicó con el valor vacío.', r.variable);
      }
    }

    // Un aviso no pone línea: deja dicho en el presupuesto lo que no cuadra
    // (una batería que no va con ese inversor, un backup sin batería…).
    if (r.tipo === 'aviso') {
      avisar('aviso', 'regla_aviso', r.notas || 'Una regla pide revisar este presupuesto.', r.variable || null);
      return;
    }

    let cantidad;
    try { cantidad = evaluarNumero(r.formula_cantidad || '1', scope, ayudas); }
    catch (e) {
      avisar('error', 'formula_rota', 'Una regla tiene una fórmula que falla: ' + e.message);
      return;
    }
    if (cantidad <= 0) return;

    // De qué estancia salió, para que la línea lo diga («Salón») y se explique.
    const donde = elemento ? (elemento.nombre || elemento.estancia || null) : null;
    if (r.partida_id) { aplicaPartida(r.partida_id, cantidad, r); return; }
    mete(deProducto(r.producto_ref, cantidad, {
      seccion: r.seccion || null,
      origen: 'regla',
      origen_regla_id: r.id,
      origen_inputs: { variable: r.variable, valor: r.variable ? scope[r.variable] : null, cantidad, elemento: donde },
      elemento: donde,
    }));
  };

  const ordenadas = (cfg.reglas || []).filter((r) => r.activa !== false)
    .sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0));
  const listasHechas = new Set();
  ordenadas.forEach((r) => {
    if (!r.por_cada) { aplicaRegla(r, ambito, null); return; }
    // Las reglas «por cada estancia» van estancia a estancia, no regla a
    // regla: así las líneas del salón salen juntas y luego las del dormitorio,
    // que es como se lee un presupuesto. Se hacen todas la primera vez que
    // aparece una de esa lista.
    if (listasHechas.has(r.por_cada)) return;
    listasHechas.add(r.por_cada);
    const lista = ambito[r.por_cada];
    if (!Array.isArray(lista)) return;
    const deLaLista = ordenadas.filter((x) => x.por_cada === r.por_cada);
    lista.forEach((el, i) => {
      const scope = Object.assign({}, ambito, el && typeof el === 'object' ? el : {}, { indice: i + 1 });
      deLaLista.forEach((x) => aplicaRegla(x, scope, el || {}));
    });
  });

  /* --- 3 · mano de obra ---------------------------------------------------- */
  (cfg.manoObra || []).forEach((m) => {
    if (!cumple(m.condicion, ambito)) return;
    let cantidad = 1, precio = numero(m.precio_fijo);
    if (m.formula_horas) {
      try { cantidad = evaluarNumero(m.formula_horas, ambito, ayudas); }
      catch (e) { avisar('error', 'formula_rota', 'La mano de obra «' + m.concepto + '» falla: ' + e.message); return; }
      precio = numero(m.precio_hora);
    }
    mete({
      producto_ref: null, descripcion: m.concepto, detalle_tecnico: null, especificaciones: [],
      cantidad, unidad: m.formula_horas ? 'h' : 'ud',
      precio_tarifa: preciosDe(precio, { familia: 'mano_obra' }).venta, precio_coste: preciosDe(precio, { familia: 'mano_obra' }).coste,
      dto_linea_pct: 0, iva: 21,
      seccion: 'Mano de obra', origen: 'mano_obra', origen_regla_id: null,
      origen_inputs: { formula: m.formula_horas || null },
      confirmada: true,
    });
  });

  /* --- 4 · lo que faltó ---------------------------------------------------- */
  faltantes.forEach((campo) => avisar('aviso', 'campo_faltante',
    'La visita no trae «' + campo + '»: se ha contado como cero.', campo));
  if (!lineas.length) {
    avisar('error', 'sin_lineas',
      'Con estos datos no se ha disparado ninguna regla. Revisa la ficha o las reglas de ' + categoria + '.');
  }

  lineas.forEach((l, i) => { l.orden = i + 1; beneficioEnLinea(l); });
  return { lineas, incidencias, variables, recargo_sobre_coste: recargo, motor_version: MOTOR_VERSION, resumen: resumenDe(lineas) };
}

/* --- El beneficio, por dentro (1.4) ---------------------------------------
 * Lo que gana Sysefen en cada línea y en el presupuesto entero, y cuánto
 * descuento sobre la venta cabe sin bajar de un margen dado:
 *   descuento_max(m) = 1 − coste / (venta × (1 − m))
 * Todo sobre venta, que es sobre lo que se descuenta. Una línea sin coste
 * conocido (la puso la persona a mano) no cuenta y se dice cuántas hay.
 * NADA de esto va al cliente: ni al PDF ni a Teamleader. */
const alCent = (n) => Math.round(numero(n) * 100 + 1e-7) / 100;
const fraccion = (n) => Math.round(numero(n) * 10000) / 10000;
export function beneficioEnLinea(l) {
  if (l.precio_coste == null || l.precio_coste === '') { l.beneficio_ud = null; l.margen_pct = null; return l; }
  const venta = numero(l.precio_tarifa), coste = numero(l.precio_coste);
  l.beneficio_ud = alCent(venta - coste);
  l.margen_pct = venta > 0 ? fraccion((venta - coste) / venta) : null;
  return l;
}
export function resumenDe(lineas) {
  let coste = 0, venta = 0, sinCoste = 0;
  (lineas || []).forEach((l) => {
    const c = numero(l.cantidad == null ? 1 : l.cantidad);
    venta += numero(l.precio_tarifa) * c;
    if (l.precio_coste == null || l.precio_coste === '') { sinCoste++; return; }
    coste += numero(l.precio_coste) * c;
  });
  coste = alCent(coste); venta = alCent(venta);
  const beneficio = alCent(venta - coste);
  const descuentoMax = {};
  [20, 15, 10].forEach((m) => {
    const d = venta > 0 ? 1 - coste / (venta * (1 - m / 100)) : 0;
    descuentoMax[String(m)] = fraccion(Math.max(0, d));
  });
  return {
    coste, venta, beneficio,
    margen_pct: venta > 0 ? fraccion(beneficio / venta) : null,
    descuento_max_pct_para_margen: descuentoMax,
    lineas_sin_coste: sinCoste,
  };
}

export { MOTOR_VERSION };
