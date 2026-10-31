// "Más" en el teléfono (pestaña de la barra de abajo): la cuenta y la empresa, todos los módulos que el rol ve,
// la apariencia (claro, oscuro o como el sistema), notificaciones y cerrar sesión. En pantallas grandes también se
// puede abrir (#/mas), pero ahí el menú lateral ya lo tiene todo.
import { el } from '../ui/dom.js?v=66a811d';
import { icono } from '../ui/iconos.js?v=66a811d';
import { nombreEmpresa } from '../empresas.js?v=66a811d';

const TEMAS = [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['sistema', 'Sistema', 'pantalla']];
const AYUDA = { claro: 'Fondo claro: mejor a pleno sol.', oscuro: 'Fondo oscuro: descansa la vista y ahorra batería.', sistema: 'Sigue el modo del teléfono o del computador.' };

export default function mas(ctx, { empresas, cambiarEmpresa, apartados, modo, cambiarModo, abrirNotificaciones, salir, iconoDe }) {
  const nombre = el('strong', {}, ctx.usuario.email.split('@')[0]);
  const iniciales = el('span', { class: 'mas-avatar', 'aria-hidden': 'true' }, ctx.usuario.email.slice(0, 2).toUpperCase());
  ctx.api.rpc('nombres_usuarios', { p_empresa: ctx.empresa.id }).then(({ data }) => {
    const n = (data ?? []).find((x) => x.user_id === ctx.usuario.id)?.nombre;
    if (n && n !== ctx.usuario.email.split('@')[0]) {
      nombre.textContent = n;
      iniciales.textContent = n.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    }
  }).catch(() => {});

  const cuenta = el('div', { class: 'ficha mas-cuenta' }, iniciales,
    el('div', { class: 'mas-cuenta-texto' }, nombre, el('span', { class: 'texto-suave texto-chico' }, `${ctx.usuario.email} · ${nombreEmpresa(ctx.empresa)}`)));
  const otras = empresas.filter((e) => e.id !== ctx.empresa.id);
  const empresasNodo = otras.length ? el('section', { class: 'mas-seccion' },
    el('h2', {}, 'Cambiar empresa'),
    el('div', { class: 'mas-lista ficha' }, otras.map((e) => el('button', { type: 'button', class: 'mas-fila', onclick: () => cambiarEmpresa(e) },
      el('span', { class: 'punto', style: `background:${e.color || 'var(--empresa)'}` }), el('span', { class: 'mas-fila-texto' }, nombreEmpresa(e)), icono('derecha', { tam: 16 }))))) : null;

  const modulos = el('section', { class: 'mas-seccion' },
    el('h2', {}, 'Módulos'),
    el('div', { class: 'mas-modulos' }, [...apartados.grupos.values()].flat().map((ap) => {
      const it = ap.items[0];
      return el('a', { class: 'mas-modulo', href: `#/${it.id}` },
        el('span', { class: 'mas-modulo-icono' }, icono(ap.items.length > 1 ? ap.icono : iconoDe(it), { tam: 20 })),
        el('span', {}, ap.items.length > 1 ? ap.label : it.label));
    })));

  // Apariencia: tres opciones; se aplica al instante
  const ayuda = el('span', { class: 'texto-suave texto-chico' }, AYUDA[modo()] ?? '');
  const grupo = el('div', { class: 'mas-temas', role: 'radiogroup', 'aria-label': 'Apariencia' });
  const pintarTemas = () => grupo.replaceChildren(...TEMAS.map(([k, t, ic]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(modo() === k),
    onclick: () => { cambiarModo(k); ayuda.textContent = AYUDA[k]; pintarTemas(); } }, icono(ic, { tam: 18 }), t)));
  pintarTemas();

  return el('section', { class: 'listado mas' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Más')),
    cuenta,
    empresasNodo,
    modulos,
    el('section', { class: 'mas-seccion' }, el('h2', {}, 'Apariencia'), grupo, ayuda),
    el('div', { class: 'mas-lista ficha' },
      el('button', { type: 'button', class: 'mas-fila', onclick: abrirNotificaciones }, icono('campana', { tam: 18 }), el('span', { class: 'mas-fila-texto' }, 'Notificaciones'), icono('derecha', { tam: 16 })),
      el('button', { type: 'button', class: 'mas-fila mas-salir', onclick: salir }, icono('salir', { tam: 18 }), el('span', { class: 'mas-fila-texto' }, 'Cerrar sesión'))));
}
