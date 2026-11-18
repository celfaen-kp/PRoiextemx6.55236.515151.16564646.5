// =============================================================================
// Sysefen · Edge Function `crear-lead`
//
// La puerta por la que los agentes de fuera (los que recogen los leads de Meta,
// Vaillant y Saunier Duval) meten un cliente nuevo en la app. Enzo, 18-11-2026:
// «lo ideal sería una función tipo "crear lead" en la app que ya compruebe
// duplicados, y que los agentes solo la llamen. Así las reglas quedan en la app
// y no repartidas.»
//
// AQUÍ SOLO SE REVISA LO QUE LLEGA (clave, campos, formato). La regla de los
// duplicados y el alta están en la base: función `crear_lead` (sql/etapa114),
// que es la misma regla que usa la ficha del cliente en la app.
//
// LO QUE DEVUELVE (siempre con "ok": true si se ha entendido):
//   "resultado": "nuevo"      se ha creado la ficha (cliente_id). Si alguien se
//                             llama igual, va en posibles_duplicados, de aviso.
//   "resultado": "duplicado"  ya había una ficha con ese teléfono o ese correo:
//                             no se crea otra; se apunta en la que hay.
//   "resultado": "repetido"   esa misma entrada (fuente + ref) ya había llegado:
//                             no se hace nada.
//
// NO TOCA TEAMLEADER. La ficha nace solo en la app (queda «pendiente de alta»;
// desde la ficha se puede crear en el CRM con su botón). A la hoja de clientes
// de Drive llega sola con la siguiente pasada de `teamleader-leads`.
//
// SECRETO (Supabase → Edge Functions → Secrets):
//   LEADS_CLAVE   la clave de los agentes. Es SOLO para esta función: no abre
//                 nada más de la app. Si se escapa, se cambia y listo.
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. La protege la cabecera `x-clave`.
// No lleva CORS a propósito: se llama de servidor a servidor, nunca desde un
// navegador.
//
// USO (POST con JSON, cabecera x-clave):
//   { "fuente": "vaillant", "ref": "V-2026-1234", "nombre": "Marta Riera",
//     "telefono": "+34 600 11 22 33", "email": "marta@ejemplo.es",
//     "poblacion": "Palma", "interes": "Aerotermia",
//     "mensaje": "Quiere cambiar la caldera de gasoil",
//     "respuestas": { "¿Vivienda habitual?": "Sí" } }
//   { ..., "prueba": true }   dice qué pasaría, sin guardar nada
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// --- PURO: inicio (pruebas/crear-lead.js carga este trozo tal cual) -----------
// De dónde puede venir un lead, y cómo se llama esa fuente en la app
// (AG_ORIGENES en index.html). Para añadir otra, se añade aquí y allí.
const FUENTES = { meta: 'Meta', vaillant: 'Vaillant', saunier: 'Saunier Duval', web: 'la web' };
const TIPOS = ['particular', 'empresa', 'comunidad'];
const MAX_MOTIVO = 3000;

