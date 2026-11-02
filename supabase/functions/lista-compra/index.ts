// =============================================================================
// Sysefen · lista-compra · La lista de compra de la obra (2-11-2026, V30.8)
//
// QUÉ HACE: cuando el cliente acepta un presupuesto, junta TODOS los presupuestos
// aceptados de esa obra, saca el material a pedir agrupado por proveedor, lo que
// queda pendiente de definir y lo que no se compra (mano de obra, trámites), lo
// pinta en un PDF interno, lo guarda en Storage (obra-docs/lista-compra/…) y lo
// manda por correo a los destinatarios de `ajustes.lista_compra_correos`
// (Ramón y Fabrizio). Al cliente y a los operarios no les llega nada.
//
// DE DÓNDE SALE CADA COSA:
//   · Presupuestos del motor FV v2: `origen_inputs.pedido` ya trae el pedido por
//     proveedor (Electromat, BayWa, Würth…). Si el motor no lo dejó (inversor A
//     MEDIDA), se usa el `desglose` y la tabla `proveedor_articulos`.
//   · Líneas del catálogo (producto_ref): la familia del producto dice si es
//     material o servicio; el proveedor sale de `proveedor_marcas` o de la tarifa.
//   · Líneas sueltas (Teamleader): por la descripción. Lo que parece mano de obra o
//     trámite va a «no se compra»; lo que es una partida compuesta («Instalación
//     eléctrica interior completa: …») va a «partidas sin desglose»; el resto es
//     material sin proveedor. Si no hay coste se usa la venta y se marca.
//   · Las líneas iguales de varios presupuestos se suman.
//
// QUIÉN LLAMA:
//   · El disparador de la base (sql/etapa96) con x-clave: accion 'aceptacion'
//     (genera y manda el correo) o 'cambio' (el presupuesto aceptado cambió de
//     obra: regenera sin correo).
//   · La app con sesión (presupuestos, jefe, Administración): 'ver' (la última
//     versión; si los presupuestos cambiaron, la regenera sin correo; si el
//     presupuesto no está aceptado, una simulación con él incluido), 'regenerar',
//     'destinatarios' (leer/guardar los correos; solo Administración).
//
// SECRETOS: SUPABASE_*, AVISOS_CLAVE, RESEND_API_KEY.
// DESPLIEGUE: "Verify JWT" DESACTIVADO (entra el disparador con x-clave).
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ZONA = 'Europe/Madrid';
const BUCKET = 'obra-docs';
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const LOGO_URL = 'https://celfaen-kp.github.io/PRoiextemx6.55236.515151.16564646.5/logo-sysefen.png';
const ESPERA_ACEPTACION_MS = 8000;   // la app asigna la obra justo después de aceptar: se le da margen

// Bloques del desglose del motor FV v2 (fv.js).
const BLOQUES_MATERIAL = ['MÓDULOS FOTOVOLTAICOS', 'INVERSOR', 'MEDICIÓN Y MONITORIZACIÓN', 'ESTRUCTURA', 'MATERIAL ELÉCTRICO'];
const BLOQUES_SERVICIO = ['MANO DE OBRA', 'TRÁMITES', 'INTERNO'];
// Familias del catálogo que no se compran o van aparte.
const FAM_SERVICIO = ['mano_obra', 'servicio', 'tramite', 'medios', 'obra_civil', 'transporte'];
const FAM_ALMACEN = ['consumible'];
const FAM_PENDIENTE = ['opcional'];
// Descripciones que son servicio (empiezan así) y unidades de tiempo.
const SERVICIO_RE = /^(mano de obra|montaje|instalaci[oó]n( del?| de la| de los| de las)?(\s+\S+){0,3}$|desmontaje|retirada|limpieza|proyecto|legalizaci|tramit|gesti[oó]n|permiso|tasa|certificad|visita|desplazamiento|jornada|relleno|obra civil|andamio|alquiler|transporte|gastos|garant[ií]a|revisi[oó]n|documentaci[oó]n|ingenier[ií]a|puesta en (servicio|marcha)|a cuenta|descuento|boletín|boletin|memoria|direcci[oó]n de obra|supervisi)/i;
const UD_TIEMPO = ['h', 'hora', 'horas', 'jornada', 'jornadas', 'día', 'dia', 'días', 'dias', 'km'];
const PARTIDA_RE = /:|\bcompleta\b|\bincluye\b|\bincluido\b|\bconjunto de\b/i;

const esc = (s: unknown) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const rnd2 = (n: number) => Math.round(n * 100) / 100;
// Formato español con punto de miles SIEMPRE (Intl en es-ES no lo pone en cifras de 4 dígitos).
const dec = (n: unknown, decimales = 2) => { const v = num(n); const [ent, fr] = Math.abs(v).toFixed(decimales).split('.'); return (v < 0 ? '-' : '') + ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fr ? ',' + fr : ''); };
const eur = (n: unknown) => dec(n) + ' €';
const cant = (n: unknown) => { const v = num(n); return Number.isInteger(v) ? dec(v, 0) : dec(v, 2).replace(/,?0+$/, ''); };
const limpio = (v: unknown) => String(v == null ? '' : v).trim();
const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const codigoObra = (o: { numero?: number | null } | null) => o && o.numero != null ? 'OB-' + String(o.numero).padStart(3, '0') : '';
const fechaHora = (d: Date) => d.toLocaleString('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaCorta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const bytesAb64 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return btoa(s); };
async function sha(texto: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ---------------------------------------------------------------- tipos
// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
type Tipo = 'material' | 'partida' | 'servicio' | 'pendiente' | 'almacen';
type Item = {
  articulo: string; ref: string | null; cantidad: number; ud: string;
  coste_ud: number | null; venta_ud: number | null; importe: number; base: 'coste' | 'venta';
  proveedor: string | null; tipo: Tipo; presupuestos: string[]; nuevo: boolean; aviso: string | null; clave: string;
};
type Lista = {
  clave: string; obra: Fila | null; cliente: Fila | null; presupuestos: Fila[]; nuevo_id: string | null; simulado_id: string | null;
  proveedores: { nombre: string; datos: Fila | null; items: Item[]; total: number; sin_coste: number }[];
  partidas: Item[]; pendiente: Item[]; servicio: Item[]; almacen: Item[];
  avisos: string[];
  totales: { material: number; material_sin_coste: number; partidas: number; pendiente: number; servicio: number; almacen: number; venta: number; coste: number | null };
};

// ---------------------------------------------------------------- clasificar
const sinSitio = (s: string) => s.replace(/\s+[–\-·]\s+(piso|vivienda|planta|tramo|zona|local|habitaci[oó]n)\b.*$/i, '').trim();
const normaliza = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\s+[–\-·]\s+(piso|vivienda|planta|tramo|zona|local|habitaci[oó]n)\b.*$/i, '').replace(/\s*\(ref\.?[^)]*\)/i, '').trim();
const refDe = (s: string) => { const m = /ref\.?\s*:?\s*([A-Z0-9][A-Z0-9\-./]{3,})/i.exec(s); return m ? m[1] : null; };
const esServicioTexto = (desc: string, ud: string) => SERVICIO_RE.test(desc.trim()) || UD_TIEMPO.includes(ud.trim().toLowerCase());

