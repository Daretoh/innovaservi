// Documentos PDF de Prevención SST con el membrete de la empresa: salida a atención médica,
// formulario de investigación de accidentes (informe mensual) y registro de entrega para firmar.
// Formatos tomados de InnovaGestión; los datos de la empresa salen de la empresa y de sst_config.
import { cargarJsPdf, cargarLogo, rgb, sellar, contactoEmpresa } from '../../core/pdf.js?v=3b97680';
import { nombreEmpresa } from '../../core/empresas.js?v=3b97680';
import { fechaLarga, hhmm } from '../../core/ui/formato.js?v=3b97680';
import { SINTOMAS, TIPOS_ACC, GRAVEDAD, mesTexto, nombreDe } from './datos.js?v=3b97680';

const M = 15;
const TEXTO = [28, 35, 48];
const GRIS = [91, 101, 118];
const LINEA = [190, 196, 205];
const SUAVE = [247, 248, 250];

// Documento A4 con membrete; devuelve utilidades para escribir de arriba hacia abajo con salto de página.
async function nuevoDoc(ctx, titulo, subtitulo = '') {
  const jsPDF = await cargarJsPdf();
  const e = ctx.empresa;
  const color = rgb(e.color);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const logo = await cargarLogo(ctx.api, e.logo_url);

  const membrete = () => {
    if (logo) {
      const k = Math.min(38 / logo.ancho, 15 / logo.alto);
      doc.addImage(logo.dataUrl, logo.formato, M, 9, logo.ancho * k, logo.alto * k);
    } else {
      doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...color).text(nombreEmpresa(e), M, 17);
    }
    doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(...TEXTO).text(e.razon_social, W - M, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...GRIS);
    [`RUT ${e.rut}`, e.direccion, contactoEmpresa(e, { direccion: false })].filter(Boolean).forEach((t, i) => doc.text(String(t), W - M, 16 + i * 3.8, { align: 'right' }));
    doc.setDrawColor(...color).setLineWidth(0.7).line(M, 26, W - M, 26);
    return 33;
  };

  let y = membrete();
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(...TEXTO).text(titulo, W / 2, y + 2, { align: 'center' });
  y += 7;
  if (subtitulo) { doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...GRIS).text(subtitulo, W / 2, y, { align: 'center' }); y += 6; }
  y += 3;

  const u = {
    doc, W, H, color,
    get y() { return y; },
    set y(v) { y = v; },
    espacio(alto) { if (y + alto > H - 18) { doc.addPage(); y = membrete(); } },
    seccion(t) {
      u.espacio(14);
      doc.setFillColor(...color).rect(M, y - 4.2, W - 2 * M, 6.2, 'F');
      doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(255, 255, 255).text(t, M + 2.5, y);
      y += 6;
    },
    // Tabla de dos columnas: [[etiqueta, valor], …]
    datos(filas, anchoEtiqueta = 52) {
      doc.autoTable({
        startY: y, body: filas.map(([k, v]) => [k, v == null || v === '' ? '' : String(v)]),
        margin: { left: M, right: M, top: 33, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 1.5, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2, minCellHeight: 6 },
        columnStyles: { 0: { cellWidth: anchoEtiqueta, fontStyle: 'bold', fillColor: SUAVE } },
        didDrawPage: (d) => { if (d.pageNumber > 1) membrete(); },
      });
      y = doc.lastAutoTable.finalY + 6;
    },
    tabla(cabeza, filas, opciones = {}) {
      doc.autoTable({
        startY: y, head: [cabeza], body: filas,
        margin: { left: M, right: M, top: 33, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.8, cellPadding: 1.5, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2, minCellHeight: 6 },
        headStyles: { fillColor: SUAVE, textColor: TEXTO, fontStyle: 'bold' },
        ...opciones,
        didDrawPage: (d) => { if (d.pageNumber > 1) membrete(); },
      });
      y = doc.lastAutoTable.finalY + 6;
    },
    parrafo(texto, { negrita = false, tam = 9.5 } = {}) {
      doc.setFont('helvetica', negrita ? 'bold' : 'normal').setFontSize(tam).setTextColor(...TEXTO);
      const lineas = doc.splitTextToSize(texto, W - 2 * M);
      for (const l of lineas) { u.espacio(5); doc.text(l, M, y); y += 4.6; }
      y += 2;
    },
    vinetas(lista) {
      doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...TEXTO);
      for (const t of lista) {
        const lineas = doc.splitTextToSize(t, W - 2 * M - 6);
        u.espacio(lineas.length * 4.6 + 1);
        doc.setFillColor(...color).circle(M + 1.6, y - 1.2, 0.8, 'F');
        doc.text(lineas, M + 5, y);
        y += lineas.length * 4.6 + 1;
      }
      y += 2;
    },
    // Casillas en columnas (marcadas o no)
    casillas(opciones, marcadas, columnas = 2) {
      const ancho = (W - 2 * M) / columnas;
      doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXTO);
      opciones.forEach((t, i) => {
        if (i % columnas === 0) u.espacio(6);
        const x = M + (i % columnas) * ancho;
        doc.setDrawColor(...GRIS).setLineWidth(0.3).rect(x, y - 3.2, 3.6, 3.6);
        if (marcadas.includes(t)) { doc.setDrawColor(...TEXTO).setLineWidth(0.6).line(x + 0.7, y - 1.4, x + 1.5, y - 0.3).line(x + 1.5, y - 0.3, x + 3, y - 2.6); }
        doc.text(t, x + 5.5, y);
        if (i % columnas === columnas - 1 || i === opciones.length - 1) y += 5.2;
      });
      y += 1;
    },
    // Firmas al pie: [{titulo, nombre, imagenes:[{dataUrl, formato, ancho, alto}]}]
    firmas(lista) {
      u.espacio(34);
      const ancho = (W - 2 * M - 10 * (lista.length - 1)) / lista.length;
      lista.forEach((f, i) => {
        const x = M + i * (ancho + 10);
        const base = y + 22;
        let xi = x + 4;
        for (const img of f.imagenes ?? []) {
          if (!img) continue;
          const k = Math.min(32 / img.ancho, 20 / img.alto);
          doc.addImage(img.dataUrl, img.formato, xi, base - 1 - img.alto * k, img.ancho * k, img.alto * k);
          xi += img.ancho * k + 4;
        }
        doc.setDrawColor(...TEXTO).setLineWidth(0.3).line(x, base, x + ancho, base);
        doc.setFont('helvetica', 'bold').setFontSize(8.5).setTextColor(...TEXTO).text(f.titulo, x + ancho / 2, base + 4, { align: 'center' });
        if (f.nombre) doc.setFont('helvetica', 'normal').text(doc.splitTextToSize(f.nombre, ancho), x + ancho / 2, base + 8, { align: 'center' });
      });
      y += 34;
    },
    terminar() {
      const n = doc.getNumberOfPages();
      for (let p = 1; p <= n; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...GRIS);
        doc.text(`${nombreEmpresa(e)} · ${titulo}`, M, H - 8);
        doc.text(`Página ${p} de ${n}`, W - M, H - 8, { align: 'right' });
      }
      return sellar(doc, { autor: e.razon_social, titulo });
    },
  };
  return u;
}

