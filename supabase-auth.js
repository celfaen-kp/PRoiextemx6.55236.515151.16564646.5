// Sysefen · Etapa 2
// Autenticación. Mantiene el login visual por PIN de 4 dígitos, pero por
// debajo usa Supabase Auth (email + contraseña internos, nunca visibles).
//
// - Los PIN NO se guardan en ningún sitio (ni base de datos ni localStorage).
// - El email/clave internos se derivan del empleado + PIN en el momento del login.
// - La sesión la gestiona Supabase (supabase-client.js, storageKey 'sysefen_auth').
//
// Esta capa todavía NO está enchufada al flujo de index.html (eso es Etapa 3).
// Se expone en window.Sysefen.auth para poder integrarla y probarla.

import { supabase } from './supabase-client.js';

// Mapa fijo de empleados conocidos -> cuenta interna de Supabase Auth.
// El nombre es el que ya se muestra en la pantalla de "¿Quién eres?".
export const CUENTAS = {
  Bayron:         { email: 'bayron@sysefen.app',         rol: 'jefe'    },
  Jaime:          { email: 'jaime@sysefen.app',          rol: 'jefe'    },
  David:          { email: 'david@sysefen.app',          rol: 'operario' },
  Ale:            { email: 'ale@sysefen.app',            rol: 'operario' },
  'Administración': { email: 'administracion@sysefen.app', rol: 'admin'   },
};

// Contraseña interna = PIN + 'sysefen'  (p.ej. 1111 -> "1111sysefen").
// Se calcula al vuelo; el PIN nunca se persiste.
function claveInterna(pin) {
  return String(pin).trim() + 'sysefen';
}

export function cuentaPorNombre(nombre) {
  return CUENTAS[nombre] || null;
}

export function listaEmpleadosLogin() {
  return Object.keys(CUENTAS).map((nombre) => ({ nombre, ...CUENTAS[nombre] }));
}

// Login con el PIN visual. Devuelve { user, session } de Supabase.
// `emailFallback` permite entrar a empleados dados de alta desde la app
// (no incluidos en el mapa fijo CUENTAS): su email viene de public.empleados.
// Lanza Error con mensaje corto en español si algo falla.
export async function loginConPin(nombre, pin, emailFallback) {
  const cuenta = cuentaPorNombre(nombre);
  const email = cuenta ? cuenta.email : (emailFallback || '').trim().toLowerCase();
  if (!email) throw new Error('Empleado no reconocido.');
  if (!/^\d{4}$/.test(String(pin))) throw new Error('El PIN son 4 números.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: claveInterna(pin),
  });

  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      throw new Error('PIN incorrecto.');
    }
    throw new Error('No se pudo entrar: ' + error.message);
  }
  return data;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function sesionActual() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function usuarioActual() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

// Fila de la tabla `empleados` vinculada al usuario autenticado (por user_id).
// null si no hay sesión o el empleado aún no está vinculado.
export async function empleadoActual() {
  const user = await usuarioActual();
  if (!user) return null;
  const { data, error } = await supabase
    .from('empleados')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return null;
  return data;
}

// cb(session) cada vez que cambia la sesión (login/logout/refresh).
// Devuelve función para cancelar la suscripción.
export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export default {
  CUENTAS,
  cuentaPorNombre,
  listaEmpleadosLogin,
  loginConPin,
  logout,
  sesionActual,
  usuarioActual,
  empleadoActual,
  onAuthChange,
};
