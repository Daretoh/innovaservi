// Informe mensual de accidentes por mandante: estado de cada mes y generación del formulario
// (sin accidentes o con los accidentes registrados ese mes en ese mandante).
import { el } from '../../../core/ui/dom.js?v=3a264c0';
import { icono } from '../../../core/ui/iconos.js?v=3a264c0';
import { boton } from '../../../core/ui/tabla.js?v=3a264c0';
import { abrirFormulario } from '../../../core/ui/modal.js?v=3a264c0';
import { avisar } from '../../../core/ui/aviso.js?v=3a264c0';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=3a264c0';
import { moverMes, nombreMes, rangoMes } from '../../../core/ui/formato.js?v=3a264c0';
import { mesActual, cargarClientes, cargarConfig, cargarPersonas } from '../datos.js?v=3a264c0';

const MESES = 6;   // meses que se muestran hacia atrás (desde el anterior)

export default async function vista(ctx) {
  const anterior = moverMes(mesActual(), -1);
  const meses = Array.from({ length: MESES }, (_, i) => moverMes(anterior, -i));
  const [clientes, inf, acc] = await Promise.all([
    cargarClientes(ctx),
    ctx.api.from('sst_informes').select('*').eq('empresa_id', ctx.empresa.id).gte('periodo', meses.at(-1)),
    ctx.api.from('sst_accidentes').select('id, tercero_id, fecha, tipo').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
      .neq('tipo', 'incidente').gte('fecha', `${meses.at(-1)}-01`),
  ]);
  if (inf.error) throw inf.error;
  if (acc.error) throw acc.error;
  const informe = new Map(inf.data.map((i) => [`${i.tercero_id}|${i.periodo}`, i]));
  const accDe = (t, p) => acc.data.filter((a) => a.tercero_id === t && a.fecha.startsWith(p));
  const mandantes = clientes.filter((c) => c.mandante?.pide_informe);
  const editable = ctx.puede('sst', 'crear') && ctx.puede('sst', 'editar');

  const celda = (c, p) => {
    const i = informe.get(`${c.id}|${p}`);
    const n = accDe(c.id, p).length;
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, nombreMes(p)),
        el('span', { class: 'texto-suave texto-chico' }, n ? `${n} ${n === 1 ? 'accidente registrado' : 'accidentes registrados'}` : 'Sin accidentes registrados')),
      i ? el('span', { class: 'chip chip-ok' }, i.sin_accidentes ? 'Generado · sin accidentes' : 'Generado · con accidentes')
        : p === anterior ? el('span', { class: 'chip chip-venc' }, 'Pendiente') : el('span', { class: 'chip chip-pend' }, 'Sin informe'),
      el('div', { class: 'doc-acciones' },
        i?.pdf_ruta ? boton('Ver', { icono: 'ojo', onclick: async () => { try { window.open(await urlFirmada(ctx.api, i.pdf_ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } } }) : null,
        editable ? boton(i ? 'Rehacer' : 'Generar', { icono: 'descargar', tipo: i ? 'secundario' : 'primario', onclick: () => generar(ctx, c, p, i, n) }) : null));
  };

  const pendientes = mandantes.filter((c) => !informe.has(`${c.id}|${anterior}`));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, 'Informe mensual de accidentes'),
      el('a', { class: 'boton boton-secundario', href: ctx.ruta('sst.config') }, 'Mandantes y firma')),
    pendientes.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }),
      `Pendiente el informe de ${nombreMes(anterior)}: ${pendientes.map((c) => c.nombre).join(' · ')}`) : null,
    mandantes.length
      ? mandantes.map((c) => el('div', { class: 'ficha doc-grupo' }, el('h2', {}, c.nombre), meses.map((p) => celda(c, p))))
      : el('p', { class: 'texto-suave' }, 'Ningún mandante pide el informe. Márcalos en "Firma y mandantes".'),
    el('p', { class: 'texto-suave texto-chico' }, 'Se genera con los accidentes registrados ese mes en ese mandante (los incidentes sin lesión no van). Si no hay, sale "no registra accidentes". Luego se sube a la plataforma del mandante.'));
}

function generar(ctx, c, periodo, actual, n) {
  abrirFormulario({
    titulo: `Informe de ${nombreMes(periodo)} · ${c.nombre}`,
    mensaje: n === 1 ? 'Se generará el formulario con el accidente registrado ese mes.' : n ? `Se generará un formulario por cada uno de los ${n} accidentes registrados.` : 'No hay accidentes registrados: el informe dirá que no registra accidentes ni enfermedades profesionales.',
    campos: [{ id: 'servicio', etiqueta: 'Servicio (texto del formulario)', tipo: 'textarea', valor: actual?.servicio ?? c.mandante?.servicio ?? '' }],
    textoGuardar: 'Generar y guardar',
    alGuardar: async (v) => {
      const [{ pdfInformeAccidentes, cargarFirmas }, cfg, personas] = await Promise.all([import('../documentos.js?v=3a264c0'), cargarConfig(ctx), cargarPersonas(ctx, { todas: true })]);
      if (!cfg.representante) throw new Error('Falta el nombre del representante en "Firma y mandantes".');
      const { desde, hasta } = rangoMes(periodo);
      const { data: accidentes, error } = await ctx.api.from('sst_accidentes').select('*').eq('empresa_id', ctx.empresa.id).eq('tercero_id', c.id)
        .is('deleted_at', null).neq('tipo', 'incidente').gte('fecha', desde).lte('fecha', hasta).order('fecha');
      if (error) throw new Error(error.message);
      const servicio = v.servicio.trim() || null;
      const doc = await pdfInformeAccidentes(ctx, { cfg, firmas: await cargarFirmas(ctx, cfg), mandante: c, periodo, servicio, accidentes, personas: personas.de });
      const archivo = new File([doc.output('blob')], `informe-accidentes-${periodo}.pdf`, { type: 'application/pdf' });
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'sst', archivo, tabla: 'sst_informes' });
      const datos = { servicio, sin_accidentes: !accidentes.length, pdf_ruta: ruta };
      const r = actual
        ? await ctx.api.from('sst_informes').update(datos).eq('id', actual.id)
        : await ctx.api.from('sst_informes').insert({ ...datos, empresa_id: ctx.empresa.id, tercero_id: c.id, periodo });
      if (r.error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(r.error.message); }
      if (actual?.pdf_ruta) await eliminarArchivo(ctx.api, actual.pdf_ruta).catch(() => {});
      if (servicio && servicio !== c.mandante?.servicio) await ctx.api.from('sst_mandantes').update({ servicio }).eq('tercero_id', c.id);
      window.open(doc.output('bloburl'), '_blank', 'noopener');
      avisar('Informe generado y guardado.');
      ctx.refrescar();
    },
  });
}
