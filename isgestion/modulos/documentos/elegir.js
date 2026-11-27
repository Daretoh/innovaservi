// Ventanas para abrir plantillas del generador desde donde corresponde cada documento:
//   elegirRegistro(ctx, { libre }) → Prevención SST → Registros de entrega → Nuevo registro (charla, checklist o libre)
//   elegirPlantillaEmpresa(ctx)    → Prevención SST → Documentos preventivos (PTS, IPER, programa, Ley Karin…)
import { el } from '../../core/ui/dom.js?v=99f3bd0';
import { icono } from '../../core/ui/iconos.js?v=99f3bd0';
import { boton } from '../../core/ui/tabla.js?v=99f3bd0';
import { avisar } from '../../core/ui/aviso.js?v=99f3bd0';
import { generador } from './servicios.js?v=99f3bd0';

function ventana(titulo, contenido) {
  const cerrar = () => d.remove();
  const d = el('dialog', { class: 'modal', 'aria-label': titulo },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, titulo),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' }, contenido(cerrar)));
  document.body.append(d);
  d.showModal();
}
const opcion = (titulo, sub, alElegir, extra = null) => el('div', { class: 'doc-fila' },
  el('div', { class: 'doc-nombre' }, el('strong', {}, titulo), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null),
  el('div', { class: 'doc-acciones' }, extra, boton('Abrir', { icono: 'documento', onclick: alElegir })));

// Nuevo registro de entrega: con plantilla (se completa, se guarda y se envía a firmar por WhatsApp) o libre
export function elegirRegistro(ctx, { libre }) {
  ventana('Nuevo registro de entrega', (cerrar) => {
    const usar = (cual) => async () => {
      cerrar();
      try {
        const G = await generador(ctx, { alGuardado: (id) => { location.hash = ctx.ruta('sst.entrega', { id }); } });
        await G[cual]();
      } catch (e) { avisar(e.message, 'error'); }
    };
    const grupo = (titulo, ...ops) => el('div', { class: 'doc-grupo' }, el('h3', { class: 'doc-sub' }, titulo), ops);
    return [
      el('p', { class: 'texto-suave texto-chico' }, 'Con plantilla se completa en pantalla, eliges a los trabajadores y al guardar se envía a firmar por WhatsApp. Cada firma queda en la ficha de quien firma.'),
      grupo('En terreno',
        opcion('Charla diaria de autocuidado', 'Una de las 30 charlas, con lista de asistencia; propone la que sigue', usar('abrirCharla')),
        opcion('Checklist de seguridad · diluidores de sal', 'Ítems marcables, medición de gases y firmas', usar('abrirChecklist'))),
      grupo('Capacitación y procedimientos',
        opcion('Registro de capacitación o entrega de PTS', 'Cada capacitación del catálogo o la entrega de cada PTS, con su temario y lista de asistencia', usar('abrirCapacitacion')),
        opcion('Evaluación de aprendizaje', 'Una por trabajador, de la capacitación que elijas', usar('abrirEvaluacion'))),
      grupo('Documentos con firma individual',
        opcion('Entrega individual de documentos', 'Matriz IPER, Inventario de riesgos, cada PTS, PTS por cargo o la IRL: cada documento con la firma del trabajador abajo (nombre, RUT y cargo)', async () => {
          cerrar();
          try { const { abrirEntregaIndividual } = await import('../sst/individual.js?v=99f3bd0'); await abrirEntregaIndividual(ctx, { alGuardado: (id) => { location.hash = ctx.ruta('sst.entrega', { id }); } }); }
          catch (e) { avisar(e.message, 'error'); }
        })),
      grupo('Del trabajador (una hoja por persona)',
        opcion('Entrega de elementos de protección personal', 'Queda la entrega de EPP en la ficha de cada uno', usar('abrirEPP')),
        opcion('Información de riesgos laborales (IRL)', 'Queda la IRL en la ficha de cada uno', usar('abrirIRL')),
        opcion('Carta de compromiso', 'Sin examen de altura / espacios confinados, con la firma de cada trabajador', usar('abrirCarta'))),
      grupo('Sin plantilla',
        opcion('Registro libre', 'Tu propio tema y temario, con la lista de participantes', () => { cerrar(); libre(); })),
    ];
  });
}

// Documentos de la empresa desde plantilla: se abren, se revisan y se guardan como nueva versión aquí mismo
export async function elegirPlantillaEmpresa(ctx) {
  let G;
  try { G = await generador(ctx); } catch (e) { avisar(e.message, 'error'); return; }
  ventana('Generar desde plantilla', (cerrar) => [
    el('p', { class: 'texto-suave texto-chico' }, 'Con el membrete y los datos de la empresa. Al guardar queda como nueva versión en esta lista.'),
    G.carpetasEmpresa().filter((c) => c.docs.length).map((c) => el('div', { class: 'doc-grupo' },
      el('h3', { class: 'doc-sub' }, c.titulo),
      c.docs.map(({ slug, nombre }) => opcion(nombre, G.lineaVersion(slug), () => { cerrar(); G.docEmpresa(slug, nombre); },
        G.P.PTS_DOC[slug] && ctx.puede('documentos', 'editar')
          ? boton('Editar', { icono: 'editar', onclick: () => { cerrar(); location.hash = ctx.ruta('documentos.pts', { s: slug }); } }) : null)))),
  ]);
}
