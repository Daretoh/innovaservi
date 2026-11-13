// Sesión del usuario (Supabase Auth).
import { db } from './api.js?v=7f910f1';

export async function sesionActual() {
  const { data, error } = await db().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function iniciarSesion(email, clave) {
  const { data, error } = await db().auth.signInWithPassword({ email, password: clave });
  if (error) {
    throw new Error(errorAuth(error));
  }
  return data.session;
}

// Mensajes de Supabase Auth en español (los demás pasan tal cual)
export function errorAuth(e) {
  const m = e?.message ?? String(e);
  if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/should be different from the old/i.test(m)) return 'La contraseña nueva debe ser distinta de la anterior.';
  if (/password should (be at least|contain)/i.test(m)) return 'La contraseña no cumple el largo o los caracteres pedidos.';
  if (/rate limit|security purposes|only request this after/i.test(m)) return 'Se pidieron demasiados correos seguidos: espera unos minutos y vuelve a intentar.';
  if (/session.*(missing|expired)|jwt expired|invalid.*(token|link)|otp.*expired/i.test(m)) return 'El enlace venció o ya se usó: pide uno nuevo con "¿Olvidaste tu contraseña?".';
  if (/email not confirmed/i.test(m)) return 'La cuenta aún no se activa: pide que te reenvíen la invitación.';
  return m;
}

// Correo con enlace para crear una contraseña nueva (plantilla "recuperar"); vuelve a la app, que la pide
export async function recuperarClave(email, redirectTo) {
  const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(errorAuth(error));
}

export async function cerrarSesion() {
  await db().auth.signOut();
}

export function alCambiarSesion(cb) {
  return db().auth.onAuthStateChange((evento, sesion) => cb(evento, sesion));
}
