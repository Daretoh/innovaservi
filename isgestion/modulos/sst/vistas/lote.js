// Una entrega (lote, SST 006). Con ?doc=<clave>: un documento de la entrega (ej.: INV-PREV-08) con cada trabajador que lo
// recibió, si lo firmó, su PDF y el ZIP de ese documento. Sin doc: la entrega completa, con una fila por documento.
// Ruta: #/sst.lote?id=<lote_id>[&doc=<clave>]
import { el } from '../../../core/ui/dom.js?v=9dd99fc';
import { icono } from '../../../core/ui/iconos.js?v=9dd99fc';
import { boton } from '../../../core/ui/tabla.js?v=9dd99fc';
import { avisar } from '../../../core/ui/aviso.js?v=9dd99fc';
import { urlFirmada } from '../../../core/adjuntos.js?v=9dd99fc';
import { fechaLarga } from '../../../core/ui/formato.js?v=9dd99fc';
import { cargarPersonas } from '../datos.js?v=9dd99fc';
import { cargarDestinos, agrupar, barraAvance, elegirAcreditacion, claveDoc } from '../acreditacion.js?v=9dd99fc';

const chip = (ok, faltan = 0) => el('span', { class: `chip ${ok ? 'chip-ok' : 'chip-prox'}` }, ok ? 'Firmado' : faltan ? `Faltan ${faltan}` : 'Por firmar');