function proveedorPorMarca(texto: string, marcas: { marca: string; proveedor_codigo: string }[], provs: Map<string, Fila>) {
  const t = ' ' + texto.toLowerCase() + ' ';
  for (const m of marcas) {
    const re = new RegExp('(^|[^a-záéíóúñ])' + m.marca.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-záéíóúñ]|$)', 'i');
    if (re.test(t)) { const p = provs.get(m.proveedor_codigo); if (p) return p.nombre as string; }
  }
  return null;
}

function item(base: Partial<Item> & { articulo: string; tipo: Tipo; presupuesto: string }): Item {
  const c = num(base.cantidad);
  const coste_ud = base.coste_ud != null && num(base.coste_ud) > 0 ? num(base.coste_ud) : null;
  const venta_ud = base.venta_ud != null ? num(base.venta_ud) : null;
  const usa: 'coste' | 'venta' = coste_ud != null ? 'coste' : 'venta';
  const importe = base.importe != null ? num(base.importe) : rnd2(c * (usa === 'coste' ? coste_ud! : num(venta_ud)));
  const ud = limpio(base.ud) || 'ud';
  return {
    articulo: limpio(base.articulo), ref: base.ref || null, cantidad: c, ud,
    coste_ud, venta_ud, importe, base: usa,
    proveedor: base.proveedor || null, tipo: base.tipo, presupuestos: [base.presupuesto], nuevo: false, aviso: base.aviso || null,
    clave: [base.tipo, (base.proveedor || '').toLowerCase(), normaliza(base.articulo), ud.toLowerCase(), coste_ud != null ? coste_ud.toFixed(3) : 'v' + num(venta_ud).toFixed(3)].join('|'),
  };
}

// Convierte las líneas de todos los presupuestos en items clasificados.
function clasificar(presupuestos: Fila[], lineasPor: Map<string, Fila[]>, productos: Map<string, Fila>, tarifas: Map<string, Fila>, provs: Map<string, Fila>, marcas: Fila[], articulos: Map<string, string>) {
  const items: Item[] = [];
  const avisos: string[] = [];
  const provPorCodigo = (cod: string | null | undefined) => { const p = cod ? provs.get(cod) : null; return p ? (p.nombre as string) : null; };
  const provTarifa = (prod: Fila | null) => { if (!prod) return null; const t = tarifas.get(prod.tarifa_id); const p = t && t.proveedor_id ? [...provs.values()].find((x) => x.id === t.proveedor_id) : null; return p && p.compra !== false ? (p.nombre as string) : null; };

  for (const p of presupuestos) {
    const lineas = (lineasPor.get(p.id) || []).slice().sort((a, b) => num(a.orden) - num(b.orden));
    for (const l of lineas) {
      const oi = (l.origen_inputs && typeof l.origen_inputs === 'object' ? l.origen_inputs : {}) as Fila;
      const desc = limpio(l.descripcion);
      const desglose: Fila[] = Array.isArray(oi.desglose) ? oi.desglose : [];
      const ventaLinea = num(l.precio_venta) * (num(l.cantidad) || 1);

      // --- 1. Partida del motor FV v2 con desglose ---------------------------------
      if (oi.fv2 && desglose.length) {
        const pedido = oi.pedido && typeof oi.pedido === 'object' ? oi.pedido as Record<string, Fila> : null;
        if (pedido) {
          for (const [quien, bloque] of Object.entries(pedido)) {
            for (const a of (bloque.lineas || []) as Fila[]) {
              const prov = quien === 'PENDIENTE' ? null : quien;
              items.push(item({ articulo: a.articulo, ref: refDe(String(a.articulo || '')), cantidad: a.cantidad, ud: a.ud, coste_ud: a.coste_ud, importe: a.importe, proveedor: prov, tipo: 'material', presupuesto: p.id, aviso: a.aviso || (prov ? null : 'proveedor pendiente') }));
            }
          }
        }
        for (const d of desglose) {
          const bloque = String(d.bloque || '');
          const c = num(d.cantidad);
          if (BLOQUES_MATERIAL.includes(bloque)) {
            if (c <= 0 && d.aviso) items.push(item({ articulo: d.nombre + (d.texto && d.texto !== d.nombre ? ' · ' + d.texto : ''), cantidad: 0, ud: d.unidad, coste_ud: null, importe: 0, tipo: 'pendiente', presupuesto: p.id, aviso: d.aviso }));
            else if (c > 0 && !pedido) {
              const prov = provPorCodigo(articulos.get(String(d.nombre))) || proveedorPorMarca(String(d.nombre), marcas as { marca: string; proveedor_codigo: string }[], provs);
              items.push(item({ articulo: d.nombre, cantidad: Math.ceil(c), ud: d.unidad, coste_ud: d.coste_ud, proveedor: prov, tipo: 'material', presupuesto: p.id, aviso: d.aviso || (num(d.coste_ud) === 0 ? 'sin precio de coste: pedir precio' : null) }));
            }
          } else if (BLOQUES_SERVICIO.includes(bloque) && c > 0) {
            items.push(item({ articulo: d.nombre + (d.texto && d.texto !== d.nombre && bloque !== 'INTERNO' ? ' · ' + d.texto : ''), cantidad: c, ud: d.unidad, coste_ud: d.coste_ud, importe: d.coste, tipo: 'servicio', presupuesto: p.id }));
          } else if (bloque === 'PEQUEÑO MATERIAL' && num(d.coste) > 0) {
            items.push(item({ articulo: d.nombre, cantidad: 1, ud: 'lote', coste_ud: d.coste, importe: d.coste, tipo: 'almacen', presupuesto: p.id, aviso: 'sale de almacén, no se pide' }));
          }
        }
        if (Array.isArray(oi.avisos)) oi.avisos.forEach((a: unknown) => { const t = limpio(a); if (t && !avisos.includes(t)) avisos.push(t); });
        continue;
      }

      // --- 2. Otra partida con desglose (cargador de coche…) ----------------------------
      if (desglose.length) {
        for (const d of desglose) {
          const c = num(d.cantidad); if (c <= 0) continue;
          const nombre = String(d.nombre || d.articulo || '');
          if (esServicioTexto(nombre, String(d.unidad || ''))) items.push(item({ articulo: nombre, cantidad: c, ud: d.unidad, coste_ud: d.coste_ud, venta_ud: d.venta_ud, importe: d.coste, tipo: 'servicio', presupuesto: p.id }));
          else items.push(item({ articulo: nombre, ref: l.producto_ref || null, cantidad: c, ud: d.unidad, coste_ud: d.coste_ud, venta_ud: d.venta_ud, proveedor: proveedorPorMarca(nombre, marcas as { marca: string; proveedor_codigo: string }[], provs), tipo: 'material', presupuesto: p.id }));
        }
        continue;
      }

      // --- 3. Línea del catálogo -----------------------------------------------------
      const prod = l.producto_ref ? productos.get(String(l.producto_ref)) || null : null;
      if (prod) {
        const fam = String(prod.familia || '');
        const tarifa = tarifas.get(prod.tarifa_id);
        const propio = tarifa && /catálogo propio/i.test(String(tarifa.nombre || ''));
        let tipo: Tipo;
        if (propio ? esServicioTexto(desc || String(prod.nombre), limpio(l.unidad)) || ['mano_obra', 'servicio'].includes(fam) : FAM_SERVICIO.includes(fam)) tipo = 'servicio';
        else if (FAM_ALMACEN.includes(fam)) tipo = 'almacen';
        else if (FAM_PENDIENTE.includes(fam)) tipo = 'pendiente';
        else if (propio && PARTIDA_RE.test(desc) && num(l.precio_coste) <= 0) tipo = 'partida';
        else tipo = 'material';
        const texto = desc || String(prod.nombre || l.producto_ref);
        const prov = tipo === 'material' ? proveedorPorMarca(texto + ' ' + String(prod.nombre || ''), marcas as { marca: string; proveedor_codigo: string }[], provs) || provTarifa(prod) : null;
        items.push(item({ articulo: texto, ref: String(l.producto_ref), cantidad: l.cantidad, ud: l.unidad, coste_ud: l.precio_coste, venta_ud: l.precio_venta, proveedor: prov, tipo, presupuesto: p.id, aviso: tipo === 'pendiente' ? 'opcional sin desglose de material: definir qué se pide' : tipo === 'almacen' ? 'sale de almacén' : null }));
        continue;
      }

      // --- 4. Línea suelta (Teamleader o manual) -------------------------------------------
      if (!desc) continue;
      if (esServicioTexto(desc, limpio(l.unidad))) {
        items.push(item({ articulo: desc, cantidad: l.cantidad, ud: l.unidad, coste_ud: l.precio_coste, venta_ud: l.precio_venta, tipo: 'servicio', presupuesto: p.id }));
      } else if (PARTIDA_RE.test(desc) && (num(l.precio_coste) <= 0 || ventaLinea >= 500)) {
        items.push(item({ articulo: desc, ref: l.producto_ref || refDe(desc), cantidad: l.cantidad, ud: l.unidad, coste_ud: l.precio_coste, venta_ud: l.precio_venta, tipo: 'partida', presupuesto: p.id }));
      } else {
        items.push(item({ articulo: desc, ref: l.producto_ref || refDe(desc), cantidad: l.cantidad, ud: l.unidad, coste_ud: l.precio_coste, venta_ud: l.precio_venta, proveedor: proveedorPorMarca(desc, marcas as { marca: string; proveedor_codigo: string }[], provs), tipo: 'material', presupuesto: p.id }));
      }
    }
  }
  return { items, avisos };
}