// Firma y timbre del representante (imágenes privadas) como imágenes para el PDF
export async function cargarFirmas(ctx, cfg) {
  const [firma, timbre] = await Promise.all([cargarLogo(ctx.api, cfg.firma_ruta), cargarLogo(ctx.api, cfg.timbre_ruta)]);
  return { firma, timbre };
}

// ---------------------------------------------------------------- Salida a atención médica
export async function pdfSalida(ctx, s, persona) {
  const u = await nuevoDoc(ctx, 'REGISTRO DE SALIDA A ATENCIÓN MÉDICA', 'Por síntomas leves o malestar general');
  const e = ctx.empresa;
  u.seccion('1. Datos del trabajador');
  u.datos([['Empresa', `${e.razon_social} · RUT ${e.rut}`], ['Fecha', fechaLarga(s.fecha)], ['Nombre completo', persona?.nombre], ['RUT', persona?.rut],
    ['Cargo', s.cargo], ['Área / faena', s.area]]);
  u.seccion('2. Motivo de la salida');
  u.parrafo('El trabajador informa presentar el siguiente malestar o síntoma:');
  u.casillas([...SINTOMAS, `Otro: ${s.otro ?? '________________'}`], [...(s.sintomas ?? []), ...(s.otro ? [`Otro: ${s.otro}`] : [])]);
  u.datos([['Descripción breve', s.descripcion]]);
  u.seccion('3. Horario y destino');
  u.datos([['Hora de aviso del malestar', s.hora_aviso ? `${hhmm(s.hora_aviso)} hrs.` : ''], ['Hora de salida autorizada', s.hora_salida ? `${hhmm(s.hora_salida)} hrs.` : ''],
    ['Centro médico', s.centro], ['Traslado', s.traslado], ...(s.observaciones ? [['Observaciones', s.observaciones]] : [])], 58);
  u.seccion('4. Declaración');
  u.parrafo('El trabajador declara que los síntomas informados no tienen relación con un accidente del trabajo ni con las labores que desempeña, y que la salida se autoriza para que acuda a atención médica por cuenta de su sistema de salud. Si el malestar tuviera origen laboral, deberá informarlo de inmediato a su jefatura para efectuar la denuncia correspondiente ante el organismo administrador de la Ley N° 16.744. El trabajador se compromete a informar el resultado de la atención y a presentar la licencia médica o comprobante de atención, si corresponde.');
  u.firmas([{ titulo: 'Firma del trabajador', nombre: persona?.nombre }, { titulo: 'Autorizado por', nombre: s.autorizado_por || 'Jefatura / supervisor' }]);
  return u.terminar();
}

