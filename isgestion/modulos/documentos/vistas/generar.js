// Generador de documentos (como en InnovaGestión): documentos del trabajador (contrato, perfil de cargo, ficha de
// datos, entrega de EPP, IRL y registros de entrega de PTS), formatos para firmar (registro de capacitación,
// evaluación de aprendizaje, entrega de EPP e IRL en blanco) y documentos de la empresa (PTS, matriz e instructivo
// IPER, programa preventivo, Ley Karin, emergencias y accidentes, matriz de EPP y capacitaciones).
import { el } from '../../../core/ui/dom.js?v=6f116b3';
import { icono } from '../../../core/ui/iconos.js?v=6f116b3';
import { boton } from '../../../core/ui/tabla.js?v=6f116b3';
import { avisar } from '../../../core/ui/aviso.js?v=6f116b3';
import { abrirDocumento } from '../editor.js?v=6f116b3';
import { generador } from '../servicios.js?v=6f116b3';
import { enviarAFirmar } from '../../../core/firmas.js?v=6f116b3';
import { guardarEnRrhh, puedeGuardarRrhh, puedeGuardarSst } from '../acciones.js?v=6f116b3';

const estado = { persona: '' };
const DEL_TRABAJADOR = ['contrato', 'perfil', 'datos', 'epp', 'odi'];