// Suma las líneas iguales y reparte por tipo y proveedor.
function agrupar(items: Item[], nuevoId: string | null): Pick<Lista, 'proveedores' | 'partidas' | 'pendiente' | 'servicio' | 'almacen'> {
  const porClave = new Map<string, Item>();
  for (const it of items) {
    const ya = porClave.get(it.clave);
    if (ya) {
      ya.cantidad = rnd2(ya.cantidad + it.cantidad); ya.importe = rnd2(ya.importe + it.importe);
      it.presupuestos.forEach((p) => { if (!ya.presupuestos.includes(p)) ya.presupuestos.push(p); });
      if (it.aviso && !ya.aviso) ya.aviso = it.aviso;
      if (ya.articulo !== it.articulo) ya.articulo = sinSitio(ya.articulo);   // «Cable portero 6 hilos – Piso A» + «… – Piso B» → «Cable portero 6 hilos»
    } else porClave.set(it.clave, { ...it, presupuestos: it.presupuestos.slice() });
  }
  const todos = [...porClave.values()];
  todos.forEach((it) => { it.nuevo = !!nuevoId && it.presupuestos.includes(nuevoId); });
  const de = (t: Tipo) => todos.filter((i) => i.tipo === t).sort((a, b) => b.importe - a.importe);
  const material = de('material');
  const nombres = [...new Set(material.map((i) => i.proveedor || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'es')));
  const proveedores = nombres.map((n) => {
    const its = material.filter((i) => (i.proveedor || '') === n);
    return { nombre: n || 'Sin proveedor asignado', datos: null as Fila | null, items: its, total: rnd2(its.reduce((s, i) => s + i.importe, 0)), sin_coste: its.filter((i) => i.base === 'venta').length };
  });
  return { proveedores, partidas: de('partida'), pendiente: de('pendiente'), servicio: de('servicio'), almacen: de('almacen') };
}

