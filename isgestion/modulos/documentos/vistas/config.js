// Datos de la empresa para los documentos y firmas (representante, timbre y prevencionista). Las firmas son imágenes
// privadas (PNG o JPG; mejor con fondo blanco o transparente). Si no hay firmas aquí, se usan las de Prevención SST.
import { el } from '../../../core/ui/dom.js?v=25e9201';
import { icono } from '../../../core/ui/iconos.js?v=25e9201';
import { boton } from '../../../core/ui/tabla.js?v=25e9201';
import { avisar } from '../../../core/ui/aviso.js?v=25e9201';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=25e9201';

const CAMPOS = [
  ['Membrete', [['ciudad', 'Ciudad (donde se firman los contratos)'], ['direccion', 'Dirección (calle y número, sin la ciudad)'], ['region', 'Región'],
    ['mutual', 'Organismo administrador de la Ley 16.744 (mutual)']]],
  ['Representante legal', [['representante', 'Nombre completo'], ['rep_rut', 'RUT'], ['rep_cargo', 'Cargo']]],
  ['Prevención de riesgos', [['prevencionista', 'Prevencionista (relator y quien elabora los PTS)'], ['prev_cargo', 'Cargo']]],
  ['Ley Karin (protocolo)', [['karin_responsable', 'Responsable del protocolo'], ['karin_receptor', 'Quién recibe las denuncias (nombre y cargo)'],
    ['karin_correo', 'Correo para denuncias'], ['karin_canal', 'Canal alternativo (correo u otro)']]],
];
const FIRMAS = [['firma_ruta', 'Firma del representante'], ['timbre_ruta', 'Timbre de la empresa'], ['firma_prev_ruta', 'Firma del prevencionista']];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const { data, error } = await ctx.api.from('gen_config').select('*').eq('empresa_id', e).maybeSingle();
  if (error) throw error;
  const c = data ?? {};
  const editable = ctx.puede('documentos', 'editar');
  const volver = el('a', { class: 'volver', href: ctx.ruta('documentos.generar') }, icono('volver', { tam: 16 }), 'Generar documentos');

  const form = el('form', { class: 'ficha-datos' },
    CAMPOS.map(([titulo, campos]) => el('div', { class: 'ficha' }, el('h2', {}, titulo),
      el('div', { class: 'rejilla-campos' }, campos.map(([id, etiqueta]) => el('div', { class: 'form-fila' },
        el('label', { for: `gc-${id}` }, etiqueta),
        el('input', { id: `gc-${id}`, name: id, class: 'campo', value: c[id] ?? '', disabled: !editable })))))),
    editable ? el('div', {}, boton('Guardar datos', { icono: 'check', tipo: 'primario', type: 'submit' })) : el('p', { class: 'texto-suave' }, 'Tu rol solo permite ver estos datos.'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const datos = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x).trim() || null]));
    for (const k of ['mutual', 'rep_cargo', 'prev_cargo', 'karin_responsable']) if (!datos[k]) delete datos[k];
    const r = data
      ? await ctx.api.from('gen_config').update(datos).eq('empresa_id', e).select('empresa_id')
      : await ctx.api.from('gen_config').insert({ empresa_id: e, ...datos }).select('empresa_id');
    if (r.error || !r.data?.length) { avisar(r.error?.message ?? 'No tienes permiso.', 'error'); return; }
    avisar('Datos guardados.'); ctx.refrescar();
  });

  const firma = ([id, titulo]) => {
    const img = el('img', { class: 'gc-firma', alt: titulo, hidden: true });
    if (c[id]) urlFirmada(ctx.api, c[id], 300).then((u) => { img.src = u; img.hidden = false; }).catch(() => {});
    const archivo = el('input', { type: 'file', accept: 'image/png,image/jpeg', hidden: true, onchange: async () => {
      const f = archivo.files[0]; if (!f) return;
      try {
        const { ruta } = await subirArchivo(ctx.api, { empresaId: e, modulo: 'documentos', archivo: f, tabla: 'gen_config', tipos: ['image/png', 'image/jpeg'], maxBytes: 2 * 1024 * 1024 });
        const r = data ? await ctx.api.from('gen_config').update({ [id]: ruta }).eq('empresa_id', e).select('empresa_id')
          : await ctx.api.from('gen_config').insert({ empresa_id: e, [id]: ruta }).select('empresa_id');
        if (r.error || !r.data?.length) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(r.error?.message ?? 'No tienes permiso.'); }
        if (c[id]) await eliminarArchivo(ctx.api, c[id]).catch(() => {});
        avisar(`${titulo} guardada.`); ctx.refrescar();
      } catch (err) { avisar(err.message, 'error'); }
    } });
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, titulo), el('span', { class: 'texto-suave texto-chico' }, c[id] ? 'Cargada' : 'Sin cargar'), img),
      editable ? el('div', { class: 'doc-acciones' }, boton(c[id] ? 'Cambiar' : 'Subir', { icono: 'mas', onclick: () => archivo.click() }), archivo,
        c[id] ? boton('Quitar', { icono: 'basura', onclick: async () => {
          const r = await ctx.api.from('gen_config').update({ [id]: null }).eq('empresa_id', e);
          if (r.error) { avisar(r.error.message, 'error'); return; }
          await eliminarArchivo(ctx.api, c[id]).catch(() => {});
          avisar('Quitada.'); ctx.refrescar();
        } }) : null) : null);
  };

  return el('section', { class: 'listado' }, volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Datos para los documentos'),
      el('p', { class: 'texto-suave' }, 'La razón social, el RUT y el logo salen de Administración → Empresa.'))),
    form,
    el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Firmas y timbre'),
      el('p', { class: 'texto-suave texto-chico' }, 'Foto o escaneo en PNG o JPG, idealmente con fondo blanco o transparente (máx. 2 MB). Si no hay, se usan las de Prevención SST.'),
      FIRMAS.map(firma)));
}