export default async function vista(ctx) {
  const [res, personas, dest] = await Promise.all([
    ctx.api.from('sst_entregas').select('id, tipo, tema, fecha, relator, estado, lote_id, acr_tercero_id, acr_sitio_id, documentos, created_at, sst_entrega_personas(persona_id, cargo)')
      .eq('empresa_id', ctx.empresa.id).eq('lote_id', ctx.params.id).is('deleted_at', null).order('created_at'),
    cargarPersonas(ctx, { todas: true }),
    cargarDestinos(ctx).catch(() => null),
  ]);
  if (res.error) throw res.error;
  const lista = ctx.ruta('sst.entregas');
  if (!res.data.length) return el('section', { class: 'listado' }, el('a', { class: 'volver', href: lista }, icono('volver', { tam: 16 }), 'Registros de entrega'), el('h1', {}, 'Entrega no encontrada'));
  const [g] = agrupar(res.data);
  const persona = (r) => {
    const pid = r.sst_entrega_personas[0]?.persona_id;
    const p = personas.de.get(pid) ?? { nombre: 'Persona' };
    return { ...p, id: pid, cargo: r.sst_entrega_personas[0]?.cargo ?? p.cargo };
  };
  const para = g.acr && g.acr !== 'varias' && dest ? dest.texto(...g.acr.split('|')) : g.acr === 'varias' ? 'Varias acreditaciones' : null;
  const ids = res.data.map((r) => r.id);
  const doc = ctx.params.doc ? g.documentos.find((d) => d.clave === ctx.params.doc) : null;

  const zip = (nombre, soloDoc = null, regs = ids) => boton('Descargar ZIP', { icono: 'descargar', title: 'Una carpeta por trabajador (firmado si ya firmó), en partes de hasta 19 MB', onclick: async (ev) => {
    const b = ev.currentTarget;
    const { descargarEntregasZip } = await import('../zip.js?v=9dd99fc');
    await descargarEntregasZip(ctx, regs, { nombre, soloDoc, boton: b });
  } });
  const enviar = (regs) => regs.length && ctx.puede('sst', 'editar') ? boton(`Enviar a firmar (${regs.length})`, { icono: 'chat', tipo: 'primario', title: 'Cada uno firma una vez y su sello queda en todos sus documentos de esta entrega', onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try {
      const { enviarVarios } = await import('../../../core/firmas.js?v=9dd99fc');
      await enviarVarios(ctx, regs.map((r) => ({ origen: 'sst_entrega', id: r.id, personas: [persona(r)], titulo: r.tema })), () => ctx.refrescar());
    } catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
  } }) : null;
  const bloquePara = el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, 'Para la acreditación de'),
      el('span', { class: para ? '' : 'texto-suave' }, para ?? 'Sin asignar: elige el mandante para verla en Acreditación')),
    ctx.puede('sst', 'editar') ? el('div', { class: 'doc-acciones' },
      boton(para ? 'Cambiar' : 'Asignar', { icono: 'editar', onclick: () => elegirAcreditacion(ctx, ids, g.acr === 'varias' ? '' : g.acr) })) : null);
  const verPdf = async (ruta) => {
    const v = window.open('', '_blank');
    try { const u = await urlFirmada(ctx.api, ruta, 300); if (v) v.location = u; else window.open(u, '_blank', 'noopener'); }
    catch (e) { v?.close(); avisar(e.message, 'error'); }
  };

  // ---- Un documento: quién lo recibió y quién lo firmó
  if (doc) {
    const items = [...doc.items].sort((a, b) => (a.firmado === b.firmado ? 0 : a.firmado ? 1 : -1) || persona(a.r).nombre.localeCompare(persona(b.r).nombre));
    const pendientes = items.filter((i) => !i.firmado).map((i) => i.r);
    const titulo = doc.codigo ? `${doc.codigo} · ${doc.nombre}` : doc.nombre;
    return el('section', { class: 'listado' },
      el('a', { class: 'volver', href: lista }, icono('volver', { tam: 16 }), 'Registros de entrega'),
      el('header', { class: 'listado-cabecera' },
        el('div', {}, el('h1', {}, titulo),
          el('p', { class: 'texto-suave' }, `Entrega individual del ${fechaLarga(g.fecha)}${g.primero.relator ? ` · Relator: ${g.primero.relator}` : ''} · ${doc.total} trabajador${doc.total === 1 ? '' : 'es'}`)),
        el('div', { class: 'listado-acciones' }, chip(doc.firmados === doc.total, doc.total - doc.firmados),
          zip(`${doc.codigo || doc.clave} ${fechaLarga(g.fecha)}${para ? ` ${para}` : ''}`, (d) => claveDoc(d) === doc.clave, items.map((i) => i.r.id)),
          enviar(pendientes))),
      el('div', { class: 'ficha doc-grupo' },
        barraAvance(doc.firmados, doc.total, `${doc.firmados} de ${doc.total} firmados`),
        bloquePara),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Trabajadores'),
        items.map(({ r, d, firmado }) => {
          const p = persona(r);
          return el('div', { class: 'doc-fila' },
            el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre),
              el('span', { class: 'texto-suave texto-chico' }, [p.rut, p.cargo, d.codigo && d.codigo !== doc.clave ? d.codigo : null].filter(Boolean).join(' · '))),
            el('div', { class: 'doc-acciones' }, chip(firmado),
              boton(firmado ? 'Ver firmado' : 'Ver PDF', { icono: 'ojo', onclick: () => verPdf(d.archivo_firmado || d.archivo) }),
              el('a', { class: 'boton-icono', href: ctx.ruta('sst.entrega', { id: r.id }), title: 'Registro de este trabajador', 'aria-label': `Registro de ${p.nombre}` }, icono('derecha', { tam: 16 }))));
        })),
      el('p', { class: 'texto-suave texto-chico' }, 'Cada trabajador firma una sola vez la entrega completa: su sello queda en todos sus documentos.'));
  }

  // ---- La entrega completa: una fila por documento y los trabajadores
  const pendientes = res.data.filter((r) => r.estado !== 'firmado');
  return el('section', { class: 'listado' },
    el('a', { class: 'volver', href: lista }, icono('volver', { tam: 16 }), 'Registros de entrega'),
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, g.documentos.length ? 'Entrega individual de documentos' : g.primero.tema),
        el('p', { class: 'texto-suave' }, `${fechaLarga(g.fecha)}${g.primero.relator ? ` · Relator: ${g.primero.relator}` : ''} · ${g.total} trabajador${g.total === 1 ? '' : 'es'}`)),
      el('div', { class: 'listado-acciones' }, zip(`Entrega ${fechaLarga(g.fecha)}${para ? ` ${para}` : ''}`), enviar(pendientes))),
    el('div', { class: 'ficha doc-grupo' },
      barraAvance(g.firmados, g.total, `${g.firmados} de ${g.total} trabajadores firmaron`),
      bloquePara),
    g.documentos.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, `Documentos (${g.documentos.length})`),
      g.documentos.map((d) => el('a', { class: 'doc-fila', href: ctx.ruta('sst.lote', { id: ctx.params.id, doc: d.clave }) },
        el('div', { class: 'doc-nombre' }, el('strong', {}, d.codigo ? `${d.codigo} · ${d.nombre}` : d.nombre),
          el('span', { class: 'texto-suave texto-chico' }, `${d.total} trabajador${d.total === 1 ? '' : 'es'}`)),
        el('div', { class: 'doc-acciones' }, barraAvance(d.firmados, d.total), chip(d.firmados === d.total, d.total - d.firmados), icono('derecha', { tam: 16 }))))) : null,
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'Trabajadores'),
      [...res.data].sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'firmado' ? 1 : -1) || persona(a).nombre.localeCompare(persona(b).nombre)).map((r) => {
        const p = persona(r);
        return el('a', { class: 'doc-fila', href: ctx.ruta('sst.entrega', { id: r.id }) },
          el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre),
            el('span', { class: 'texto-suave texto-chico' }, [p.rut, p.cargo, r.documentos?.length ? `${r.documentos.length} documentos` : null].filter(Boolean).join(' · '))),
          el('div', { class: 'doc-acciones' }, chip(r.estado === 'firmado'), icono('derecha', { tam: 16 })));
      })));
}
