// Inicio: saludo con la fecha, lo que requiere atención (alertas de los módulos que el usuario puede ver)
// indicadores de los módulos (core/vistas/indicadores.js) y accesos a los módulos agrupados por área. Las alertas llegan después, sin bloquear la pantalla.
import { el } from '../ui/dom.js';
import { icono } from '../ui/iconos.js';
import { nombreEmpresa } from '../empresas.js';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function saludo(d) {
  const h = d.getHours();
  return h < 6 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export default function inicio(ctx, visibles) {
  const hoy = new Date();
  const fecha = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;

  // Requiere atención: se llena cuando llegan las alertas
  const atencion = el('div', { class: 'ficha doc-grupo inicio-atencion' },
    el('h2', {}, 'Requiere atención'),
    el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando' }, el('span', { class: 'cargador', 'aria-hidden': 'true' })));
  // Indicadores (tarjetas y paneles): llegan después, sin bloquear la pantalla
  const indicadores = el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando indicadores' }, el('span', { class: 'cargador', 'aria-hidden': 'true' }));
  if (visibles.length) {
    import('./indicadores.js')
      .then(async ({ cargarIndicadores, panelIndicadores }) => { const p = panelIndicadores(ctx, await cargarIndicadores(ctx)); if (p) indicadores.replaceWith(p); else indicadores.remove(); })
      .catch(() => indicadores.remove());
  } else indicadores.remove();
  if (visibles.length) {
    import('../../modulos/gerencia/alertas.js')
      .then(({ cargarAlertas }) => cargarAlertas(ctx))
      .then((alertas) => {
        atencion.replaceChildren(el('h2', {}, alertas.length ? `Requiere atención (${alertas.length})` : 'Requiere atención'),
          ...(alertas.length
            ? alertas.slice(0, 8).map((a) => el('a', { class: 'doc-fila ger-alerta', href: a.ruta },
                el('span', { class: `chip ${a.nivel === 'venc' ? 'chip-venc' : 'chip-prox'}` }, String(a.cantidad)),
                el('div', { class: 'doc-nombre' }, el('strong', {}, a.modulo), el('span', { class: 'texto-suave' }, a.texto)),
                icono('derecha', { tam: 16 })))
            : [el('div', { class: 'inicio-al-dia' }, icono('check', { tam: 20 }), el('span', {}, 'Todo al día en los módulos que puedes ver.'))]),
          alertas.length > 8 && ctx.puede('gerencia', 'ver') ? el('a', { class: 'texto-chico', href: '#/gerencia.panel' }, `Ver las ${alertas.length} en el Panel de gerencia`) : '');
      })
      .catch(() => atencion.remove());
  } else atencion.remove();

  // Un acceso por módulo (a su primera vista), agrupados por área
  const grupos = new Map();
  for (const m of visibles) { if (!grupos.has(m.categoria)) grupos.set(m.categoria, []); grupos.get(m.categoria).push(m); }
  return el('section', { class: 'listado inicio' },
    el('header', { class: 'inicio-cabecera' },
      el('p', { class: 'texto-suave inicio-fecha' }, fecha[0].toUpperCase() + fecha.slice(1)),
      el('h1', {}, `${saludo(hoy)}`),
      el('p', { class: 'texto-suave' }, `${nombreEmpresa(ctx.empresa)} · ${ctx.empresa.razon_social} · RUT ${ctx.empresa.rut}`)),
    visibles.length ? indicadores : null,
    visibles.length ? atencion : el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no tiene módulos habilitados en esta empresa. Pide acceso al administrador.'),
    [...grupos].map(([categoria, mods]) => el('div', { class: 'inicio-grupo' },
      el('h2', {}, categoria),
      el('div', { class: 'tarjetas' }, mods.map((m) => {
        const vistas = m.menu.filter((x) => !x.oculto);
        return el('a', { class: 'tarjeta', href: `#/${vistas[0]?.id ?? m.menu[0].id}` },
          el('span', { class: 'tarjeta-icono' }, icono(m.icono, { tam: 20 })),
          el('span', {}, el('strong', {}, m.nombre), el('span', { class: 'texto-suave texto-chico tarjeta-sub' }, vistas.slice(0, 3).map((x) => x.label).join(' · '))));
      })))),
  );
}
