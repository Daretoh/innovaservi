// Nómina mensual de trabajadores para un mandante (como la de Zerty · Cermaq de InnovaGestión): se marcan solos
// quienes tuvieron horas en ese cliente en el mes (acr_nomina_mes) y se pueden agregar o quitar. El PDF lleva el
// membrete de la empresa, los datos de la nómina, la tabla (N°, nombre, RUT, cargo, ingreso) y la firma del
// representante (si la empresa la tiene en Prevención SST). Se guarda como el archivo del mes del requisito.
import { abrirFormulario } from '../../core/ui/modal.js?v=3a264c0';
import { avisar } from '../../core/ui/aviso.js?v=3a264c0';
import { fechaLarga, hoyISO, nombreMes } from '../../core/ui/formato.js?v=3a264c0';
import { subirArchivo, eliminarArchivo } from '../../core/adjuntos.js?v=3a264c0';
import { nombreTercero } from './datos.js?v=3a264c0';

export const esNomina = (r) => /n[oó]mina/i.test(r.nombre);

export async function generarNomina(ctx, c, r, periodo, x) {
  const { data, error } = await ctx.api.rpc('acr_nomina_mes', { p_empresa: ctx.empresa.id, p_tercero: c.id, p_mes: periodo });
  if (error) { avisar(error.message, 'error'); return; }
  const conHoras = data.filter((p) => p.dias > 0).length;
  const mandante = nombreTercero(c);
  abrirFormulario({
    titulo: `Nómina de trabajadores · ${nombreMes(periodo)}`,
    mensaje: conHoras
      ? `Marcados los ${conHoras} que tienen horas en ${mandante} en ${nombreMes(periodo)}. Puedes agregar o quitar.`
      : `No hay horas registradas en ${mandante} ese mes: marca a mano quiénes van.`,
    campos: [
      { id: 'personas', etiqueta: 'Trabajadores', tipo: 'checks', valor: data.filter((p) => p.dias > 0).map((p) => p.persona_id),
        opciones: data.map((p) => [p.persona_id, `${p.nombre} · ${p.dias ? `${p.dias} día${p.dias > 1 ? 's' : ''}` : 'sin horas'}${p.activo ? '' : ' (inactivo)'}`]) },
      { id: 'destino', etiqueta: 'Después', opciones: [['ambos', 'Guardar como subido este mes y descargar'], ['subir', 'Solo guardar como subido'], ['descargar', 'Solo descargar']], valor: 'ambos' },
    ],
    textoGuardar: 'Generar nómina',
    alGuardar: async (v) => {
      const lista = data.filter((p) => v.personas.includes(p.persona_id));
      if (!lista.length) throw new Error('Marca al menos un trabajador.');
      const pdf = await pdfNomina(ctx, mandante, periodo, lista);
      const nombre = `nomina-trabajadores-${mandante.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${periodo}`;
      if (v.destino !== 'subir') pdf.guardar(nombre);
      if (v.destino === 'descargar') { avisar('Nómina descargada.'); return; }
      const archivo = new File([pdf.blob()], `${nombre}.pdf`, { type: 'application/pdf' });
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'acreditacion', archivo, tabla: 'acr_cumplimientos', tipos: ['application/pdf'] });
      const datos = { estado: 'subido', fecha: hoyISO(), archivo: ruta, nota: `Nómina generada (${lista.length} trabajador${lista.length === 1 ? '' : 'es'})` };
      const res = x
        ? await ctx.api.from('acr_cumplimientos').update(datos).eq('id', x.id)
        : await ctx.api.from('acr_cumplimientos').insert({ ...datos, empresa_id: ctx.empresa.id, requisito_id: r.id, periodo });
      if (res.error) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(res.error.message); }
      if (x?.archivo) await eliminarArchivo(ctx.api, x.archivo).catch(() => {});
      avisar('Nómina generada y guardada.');
      ctx.refrescar();
    },
  });
}

async function pdfNomina(ctx, mandante, periodo, lista) {
  const { nuevoPdf, cargarLogo } = await import('../../core/pdf.js?v=3a264c0');
  const e = ctx.empresa;
  const pdf = await nuevoPdf(ctx, { titulo: 'Nómina de trabajadores', subtitulo: `${mandante} · ${nombreMes(periodo)}` });
  pdf.tabla({ columnas: ['Dato', 'Detalle'], filas: [
    ['Empresa contratista', `${e.razon_social} · RUT ${e.rut}`], ['Empresa mandante', mandante],
    ['Período', nombreMes(periodo)], ['Total trabajadores', String(lista.length)],
  ] });
  pdf.tabla({ columnas: ['N°', 'Nombre completo', 'RUT', 'Cargo', 'Fecha de ingreso'],
    filas: lista.map((p, i) => [i + 1, p.nombre, p.rut, p.cargo || '', p.fecha_ingreso ? fechaLarga(p.fecha_ingreso) : '']) });

  // Firma del representante legal (de la configuración de Prevención SST, si existe y se puede leer)
  const { data: cfg } = await ctx.api.from('sst_config').select('representante, cargo_rep, firma_ruta, timbre_ruta').eq('empresa_id', e.id).maybeSingle().then((r) => r, () => ({ data: null }));
  const [firma, timbre] = cfg ? await Promise.all([cargarLogo(ctx.api, cfg.firma_ruta), cargarLogo(ctx.api, cfg.timbre_ruta)]) : [null, null];
  const doc = pdf.doc;
  const ancho = doc.internal.pageSize.getWidth();
  let y = pdf.y + 22;
  if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 40; }
  const x0 = ancho - 16 - 80;
  for (const [img, dx] of [[firma, 0], [timbre, 44]]) {
    if (!img) continue;
    const k = Math.min(36 / img.ancho, 20 / img.alto);
    doc.addImage(img.dataUrl, img.formato, x0 + dx, y - 21, img.ancho * k, img.alto * k);
  }
  doc.setDrawColor(120, 128, 140).setLineWidth(0.3).line(x0, y, x0 + 80, y);
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(28, 35, 48).text(cfg?.representante || 'Representante legal', x0 + 40, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(110, 116, 128).text(`${cfg?.cargo_rep || 'Representante legal'} · ${e.razon_social}`, x0 + 40, y + 9.5, { align: 'center' });
  return pdf;
}
