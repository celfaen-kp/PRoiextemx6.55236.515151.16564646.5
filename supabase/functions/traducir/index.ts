// Sysefen · traducir · Las líneas del presupuesto en otro idioma (Enzo, 6-11-2026)
//
// POST {idioma:'en'|'ca'|'de', textos:[...]} con la sesión de la app (o x-clave
// desde otra función). Devuelve {textos:{original: traducción}}. Cada
// traducción se guarda en la tabla traducciones (sql/etapa100) y la próxima
// vez sale de ahí sin pedirla: las líneas del catálogo se repiten mucho.
// Traduce Claude (secreto ANTHROPIC_API_KEY), con las instrucciones de
// mantener marcas, modelos, cifras y unidades tal cual.
// Se despliega SIN verify_jwt (la sesión se comprueba aquí).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const IDIOMAS: Record<string, string> = { en: 'English (UK)', ca: 'Catalan', de: 'German' };
const MODELO = 'claude-opus-5-5';
const LOTE = 60; // textos por llamada
const MAX_TEXTOS = 300, MAX_LARGO = 3000;

const limpio = (v: unknown) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim();
async function hash(idioma: string, texto: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(idioma + '\n' + texto));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function instrucciones(idioma: string) {
  return `You translate text from Spanish into ${IDIOMAS[idioma]} for Sysefen, an installer of photovoltaic systems, batteries, aerothermal heat pumps, air conditioning and electrical installations in Mallorca (Spain). The texts are the lines of a customer quotation: product names, technical descriptions, section titles, notes and the installer's short messages to the customer.

Rules:
- Translate every text faithfully, in the natural professional register a local installer would use with a customer. Keep it the same length and structure as the original: no additions, no explanations, no omissions.
- Keep brand names, model and reference codes, numbers, units (kW, kWp, kWh, m², mm², A, V), percentages, prices and formatting characters (·, —, line breaks, parentheses) exactly as they are. Spanish number formatting (decimal comma, thousands point) stays as written.
- Technical terms: use the standard term of the target language (e.g. inverter/Wechselrichter/inversor, heat pump, DHW tank, string, surge protection, circuit breaker).
- If a text is already in the target language or has nothing to translate (a code, a number), return it unchanged.
- Return exactly one translation per input text, in the same order.`;
}

async function traducirLote(cliente: Anthropic, idioma: string, textos: string[]) {
  const r = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: instrucciones(idioma),
    messages: [{ role: 'user', content: 'Translate these ' + textos.length + ' texts. Input (JSON array of strings):\n' + JSON.stringify(textos) }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { traducciones: { type: 'array', items: { type: 'string' } } },
          required: ['traducciones'],
          additionalProperties: false,
        },
      },
    },
  } as any);
  if (r.stop_reason === 'refusal') throw new Error('el traductor rechazó el texto' + (r.stop_details && (r.stop_details as any).explanation ? ': ' + (r.stop_details as any).explanation : ''));
  const texto = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let salida: { traducciones?: unknown };
  try { salida = JSON.parse(texto); } catch { throw new Error('el traductor no devolvió JSON'); }
  const t = Array.isArray(salida.traducciones) ? salida.traducciones.map((x) => limpio(x)) : [];
  if (t.length !== textos.length) throw new Error('el traductor devolvió ' + t.length + ' textos de ' + textos.length);
  return t;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // Quién llama: la app con su sesión, u otra función con la clave interna.
  const CLAVE = Deno.env.get('AVISOS_CLAVE') || '';
  const interno = !!CLAVE && req.headers.get('x-clave') === CLAVE;
  if (!interno) {
    const autorizacion = req.headers.get('Authorization') || '';
    if (!autorizacion) return json({ error: 'Falta la sesión.' }, 401);
    const comoUsuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: autorizacion } } });
    const { data: { user } } = await comoUsuario.auth.getUser();
    if (!user) return json({ error: 'Sesión no válida.' }, 401);
    const { data: yo } = await sb.from('empleados').select('id, rol, activo').eq('user_id', user.id).maybeSingle();
    if (!yo || yo.activo === false) return json({ error: 'No eres empleado activo.' }, 403);
  }

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'Petición mal formada.' }, 400); }
  const idioma = String(b.idioma || '');
  if (!IDIOMAS[idioma]) return json({ error: 'Idioma no admitido: ' + idioma + ' (en, ca, de).' }, 400);
  const entrada: string[] = (Array.isArray(b.textos) ? b.textos : []).map(limpio).filter((t: string) => t);
  const textos = [...new Set(entrada)];
  if (textos.length > MAX_TEXTOS) return json({ error: 'Demasiados textos (máximo ' + MAX_TEXTOS + ').' }, 400);
  if (textos.some((t) => t.length > MAX_LARGO)) return json({ error: 'Hay un texto demasiado largo (máximo ' + MAX_LARGO + ' caracteres).' }, 400);
  const salida: Record<string, string> = {};
  if (!textos.length) return json({ textos: salida, nuevas: 0 });

  // 1 · Lo que ya está traducido.
  const hashes = new Map<string, string>();
  for (const t of textos) hashes.set(t, await hash(idioma, t));
  const { data: guardadas } = await sb.from('traducciones').select('hash, texto').eq('idioma', idioma).in('hash', [...hashes.values()]);
  const porHash = new Map((guardadas || []).map((g: { hash: string; texto: string }) => [g.hash, g.texto]));
  const faltan: string[] = [];
  for (const t of textos) { const h = hashes.get(t)!; if (porHash.has(h)) salida[t] = porHash.get(h)!; else faltan.push(t); }

  // 2 · El resto, a Claude, por lotes.
  if (faltan.length) {
    const KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
    if (!KEY) return json({ error: 'Falta el secreto ANTHROPIC_API_KEY: sin él no se pueden traducir las líneas.' }, 500);
    const cliente = new Anthropic({ apiKey: KEY });
    for (let i = 0; i < faltan.length; i += LOTE) {
      const lote = faltan.slice(i, i + LOTE);
      let t: string[];
      try { t = await traducirLote(cliente, idioma, lote); }
      catch (e) { return json({ error: 'No se pudo traducir: ' + (e as Error).message }, 502); }
      const filas = lote.map((orig, j) => ({ idioma, hash: hashes.get(orig)!, origen: orig, texto: t[j] || orig }));
      filas.forEach((f) => { salida[f.origen] = f.texto; });
      await sb.from('traducciones').upsert(filas, { onConflict: 'idioma,hash' });
    }
  }
  return json({ textos: salida, nuevas: faltan.length });
});
