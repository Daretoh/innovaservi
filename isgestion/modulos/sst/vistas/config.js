// Firma y mandantes: datos del representante (con firma y timbre para los documentos) y
// los clientes que piden el informe mensual de accidentes.
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { boton } from '../../../core/ui/tabla.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=cb36eb2';
import { cargarConfig, cargarClientes } from '../datos.js?v=cb36eb2';

const IMAGENES = ['image/png', 'image/jpeg'];   // formatos que el PDF puede estampar

export default async function vista(ctx) {
  const [cfg, clientes] = await Promise.all([cargarConfig(ctx), cargarClientes(ctx)]);
  const editable = ctx.puede('sst', 'editar') && ctx.puede('sst', 'crear');

  // Actualizar o crear (la empresa del registro no se puede cambiar, por eso no se usa upsert)
  const guardarConfig = async (datos) => {
    const u = await ctx.api.from('sst_config').update(datos).eq('empresa_id', ctx.empresa.id).select('empresa_id');
    const { error } = u.error || u.data?.length ? u : await ctx.api.from('sst_config').insert({ empresa_id: ctx.empresa.id, ...datos });
    if (error) throw new Error(error.message);
    Object.assign(cfg, datos);
  };

  const campo = (id, etiqueta, ayuda) => {
    const c = el('input', { class: 'campo', id: `c-${id}`, value: cfg[id] ?? '', disabled: !editable });
    c.addEventListener('change', async () => {
      try { await guardarConfig({ [id]: c.value.trim() || (id === 'cargo_rep' ? 'Representante legal' : null) }); avisar('Guardado.'); } catch (e) { avisar(e.message, 'error'); }
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `c-${id}` }, etiqueta), c, ayuda ? el('span', { class: 'texto-suave texto-chico' }, ayuda) : null);
  };

  const imagen = async (col, titulo, ayuda) => {
    const ruta = cfg[col];
    const url = ruta ? await urlFirmada(ctx.api, ruta, 300).catch(() => null) : null;
    const entrada = el('input', { type: 'file', accept: IMAGENES.join(','), hidden: true });
    entrada.addEventListener('change', async () => {
      const archivo = entrada.files[0];
      if (!archivo) return;
      try {
        const { ruta: nueva } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'sst', archivo, tabla: 'sst_config', tipos: IMAGENES, maxBytes: 2 * 1024 * 1024 });
        try { await guardarConfig({ [col]: nueva }); } catch (e) { await eliminarArchivo(ctx.api, nueva).catch(() => {}); throw e; }
        if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {});
        avisar(`${titulo} guardado.`); ctx.refrescar();
      } catch (e) { avisar(e.message, 'error'); }
    });
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, titulo), el('span', { class: 'texto-suave texto-chico' }, ayuda)),
      url ? el('img', { class: 'sst-firma', src: url, alt: titulo }) : el('span', { class: 'chip chip-pend' }, 'Sin imagen'),
      editable ? el('div', { class: 'doc-acciones' },
        boton(url ? 'Cambiar' : 'Subir', { icono: 'descargar', onclick: () => entrada.click() }),
        url ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': `Quitar ${titulo.toLowerCase()}`, onclick: async () => {
          try { await guardarConfig({ [col]: null }); await eliminarArchivo(ctx.api, ruta).catch(() => {}); avisar('Quitado.'); ctx.refrescar(); } catch (e) { avisar(e.message, 'error'); }
        } }, icono('basura', { tam: 16 })) : null, entrada) : null);
  };

  // Mandantes que piden el informe mensual de accidentes
  const filaCliente = (c) => {
    const m = c.mandante;
    const pide = el('input', { type: 'checkbox', class: 'interruptor', checked: !!m?.pide_informe, disabled: !editable });
    const servicio = Object.assign(el('textarea', { class: 'campo', rows: 2, disabled: !editable || !m?.pide_informe, 'aria-label': `Servicio para ${c.nombre}`, placeholder: 'Texto "Servicio" del formulario (ej.: Higiene industrial, planta y dirección)' }), { value: m?.servicio ?? '' });
    const guardar = async (datos) => {
      const u = await ctx.api.from('sst_mandantes').update(datos).eq('tercero_id', c.id).select('tercero_id');
      const { error } = u.error || u.data?.length ? u : await ctx.api.from('sst_mandantes').insert({ empresa_id: ctx.empresa.id, tercero_id: c.id, ...datos });
      if (error) throw new Error(error.message);
    };
    pide.addEventListener('change', async () => {
      try { await guardar({ pide_informe: pide.checked }); servicio.disabled = !pide.checked; avisar(pide.checked ? `${c.nombre} pide el informe mensual.` : `${c.nombre} ya no pide el informe.`); }
      catch (e) { pide.checked = !pide.checked; avisar(e.message, 'error'); }
    });
    servicio.addEventListener('change', async () => { try { await guardar({ servicio: servicio.value.trim() || null }); avisar('Guardado.'); } catch (e) { avisar(e.message, 'error'); } });
    return el('div', { class: 'doc-fila sst-mandante' },
      el('label', { class: 'casilla' }, pide, el('strong', {}, c.nombre)), servicio);
  };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Firma y mandantes')),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Representante para los documentos'),
        campo('representante', 'Nombre del representante legal'),
        campo('cargo_rep', 'Cargo'),
        campo('telefono', 'Teléfono'),
        campo('direccion', 'Dirección', 'Si se deja vacía se usa la de la empresa.'),
        await imagen('firma_ruta', 'Firma', 'PNG sin fondo de preferencia. Va en el informe mensual de accidentes.'),
        await imagen('timbre_ruta', 'Timbre', 'Se estampa junto a la firma.')),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Mandantes que piden el informe mensual de accidentes'),
        el('p', { class: 'texto-suave texto-chico' }, 'Se avisa cada mes el informe pendiente del mes anterior. El texto "Servicio" se propone al generarlo.'),
        clientes.length ? clientes.map(filaCliente) : el('p', { class: 'texto-suave' }, 'No hay clientes. Créalos en Clientes y proveedores.'))));
}