// ---------------------------------------------------------------- PDF
async function pdfLista(L: Lista, version: number, cuando: Date, simulacion: boolean) {
  const doc = await PDFDocument.create();
  const F = await doc.embedFont(StandardFonts.Helvetica), B = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 36, ANCHO = W - 2 * M;
  const VERDE = rgb(0.125, 0.376, 0.157), GRIS = rgb(0.4, 0.42, 0.38), TINTA = rgb(0.1, 0.12, 0.09), LINEA = rgb(0.85, 0.87, 0.84), AMBAR = rgb(0.6, 0.39, 0), ROJO = rgb(0.61, 0.18, 0.18), VERDE_S = rgb(0.9, 0.95, 0.9);
  const w = (s: string) => String(s || '').replace(/→/g, '-').replace(/[✓✔]/g, 'si').replace(/[^\x00-\xff€–—…“”‘’•]/g, '?');
  let pagina = doc.addPage([W, H]); let y = H - M;
  const titulo = L.obra ? codigoObra(L.obra) + ' ' + (L.obra.nombre || L.obra.cliente || '') : (L.cliente?.nombre || 'Cliente') + ' (sin obra)';
  const pie: string[] = [];
  const cabecera = () => {
    pagina.drawText('SYSEFEN', { x: M, y: H - M - 14, size: 15, font: B, color: VERDE });
    pagina.drawText(w('Documento interno · no se entrega al cliente'), { x: M, y: H - M - 27, size: 8, font: F, color: GRIS });
    const t = simulacion ? 'Lista de compra (simulación)' : 'Lista de compra';
    pagina.drawText(w(t), { x: W - M - B.widthOfTextAtSize(w(t), 15), y: H - M - 14, size: 15, font: B, color: TINTA });
    const s = w(titulo + ' · versión ' + version + ' · ' + fechaHora(cuando));
    pagina.drawText(s, { x: W - M - F.widthOfTextAtSize(s, 8), y: H - M - 27, size: 8, font: F, color: GRIS });
    pagina.drawLine({ start: { x: M, y: H - M - 34 }, end: { x: W - M, y: H - M - 34 }, thickness: 2, color: VERDE });
    y = H - M - 48;
  };
  const nueva = () => { pagina = doc.addPage([W, H]); cabecera(); };
  const sitio = (alto: number) => { if (y - alto < M + 24) nueva(); };
  const partir = (texto: string, ancho: number, size: number, font = F) => {
    const palabras = w(texto).split(/\s+/); const lineas: string[] = []; let actual = '';
    for (const p of palabras) {
      const prueba = actual ? actual + ' ' + p : p;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) actual = prueba;
      else { if (actual) lineas.push(actual); actual = p; while (font.widthOfTextAtSize(actual, size) > ancho && actual.length > 1) { let corte = actual.length - 1; while (corte > 1 && font.widthOfTextAtSize(actual.slice(0, corte), size) > ancho) corte--; lineas.push(actual.slice(0, corte)); actual = actual.slice(corte); } }
    }
    if (actual) lineas.push(actual);
    return lineas.length ? lineas : [''];
  };
  const texto = (s: string, size = 9, font = F, color = TINTA, x = M) => { pagina.drawText(w(s), { x, y, size, font, color }); };
  const parrafo = (s: string, size = 9, font = F, color = TINTA, ancho = ANCHO) => { for (const ln of partir(s, ancho, size, font)) { sitio(size + 4); pagina.drawText(ln, { x: M, y, size, font, color }); y -= size + 3; } };
  const derecha = (s: string, xFin: number, size = 9, font = F, color = TINTA) => { pagina.drawText(w(s), { x: xFin - font.widthOfTextAtSize(w(s), size), y, size, font, color }); };
  const seccion = (t: string, sub?: string, color = TINTA) => { sitio(34); y -= 10; texto(t, 11, B, color); y -= 14; if (sub) { texto(sub, 8, F, GRIS); y -= 11; } };
  // Columnas: artículo (flexible) · cantidad · ud · precio ud · total · presupuesto
  const C = { cant: 48, ud: 26, pu: 62, tot: 66, p: 30 };
  const xArt = M, anchoArt = ANCHO - C.cant - C.ud - C.pu - C.tot - C.p - 6, xCant = xArt + anchoArt + C.cant, xUd = xCant + 4, xPu = xUd + C.ud + C.pu, xTot = xPu + C.tot, xP = xTot + 6;
  const etiqueta = new Map(L.presupuestos.map((p, i) => [p.id, 'P' + (i + 1)]));
  let baseActual: 'coste' | 'venta' | 'mixto' = 'coste';
  const cabTabla = (base: 'coste' | 'venta' | 'mixto') => {
    baseActual = base; sitio(16);
    const col = GRIS;
    texto('Artículo', 7.5, B, col); derecha('Cant.', xCant, 7.5, B, col); texto('Ud', 7.5, B, col, xUd);
    derecha(base === 'venta' ? 'Venta ud' : base === 'mixto' ? 'Precio ud' : 'Coste ud', xPu, 7.5, B, col); derecha('Total', xTot, 7.5, B, col); texto('Presu.', 7.5, B, col, xP);
    y -= 4; pagina.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINEA }); y -= 10;
  };
  const filaItem = (it: Item) => {
    const lineas = partir(it.articulo, anchoArt - 6, 8.5);
    const extra: string[] = [];
    if (it.ref) extra.push('ref. ' + it.ref);
    if (it.aviso) extra.push(it.aviso);
    if (it.base === 'venta' && it.tipo === 'material' && baseActual === 'mixto') extra.push('sin coste: importe de venta');
    const alto = lineas.length * 10.5 + (extra.length ? 9 : 0) + 5;
    sitio(alto);
    if (it.nuevo) pagina.drawRectangle({ x: M - 4, y: y - alto + 12, width: ANCHO + 8, height: alto - 2, color: VERDE_S });
    if (it.nuevo) pagina.drawRectangle({ x: M - 4, y: y - alto + 12, width: 2.5, height: alto - 2, color: VERDE });
    const y0 = y;
    lineas.forEach((ln, i) => { pagina.drawText(ln, { x: xArt, y: y0 - i * 10.5, size: 8.5, font: F, color: TINTA }); });
    y = y0;
    if (it.tipo !== 'pendiente' || it.cantidad > 0) { derecha(cant(it.cantidad), xCant, 8.5); texto(it.ud, 8.5, F, GRIS, xUd); }
    const pu = it.base === 'coste' ? it.coste_ud : it.venta_ud;
    if (pu != null && (it.cantidad > 0 || pu > 0)) derecha(dec(pu), xPu, 8.5, F, it.base === 'venta' ? AMBAR : TINTA);
    if (it.importe > 0 || it.cantidad > 0) derecha(dec(it.importe), xTot, 8.5, it.base === 'venta' ? F : B, it.base === 'venta' ? AMBAR : TINTA);
    texto(it.presupuestos.map((p) => etiqueta.get(p) || '?').join(','), 7.5, F, GRIS, xP);
    y -= lineas.length * 10.5;
    if (extra.length) { pagina.drawText(w(extra.join(' · ')), { x: xArt, y, size: 7, font: F, color: it.aviso && it.tipo !== 'almacen' ? AMBAR : GRIS }); y -= 9; }
    y -= 2; pagina.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: LINEA }); y -= 6;
  };
  const subtotal = (t: string, n: number) => { sitio(14); texto(t, 8.5, B); derecha(eur(n), xTot, 8.5, B); y -= 14; };

  cabecera();
  // Cabecera de datos
  const T = L.totales;
  const datos: [string, string][] = [
    ['Obra', L.obra ? codigoObra(L.obra) + ' ' + (L.obra.nombre || '') + (L.obra.estado ? ' · ' + String(L.obra.estado).replace('_', ' ') : '') : 'todavía sin obra'],
    ['Cliente', L.cliente?.nombre || L.obra?.cliente || '—'],
    ['Presupuestos ' + (simulacion ? 'incluidos' : 'aceptados'), L.presupuestos.length + ' · venta ' + eur(T.venta) + ' sin IVA'],
    ['Coste previsto', T.coste != null ? eur(T.coste) + (T.venta > 0 ? ' · margen ' + dec((1 - T.coste / T.venta) * 100, 1) + ' %' : '') : 'sin datos (presupuestos sin coste por línea)'],
  ];
  if (L.nuevo_id) { const p = L.presupuestos.find((x) => x.id === L.nuevo_id); if (p) datos.push(['Esta versión', 'se añade «' + (p.titulo || 'presupuesto') + '» (aceptado ' + fechaCorta(p.respondido_at) + ')']); }
  if (L.simulado_id) { const p = L.presupuestos.find((x) => x.id === L.simulado_id); if (p) datos.push(['Simulación', 'incluye «' + (p.titulo || 'presupuesto') + '», que NO está aceptado']); }
  for (const [k, v] of datos) { sitio(12); texto(k.toUpperCase(), 7, B, GRIS); const ls = partir(v, ANCHO - 120, 9); ls.forEach((ln, i) => { pagina.drawText(ln, { x: M + 120, y: y - i * 11, size: 9, font: F, color: TINTA }); }); y -= Math.max(1, ls.length) * 11 + 1; }
  // Leyenda de presupuestos
  y -= 4;
  for (const p of L.presupuestos) { sitio(11); const s = (etiqueta.get(p.id) || '') + ' · ' + (p.titulo || 'Presupuesto') + ' · ' + eur(p.total_venta) + (p.respuesta_cliente === 'aceptado' ? ' · aceptado ' + fechaCorta(p.respondido_at) : ' · pendiente de respuesta') + (p.motor_version === 'teamleader' ? ' · hecho en Teamleader' : ''); for (const ln of partir(s, ANCHO, 7.5)) { pagina.drawText(ln, { x: M, y, size: 7.5, font: F, color: GRIS }); y -= 9.5; } }
  if (L.avisos.length) { y -= 2; for (const a of L.avisos) parrafo('Aviso del motor: ' + a, 7.5, F, AMBAR); }

  // Material por proveedor
  seccion('Material a pedir', 'Agrupado por proveedor. Las líneas iguales de varios presupuestos están sumadas; en verde lo que entra con esta versión.');
  if (!L.proveedores.length) parrafo('No hay material identificado en los presupuestos.', 9, F, GRIS);
  for (const pr of L.proveedores) {
    sitio(40); y -= 4;
    texto(pr.nombre, 10, B, pr.datos ? TINTA : pr.nombre === 'Sin proveedor asignado' ? AMBAR : TINTA);
    const d = pr.datos;
    const contacto = d ? [d.contacto, d.telefono, d.email, d.web, d.forma_pedido].filter(Boolean).join(' · ') : (pr.nombre === 'Sin proveedor asignado' ? 'Hay que decidir a quién se pide' : 'contacto sin cargar (Ajustes → Proveedores)');
    y -= 11; texto(contacto, 7.5, F, GRIS); y -= 12;
    cabTabla(pr.sin_coste === pr.items.length ? 'venta' : pr.sin_coste ? 'mixto' : 'coste');
    pr.items.forEach(filaItem);
    subtotal('Subtotal ' + pr.nombre + (pr.sin_coste ? ' (' + pr.sin_coste + ' líneas a precio de venta)' : ''), pr.total);
  }
  if (L.partidas.length) {
    seccion('Partidas sin desglose de material', 'El pedido hay que sacarlo de la descripción. Importes de venta de la partida.');
    cabTabla('venta'); L.partidas.forEach(filaItem); subtotal('Subtotal partidas', L.totales.partidas);
  }
  if (L.pendiente.length) {
    seccion('Pendiente de definir antes de pedir', undefined, AMBAR);
    cabTabla('mixto'); L.pendiente.forEach(filaItem); if (L.totales.pendiente) subtotal('Subtotal pendiente', L.totales.pendiente);
  }
  if (L.servicio.length || L.almacen.length) {
    seccion('No se compra (mano de obra, trámites, interno, almacén)', 'Solo para tener el total; no entra en el pedido.', GRIS);
    cabTabla('mixto'); [...L.servicio, ...L.almacen].forEach(filaItem); subtotal('Subtotal no se compra', rnd2(L.totales.servicio + L.totales.almacen));
  }
  // Totales
  sitio(90); y -= 10; pagina.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: TINTA }); y -= 16;
  const tot = (t: string, n: string, grande = false, color = TINTA) => { sitio(16); texto(t, grande ? 11 : 9, grande ? B : F, color); derecha(n, xTot, grande ? 11 : 9, grande ? B : F, color); y -= grande ? 18 : 14; };
  tot('Material a pedir', eur(T.material), true);
  if (T.material_sin_coste) tot('  de ello a precio de venta (sin coste en el presupuesto)', eur(T.material_sin_coste), false, AMBAR);
  if (T.partidas) tot('Partidas sin desglose (pedido a mano, a venta)', eur(T.partidas));
  if (T.pendiente) tot('Pendiente de definir', eur(T.pendiente), false, AMBAR);
  tot('Mano de obra, trámites, interno y almacén', eur(rnd2(T.servicio + T.almacen)));
  tot('Venta de los presupuestos incluidos (sin IVA)', eur(T.venta), false, GRIS);
  if (T.coste != null) tot('Coste previsto en los presupuestos', eur(T.coste), false, GRIS);

  // Pie en todas las páginas
  const paginas = doc.getPages();
  paginas.forEach((pg, i) => {
    const s = w((simulacion ? 'Simulación: ' : '') + 'generada ' + fechaHora(cuando) + ' · en la app: ' + (L.obra ? 'Obras → ' + codigoObra(L.obra) + ' → Lista de compra' : 'ficha del presupuesto → Ver lista de compra'));
    pg.drawText(s, { x: M, y: M - 10, size: 7, font: F, color: GRIS });
    const n = 'Página ' + (i + 1) + ' de ' + paginas.length;
    pg.drawText(n, { x: W - M - F.widthOfTextAtSize(n, 7), y: M - 10, size: 7, font: F, color: GRIS });
  });
  void pie;
  return await doc.save();
}