export default async function vista(ctx) {
  const G = await generador(ctx);
  const { P, faltan, todos, formato, evaluaciones, abrirCharla, abrirChecklist, firmarPdf, docEmpresa, lineaVersion } = G;
  const actual = G.actualDe(estado.persona);
  // ---- Documentos del trabajador
  const selector = el('select', { class: 'campo', 'aria-label': 'Trabajador', onchange: (ev) => { estado.persona = ev.currentTarget.value; ctx.refrescar(); } },
    el('option', { value: '' }, 'Elige el trabajador…'),
    todos.map((x) => el('option', { value: x.v.persona_id, selected: x.v.persona_id === estado.persona }, `${x.t.nombre}${x.v.estado === 'activo' ? '' : ' (inactivo)'}`)));
  const docTrabajador = (slug) => {
    const g = P.DOC_GEN[slug];
    abrirDocumento({
      titulo: `${g.nombre} · ${actual.t.nombre}`, nombreArchivo: `${slug}-${actual.t.nombre}`, autor: ctx.empresa.razon_social, firmaDe: actual.v.persona_id,
      variantes: g.variantes ? P.DG_VARS : null, variante: g.variantes ? P.varDefault(actual.t) : null,
      construir: (v) => g.build(actual.t, v),
      guardar: puedeGuardarRrhh(ctx) ? { texto: 'Guardar en la ficha', alGuardar: async (blob, x) => {
        await guardarEnRrhh(ctx, slug, actual.v.persona_id, blob, x.nombre, g.nombre);
        avisar('Documento generado y guardado en la ficha del trabajador.');
      } } : null,
      // Firma por WhatsApp: queda en la ficha por firmar y se entrega firmado cuando la persona firma
      firmar: puedeGuardarRrhh(ctx) ? { texto: 'Enviar a firmar por WhatsApp', alFirmar: async (blob, x) => {
        const id = await guardarEnRrhh(ctx, slug, actual.v.persona_id, blob, x.nombre, g.nombre, { porFirmar: true });
        await enviarAFirmar(ctx, { origen: 'rrhh_documento', id, titulo: g.nombre, casillas: x.casillas, personas: [{ id: actual.v.persona_id, nombre: actual.t.nombre, telefono: actual.t.telefono }] });
      } } : null,
    });
  };
  const tarjetaDoc = (titulo, sub, alAbrir, extra = null) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, titulo), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null),
    el('div', { class: 'doc-acciones' }, extra, boton('Abrir', { icono: 'documento', onclick: alAbrir })));

  const seccionTrabajador = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Del trabajador'),
    el('p', { class: 'texto-suave texto-chico' }, `Se completan con su ficha. ${puedeGuardarRrhh(ctx) ? 'Al guardar quedan en su documentación de RRHH.' : 'Tu rol no guarda en RRHH: se descargan.'}`),
    el('label', { class: 'form-fila' }, 'Trabajador', selector),
    actual ? [
      ...DEL_TRABAJADOR.map((slug) => tarjetaDoc(P.DOC_GEN[slug].nombre, P.DOC_GEN[slug].variantes ? 'Formato según el cargo (operario, prevención o prevención y administración)' : null, () => docTrabajador(slug))),
      el('h3', { class: 'doc-sub' }, 'Registros de entrega de PTS'),
      ...Object.keys(P.DOC_GEN).filter((s) => s.startsWith('pts_')).map((slug) => tarjetaDoc(P.DOC_GEN[slug].nombre, null, () => docTrabajador(slug))),
    ] : el('p', { class: 'texto-suave' }, 'Elige un trabajador para ver sus documentos.'));

  // ---- Formatos para firmar (en blanco o con los trabajadores elegidos)
  const seccionFormatos = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Formatos para firmar'),
    el('p', { class: 'texto-suave texto-chico' }, 'Con membrete, en blanco o con los trabajadores que elijas (nombre, RUT y cargo).'),
    tarjetaDoc('Registro de capacitación (lista de asistencia)', 'Capacitaciones, entrega de PTS o charla libre: el tema y el temario se completan solos', () => formato('Registro de capacitación', {
      variantes: P.opcionesRegistro(), personas: 'lista', construir: (v, PER) => P.docAsistencia(v, PER) })),
    evaluaciones.length ? tarjetaDoc('Evaluación de aprendizaje (individual)', 'Una por trabajador, o la pauta de corrección del relator', () => formato('Evaluación de aprendizaje', {
      variantes: evaluaciones, personas: 'lista', construir: (v, PER) => (/\|pauta$/.test(v || '') ? P.docEvaluacion(v) : P.porPersona(PER, (t) => P.docEvaluacion(v, t))) })) : null,
    tarjetaDoc('Entrega de elementos de protección personal', null, () => formato('Entrega de EPP', { personas: 'lista', construir: (v, PER) => P.porPersona(PER, (t) => P.docEPP(t)) })),
    tarjetaDoc('Información de riesgos laborales (IRL)', null, () => formato('IRL', { personas: 'lista', construir: (v, PER) => P.porPersona(PER, (t) => P.docODI(t)) })),
    tarjetaDoc('Charla diaria de autocuidado (con lista de asistencia)', 'Elige una de las 30 charlas; propone la que sigue a la última registrada', abrirCharla),
    tarjetaDoc('Charlas diarias: las 30 charlas juntas', 'Guía completa para quien las dicta', () => formato('Charlas diarias', { nombreArchivo: 'charlas-diarias', construir: () => P.docCharlasTodas() })),
    tarjetaDoc('Checklist de seguridad y ejecución · diluidores de sal', 'Ítems marcables, medición de gases y firmas', abrirChecklist),
    tarjetaDoc('Carta (formato editable)', 'En blanco o carta de compromiso (sin examen de altura / espacios confinados), con la lista de trabajadores y la firma del representante legal',
      () => formato('Carta', { variantes: P.opcionesCarta(), personas: 'lista', construir: (v, PER) => P.docCarta(v, PER) })),
    tarjetaDoc('Firmar un PDF', 'Sube un PDF (por ejemplo, la matriz IPER) y agrégale la firma, el timbre y la firma de la prevencionista guardados', firmarPdf));

  // ---- Documentos de la empresa

  const carpetas = P.EMP_CARPETAS.filter((c) => c.k !== 'legal').map((c) => el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, c.n),
    c.tipos.filter(([slug]) => P.EMP_GEN[slug] || P.PTS_DOC[slug] || slug === 'pts_funciones').map(([slug, nombre]) => {
      const editable = P.PTS_DOC[slug] && ctx.puede('documentos', 'editar');
      return tarjetaDoc(nombre, lineaVersion(slug), () => docEmpresa(slug, nombre),
        editable ? boton('Editar', { icono: 'editar', onclick: () => { location.hash = ctx.ruta('documentos.pts', { s: slug }); } }) : null);
    })));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Generar documentos'), el('p', { class: 'texto-suave' }, 'Con el membrete y los datos de la empresa; se revisan y completan antes de descargar o guardar.')),
      ctx.puede('documentos', 'editar') ? el('div', { class: 'listado-acciones' }, boton('Datos de la empresa y firmas', { icono: 'ajustes', onclick: () => { location.hash = ctx.ruta('documentos.config'); } })) : null),
    faltan.length ? el('a', { class: 'aviso-bandeja', href: ctx.ruta('documentos.config') }, icono('alerta', { tam: 16 }), `Faltan datos para los documentos: ${faltan.join(', ')}.`, icono('derecha', { tam: 16 })) : null,
    seccionTrabajador, seccionFormatos,
    el('h2', { class: 'doc-sub' }, 'De la empresa'),
    el('p', { class: 'texto-suave texto-chico' }, puedeGuardarSst(ctx) ? 'Al guardar quedan como nueva versión en Prevención SST → Documentos preventivos.' : 'Se descargan (guardar en Prevención SST requiere ese módulo).'),
    carpetas);
}
