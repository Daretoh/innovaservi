// Ventanas para abrir plantillas del generador desde donde corresponde cada documento:
//   elegirRegistro(ctx, { libre }) → Prevención SST → Registros de entrega → Nuevo registro (charla, checklist o libre)
//   elegirPlantillaEmpresa(ctx)    → Prevención SST → Documentos preventivos (PTS, IPER, programa, Ley Karin…)
import { el } from '../../core/ui/dom.js?v=fce4a19';
import { icono } from '../../core/ui/iconos.js?v=fce4a19';
import { boton } from '../../core/ui/tabla.js?v=fce4a19';
import { avisar } from '../../core/ui/aviso.js?v=fce4a19';
import { generador } from './servicios.js?v=fce4a19';

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
        await (cual === 'charla' ? G.abrirCharla() : G.abrirChecklist());
      } catch (e) { avisar(e.message, 'error'); }
    };
    return [
      el('p', { class: 'texto-suave texto-chico' }, 'Con plantilla se completa en pantalla, eliges a los trabajadores y al guardar se envía a firmar por WhatsApp.'),
      opcion('Charla diaria de autocuidado', 'Una de las 30 charlas, con lista de asistencia; propone la que sigue', usar('charla')),
      opcion('Checklist de seguridad · diluidores de sal', 'Ítems marcables, medición de gases y firmas', usar('checklist')),
      opcion('Registro libre', 'Capacitación, entrega de EPP o PTS con tu propio tema y temario', () => { cerrar(); libre(); }),
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