// ---------------------------------------------------------------- correo
async function mandar(RESEND: string, msg: { to: string[]; subject: string; text: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: REMITENTE }, msg)),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { message?: string }).message || String(r.status)); }
}
const marco = (titulo: string, cuerpo: string) => `<div style="background:#f5f4ef;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#14170f">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:18px;padding:28px 26px">
    <img src="${LOGO_URL}" alt="Sysefen" style="height:42px;margin-bottom:18px">
    <div style="font:700 24px/1.15 Arial,Helvetica,sans-serif;margin-bottom:12px">${titulo}</div>
    ${cuerpo}
    <div style="margin-top:26px;padding-top:14px;border-top:1px solid #e6e5df;font-size:12px;color:#777">Sysefen · documento interno · no reenviar al cliente</div>
  </div></div>`;

// ---------------------------------------------------------------- la lista
// deno-lint-ignore no-explicit-any
type SB = any;

async function destinatarios(sb: SB) {
  const { data } = await sb.from('ajustes').select('valor').eq('clave', 'lista_compra_correos').maybeSingle();
  const lista = String(data?.valor || '').split(/[,\s;]+/).map((s) => s.trim()).filter(esEmail);
  if (lista.length) return lista;
  // Sin ajuste: Ramón y Fabrizio por su correo de avisos.
  const { data: emps } = await sb.from('empleados').select('nombre, email, email_avisos').eq('activo', true).eq('rol', 'presupuestos');
  return (emps || []).filter((e: Fila) => /^(ram[oó]n|fabrizio)/i.test(String(e.nombre || ''))).map((e: Fila) => e.email_avisos || e.email).filter(esEmail);
}

