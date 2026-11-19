// =============================================================================
// Sysefen · Edge Function `agentes-leer`
//
// Lo que los agentes de la oficina virtual pueden LEER de la app. Ramón,
// 19-11-2026: «funciones de lectura, con la misma idea que crear-lead (clave
// propia, JSON, solo lectura)… para que los agentes de seguimiento, obras y
// costes dejen de depender de la exportación de Teamleader».
//
// Es una sola función con el parámetro `que`. No escribe nada, nunca. Qué se
// lee y qué no se enseña (teléfonos, correos, direcciones, coste por hora de
// cada uno) está en la base: función `agentes_leer` (sql/etapa115).
//
//   que = "leads-pendientes"         desde, limite
//   que = "visitas-sin-presupuesto"  dias_min, desde, limite
//   que = "presupuestos"             estado, respuesta, desde, limite
//   que = "obras-estado"             estado, limite
//   que = "partes"                   desde, hasta, limite
//   que = "costes-obra"              obra_id
//
// SECRETO (Supabase → Edge Functions → Secrets):
//   AGENTES_LEER_CLAVE   la clave de lectura de los agentes. Solo abre esta
//                        función: no sirve para crear leads ni para apuntar nada.
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`.
// Sin CORS a propósito: se llama de servidor a servidor.
//
// USO (POST con JSON, cabecera x-clave):
//   { "que": "presupuestos", "estado": "enviado", "respuesta": "pendiente" }
//   { "que": "partes", "desde": "2026-11-01", "hasta": "2026-11-19" }
//   { "que": "costes-obra", "obra_id": "uuid" }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const QUE = ['leads-pendientes', 'visitas-sin-presupuesto', 'presupuestos', 'obras-estado', 'partes', 'costes-obra'];
const ESTADOS: Record<string, string[]> = {
  presupuestos: ['generado', 'revisar', 'aprobado', 'enviado'],
  'obras-estado': ['planificada', 'en_curso', 'finalizada', 'cerrada'],
};
const RESPUESTAS = ['pendiente', 'aceptado', 'rechazado', 'caducado'];
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// Una lista puede venir como ["a","b"] o como "a,b".
// deno-lint-ignore no-explicit-any
function lista(v: any) {
  if (v == null || v === '') return null;
  const a = Array.isArray(v) ? v : String(v).split(',');
  // deno-lint-ignore no-explicit-any
  const fuera = a.map((x: any) => String(x).trim().toLowerCase()).filter(Boolean);
  return fuera.length ? fuera : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido: se llama con POST.' }, 405);

  const CLAVE = Deno.env.get('AGENTES_LEER_CLAVE') || '';
  if (CLAVE.length < 32) return json({ ok: false, error: 'Falta el secreto AGENTES_LEER_CLAVE.' }, 500);
  if (!mismaClave(req.headers.get('x-clave') || '', CLAVE)) return json({ ok: false, error: 'No autorizado.' }, 401);

  // deno-lint-ignore no-explicit-any
  let b: any = null;
  try { b = JSON.parse(await req.text()); } catch { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ ok: false, error: 'El cuerpo tiene que ser un objeto JSON.' }, 400);

  const que = String(b.que || '').trim().toLowerCase();
  const mal = (error: string, campo: string) => json({ ok: false, error, campo }, 400);
  if (!QUE.includes(que)) return mal('No sé leer eso. Valen: ' + QUE.join(', ') + '.', 'que');

  const p: Record<string, unknown> = {};
  for (const k of ['desde', 'hasta']) {
    if (b[k] == null || b[k] === '') continue;
    if (!ES_FECHA.test(String(b[k])) || Number.isNaN(Date.parse(String(b[k])))) return mal(k + ' tiene que ser una fecha AAAA-MM-DD.', k);
    p[k] = String(b[k]);
  }
  for (const k of ['limite', 'dias_min']) {
    if (b[k] == null || b[k] === '') continue;
    const n = Number(b[k]);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return mal(k + ' tiene que ser un número entero.', k);
    p[k] = n;
  }
  const estados = lista(b.estado);
  if (estados) {
    const valen = ESTADOS[que];
    if (!valen) return mal('«' + que + '» no se filtra por estado.', 'estado');
    const raro = estados.find((e: string) => !valen.includes(e));
    if (raro) return mal('Estado «' + raro + '» no existe. Valen: ' + valen.join(', ') + '.', 'estado');
    p.estado = estados;
  }
  const respuestas = lista(b.respuesta);
  if (respuestas) {
    if (que !== 'presupuestos') return mal('Solo los presupuestos se filtran por respuesta.', 'respuesta');
    const raro = respuestas.find((e: string) => !RESPUESTAS.includes(e));
    if (raro) return mal('Respuesta «' + raro + '» no existe. Valen: ' + RESPUESTAS.join(', ') + '.', 'respuesta');
    p.respuesta = respuestas;
  }
  if (que === 'costes-obra') {
    if (!ES_UUID.test(String(b.obra_id || ''))) return mal('Falta obra_id (el id de la obra, como viene en obras-estado).', 'obra_id');
    p.obra_id = String(b.obra_id);
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc('agentes_leer', { p_que: que, p });
  if (error) {
    // P0001 es un «raise exception» nuestro (obra que no existe, rango demasiado largo): culpa del dato.
    if (error.code === 'P0001') return json({ ok: false, error: error.message }, 400);
    const falta = /agentes_leer|schema cache|PGRST202/i.test(error.message);
    return json({ ok: false, error: falta ? 'Falta preparar la base: sql/etapa115_agentes_leer.sql.' : 'No se pudo leer: ' + error.message }, 500);
  }
  return json(data);
});
