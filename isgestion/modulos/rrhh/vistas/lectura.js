// Leer vencimientos de cédulas en lote (como en InnovaGestión): las cédulas entregadas de personas activas que no
// tienen fecha de vencimiento se leen una tras otra en este equipo (gratis, sin enviar las imágenes a nadie). Las
// fechas del reverso (zona MRZ, con dígito de control y RUN igual a la ficha) quedan marcadas; las del frente se
// comparan con la imagen antes de marcarlas. Solo se guardan las marcadas.
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { icono } from '../../../core/ui/iconos.js?v=a7f53fa';
import { boton } from '../../../core/ui/tabla.js?v=a7f53fa';
import { avisar } from '../../../core/ui/aviso.js?v=a7f53fa';
import { urlFirmada } from '../../../core/adjuntos.js?v=a7f53fa';
import { cargarRrhh, nombreCompleto } from '../datos.js?v=a7f53fa';

export default async function vista(ctx) {
  const datos = await cargarRrhh(ctx);
  const volver = el('a', { class: 'volver', href: ctx.ruta('rrhh.documentos') }, icono('volver', { tam: 16 }), 'Estado documental');
  const titulo = el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Leer vencimientos de cédulas'),
    el('p', { class: 'texto-suave' }, 'Cédulas entregadas sin fecha de vencimiento, de personas activas.')));
  const lista = datos.vinculos.filter((v) => v.estado === 'activo').map((v) => ({ v, d: datos.doc(v.persona_id, 'cedula') }))
    .filter((x) => x.d?.estado === 'entregado' && !x.d.vence && (x.d.archivo || x.d.archivo2));
  if (!ctx.puede('rrhh', 'editar')) return el('section', { class: 'listado' }, volver, titulo, el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no puede editar documentos.'));
  if (!lista.length) return el('section', { class: 'listado' }, volver, titulo, el('div', { class: 'ficha' }, el('p', { class: 'texto-suave' }, icono('check', { tam: 16 }), ' Todas las cédulas entregadas ya tienen fecha de vencimiento.')));

  const filas = lista.map((x) => {
    const estado = el('span', { class: 'texto-chico lec-estado' }, 'En espera');
    const fecha = el('input', { type: 'date', class: 'campo', 'aria-label': `Vencimiento de ${nombreCompleto(x.v.personas)}` });
    const marca = el('input', { type: 'checkbox', class: 'casilla-sola', 'aria-label': 'Guardar esta fecha' });
    fecha.addEventListener('change', () => { if (fecha.value) marca.checked = true; });
    const mini = el('button', { type: 'button', class: 'lec-mini', title: 'Ver la cédula', 'aria-label': 'Ver la cédula' }, icono('documento', { tam: 18 }));
    const ruta = x.d.archivo || x.d.archivo2;
    if (!/\.pdf$/i.test(ruta)) urlFirmada(ctx.api, ruta, 600).then((u) => mini.replaceChildren(el('img', { src: u, alt: '' }))).catch(() => {});
    mini.addEventListener('click', async () => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } });
    return { ...x, estado, fecha, marca, nodo: el('div', { class: 'doc-fila lec-fila' }, mini,
      el('div', { class: 'doc-nombre' }, el('strong', {}, nombreCompleto(x.v.personas)), estado), fecha, el('label', { class: 'casilla' }, marca)) };
  });

  let corriendo = false;
  const comenzar = async (ev) => {
    if (corriendo) return; corriendo = true;
    const b = ev.currentTarget; b.disabled = true;
    const L = await import('../../../core/lector-venc.js?v=a7f53fa');
    for (const f of filas) {
      if (!document.body.contains(b)) return;   // se salió de la vista
      f.estado.className = 'texto-chico lec-estado'; f.estado.textContent = 'Leyendo…';
      try {
        const fuentes = await Promise.all([f.d.archivo2, f.d.archivo].filter(Boolean).map((r) => urlFirmada(ctx.api, r, 600)));
        const r = await L.leerVencCedula(fuentes, f.v.personas?.rut, (t) => { f.estado.textContent = t; });
        const R = L.resumenCedula(r);
        f.estado.textContent = R.texto; f.estado.className = `texto-chico lec-estado estado-${R.clase}`;
        if (r?.venc) { f.fecha.value = r.venc; if (r.fuente === 'mrz' && r.rutOk !== false) f.marca.checked = true; }
      } catch (e) { f.estado.textContent = e.message || 'No se pudo leer.'; f.estado.className = 'texto-chico lec-estado estado-mal'; }
    }
    b.lastChild.textContent = 'Lectura terminada';
  };
  const guardar = async (ev) => {
    const marcadas = filas.filter((f) => f.marca.checked && f.fecha.value);
    if (!marcadas.length) { avisar('Marca al menos una fecha para guardar.', 'error'); return; }
    const b = ev.currentTarget; b.classList.add('cargando');
    let malos = 0;
    for (const f of marcadas) {
      const { data, error } = await ctx.api.from('rrhh_documentos').update({ vence: f.fecha.value }).eq('id', f.d.id).select('id');
      if (error || !data?.length) malos += 1;
    }
    b.classList.remove('cargando');
    avisar(malos ? `Se guardaron ${marcadas.length - malos}; ${malos} no se pudieron guardar.` : `${marcadas.length} fecha${marcadas.length === 1 ? '' : 's'} guardada${marcadas.length === 1 ? '' : 's'}.`, malos ? 'error' : 'ok');
    ctx.refrescar();
  };

  return el('section', { class: 'listado' }, volver, titulo,
    el('div', { class: 'ficha' },
      el('p', {}, `Se leerán ${lista.length} cédula${lista.length === 1 ? '' : 's'}. La lectura se hace en este equipo, sin enviar las imágenes a nadie, y tarda unos segundos por cédula.`),
      el('p', { class: 'texto-suave texto-chico' }, 'Las fechas del reverso quedan verificadas y marcadas; las del frente compáralas con la imagen antes de marcarlas.'),
      boton('Comenzar lectura', { icono: 'ojo', tipo: 'primario', onclick: comenzar })),
    el('div', { class: 'ficha doc-grupo' }, filas.map((f) => f.nodo)),
    el('div', { class: 'listado-acciones' }, boton('Guardar fechas marcadas', { icono: 'check', tipo: 'primario', onclick: guardar })));
}