// Dónde cuelga la lista: la obra del presupuesto, la obra abierta del cliente, o el cliente.
async function claveDe(sb: SB, p: Fila): Promise<{ obra: Fila | null; cliente_id: string | null }> {
  if (p.obra_id) {
    const { data: o } = await sb.from('obras').select('*').eq('id', p.obra_id).maybeSingle();
    if (o) return { obra: o, cliente_id: p.cliente_id || o.cliente_id || null };
  }
  let cli: Fila | null = null;
  if (p.cliente_id) { const { data } = await sb.from('clientes_cache').select('id, nombre, tl_id').eq('id', p.cliente_id).maybeSingle(); cli = data; }
  const filtros = [p.cliente_id ? 'cliente_id.eq.' + p.cliente_id : '', cli?.tl_id ? 'tl_id.eq.' + cli.tl_id : ''].filter(Boolean);
  if (filtros.length) {
    const { data: abierta } = await sb.from('obras').select('*').or(filtros.join(',')).in('estado', ['planificada', 'en_curso']).order('creado_en', { ascending: false }).limit(1).maybeSingle();
    if (abierta) {
      // El presupuesto aceptado se enlaza a la obra abierta (como hace la app al aceptar).
      if (!p.obra_id && p.respuesta_cliente === 'aceptado') { await sb.from('presupuestos').update({ obra_id: abierta.id }).eq('id', p.id); p.obra_id = abierta.id; }
      return { obra: abierta, cliente_id: p.cliente_id || abierta.cliente_id || null };
    }
  }
  return { obra: null, cliente_id: p.cliente_id || null };
}

async function construir(sb: SB, obra: Fila | null, cliente_id: string | null, extra: Fila | null, nuevoId: string | null): Promise<Lista> {
  let q = sb.from('presupuestos').select('*').eq('respuesta_cliente', 'aceptado');
  if (obra) q = q.eq('obra_id', obra.id); else if (cliente_id) q = q.eq('cliente_id', cliente_id).is('obra_id', null); else q = q.eq('id', extra?.id || '00000000-0000-0000-0000-000000000000');
  const { data: aceptados, error } = await q.order('respondido_at', { ascending: true });
  if (error) throw new Error(error.message);
  const presupuestos: Fila[] = (aceptados || []).slice();
  if (extra && !presupuestos.some((p) => p.id === extra.id)) presupuestos.push(extra);
  if (!presupuestos.length) throw new Error('No hay presupuestos aceptados en esta obra.');
  const ids = presupuestos.map((p) => p.id);
  const [{ data: lineas }, { data: provs }, { data: marcas }, { data: arts }, { data: tarifas }] = await Promise.all([
    sb.from('presupuesto_lineas').select('*').in('presupuesto_id', ids),
    sb.from('proveedores').select('*'),
    sb.from('proveedor_marcas').select('*'),
    sb.from('proveedor_articulos').select('*'),
    sb.from('tarifas').select('id, nombre, proveedor_id'),
  ]);
  const refs = [...new Set((lineas || []).map((l: Fila) => l.producto_ref).filter(Boolean))];
  const productos = new Map<string, Fila>();
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await sb.from('productos').select('referencia, nombre, familia, tarifa_id, unidad').in('referencia', refs.slice(i, i + 200));
    (data || []).forEach((pr: Fila) => productos.set(String(pr.referencia), pr));
  }
  const lineasPor = new Map<string, Fila[]>();
  (lineas || []).forEach((l: Fila) => { const a = lineasPor.get(l.presupuesto_id) || []; a.push(l); lineasPor.set(l.presupuesto_id, a); });
  const provMap = new Map<string, Fila>((provs || []).map((p: Fila) => [String(p.codigo), p]));
  const tarMap = new Map<string, Fila>((tarifas || []).map((t: Fila) => [String(t.id), t]));
  const artMap = new Map<string, string>((arts || []).map((a: Fila) => [String(a.articulo), String(a.proveedor_codigo)]));
  const marcasOrd = (marcas || []).slice().sort((a: Fila, b: Fila) => String(b.marca).length - String(a.marca).length);

  const { items, avisos } = clasificar(presupuestos, lineasPor, productos, tarMap, provMap, marcasOrd, artMap);
  const g = agrupar(items, nuevoId);
  const porNombre = new Map<string, Fila>((provs || []).map((p: Fila) => [String(p.nombre).toLowerCase(), p]));
  g.proveedores.forEach((pr) => { pr.datos = porNombre.get(pr.nombre.toLowerCase()) || null; });
  const suma = (arr: Item[]) => rnd2(arr.reduce((s, i) => s + i.importe, 0));
  const material = g.proveedores.flatMap((p) => p.items);
  const costes = presupuestos.map((p) => p.total_coste).filter((c) => c != null && num(c) > 0);
  let cliente: Fila | null = null;
  const cid = cliente_id || presupuestos.find((p) => p.cliente_id)?.cliente_id || null;
  if (cid) { const { data } = await sb.from('clientes_cache').select('id, nombre, email, telefono').eq('id', cid).maybeSingle(); cliente = data; }
  return {
    clave: obra ? 'obra:' + obra.id : 'cliente:' + (cid || presupuestos[0].id), obra, cliente, presupuestos, nuevo_id: nuevoId, simulado_id: extra ? extra.id : null,
    ...g, avisos,
    totales: {
      material: suma(material), material_sin_coste: suma(material.filter((i) => i.base === 'venta')), partidas: suma(g.partidas), pendiente: suma(g.pendiente), servicio: suma(g.servicio), almacen: suma(g.almacen),
      venta: rnd2(presupuestos.reduce((s, p) => s + num(p.total_venta), 0)), coste: costes.length === presupuestos.length ? rnd2(costes.reduce((s, c) => s + num(c), 0)) : null,
    },
  };
}

