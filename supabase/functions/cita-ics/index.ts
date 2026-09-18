// =============================================================================
// Sysefen · Edge Function `cita-ics`
//
// Sirve una cita como archivo de calendario (.ics) desde un enlace. Es lo que
// hay detrás del botón "Añadir a mi calendario" de los correos: al tocarlo, el
// iPhone abre Calendario y Android ofrece guardarla. El calendario es el DEL
// MÓVIL, el que use cada uno; no hace falta cuenta de Google ni nada.
//
// EL ENLACE VA FIRMADO: lleva un código sacado de AVISOS_CLAVE y del id de la
// cita, así que no se puede adivinar cambiando números en la dirección. Sin la
// firma correcta no se devuelve nada.
//
// SE LEE DE LA BASE CADA VEZ, así que si la cita cambió de hora, el enlace del
// correo viejo da la hora nueva. Y si se anuló, da un archivo de cancelación,
// que borra el evento del calendario.
//
// SECRETOS (Supabase → Edge Functions → Secrets):
//   AVISOS_CLAVE   la misma que usan la tarea de citas y `teamleader-leads`
//
// DESPLIEGUE: "Verify JWT" DESACTIVADO. Tiene que estarlo: quien abre el enlace
// es el cliente desde su correo, sin sesión de la app. Lo que protege es la
// firma.
//
// USO:  GET ?c=<id de la cita>&q=<c|t>&k=<firma>
//         q = c (el correo del cliente) o t (el del instalador)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const ZONA = 'Europe/Madrid';
const TEL = '+34 696 284 058';
const CATEGORIAS: Record<string, string> = {
  aerotermia: 'aerotermia',
  solar: 'paneles solares',
  electricidad: 'electricidad',
  aire_acondicionado: 'aire acondicionado',
};

const texto = (cuerpo: string, status = 200) =>
  new Response(cuerpo, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const limpio = (s: unknown) => String(s ?? '').trim();
const mayus = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lista = (n: string[]) =>
  n.length <= 1 ? (n[0] || '') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];

// La firma del enlace. Tiene que calcularse igual aquí y en `recordatorio-citas`.
async function firmaDe(clave: string, dato: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clave), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dato));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function mismaFirma(a: string, b: string) {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

const enUTC = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function lineaICS(campo: string, valor: string) {
  const v = String(valor || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
  let linea = campo + ':' + v;
  const trozos: string[] = [];
  while (linea.length > 73) { trozos.push(linea.slice(0, 73)); linea = ' ' + linea.slice(73); }
  trozos.push(linea);
  return trozos.join('\r\n');
}

// deno-lint-ignore no-explicit-any
function citaICS(d: any) {
  const inicio = new Date(d.inicio);
  const fin = new Date(inicio.getTime() + (d.duracion_min || 60) * 60000);
  const anulada = d.anulada === true;
  const secuencia = Math.max(0, Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sysefen//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:' + (anulada ? 'CANCEL' : 'PUBLISH'),
    'BEGIN:VEVENT',
    lineaICS('UID', d.id + '@sysefen.com'),
    'DTSTAMP:' + enUTC(new Date().toISOString()),
    'DTSTART:' + enUTC(d.inicio),
    'DTEND:' + enUTC(fin.toISOString()),
    'SEQUENCE:' + secuencia,
    'STATUS:' + (anulada ? 'CANCELLED' : 'CONFIRMED'),
    lineaICS('SUMMARY', d.titulo),
    d.donde ? lineaICS('LOCATION', d.donde) : '',
    d.detalle ? lineaICS('DESCRIPTION', d.detalle) : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    lineaICS('DESCRIPTION', d.titulo),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texto('Método no permitido.', 405);

  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  if (CLAVE.length < 24) return texto('Falta el secreto AVISOS_CLAVE.', 500);

  const url = new URL(req.url);
  const citaId = limpio(url.searchParams.get('c'));
  const quien = url.searchParams.get('q') === 't' ? 't' : 'c';
  const k = limpio(url.searchParams.get('k'));
  if (!/^[0-9a-f-]{36}$/i.test(citaId) || !k) return texto('Enlace incompleto.', 400);
  if (!mismaFirma(k, await firmaDe(CLAVE, citaId + '.' + quien))) return texto('Enlace no válido.', 403);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: c, error } = await sb.from('citas')
    .select(`id, inicio, duracion_min, categorias, direccion, poblacion, nota, estado,
      cliente:clientes_cache(nombre, direccion, poblacion),
      empleado:empleados!citas_empleado_id_fkey(nombre)`)
    .eq('id', citaId).maybeSingle();
  if (error) return texto('No se pudo leer la cita.', 500);
  if (!c || !c.inicio) return texto('Esa cita ya no está.', 404);

  const donde = [limpio(c.direccion) || limpio(c.cliente?.direccion),
    limpio(c.poblacion) || limpio(c.cliente?.poblacion)].filter(Boolean).join(', ');
  const motivo = lista((c.categorias || []).map((x: string) => CATEGORIAS[x] || x));
  const anulada = c.estado === 'anulada';

  const titulo = quien === 't'
    ? (anulada ? 'ANULADA · ' : '') + (limpio(c.cliente?.nombre) || 'Cliente') + (motivo ? ' · ' + mayus(motivo) : '')
    : 'Visita de Sysefen' + (motivo ? ' · ' + mayus(motivo) : '');
  const detalle = quien === 't'
    ? [motivo ? mayus(motivo) : '', limpio(c.nota) ? 'Nota: ' + limpio(c.nota) : '', 'Sysefen · ' + TEL].filter(Boolean).join('\n')
    : [motivo ? mayus(motivo) : '', limpio(c.empleado?.nombre) ? 'Le atenderá ' + limpio(c.empleado.nombre) : '', 'Sysefen · ' + TEL].filter(Boolean).join('\n');

  const ics = citaICS({ id: c.id, inicio: c.inicio, duracion_min: c.duracion_min, titulo, donde, detalle, anulada });

  return new Response(req.method === 'HEAD' ? null : ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8; method=' + (anulada ? 'CANCEL' : 'PUBLISH'),
      'Content-Disposition': 'attachment; filename="cita-sysefen.ics"',
      'Cache-Control': 'no-store',
    },
  });
});
