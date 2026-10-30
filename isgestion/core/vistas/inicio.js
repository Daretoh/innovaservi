// Inicio: saludo con la fecha, lo que requiere atención (alertas de los módulos que el usuario puede ver)
// indicadores de los módulos (core/vistas/indicadores.js) y accesos a los módulos agrupados por área. Las alertas llegan después, sin bloquear la pantalla.
import { el } from '../ui/dom.js?v=ca87e0a';
import { icono } from '../ui/iconos.js?v=ca87e0a';
import { nombreEmpresa } from '../empresas.js?v=ca87e0a';
import { esTelefono, marcaGuardada, recordarMarca } from '../movil.js?v=ca87e0a';

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

// Teléfono (dirección B): cabecera con el color de la empresa (logo, campana, fecha, saludo y, con Taller, los números
// del día) y "Necesitan atención" con los autos del taller. Debajo, lo mismo que en pantalla grande.
function cabeceraMovil(ctx, { fecha, titulo, abrirNotificaciones, conTaller }) {
  const marca = marcaGuardada(ctx.empresa.id);
  const cifras = el('div', { class: 'im-cifras', hidden: true });
  if (conTaller) {
    ctx.api.from('tal_ordenes').select('estado').eq('empresa_id', ctx.empresa.id).in('estado', ['espera', 'proceso', 'terminado']).then(({ data }) => {
      const n = (e) => (data ?? []).filter((o) => o.estado === e).length;
      cifras.replaceChildren(...[[n('espera') + n('proceso') + n('terminado'), 'en el taller'], [n('proceso'), 'en proceso'], [n('terminado'), 'para entregar']]
        .map(([c, t], i) => el('a', { class: `im-cifra${i === 2 && c ? ' destacada' : ''}`, href: '#/taller.tablero' }, el('strong', {}, String(c)), el('span', {}, t))));
      cifras.hidden = false;
    });
  }
  const pastilla = el('span', { class: 'im-marca' }, marca?.logo ? el('img', { src: marca.logo, alt: '' }) : null, nombreEmpresa(ctx.empresa));
  // Sin logo guardado aún en este teléfono (recién abierto o recién subido): se trae y se guarda
  if (!marca?.logo && ctx.empresa.logo_url) recordarMarca(ctx.api, ctx.empresa).then((logo) => { if (logo && pastilla.isConnected) pastilla.prepend(el('img', { src: logo, alt: '' })); });
  return el('header', { class: 'im-cab' },
    el('div', { class: 'im-cab-fila' },
      pastilla,
      abrirNotificaciones ? el('button', { type: 'button', class: 'im-campana', 'aria-label': 'Notificaciones', onclick: abrirNotificaciones }, icono('campana', { tam: 22 })) : null),
    el('div', { class: 'im-saludo' }, el('span', {}, fecha[0].toUpperCase() + fecha.slice(1)), titulo),
    cifras);
}

// Autos del taller que necesitan atención: listos sin entregar, esperas largas, los que llevan más en proceso y las citas de hoy
function atencionTaller(ctx) {
  const nodo = el('section', { class: 'im-atencion', hidden: true });
  (async () => {
    const [{ SELECT_ORDEN, minutosTrabajo }, m] = await Promise.all([import('../../modulos/taller/datos.js?v=ca87e0a'), import('../../modulos/taller/movil.js?v=ca87e0a')]);
    const { data, error } = await ctx.api.from('tal_ordenes').select(SELECT_ORDEN).eq('empresa_id', ctx.empresa.id).in('estado', ['agendado', 'espera', 'proceso', 'terminado']);
    if (error) throw error;
    // Primero por tipo de motivo; dentro de cada uno, el que lleva más tiempo
    const espera = (o) => minutosTrabajo(o) ?? m.minutosDesde(o.termino_at ?? o.ingreso_at) ?? 0;
    const autos = (data ?? []).map((o) => ({ o, mot: m.motivoAtencion(o) })).filter((x) => x.mot)
      .sort((a, b) => a.mot.orden - b.mot.orden || espera(b.o) - espera(a.o))
      .slice(0, 4);
    nodo.replaceChildren(
      el('div', { class: 'im-titulo' }, el('h2', {}, 'Necesitan atención'), el('a', { href: '#/taller.tablero' }, 'Ver todo')),
      ...(autos.length ? autos.map(({ o, mot }, i) => m.tarjetaAuto(ctx, o, { texto: mot.texto, pie: 'pasos', retraso: 60 + i * 60 }))
        : [el('div', { class: 'inicio-al-dia' }, icono('check', { tam: 20 }), el('span', {}, 'Nada pendiente en el taller.'))]));
    nodo.hidden = false;
  })().catch(() => nodo.remove());
  return nodo;
}

export default function inicio(ctx, visibles, { abrirNotificaciones } = {}) {
  const hoy = new Date();
  const fecha = `${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
  const telefono = esTelefono();
  // Roles de tablet (Operador de taller, Tablet de marcaje): solo ven el taller; su Inicio es el saludo, el resumen del
  // taller y sus accesos, sin indicadores ni alertas de gestión
  const tablet = visibles.some((m) => m.id === 'taller') && !ctx.puede('taller', 'editar')
    && visibles.every((m) => ['taller', 'terceros', 'marcaje', 'asistencia'].includes(m.id));
  const titulo = el('h1', {}, telefono ? 'Hola' : saludo(hoy));
  nombreUsuario(ctx).then((n) => { if (n) titulo.textContent = telefono ? `Hola, ${n}` : `${saludo(hoy)}, ${n}`; }).catch(() => {});
  const conTaller = visibles.some((m) => m.id === 'taller');

  // Requiere atención: se llena cuando llegan las alertas
  const atencion = el('div', { class: 'ficha doc-grupo inicio-atencion' },
    el('h2', {}, 'Requiere atención'),
    el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando' }, el('span', { class: 'cargador', 'aria-hidden': 'true' })));
  // Indicadores (tarjetas y paneles): llegan después, sin bloquear la pantalla
  const indicadores = el('div', { class: 'cargando-bloque', 'aria-busy': 'true', 'aria-label': 'Cargando indicadores' }, el('span', { class: 'cargador', 'aria-hidden': 'true' }));
  if (visibles.length && !tablet) {
    import('./indicadores.js?v=ca87e0a')
      .then(async ({ cargarIndicadores, panelIndicadores }) => { const p = panelIndicadores(ctx, await cargarIndicadores(ctx)); if (p) indicadores.replaceWith(p); else indicadores.remove(); })
      .catch(() => indicadores.remove());
  } else indicadores.remove();
  if (visibles.length && !tablet) {
    import('../../modulos/gerencia/alertas.js?v=ca87e0a')
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
  return el('section', { class: `listado inicio${telefono ? ' inicio-movil' : ''}` },
    telefono ? cabeceraMovil(ctx, { fecha, titulo, abrirNotificaciones, conTaller })
      : el('header', { class: 'inicio-cabecera' },
        el('p', { class: 'texto-suave inicio-fecha' }, fecha[0].toUpperCase() + fecha.slice(1)),
        titulo,
        el('p', { class: 'texto-suave' }, nombreEmpresa(ctx.empresa))),
    conTaller ? (telefono ? atencionTaller(ctx) : resumenTaller(ctx)) : null,
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