const huellaDe = (L: Lista) => sha(L.presupuestos.map((p) => p.id + ':' + (p.updated_at || '')).sort().join('|') + '|' + L.clave);

// Resumen sin las listas enteras (para la app y la fila de la base).
function resumen(L: Lista) {
  return {
    obra_id: L.obra?.id || null, cliente_id: L.cliente?.id || null, presupuestos: L.presupuestos.map((p) => ({ id: p.id, titulo: p.titulo, total_venta: p.total_venta, respondido_at: p.respondido_at })),
    proveedores: L.proveedores.map((p) => ({ nombre: p.nombre, lineas: p.items.length, total: p.total, sin_coste: p.sin_coste })),
    partidas: L.partidas.length, pendiente: L.pendiente.length, no_se_compra: L.servicio.length + L.almacen.length, avisos: L.avisos, totales: L.totales,
  };
}

// Genera el PDF, lo guarda y apunta la versión. Devuelve la fila.
async function generar(sb: SB, L: Lista, origen: string, presupuestoId: string | null) {
  const cuando = new Date();
  const simul = origen === 'simulacion';
  const filtro = L.obra ? { col: 'obra_id', val: L.obra.id } : { col: 'cliente_id', val: L.cliente?.id || null };
  let version = 1;
  if (!simul && filtro.val) {
    const { data: ult } = await sb.from('listas_compra').select('version').eq(filtro.col, filtro.val).neq('origen', 'simulacion').order('version', { ascending: false }).limit(1).maybeSingle();
    version = (ult?.version || 0) + 1;
  }
  const pdf = await pdfLista(L, version, cuando, simul);
  const carpeta = L.obra ? L.obra.id : 'cliente-' + (L.cliente?.id || 'sin');
  const ruta = simul ? `lista-compra/${carpeta}/simulacion-${presupuestoId || 'x'}.pdf` : `lista-compra/${carpeta}/v${String(version).padStart(2, '0')}-${cuando.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.pdf`;
  const { error: eUp } = await sb.storage.from(BUCKET).upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
  if (eUp) throw new Error('Storage: ' + eUp.message);
  const fila = {
    obra_id: L.obra?.id || null, cliente_id: L.cliente?.id || null, version, generada_en: cuando.toISOString(), origen, presupuesto_id: presupuestoId,
    presupuestos: L.presupuestos.map((p) => p.id), huella: await huellaDe(L), datos: resumen(L), pdf_ruta: ruta,
  };
  if (simul) return { ...fila, id: null, pdf };
  const { data, error } = await sb.from('listas_compra').insert(fila).select('*').single();
  if (error) throw new Error(error.message);
  return { ...data, pdf };
}

async function urlDe(sb: SB, ruta: string) {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(ruta, 3600);
  return data?.signedUrl || null;
}

