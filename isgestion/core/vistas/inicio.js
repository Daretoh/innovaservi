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

// Nombre del usuario para el saludo: el de su ficha de trabajador (Administración → Usuarios → Ficha). Si no tiene
// ficha, sin nombre (la parte del correo, ej. "emc2", no es un nombre).
async function nombreUsuario(ctx) {
  const { data } = await ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id });
  const n = (data ?? []).find((x) => x.user_id === ctx.usuario.id)?.nombre ?? '';
  if (!n || n === ctx.usuario.email.split('@')[0]) return '';
  const primero = n.split(' ')[0];
  return primero[0].toUpperCase() + primero.slice(1).toLowerCase();
}

// Resumen del taller (como pide Enzo para la tablet): cuántos autos hay y en qué etapa; lleva al tablero
function resumenTaller(ctx) {
  const nodo = el('a', { class: 'ficha doc-grupo inicio-taller', href: '#/taller.tablero', hidden: true });
  (async () => {
    const { data } = await ctx.api.from('tal_ordenes').select('estado, fecha_cita').eq('empresa_id', ctx.empresa.id).in('estado', ['agendado', 'espera', 'proceso', 'terminado']);
    const hoyIso = new Date().toLocaleDateString('sv-SE');
    const n = (e) => (data ?? []).filter((o) => o.estado === e).length;
    const agendadosHoy = (data ?? []).filter((o) => o.estado === 'agendado' && o.fecha_cita && o.fecha_cita <= hoyIso).length;
    const enTaller = n('espera') + n('proceso') + n('terminado');
    const partes = [[n('proceso'), 'en proceso', 'en proceso'], [n('espera'), 'en espera', 'en espera'], [n('terminado'), 'terminado', 'terminados'], [agendadosHoy, 'agendado para hoy', 'agendados para hoy']]
      .filter(([c]) => c).map(([c, uno, varios]) => `${c} ${c === 1 ? uno : varios}`);
    nodo.replaceChildren(
      el('span', { class: 'tarjeta-icono' }, icono('llave', { tam: 22 })),
      el('div', { class: 'doc-nombre' },
        el('strong', {}, enTaller ? `${enTaller} ${enTaller === 1 ? 'vehículo' : 'vehículos'} en el taller` : 'No hay vehículos en el taller'),
        el('span', { class: 'texto-suave' }, partes.length ? partes.join(' · ') : 'Sin agendados para hoy')),
      icono('derecha', { tam: 18 }));
    nodo.hidden = false;
  })().catch(() => nodo.remove());
  return nodo;
}

export default function inicio(ctx, visibles) {
  const hoy = new Date();
  const fecha = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
  // Roles de tablet (Operador de taller, Tablet de marcaje): solo ven el taller; su Inicio es el saludo, el resumen del
  // taller y sus accesos, sin indicadores ni alertas de gestión
  const tablet = visibles.some((m) => m.id === 'taller') && !ctx.puede('taller', 'crear')
    && visibles.every((m) => ['taller', 'terceros', 'marcaje', 'asistencia'].includes(m.id));
  const titulo = el('h1', {}, saludo(hoy));
  nombreUsuario(ctx).then((n) => { if (n) titulo.textContent = `${saludo(hoy)}, ${n}`; }).catch(() => {});

  // Requiere atención: se llena cuando llegan las alertas
  const atencion = el('div', { class: 'ficha doc-grupo inicio-atencion' },
    el('h2', {}, 'Requiere atención'),
    el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando' }, el('span', { class: 'cargador', 'aria-hidden': 'true' })));
  // Indicadores (tarjetas y paneles): llegan después, sin bloquear la pantalla
  const indicadores = el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando indicadores' }, el('span', { class: 'cargador', 'aria-hidden': 'true' }));
  if (visibles.length && !tablet) {
    import('./indicadores.js')
      .then(async ({ cargarIndicadores, panelIndicadores }) => { const p = panelIndicadores(ctx, await cargarIndicadores(ctx)); if (p) indicadores.replaceWith(p); else indicadores.remove(); })
      .catch(() => indicadores.remove());
  } else indicadores.remove();
  if (visibles.length && !tablet) {
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
      titulo,
      el('p', { class: 'texto-suave' }, nombreEmpresa(ctx.empresa))),
    visibles.some((m) => m.id === 'taller') ? resumenTaller(ctx) : null,
    visibles.length && !tablet ? indicadores : null,
    !visibles.length ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no tiene módulos habilitados en esta empresa. Pide acceso al administrador.') : !tablet ? atencion : null,
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
