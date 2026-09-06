// Sysefen · Etapa 2
// Cliente único de Supabase. Antes esto estaba inline en index.html.
// Todos los módulos (supabase-auth.js, supabase-db.js) y la app importan
// SIEMPRE este mismo cliente para compartir la sesión de Supabase Auth.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://pcftuxqgzeacladtmaqx.supabase.co';

// Clave pública (publishable / anon). Es segura en el cliente: la seguridad
// real la imponen RLS + las políticas del archivo sql/etapa2_seguridad.sql.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ijYsYDVew8Ekm0-5ejQHHg_grqt2QMM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'sysefen_auth',
  },
});

export default supabase;
