// Asignados a faenas próximas (14 días) con documentación incompleta (como la alerta de InnovaGestión): quién está
// planificado, en qué faenas y qué documentos tiene vencidos o pendientes. El nombre abre su ficha.
import { el } from '../../../core/ui/dom.js?v=faa3077';
import { icono } from '../../../core/ui/iconos.js?v=faa3077';
import { nombreDia, fechaCorta } from '../../../core/ui/formato.js?v=faa3077';
import { asignadosConPendientes, DIAS_PROXIMAS } from '../proximas.js?v=faa3077';

export default async function vista(ctx) {
  const titulo = el('header', { class: 'listado-cabecera' }, el('div', {},
    el('h1', {}, 'Asignados a faenas próximas'),
    el('p', { class: 'texto-suave' }, `Planificados en los próximos ${DIAS_PROXIMAS} días con documentos vencidos o pendientes.`)));
  const lista = await asignadosConPendientes(ctx);
  if (lista === null) {
    return el('section', { class: 'listado' }, titulo,
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Se necesita ver Recursos Humanos y Faenas y planificación.'));
  }
  const conVencidos = lista.filter((x) => x.venc.length).length;
  return el('section', { class: 'listado' },
    el('a', { class: 'volver', href: ctx.ruta('rrhh.documentos') }, icono('volver', { tam: 16 }), 'Estado documental'),
    titulo,
    lista.length ? el('div', { class: 'resumen-chips' },
      el('span', { class: 'chip chip-venc' }, icono('alerta', { tam: 14 }), `${conVencidos} con documentos vencidos`),
      el('span', { class: 'chip chip-pend' }, icono('circulo', { tam: 14 }), `${lista.length - conVencidos} solo con pendientes`)) : null,
    lista.length
      ? el('div', { class: 'ficha doc-grupo' }, lista.map((x) => el('div', { class: 'doc-fila prox-fila' },
        el('div', { class: 'doc-nombre' },
          el('a', { href: ctx.ruta('rrhh.ficha', { p: x.persona_id }) }, el('strong', {}, x.nombre)),
          el('span', { class: 'texto-suave texto-chico' }, x.faenas.slice(0, 3).map((f) => `${nombreDia(f.fecha)} ${fechaCorta(f.fecha)} · ${[f.cliente, f.titulo].filter(Boolean).join(' · ')}`).join(' — ')
            + (x.faenas.length > 3 ? ` y ${x.faenas.length - 3} más` : ''))),
        el('div', { class: 'prox-chips' },
          x.venc.length ? el('span', { class: 'chip chip-venc', title: x.venc.join(', ') }, `Vencido: ${x.venc.join(', ')}`) : null,
          x.pend.length ? el('span', { class: 'chip chip-pend', title: x.pend.join(', ') }, `${x.pend.length} pendiente${x.pend.length > 1 ? 's' : ''}`) : null))))
      : el('div', { class: 'ficha' }, el('p', { class: 'texto-suave' }, icono('check', { tam: 16 }), ` Todos los asignados de los próximos ${DIAS_PROXIMAS} días tienen su documentación al día.`)));
}