// ---------------------------------------------------------------- Informe mensual de accidentes
// Sin accidentes: formulario con "no registra accidentes". Con accidentes: un formulario por accidente,
// llenado desde el registro de accidentes.
export async function pdfInformeAccidentes(ctx, { cfg, firmas, mandante, periodo, servicio, accidentes, personas }) {
  const e = ctx.empresa;
  const u = await nuevoDoc(ctx, 'FORMULARIO DE INVESTIGACIÓN DE ACCIDENTES DEL TRABAJO', `${mandante.razon_social ?? mandante.nombre} · ${mesTexto(periodo)}`);
  const sinTxt = `Por el presente documento se informa que la empresa ${e.razon_social}, RUT ${e.rut}, no registra accidentes del trabajo ni enfermedades profesionales en el mes de ${mesTexto(periodo)}.`;
  const tipo = nombreDe(TIPOS_ACC); const grav = nombreDe(GRAVEDAD);
  const lista = accidentes.length ? accidentes : [null];

  lista.forEach((a, i) => {
    if (i > 0) { u.doc.addPage(); u.y = 33; }
    const p = a?.persona_id ? personas.get(a.persona_id) : null;
    u.seccion('1. Antecedentes laborales');
    u.datos([['Empresa', e.razon_social], ['RUT', e.rut], ['Dirección', cfg.direccion || e.direccion], ['Teléfono', cfg.telefono],
      ['Representante legal', cfg.representante], ['Servicio', servicio]]);
    u.seccion('2. Antecedentes del accidente');
    u.datos(a ? [['Nombre', p?.nombre ?? '(sin lesionado)'], ['RUT', p?.rut], ['Cargo', p?.cargo], ['Tipo', `${tipo[a.tipo]} · ${grav[a.gravedad]}`],
      ['Fecha y hora', `${fechaLarga(a.fecha)}${a.hora ? ` · ${hhmm(a.hora)} hrs.` : ''}`], ['Lugar', a.lugar], ['Días perdidos', a.dias_perdidos], ['N° de denuncia (DIAT)', a.denuncia]]
      : [['Nombre', ''], ['RUT', ''], ['Cargo', ''], ['Fecha y hora', ''], ['Lugar', '']]);
    u.seccion('3. Descripción del accidente');
    u.datos(a ? [['Actividad que realizaba', a.actividad], ['Qué ocurrió', a.descripcion], ['Consecuencia y parte del cuerpo', a.lesion]]
      : [['Actividad que realizaba', sinTxt]]);
    u.seccion('4. Análisis de peligros y causas');
    u.datos(a ? [['Acción insegura', a.accion_insegura ? 'Sí' : 'No'], ['Condición insegura', a.condicion_insegura ? 'Sí' : 'No'], ['Causas', a.causas]]
      : [['Acción insegura', ''], ['Condición insegura', ''], ['Causas', '']]);
    u.seccion('5. Acciones para evitar que se repita');
    const medidas = a?.medidas?.length ? a.medidas.map((m) => [m.accion ?? '', m.responsable ?? '', m.plazo ?? '']) : [['', '', ''], ['', '', '']];
    u.tabla(['Acción de mejora', 'Responsable', 'Plazo'], medidas, { columnStyles: { 1: { cellWidth: 45 }, 2: { cellWidth: 30 } } });
    u.seccion('6. Testigos');
    const testigos = a?.testigos?.length ? a.testigos.map((t) => [t.nombre ?? '', t.cargo ?? '']) : [['', '']];
    u.tabla(['Nombre', 'Cargo'], testigos);
    u.seccion('7. Comentarios del representante de la empresa');
    u.parrafo(a ? `Se informa el accidente individualizado, ocurrido en ${mesTexto(periodo)}, con las medidas de control indicadas.` : sinTxt, { negrita: !a });
    u.firmas([{ titulo: cfg.cargo_rep || 'Representante legal', nombre: `${cfg.representante ?? ''}\n${e.razon_social}`, imagenes: [firmas.firma, firmas.timbre] }]);
  });
  return u.terminar();
}