const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const parrafo = (v, max) => String(v == null ? '' : v).replace(/\r/g, '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
  .filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim().slice(0, max);
const esCorreo = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// Las respuestas del formulario: un objeto { pregunta: respuesta } o una lista
// de { pregunta, respuesta }. Salen como líneas «pregunta: respuesta».
function lineasRespuestas(r) {
  let pares = [];
  if (Array.isArray(r)) pares = r.map((x) => [x && (x.pregunta || x.name || x.label), x && (x.respuesta != null ? x.respuesta : x.value)]);
  else if (r && typeof r === 'object') pares = Object.keys(r).map((k) => [k, r[k]]);
  return pares.slice(0, 40)
    .map(([k, v]) => [texto(k, 160), texto(Array.isArray(v) ? v.join(', ') : v, 400)])
    .filter(([k, v]) => k && v).map(([k, v]) => k + ': ' + v);
}

// Lo que se enseña en la ficha como «qué pidió»: interés, mensaje y formulario.
function motivoDe(b) {
  const interes = texto(b.interes, 160), mensaje = parrafo(b.mensaje, 2000);
  return [interes ? 'Interés: ' + interes : '', mensaje, lineasRespuestas(b.respuestas).join('\n')]
    .filter(Boolean).join('\n').slice(0, MAX_MOTIVO);
}

// Revisa lo que manda el agente. Devuelve { error, campo } o { p } con lo que
// se le pasa a la base, ya limpio.
function preparar(b, ahora) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'El cuerpo tiene que ser un objeto JSON.' };
  const fuente = texto(b.fuente, 40).toLowerCase();
  if (!FUENTES[fuente]) return { error: 'Fuente no admitida. Valen: ' + Object.keys(FUENTES).join(', ') + '.', campo: 'fuente' };
  const nombre = texto(b.nombre, 120);
  if (nombre.length < 2) return { error: 'Falta el nombre.', campo: 'nombre' };
  const telefono = texto(b.telefono, 40), email = texto(b.email, 160).toLowerCase();
  if (!telefono && !email) return { error: 'Hace falta un teléfono o un correo para poder llamarle.', campo: 'telefono' };
  if (telefono && telefono.replace(/\D/g, '').length < 9) return { error: 'El teléfono tiene menos de nueve cifras.', campo: 'telefono' };
  if (telefono && /[a-z]/i.test(telefono)) return { error: 'El teléfono lleva letras.', campo: 'telefono' };
  if (email && !esCorreo(email)) return { error: 'El correo no parece un correo.', campo: 'email' };
  const tipo = texto(b.tipo, 20).toLowerCase() || 'particular';
  if (TIPOS.indexOf(tipo) < 0) return { error: 'Tipo no admitido. Valen: ' + TIPOS.join(', ') + '.', campo: 'tipo' };
  let recibido = null;
  if (b.recibido_at != null && b.recibido_at !== '') {
    const t = Date.parse(String(b.recibido_at));
    if (Number.isNaN(t)) return { error: 'recibido_at no es una fecha (se espera ISO 8601).', campo: 'recibido_at' };
    // Un lead no puede haber llegado mañana: si viene con fecha futura, vale la de ahora.
    recibido = new Date(Math.min(t, ahora)).toISOString();
  }
  return {
    p: {
      fuente, fuente_nombre: FUENTES[fuente],
      ref: texto(b.ref, 160) || null,
      nombre, telefono: telefono || null, email: email || null, tipo,
      nif: texto(b.nif, 20).toUpperCase() || null,
      direccion: texto(b.direccion, 200) || null,
      poblacion: texto(b.poblacion, 80) || null,
      motivo: motivoDe(b) || null,
      recibido_at: recibido,
    },
  };
}
// --- PURO: fin ------------------------------------------------------------------

const MAX_CUERPO = 20000;

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

  const CLAVE = Deno.env.get('LEADS_CLAVE') || '';
  if (CLAVE.length < 32) return json({ ok: false, error: 'Falta el secreto LEADS_CLAVE.' }, 500);
  if (!mismaClave(req.headers.get('x-clave') || '', CLAVE)) return json({ ok: false, error: 'No autorizado.' }, 401);

  const crudo = await req.text().catch(() => '');
  if (crudo.length > MAX_CUERPO) return json({ ok: false, error: 'El cuerpo es demasiado grande.' }, 413);
  // deno-lint-ignore no-explicit-any
  let b: any = null;
  try { b = JSON.parse(crudo); } catch { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }

  const r = preparar(b, Date.now());
  if (r.error) return json({ ok: false, error: r.error, campo: r.campo || null }, 400);
  const prueba = b.prueba === true;

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  // Se guarda también lo que mandó el agente tal cual (sin la marca de prueba),
  // por si un día hay que ver qué llegó exactamente.
  const { prueba: _p, ...original } = b;
  const { data, error } = await sb.rpc('crear_lead', { p: { ...r.p, original }, p_prueba: prueba });
  if (error) {
    const falta = /crear_lead|schema cache|PGRST202/i.test(error.message);
    return json({ ok: false, error: falta ? 'Falta preparar la base: sql/etapa114_crear_lead.sql.' : 'No se pudo guardar: ' + error.message }, 500);
  }
  return json(data);
});
