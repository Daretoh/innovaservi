// Sesión del usuario (Supabase Auth).
import { db } from './api.js?v=af5b0f2';

export async function sesionActual() {
  const { data, error } = await db().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function iniciarSesion(email, clave) {
  const { data, error } = await db().auth.signInWithPassword({ email, password: clave });
  if (error) {
    const msg = error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message;
    throw new Error(msg);
  }
  return data.session;
}

export async function cerrarSesion() {
  await db().auth.signOut();
}

export function alCambiarSesion(cb) {
  return db().auth.onAuthStateChange((evento, sesion) => cb(evento, sesion));
}
