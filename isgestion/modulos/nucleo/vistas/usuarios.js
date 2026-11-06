// Usuarios con acceso a la empresa activa: rol, ficha de trabajador y estado.
// Acceso con fecha de vencimiento y nota (como Accesos de InnovaGestión): vencido = sin acceso (acceso_vigente en la base).
import { urlApp } from '../../../core/api.js?v=7100fbc';
import { recuperarClave } from '../../../core/auth.js?v=7100fbc';
import { el } from '../../../core/ui/dom.js?v=7100fbc';
import { icono } from '../../../core/ui/iconos.js?v=7100fbc';
import { listado, boton } from '../../../core/ui/tabla.js?v=7100fbc';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7100fbc';
import { avisar } from '../../../core/ui/aviso.js?v=7100fbc';

export default async function vista(ctx) {
  const empresa = ctx.empresa.id;
  const [usuarios, roles] = await Promise.all([
    ctx.api.rpc('usuarios_empresa', { p_empresa: empresa }),
    ctx.api.from('roles').select('id, nombre, empresa_id').or(`empresa_id.is.null,empresa_id.eq.${empresa}`).order('nombre'),
  ]);
  if (usuarios.error) throw usuarios.error;
  if (roles.error) throw roles.error;

  const puedeEditar = ctx.puede('nucleo', 'editar');
  const opcionesRol = roles.data.map((r) => [r.id, r.empresa_id ? r.nombre : `${r.nombre} (plantilla)`]);

  const acciones = puedeEditar
    ? [boton('Invitar usuario', { icono: 'mas', tipo: 'primario', onclick: () => invitar(ctx, opcionesRol) })]
    : [];

  const columnas = [
    { titulo: 'Correo', valor: (u) => u.email },
    { titulo: 'Rol', valor: (u) => u.rol ?? 'Sin rol' },
    { titulo: 'Ficha', valor: (u) => u.persona ?? '' },
    { titulo: 'Estado', valor: (u) => el('span', {},
      el('span', { class: `etiqueta ${u.vigente ? '' : 'etiqueta-apagada'}` }, !u.activo ? 'Desactivado' : u.vigente ? 'Activo' : 'Vencido'),
      u.vence ? el('span', { class: 'texto-suave texto-chico' }, ` hasta ${new Date(`${u.vence}T12:00`).toLocaleDateString('es-CL')}`) : null,
      u.nota ? el('div', { class: 'texto-suave texto-chico' }, u.nota) : null) },
    { titulo: 'Último ingreso', valor: (u) => (u.ultimo_ingreso ? new Date(u.ultimo_ingreso).toLocaleString('es-CL') : 'Nunca') },
  ];
  if (puedeEditar) {
    columnas.push({
      titulo: '',
      valor: (u) => el('span', { class: 'listado-acciones' },
        !u.ultimo_ingreso && u.rol_id ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', title: 'Nunca entró: vuelve a enviar el correo de invitación (el enlace anterior vence)', onclick: (ev) => reenviar(ctx, u, ev.currentTarget) }, 'Reenviar invitación')
          : el('button', { type: 'button', class: 'boton-icono', title: 'Enviarle un correo para crear una contraseña nueva (si no puede entrar)', 'aria-label': `Enviar a ${u.email} un enlace para crear una contraseña nueva`, onclick: (ev) => enlaceClave(u, ev.currentTarget) }, icono('candado', { tam: 16 })),
        el('button', {
          type: 'button', class: 'boton-icono', title: 'Editar acceso', 'aria-label': `Editar acceso de ${u.email}`,
          onclick: () => editar(ctx, u, opcionesRol),
        }, icono('editar', { tam: 16 }))),
    });
  }

  return listado({
    titulo: 'Usuarios',
    filas: usuarios.data,
    acciones,
    columnas,
    vacio: 'Esta empresa no tiene usuarios.',
  });
}

// Si la cuenta existe, le da acceso; si no, le llega un correo para crear su contraseña.
// La creación de cuentas ocurre en la Edge Function invitar-usuario (clave de servicio en el servidor).
function invitar(ctx, opcionesRol) {
  abrirFormulario({
    titulo: 'Invitar usuario',
    mensaje: 'Si la persona aún no tiene cuenta, recibirá un correo para crear su contraseña.',
    campos: [
      { id: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true },
      { id: 'rol', etiqueta: 'Rol en esta empresa', opciones: opcionesRol, requerido: true },
    ],
    textoGuardar: 'Invitar',
    alGuardar: async (v) => {
      const { data, error } = await ctx.api.functions.invoke('invitar-usuario', {
        body: { empresa_id: ctx.empresa.id, email: v.email, rol_id: v.rol, redirect_to: urlApp() },
      });
      if (error) {
        let msg = error.message;
        try { msg = (await error.context.json()).error ?? msg; } catch { /* respuesta sin JSON */ }
        throw new Error(msg);
      }
      avisar(textoEstado(data, v.email), data.aviso ? 'error' : undefined);
      ctx.refrescar();
    },
  });
}

