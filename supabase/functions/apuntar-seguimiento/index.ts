// =============================================================================
// Sysefen · Edge Function `apuntar-seguimiento`
//
// La única escritura que tienen los agentes de la oficina virtual aparte de
// crear un lead. Ramón, 19-11-2026: «que el agente deje constancia de un
// seguimiento que Ramón ha aprobado»: una nota en el seguimiento del cliente
// (sale en su ficha como «Agente») y, si se dice, su próxima acción. Nada más.
//
// La regla está en la base: función `agentes_apuntar_seguimiento`
// (sql/etapa115). Si la misma nota llega dos veces en diez minutos (un
// reintento), la segunda no se apunta: "resultado": "repetido".
//
// OJO: si se manda proxima_accion, SUSTITUYE a la que el cliente tuviera. La
// respuesta trae la que había en "antes".
//
// SECRETO (Supabase → Edge Functions → Secrets):
//   AGENTES_APUNTAR_CLAVE   solo abre esta función.
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`.
// Sin CORS a propósito: se llama de servidor a servidor.
//
// USO (POST con JSON, cabecera x-clave):
//   { "cliente_id": "uuid", "texto": "Se le escribió para recordar el presupuesto",
//     "proxima_accion": "Llamar si no contesta", "proxima_accion_at": "2026-11-25" }
//   { ..., "prueba": true }   dice qué pasaría, sin guardar nada
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido: se llama con POST.' }, 405);

  const CLAVE = Deno.env.get('AGENTES_APUNTAR_CLAVE') || '';
  if (CLAVE.length < 32) return json({ ok: false, error: 'Falta el secreto AGENTES_APUNTAR_CLAVE.' }, 500);
  if (!mismaClave(req.headers.get('x-clave') || '', CLAVE)) return json({ ok: false, error: 'No autorizado.' }, 401);

  const crudo = await req.text().catch(() => '');
  if (crudo.length > 10000) return json({ ok: false, error: 'El cuerpo es demasiado grande.' }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any = null;
  try { b = JSON.parse(crudo); } catch { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ ok: false, error: 'El cuerpo tiene que ser un objeto JSON.' }, 400);

  const mal = (error: string, campo: string) => json({ ok: false, error, campo }, 400);
  const clienteId = String(b.cliente_id || '').trim();
  if (!ES_UUID.test(clienteId)) return mal('Falta cliente_id (el id del cliente, como viene en las lecturas).', 'cliente_id');
  const texto = String(b.texto ?? '').replace(/\r/g, '').trim();
  if (texto.length < 3) return mal('Falta el texto de la nota.', 'texto');
  if (texto.length > 2000) return mal('El texto pasa de 2000 caracteres.', 'texto');
  const accion = String(b.proxima_accion ?? '').replace(/\s+/g, ' ').trim();
  if (accion.length > 200) return mal('La próxima acción pasa de 200 caracteres.', 'proxima_accion');
  const fecha = String(b.proxima_accion_at ?? '').trim();
  if (fecha && (!ES_FECHA.test(fecha) || Number.isNaN(Date.parse(fecha)))) return mal('proxima_accion_at tiene que ser una fecha AAAA-MM-DD.', 'proxima_accion_at');
  if (fecha && !accion) return mal('Hay fecha de próxima acción pero no dice cuál es.', 'proxima_accion');

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc('agentes_apuntar_seguimiento', {
    p: { cliente_id: clienteId, texto, proxima_accion: accion || null, proxima_accion_at: fecha || null },
    p_prueba: b.prueba === true,
  });
  if (error) {
    if (error.code === 'P0001') return json({ ok: false, error: error.message }, error.message.includes('ningún cliente') ? 404 : 400);
    const falta = /agentes_apuntar_seguimiento|schema cache|PGRST202/i.test(error.message);
    return json({ ok: false, error: falta ? 'Falta preparar la base: sql/etapa115_agentes_leer.sql.' : 'No se pudo apuntar: ' + error.message }, 500);
  }
  return json(data);
});
