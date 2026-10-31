// Bandeja de fichas de ingreso + enlace público para postulantes.
import { urlApp } from '../../../core/api.js?v=fb81a8b';
import { el } from '../../../core/ui/dom.js?v=fb81a8b';
import { icono } from '../../../core/ui/iconos.js?v=fb81a8b';
import { listado, boton } from '../../../core/ui/tabla.js?v=fb81a8b';
import { abrirFormulario } from '../../../core/ui/modal.js?v=fb81a8b';
import { avisar } from '../../../core/ui/aviso.js?v=fb81a8b';

const ESTADOS = [['pendiente', 'Pendientes'], ['postulante', 'En Postulantes'], ['incorporada', 'Incorporadas'], ['descartada', 'Descartadas']];
let estado = 'pendiente';

export default async function vista(ctx) {
  const [fichas, enlace] = await Promise.all([
    ctx.api.from('rrhh_fichas_ingreso')
      .select('id, created_at, rut, nombres, apellido_paterno, apellido_materno, datos, archivo_frente, archivo_reverso, estado, persona_id')
      .eq('empresa_id', ctx.empresa.id).eq('estado', estado).order('created_at', { ascending: false }).limit(300),
    ctx.api.rpc('rrhh_enlace_ficha', { p_empresa: ctx.empresa.id }),
  ]);
  if (fichas.error) throw fichas.error;
  if (enlace.error) throw enlace.error;

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    ESTADOS.map(([v, t]) => el('button', {
      type: 'button', 'aria-pressed': String(estado === v),
      onclick: () => { estado = v; ctx.refrescar(); },
    }, t)));

  const lista = listado({
    titulo: 'Fichas de ingreso',
    filas: fichas.data,
    acciones: [segmento],
    vacio: estado === 'pendiente' ? 'No hay fichas pendientes de revisar.' : 'No hay fichas en este estado.',
    columnas: [
      { titulo: 'Recibida', valor: (f) => new Date(f.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) },
      { titulo: 'Nombre', valor: (f) => el('a', { href: ctx.ruta('rrhh.ingreso', { f: f.id }) }, [f.nombres, f.apellido_paterno, f.apellido_materno].filter(Boolean).join(' ')) },
      { titulo: 'RUT', valor: (f) => f.rut },
      { titulo: 'Cargo', valor: (f) => f.datos?.cargo_postula ?? '' },
      { titulo: 'Teléfono', valor: (f) => f.datos?.telefono ?? '' },
      { titulo: 'Cédula', valor: (f) => (f.archivo_frente || f.archivo_reverso ? 'Adjunta' : 'Sin archivo') },
      { titulo: '', valor: (f) => el('a', { class: 'boton-enlace', href: ctx.ruta('rrhh.ingreso', { f: f.id }) }, 'Revisar', icono('derecha', { tam: 15 })) },
    ],
  });
  lista.insertBefore(cajaEnlace(ctx, enlace.data[0] ?? null), lista.children[1]);
  return lista;
}

function cajaEnlace(ctx, enlace) {
  const editable = ctx.puede('rrhh', 'editar');
  const url = enlace ? urlApp(`ficha/?t=${enlace.token}`) : '';
  const cambiar = async (params, texto) => {
    const { error } = await ctx.api.rpc('rrhh_enlace_ficha', { p_empresa: ctx.empresa.id, ...params });
    if (error) { avisar(error.message, 'error'); return; }
    avisar(texto);
    ctx.refrescar();
  };

  if (!enlace) {
    return el('div', { class: 'ficha caja-enlace' },
      el('strong', {}, 'Enlace para postulantes'),
      el('p', { class: 'texto-suave' }, 'Crea un enlace para que las personas que vas a contratar llenen su ficha y suban su cédula desde el celular.'),
      editable ? el('div', {}, boton('Crear enlace', { icono: 'mas', tipo: 'primario', onclick: () => cambiar({ p_regenerar: true }, 'Enlace creado.') })) : null);
  }
  return el('div', { class: 'ficha caja-enlace' },
    el('div', { class: 'caja-enlace-titulo' },
      el('strong', {}, 'Enlace para postulantes'),
      el('span', { class: `chip ${enlace.activo ? 'chip-ok' : 'chip-na'}` }, enlace.activo ? 'Activo' : 'Desactivado')),
    el('input', { class: 'campo', value: url, readonly: true, 'aria-label': 'Enlace para postulantes', onfocus: (ev) => ev.target.select() }),
    el('div', { class: 'listado-acciones' },
      boton('Copiar enlace', {
        icono: 'copiar', onclick: async () => {
          try { await navigator.clipboard.writeText(url); avisar('Enlace copiado. Envíalo por WhatsApp o correo.'); } catch { avisar('Selecciona el enlace y cópialo.', 'error'); }
        },
      }),
      editable ? boton(enlace.activo ? 'Desactivar' : 'Activar', {
        onclick: () => cambiar({ p_activo: !enlace.activo }, enlace.activo ? 'Enlace desactivado.' : 'Enlace activado.'),
      }) : null,
      editable ? boton('Generar uno nuevo', {
        onclick: () => abrirFormulario({
          titulo: 'Generar un enlace nuevo',
          mensaje: 'El enlace actual dejará de funcionar. Úsalo si se compartió con quien no debía.',
          campos: [],
          textoGuardar: 'Generar',
          alGuardar: () => cambiar({ p_regenerar: true }, 'Se generó un enlace nuevo.'),
        }),
      }) : null),
    el('p', { class: 'texto-suave texto-chico' }, 'Quien tenga este enlace puede enviar una ficha a esta empresa. No lo publiques en redes sociales.'));
}