async function correoAceptacion(sb: SB, RESEND: string, L: Lista, fila: Fila, pdf: Uint8Array, pNuevo: Fila) {
  const para = await destinatarios(sb);
  if (!para.length) return { enviada_a: [], aviso: 'sin destinatarios' };
  if (!RESEND) return { enviada_a: [], aviso: 'falta RESEND_API_KEY' };
  const titulo = L.obra ? codigoObra(L.obra) + ' ' + (L.obra.nombre || '') : (L.cliente?.nombre || 'cliente');
  const n = L.presupuestos.length;
  const T = L.totales;
  const otros = L.presupuestos.filter((p) => p.id !== pNuevo.id);
  const nombreAdj = ('Lista de compra · ' + titulo + ' · v' + fila.version + '.pdf').replace(/[\\/:*?"<>|]/g, ' ');
  const provTxt = L.proveedores.map((p) => p.nombre + ' ' + eur(p.total)).join(' · ');
  const cuerpoHtml = `<p><b>${esc(L.cliente?.nombre || L.obra?.cliente || 'El cliente')}</b> ha aceptado «${esc(pNuevo.titulo || 'presupuesto')}» (${eur(pNuevo.total_venta)} sin IVA, ${esc(fechaCorta(pNuevo.respondido_at))}).${n > 1 ? ` Es el <b>${n}.º presupuesto aceptado</b> de la obra ${esc(titulo)}; ${otros.length === 1 ? 'el otro es' : 'los otros son'} ${otros.map((o) => '«' + esc(o.titulo || 'presupuesto') + '» (' + eur(o.total_venta) + ')').join(', ')}.` : ` Es el primer presupuesto aceptado de ${esc(titulo)}.`}</p>
    <p>Adjunta va la lista de compra de toda la obra, <b>versión ${fila.version}</b>: <b>${eur(T.material)}</b> de material${L.proveedores.length ? ' en ' + L.proveedores.length + ' proveedor' + (L.proveedores.length > 1 ? 'es' : '') + ' (' + esc(provTxt) + ')' : ''}${T.partidas ? `, ${eur(T.partidas)} en partidas sin desglose` : ''}${L.pendiente.length ? `, ${L.pendiente.length} punto${L.pendiente.length > 1 ? 's' : ''} pendiente${L.pendiente.length > 1 ? 's' : ''} de definir` : ''}.${T.material_sin_coste ? ` ${eur(T.material_sin_coste)} van a precio de venta porque el presupuesto no tiene coste.` : ''}</p>
    ${L.avisos.length ? `<p style="color:#9a6400">Avisos del motor: ${esc(L.avisos.join(' · '))}</p>` : ''}
    <p>En la app: ${L.obra ? 'Obras → ' + esc(codigoObra(L.obra)) : 'ficha del presupuesto'} → Ver lista de compra.</p>`;
  const texto = `${L.cliente?.nombre || ''} ha aceptado «${pNuevo.titulo || 'presupuesto'}» (${eur(pNuevo.total_venta)}). Lista de compra de ${titulo}, versión ${fila.version}: ${eur(T.material)} de material (${provTxt}). PDF adjunto.`;
  await mandar(RESEND, {
    to: para, subject: `Lista de compra · ${titulo} · ${n} presupuesto${n > 1 ? 's' : ''} aceptado${n > 1 ? 's' : ''}`,
    text: texto, html: marco('Lista de compra · ' + titulo, cuerpoHtml), attachments: [{ filename: nombreAdj, content: bytesAb64(pdf) }],
  });
  await sb.from('listas_compra').update({ enviada_a: para, enviada_en: new Date().toISOString() }).eq('id', fila.id);
  return { enviada_a: para };
}

// ---------------------------------------------------------------- servidor
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let b: Fila = {};
  try { b = await req.json(); } catch (_) { b = {}; }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const RESEND = Deno.env.get('RESEND_API_KEY') || '';

  // --- quién llama: el disparador con x-clave, o un comercial con su sesión --------------
  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  const esSistema = !!CLAVE && req.headers.get('x-clave') === CLAVE;
  let rol = '';
  if (!esSistema) {
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacion } } });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: emp } = await sb.from('empleados').select('rol').eq('user_id', user.id).maybeSingle();
    rol = emp?.rol || '';
    if (!['presupuestos', 'jefe', 'admin'].includes(rol)) return json({ error: 'La lista de compra es para presupuestos, jefes y Administración.' }, 403);
  }
  const accion = String(b.accion || (esSistema ? 'aceptacion' : 'ver'));

  try {
    // --- destinatarios del correo (Administración) ------------------------------------------
    if (accion === 'destinatarios') {
      if (!esSistema && rol !== 'admin') return json({ error: 'Solo Administración cambia los destinatarios.' }, 403);
      if (Array.isArray(b.correos) || typeof b.correos === 'string') {
        const lista = (Array.isArray(b.correos) ? b.correos : String(b.correos).split(/[,\s;]+/)).map((s: unknown) => limpio(s)).filter(esEmail);
        await sb.from('ajustes').upsert({ clave: 'lista_compra_correos', valor: lista.join(', '), updated_at: new Date().toISOString() });
      }
      return json({ ok: true, correos: await destinatarios(sb) });
    }

    // --- el presupuesto o la obra de la que se habla --------------------------------------------
    let p: Fila | null = null;
    if (b.presupuesto_id) {
      const { data } = await sb.from('presupuestos').select('*').eq('id', b.presupuesto_id).maybeSingle();
      if (!data) return json({ error: 'No existe ese presupuesto.' }, 404);
      p = data;
    }

    if (accion === 'aceptacion' || accion === 'cambio') {
      if (!esSistema) return json({ error: 'Solo el sistema.' }, 403);
      if (!p) return json({ error: 'Falta presupuesto_id.' }, 400);
      if (p.respuesta_cliente !== 'aceptado') return json({ ok: true, nada: 'no está aceptado' });
      if (accion === 'aceptacion') {
        // La app crea o enlaza la obra justo después de marcar la aceptación.
        await new Promise((r) => setTimeout(r, ESPERA_ACEPTACION_MS));
        const { data } = await sb.from('presupuestos').select('*').eq('id', p.id).maybeSingle(); if (data) p = data;
      }
      const { obra, cliente_id } = await claveDe(sb, p!);
      const L = await construir(sb, obra, cliente_id, null, accion === 'aceptacion' ? p!.id : null);
      const huella = await huellaDe(L);
      const filtro = obra ? { col: 'obra_id', val: obra.id } : { col: 'cliente_id', val: cliente_id };
      const { data: ult } = filtro.val ? await sb.from('listas_compra').select('id, version, huella, enviada_en, pdf_ruta').eq(filtro.col, filtro.val).neq('origen', 'simulacion').order('version', { ascending: false }).limit(1).maybeSingle() : { data: null };
      if (ult && ult.huella === huella && (accion === 'cambio' || ult.enviada_en)) return json({ ok: true, nada: 'sin cambios', version: ult.version });
      const fila = await generar(sb, L, accion, p!.id);
      let correo: Fila = {};
      if (accion === 'aceptacion') { try { correo = await correoAceptacion(sb, RESEND, L, fila, fila.pdf, p!); } catch (e) { correo = { aviso: 'correo: ' + (e as Error).message }; await sb.from('listas_compra').update({ error: 'correo: ' + (e as Error).message }).eq('id', fila.id); } }
      return json({ ok: true, version: fila.version, pdf_ruta: fila.pdf_ruta, ...correo, resumen: fila.datos });
    }

    // --- la app: ver / regenerar --------------------------------------------------------------
    if (accion === 'ver' || accion === 'regenerar') {
      let obra: Fila | null = null, cliente_id: string | null = null;
      if (p) ({ obra, cliente_id } = await claveDe(sb, p));
      else if (b.obra_id) { const { data } = await sb.from('obras').select('*').eq('id', b.obra_id).maybeSingle(); if (!data) return json({ error: 'No existe esa obra.' }, 404); obra = data; cliente_id = data.cliente_id || null; }
      else return json({ error: 'Falta presupuesto_id u obra_id.' }, 400);

      // Presupuesto no aceptado: simulación con él dentro, sin guardar versión ni mandar nada.
      if (p && p.respuesta_cliente !== 'aceptado') {
        const L = await construir(sb, obra, cliente_id, p, null);
        const fila = await generar(sb, L, 'simulacion', p.id);
        return json({ ok: true, simulacion: true, url: await urlDe(sb, fila.pdf_ruta), resumen: fila.datos });
      }
      const L = await construir(sb, obra, cliente_id, null, null);
      const huella = await huellaDe(L);
      const filtro = obra ? { col: 'obra_id', val: obra.id } : { col: 'cliente_id', val: cliente_id };
      const { data: ult } = filtro.val ? await sb.from('listas_compra').select('*').eq(filtro.col, filtro.val).neq('origen', 'simulacion').order('version', { ascending: false }).limit(1).maybeSingle() : { data: null };
      if (accion === 'ver' && ult && ult.huella === huella && ult.pdf_ruta) {
        return json({ ok: true, version: ult.version, generada_en: ult.generada_en, enviada_a: ult.enviada_a, url: await urlDe(sb, ult.pdf_ruta), resumen: ult.datos, reutilizada: true });
      }
      // Los presupuestos cambiaron (o nunca se generó): versión nueva sin correo. Se marca
      // como nuevo lo que no estaba en la versión anterior.
      const nuevos = ult ? L.presupuestos.filter((x) => !(ult.presupuestos || []).includes(x.id)) : [];
      const L2 = nuevos.length === 1 ? await construir(sb, obra, cliente_id, null, nuevos[0].id) : L;
      const fila = await generar(sb, L2, accion === 'regenerar' ? 'manual' : 'cambio', p?.id || null);
      return json({ ok: true, version: fila.version, generada_en: fila.generada_en, url: await urlDe(sb, fila.pdf_ruta), resumen: fila.datos });
    }

    return json({ error: 'Acción desconocida: ' + accion }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
