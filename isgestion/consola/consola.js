// Consola de la plataforma (solo el equipo ISgestión, es_equipo()): clientes, empresas y módulos, uso y cobro.
// Usa la misma sesión que la app (mismo dominio); si no hay sesión, se ingresa primero en ISgestión.
// Rutas: #/clientes · #/cliente?id= · #/empresas · #/cobro
import { iniciarApi, db } from '../core/api.js?v=25e9201';
import { sesionActual, cerrarSesion } from '../core/auth.js?v=25e9201';
import { el } from '../core/ui/dom.js?v=25e9201';
import { icono } from '../core/ui/iconos.js?v=25e9201';

const raiz = document.getElementById('app');
const MENU = [
  ['clientes', 'Clientes', 'building', () => import('./vistas/clientes.js?v=25e9201')],
  ['empresas', 'Empresas y módulos', 'ajustes', () => import('./vistas/empresas.js?v=25e9201')],
  ['cobro', 'Uso y cobro', 'dinero', () => import('./vistas/cobro.js?v=25e9201')],
];
const OCULTAS = { cliente: ['clientes', () => import('./vistas/cliente.js?v=25e9201')] };
const estado = { contenido: null, menu: null, usuario: null, vista: null };

const ruta = (id, params = {}) => { const q = new URLSearchParams(params).toString(); return `#/${id}${q ? `?${q}` : ''}`; };

function pantalla(...hijos) { raiz.replaceChildren(el('main', { class: 'pantalla-centro estado-vacio' }, ...hijos)); }

async function arrancar() {
  document.documentElement.style.setProperty('--empresa', '#1f4e8c');
  try {
    await iniciarApi();
    const sesion = await sesionActual();
    if (!sesion) {
      pantalla(el('span', { class: 'estado-vacio-icono' }, icono('candado', { tam: 28 })), el('h1', {}, 'Consola ISgestión'),
        el('p', { class: 'texto-suave' }, 'Ingresa primero en ISgestión con tu cuenta del equipo y vuelve a esta página.'),
        el('a', { class: 'boton boton-primario', href: '../' }, 'Ir a ingresar'));
      return;
    }
    const { data: equipo, error } = await db().rpc('es_equipo');
    if (error) throw new Error(error.message);
    if (!equipo) {
      pantalla(el('span', { class: 'estado-vacio-icono' }, icono('candado', { tam: 28 })), el('h1', {}, 'Sin acceso'),
        el('p', { class: 'texto-suave' }, `La cuenta ${sesion.user.email} no es del equipo ISgestión.`),
        el('a', { class: 'boton boton-primario', href: '../' }, 'Volver a ISgestión'));
      return;
    }
    estado.usuario = { id: sesion.user.id, email: sesion.user.email };
    pintarApp();
    window.addEventListener('hashchange', navegar);
    if (!location.hash.replace(/^#\/?/, '')) location.hash = '#/clientes'; else navegar();
  } catch (e) {
    pantalla(el('h1', {}, 'Consola ISgestión'), el('p', { class: 'texto-error' }, e.message));
  }
}

function pintarApp() {
  estado.menu = el('nav', { class: 'menu', 'aria-label': 'Menú de la consola' },
    el('div', { class: 'menu-grupo' }, el('h3', {}, 'Plataforma'),
      MENU.map(([id, texto, ic]) => el('a', { href: `#/${id}`, title: texto }, icono(ic), el('span', { class: 'menu-texto' }, texto)))),
    el('div', { class: 'menu-grupo' }, el('h3', {}, 'Accesos'),
      el('a', { href: '../', title: 'Abrir ISgestión' }, icono('inicio'), el('span', { class: 'menu-texto' }, 'Abrir ISgestión'))));
  estado.contenido = el('main', { class: 'contenido' });
  raiz.replaceChildren(el('div', { class: 'app consola' },
    el('header', { class: 'barra' },
      el('button', { type: 'button', class: 'boton-icono menu-boton', 'aria-label': 'Mostrar u ocultar el menú', onclick: () => document.body.classList.toggle(matchMedia('(max-width: 760px)').matches ? 'menu-abierto' : 'menu-compacto') }, icono('menu')),
      el('span', { class: 'marca' }, 'ISgestión'), el('span', { class: 'consola-etiqueta' }, 'Consola'),
      el('div', { class: 'barra-espacio' }),
      el('div', { class: 'usuario' }, el('span', { class: 'correo' }, estado.usuario.email),
        el('button', { type: 'button', class: 'boton-icono', title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: async () => { await cerrarSesion(); location.href = '../'; } }, icono('salir')))),
    el('div', { class: 'cuerpo' }, estado.menu, el('div', { class: 'menu-velo', onclick: () => document.body.classList.remove('menu-abierto') }), estado.contenido)));
  estado.menu.addEventListener('click', (ev) => { if (ev.target.closest('a')) document.body.classList.remove('menu-abierto'); });
}

async function navegar() {
  const [id, query = ''] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?');
  const item = MENU.find(([k]) => k === id);
  const oculta = OCULTAS[id];
  const padre = item ? id : oculta?.[0];
  for (const a of estado.menu.querySelectorAll('a')) { if (a.getAttribute('href') === `#/${padre}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }
  const cargar = item?.[3] ?? oculta?.[1];
  const nueva = estado.vista !== location.hash;
  estado.vista = location.hash;
  if (!cargar) { estado.contenido.replaceChildren(el('section', { class: 'estado-vacio' }, el('h1', {}, 'Sección no disponible'), el('a', { class: 'boton boton-primario', href: '#/clientes' }, 'Ir a clientes'))); return; }
  if (nueva) estado.contenido.replaceChildren(el('div', { class: 'cargando-vista', 'aria-busy': 'true', 'aria-label': 'Cargando' }, el('span', { class: 'cargador', 'aria-hidden': 'true' })));
  const ctx = { api: db(), usuario: estado.usuario, params: Object.fromEntries(new URLSearchParams(query)), ruta, refrescar: navegar };
  try {
    const nodo = await (await cargar()).default(ctx);
    if (nueva) nodo.classList.add('vista-entra');
    estado.contenido.replaceChildren(nodo);
  } catch (e) {
    estado.contenido.replaceChildren(el('section', { class: 'estado-vacio' }, el('h1', {}, 'No se pudo cargar'), el('p', { class: 'texto-error' }, e.message)));
  }
}

arrancar();
