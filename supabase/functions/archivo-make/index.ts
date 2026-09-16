// =============================================================================
// Sysefen · Edge Function `archivo-make`
//
// Puerta para que Make copie a Google Drive las planillas firmadas que la app
// guarda en el bucket privado `documentos`. Make NUNCA recibe la clave maestra:
// solo una clave propia de esta función y enlaces de descarga que caducan.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   MAKE_CLAVE   una contraseña larga inventada; la misma se pone en Make, en la
//                cabecera `x-clave`.
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo, dentro
//    del servidor: no se copian a ningún sitio.)
//
// DESPLIEGUE: desactivar "Verify JWT" en esta función (Make no tiene sesión de
// la app). La protección es la cabecera `x-clave`.
//
// USO (siempre POST con JSON):
//   { "accion": "pendientes" }
//      → { documentos: [ { id, tipo, periodo, anio, empleado, archivo, url } ] }
//        planillas aún no copiadas, con un enlace de descarga válido 1 hora.
//   { "accion": "marcar", "id": "<id>", "ref_externa": "<id del archivo en Drive>" }
//      → { ok: true }   la deja como copiada para no volver a enviarla.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

// Comparación en tiempo constante: no deja adivinar la clave letra a letra.
function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLAVE = Deno.env.get('MAKE_CLAVE') || '';
  if (CLAVE.length < 24) return json({ error: 'Falta el secreto MAKE_CLAVE (mínimo 24 caracteres) en Supabase.' }, 500);
  if (!mismaClave(req.headers.get('x-clave') || '', CLAVE)) return json({ error: 'No autorizado.' }, 401);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  if (b.accion === 'pendientes') {
    const { data, error } = await sb.from('documentos')
      .select('id, tipo, periodo, ruta, nombre, empleados!documentos_empleado_id_fkey(nombre, nombre_completo)')
      .is('exportado_en', null)
      .order('creado_en')
      .limit(25);
    if (error) return json({ error: error.message }, 500);
    const filas = data || [];
    if (!filas.length) return json({ documentos: [] });

    const { data: urls, error: e2 } = await sb.storage.from('documentos')
      .createSignedUrls(filas.map((f) => f.ruta), 3600);
    if (e2) return json({ error: e2.message }, 500);
    const urlDe: Record<string, string> = {};
    (urls || []).forEach((u) => { if (u.signedUrl && !u.error && u.path) urlDe[u.path] = u.signedUrl; });

    return json({
      documentos: filas.filter((f) => urlDe[f.ruta]).map((f) => {
        const e = (f as { empleados?: { nombre?: string; nombre_completo?: string } }).empleados || {};
        const empleado = e.nombre_completo || e.nombre || 'Sin nombre';
        const anio = f.ruta.split('/')[2];     // planillas/<empleado>/<año>/<archivo>
        // Nombre legible para dejar todas las planillas en una sola carpeta de
        // Drive, ordenadas por periodo. La ruta va aparte por si algún día se
        // prefieren carpetas por empleado y año.
        const limpio = empleado.replace(/[\\/:*?"<>|]/g, '-').trim();
        return {
          id: f.id,
          tipo: f.tipo,
          periodo: f.periodo,
          anio,
          empleado,
          archivo: f.nombre,
          nombre_sugerido: `${f.periodo || anio} · ${limpio}.pdf`,
          carpeta_sugerida: `Sysefen/Empleados/${limpio}/${anio}`,
          url: urlDe[f.ruta],
        };
      }),
    });
  }

  if (b.accion === 'marcar') {
    const id = typeof b.id === 'string' ? b.id : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Falta un id válido.' }, 400);
    const ref = b.ref_externa == null ? null : String(b.ref_externa).slice(0, 300);
    const { data, error } = await sb.from('documentos')
      .update({ exportado_en: new Date().toISOString(), ref_externa: ref })
      .eq('id', id).select('id');
    if (error) return json({ error: error.message }, 500);
    if (!data || !data.length) return json({ error: 'No existe ese documento.' }, 404);
    return json({ ok: true });
  }

  return json({ error: 'Acción desconocida. Usa "pendientes" o "marcar".' }, 400);
});
