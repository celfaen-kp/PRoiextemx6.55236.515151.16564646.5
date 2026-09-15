// =============================================================================
// Sysefen · Edge Function `recordatorio-citas`
//
// Cada tarde (tarea programada, sql/etapa23b_aviso_citas_cron.sql) manda por
// correo, desde noreply@sysefen.com:
//   - a cada CLIENTE con email, un recordatorio de su cita de mañana;
//   - a cada TÉCNICO con "email para avisos", la lista de sus citas de mañana.
// Cada cita se marca con aviso_enviado_at para no avisar dos veces.
//
// SECRETOS (Supabase → Edge Functions → Secrets). Nunca en el código ni en Git:
//   RESEND_API_KEY   la misma que usa enviar-parte
//   AVISOS_CLAVE     contraseña larga inventada; la misma va en la tarea cron
//   (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.)
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`.
//
// USO (POST con JSON):
//   {}                                   avisa de las citas de mañana
//   { "solo_ver": true }                 dice a quién escribiría, sin enviar nada
//   { "fecha": "2026-09-20", ... }       otro día (para probar)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ZONA = 'Europe/Madrid';
const REMITENTE = 'Sysefen <noreply@sysefen.com>';
const CATEGORIAS: Record<string, string> = {
  aerotermia: 'aerotermia',
  solar: 'paneles solares',
  electricidad: 'electricidad',
  aire_acondicionado: 'aire acondicionado',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const esEmail = (s: unknown) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

function mismaClave(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// Fecha YYYY-MM-DD en hora de Mallorca.
const fechaEnZona = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

// Desfase de Mallorca ese día ("+02:00" en verano, "+01:00" en invierno).
function desfase(fecha: string) {
  const d = new Date(fecha + 'T12:00:00Z');
  const txt = d.toLocaleString('en-US', { timeZone: ZONA, timeZoneName: 'longOffset' });
  const m = txt.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+01:00';
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' });
const diaLargo = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
const listaCategorias = (cats: string[]) => {
  const n = (cats || []).map((c) => CATEGORIAS[c] || c);
  return n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length < 24) return json({ error: 'Falta el secreto AVISOS_CLAVE (mínimo 24 caracteres).' }, 500);
  if (!mismaClave(req.headers.get('x-clave') || '', CLAVE)) return json({ error: 'No autorizado.' }, 401);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* cuerpo vacío: valores por defecto */ }
  const soloVer = b.solo_ver === true;

  const RESEND = Deno.env.get('RESEND_API_KEY') || '';
  if (!soloVer && !RESEND) return json({ error: 'Falta el secreto RESEND_API_KEY.' }, 500);

  // --- qué día -----------------------------------------------------------------
  const fecha = typeof b.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha)
    ? b.fecha
    : fechaEnZona(new Date(Date.now() + 24 * 3600 * 1000));
  const off = desfase(fecha);
  const desde = new Date(`${fecha}T00:00:00${off}`).toISOString();
  const hasta = new Date(`${fecha}T23:59:59${off}`).toISOString();

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await sb.from('citas')
    .select(`id, inicio, duracion_min, categorias, direccion, poblacion,
      cliente:clientes_cache(nombre, email, direccion, poblacion),
      empleado:empleados!citas_empleado_id_fkey(nombre, email_avisos)`)
    .eq('estado', 'pendiente')
    .is('aviso_enviado_at', null)
    .gte('inicio', desde)
    .lte('inicio', hasta)
    .order('inicio');
  if (error) return json({ error: error.message }, 500);

  type Cita = {
    id: string; inicio: string; duracion_min: number; categorias: string[];
    direccion: string | null; poblacion: string | null;
    cliente: { nombre: string; email: string | null; direccion: string | null; poblacion: string | null } | null;
    empleado: { nombre: string; email_avisos: string | null } | null;
  };
  const citas = (data || []) as unknown as Cita[];
  const dondeDe = (c: Cita) =>
    [c.direccion || c.cliente?.direccion, c.poblacion || c.cliente?.poblacion].filter(Boolean).join(', ');

  // --- correos a clientes --------------------------------------------------------
  const aClientes = citas.filter((c) => esEmail(c.cliente?.email)).map((c) => ({
    cita: c.id,
    para: String(c.cliente!.email).trim(),
    asunto: `Recordatorio de su cita con Sysefen · ${diaLargo(c.inicio)}`,
    texto:
      `Hola ${c.cliente!.nombre}:\n\n` +
      `Le recordamos que mañana, ${diaLargo(c.inicio)}, a las ${hora(c.inicio)}, ` +
      `pasaremos a verle${dondeDe(c) ? ` en ${dondeDe(c)}` : ''}` +
      `${c.categorias?.length ? ` para preparar su presupuesto de ${listaCategorias(c.categorias)}` : ''}.\n\n` +
      `Si necesita cambiar la cita, póngase en contacto con nosotros.\n\n` +
      `Un saludo,\nSysefen\n\n` +
      `(Este correo se envía automáticamente. Por favor, no responda a esta dirección.)`,
  }));

  // --- correos a técnicos: una lista por persona ----------------------------------
  const porTecnico = new Map<string, { nombre: string; citas: Cita[] }>();
  for (const c of citas) {
    const email = c.empleado?.email_avisos;
    if (!esEmail(email)) continue;
    const k = String(email).trim().toLowerCase();
    if (!porTecnico.has(k)) porTecnico.set(k, { nombre: c.empleado!.nombre, citas: [] });
    porTecnico.get(k)!.citas.push(c);
  }
  const aTecnicos = [...porTecnico.entries()].map(([para, t]) => ({
    citas: t.citas.map((c) => c.id),
    para,
    asunto: `Tus citas de mañana (${t.citas.length}) · ${diaLargo(t.citas[0].inicio)}`,
    texto:
      `Hola ${t.nombre}, mañana tienes ${t.citas.length === 1 ? '1 cita' : t.citas.length + ' citas'}:\n\n` +
      t.citas.map((c) =>
        `· ${hora(c.inicio)} (${c.duracion_min} min) — ${c.cliente?.nombre || 'Cliente'}\n` +
        `  ${dondeDe(c) || 'Sin dirección'}` +
        `${c.categorias?.length ? `\n  ${listaCategorias(c.categorias)}` : ''}`,
      ).join('\n\n') +
      `\n\nLo tienes todo en la Agenda de la app.`,
  }));

  if (soloVer) {
    return json({
      fecha, citas: citas.length,
      clientes: aClientes.map((m) => ({ para: m.para, asunto: m.asunto })),
      tecnicos: aTecnicos.map((m) => ({ para: m.para, asunto: m.asunto })),
      sin_email_cliente: citas.filter((c) => !esEmail(c.cliente?.email)).map((c) => c.cliente?.nombre || c.id),
    });
  }

  // --- enviar ----------------------------------------------------------------------
  const enviar = async (para: string, asunto: string, texto: string) => {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE, to: [para], subject: asunto, text: texto }),
    });
    if (!r.ok) {
      const res = await r.json().catch(() => ({}));
      throw new Error((res as { message?: string }).message || String(r.status));
    }
  };

  const errores: string[] = [];
  let clientesOk = 0, tecnicosOk = 0;
  for (const m of aClientes) {
    try { await enviar(m.para, m.asunto, m.texto); clientesOk++; }
    catch (e) { errores.push(`${m.para}: ${(e as Error).message}`); }
  }
  for (const m of aTecnicos) {
    try { await enviar(m.para, m.asunto, m.texto); tecnicosOk++; }
    catch (e) { errores.push(`${m.para}: ${(e as Error).message}`); }
  }

  // Se marcan todas las citas revisadas: si una no tenía email, no hay a quién
  // avisar, y repetirla cada tarde no cambiaría nada.
  if (citas.length) {
    const { error: e2 } = await sb.from('citas')
      .update({ aviso_enviado_at: new Date().toISOString() })
      .in('id', citas.map((c) => c.id));
    if (e2) errores.push('marcar avisadas: ' + e2.message);
  }

  return json({ fecha, citas: citas.length, clientes_avisados: clientesOk, tecnicos_avisados: tecnicosOk, errores });
});