const textoEstado = (data, email) => (data.estado === 'invitado' ? `Invitación enviada a ${email}.`
  : data.estado === 'reenviado' ? `Invitación enviada de nuevo a ${email} (aún no la había aceptado).`
    : data.aviso ? `Tiene acceso, pero no se pudo reenviar la invitación: ${data.aviso}` : 'La cuenta ya existía: se le dio acceso.');

// Quien ya activó su cuenta pero no puede entrar (olvidó o no alcanzó a crear su contraseña): correo de recuperación
async function enlaceClave(u, btn) {
  if (!confirm(`¿Enviar a ${u.email} un correo para crear una contraseña nueva?`)) return;
  btn.disabled = true;
  try { await recuperarClave(u.email, urlApp()); avisar(`Correo enviado a ${u.email}: el enlace le pide una contraseña nueva.`); }
  catch (e) { avisar(e.message, 'error'); } finally { btn.disabled = false; }
}

// Reenviar la invitación a quien nunca entró (el enlace del correo vence): misma función, con su rol actual
async function reenviar(ctx, u, btn) {
  btn.disabled = true;
  try {
    const { data, error } = await ctx.api.functions.invoke('invitar-usuario', {
      body: { empresa_id: ctx.empresa.id, email: u.email, rol_id: u.rol_id, redirect_to: urlApp() },
    });
    if (error) {
      let msg = error.message;
      try { msg = (await error.context.json()).error ?? msg; } catch { /* respuesta sin JSON */ }
      throw new Error(msg);
    }
    avisar(data.estado === 'agregado' && !data.aviso ? `${u.email} ya activó su cuenta: puede entrar con su contraseña.` : textoEstado(data, u.email), data.aviso ? 'error' : undefined);
  } catch (e) { avisar(e.message, 'error'); } finally { btn.disabled = false; }
}

async function editar(ctx, u, opcionesRol) {
  // Fichas de personas con vínculo en esta empresa, para enlazar al usuario con su ficha.
  const { data: vinculos, error } = await ctx.api
    .from('persona_empresa')
    .select('persona_id, personas(nombres, apellido_paterno, rut)')
    .eq('empresa_id', ctx.empresa.id)
    .is('deleted_at', null);
  const fichas = error ? [] : vinculos.map((v) => [v.persona_id, `${v.personas.nombres} ${v.personas.apellido_paterno} · ${v.personas.rut}`]);

  abrirFormulario({
    titulo: `Acceso de ${u.email}`,
    campos: [
      { id: 'rol', etiqueta: 'Rol', opciones: opcionesRol, valor: u.rol_id },
      { id: 'persona', etiqueta: 'Ficha de trabajador', opciones: [['', 'Sin ficha'], ...fichas], valor: u.persona_id ?? '' },
      { id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Desactivado']], valor: String(u.activo) },
      { id: 'vence', etiqueta: 'Acceso hasta (opcional)', tipo: 'date', valor: u.vence ?? '', ayuda: 'Después de esa fecha no puede entrar a esta empresa (ej.: reemplazos o personal temporal). Vacío = sin vencimiento.' },
      { id: 'nota', etiqueta: 'Nota', tipo: 'textarea', valor: u.nota ?? '' },
    ],
    alGuardar: async (v) => {
      const { data, error: e } = await ctx.api
        .from('usuario_empresa')
        .update({ rol_id: v.rol, persona_id: v.persona || null, activo: v.activo === 'true', vence: v.vence || null, nota: v.nota.trim() || null })
        .eq('empresa_id', ctx.empresa.id)
        .eq('user_id', u.user_id)
        .select('user_id');
      if (e) throw new Error(e.message);
      if (!data.length) throw new Error('No tienes permiso para cambiar este acceso.');
      avisar('Acceso actualizado.');
      // Si cambié mi propio acceso, mis permisos pueden haber cambiado: recargar todo.
      if (u.user_id === ctx.usuario.id) location.reload();
      else ctx.refrescar();
    },
  });
}