// ---------------------------------------------------------------- Registro de entrega (para firmar)
const TITULO_ENTREGA = { capacitacion: 'REGISTRO DE CAPACITACIÓN', charla: 'REGISTRO DE CHARLA', epp: 'REGISTRO DE ENTREGA DE ELEMENTOS DE PROTECCIÓN PERSONAL', pts: 'REGISTRO DE ENTREGA E INSTRUCCIÓN DE PTS', otro: 'REGISTRO DE ENTREGA' };
export async function pdfEntrega(ctx, ent, personas) {
  const u = await nuevoDoc(ctx, TITULO_ENTREGA[ent.tipo], ent.tema);
  u.datos([['Tema', ent.tema], ['Fecha', fechaLarga(ent.fecha)], ['Relator / responsable', ent.relator], ...(ent.duracion ? [['Duración', ent.duracion]] : [])], 48);
  const puntos = (ent.contenido ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  if (puntos.length) { u.seccion(ent.tipo === 'epp' ? 'Instrucciones' : 'Contenido'); u.vinetas(puntos); }
  if (ent.items?.length) {
    u.seccion('Elementos entregados');
    u.tabla(['Elemento', 'Cantidad'], ent.items.map((x) => [x.item, String(x.cantidad ?? 1)]), { columnStyles: { 1: { cellWidth: 25, halign: 'center' } } });
  }
  u.seccion('Participantes');
  u.tabla(['N°', 'Nombre', 'RUT', 'Cargo', 'Firma'], personas.map((p, i) => [String(i + 1), p.nombre, p.rut ?? '', p.cargo ?? '', '']),
    { styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: TEXTO, lineColor: LINEA, lineWidth: 0.2, minCellHeight: 10 },
      columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 26 }, 3: { cellWidth: 36 }, 4: { cellWidth: 38 } } });
  const decl = ent.tipo === 'epp'
    ? 'Los trabajadores individualizados declaran recibir los elementos de protección personal indicados, en buen estado, y haber sido instruidos en su uso correcto, cuidado y reposición, comprometiéndose a usarlos durante su trabajo (D.S. N° 44 y artículo 68 de la Ley N° 16.744).'
    : ent.tipo === 'pts'
      ? 'Los trabajadores individualizados declaran haber recibido la instrucción y una copia del procedimiento indicado, haber comprendido su contenido y se comprometen a cumplirlo.'
      : 'Los trabajadores individualizados declaran haber recibido la capacitación, haber comprendido su contenido y se comprometen a cumplirlo.';
  u.parrafo(decl);
  u.firmas([{ titulo: 'Relator / responsable', nombre: ent.relator }]);
  return u.terminar();
}
