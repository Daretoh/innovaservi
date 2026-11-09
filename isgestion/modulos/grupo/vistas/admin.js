// Grupo → Administración (Enzo, 2026-11-02): la administración de cada empresa se hace desde el Grupo y sale del menú
// de cada empresa (Empresa, Usuarios, Roles y permisos, Módulos, Auditoría y Clientes y proveedores). Se elige la
// empresa y la pantalla; cada pantalla es la del módulo (modulos/nucleo, modulos/terceros) con el contexto y los permisos
// del usuario en esa empresa. Los enlaces a pantallas de la empresa (p. ej. los ajustes de un módulo) se abren en ella.
import { el } from '../../../core/ui/dom.js?v=163dc56r';
import { nombreEmpresa } from '../../../core/empresas.js?v=163dc56r';
import { empresasCon, ctxDe, marcaEmpresa } from '../empresas.js?v=163dc56r';

const PANTALLAS = [
  ['nucleo.empresa', 'Empresa', 'nucleo', 'ver', () => import('../../nucleo/vistas/empresa.js?v=163dc56r')],
  ['nucleo.usuarios', 'Usuarios', 'nucleo', 'ver', () => import('../../nucleo/vistas/usuarios.js?v=163dc56r')],
  ['nucleo.roles', 'Roles y permisos', 'nucleo', 'ver', () => import('../../nucleo/vistas/roles.js?v=163dc56r')],
  ['nucleo.modulos', 'Módulos', 'nucleo', 'ver', () => import('../../nucleo/vistas/modulos.js?v=163dc56r')],
  ['nucleo.auditoria', 'Auditoría', 'nucleo', 'ver', () => import('../../nucleo/vistas/auditoria.js?v=163dc56r')],
  ['terceros.listado', 'Clientes y proveedores', 'terceros', 'editar', () => import('../../terceros/vistas/listado.js?v=163dc56r')],
];
const estado = { empresa: '', pantalla: 'nucleo.usuarios' };

export default async function vista(ctx) {
  const empresas = empresasCon(ctx, 'nucleo');
  if (!empresas.length) return el('section', { class: 'listado' }, el('h1', {}, 'Administración'), el('p', { class: 'texto-suave' }, 'No administras ninguna empresa del grupo.'));
  const g = empresas.find((x) => x.empresa.id === estado.empresa) ?? empresas[0];
  estado.empresa = g.empresa.id;
  const disponibles = PANTALLAS.filter(([, , mod, acc]) => g.modulos.has(mod) && g.puede(mod, acc));
  const actual = disponibles.find(([id]) => id === estado.pantalla) ?? disponibles[0];
  estado.pantalla = actual?.[0];

  const ctxE = { ...ctxDe(ctx, g), params: {} };
  const contenido = actual ? await (await actual[4]()).default(ctxE) : el('p', { class: 'texto-suave' }, 'Sin pantallas de administración en esta empresa.');
  // Enlaces a pantallas de la empresa (fuera del Grupo): se abren en esa empresa
  contenido.addEventListener?.('click', (ev) => {
    const a = ev.target.closest('a[href^="#/"]');
    if (!a || a.getAttribute('href').startsWith('#/grupo.')) return;
    ev.preventDefault(); ctx.abrirEnEmpresa(g.empresa, a.getAttribute('href'));
  });

  const cambiar = (c) => { Object.assign(estado, c); ctx.refrescar(); };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Administración'), el('p', { class: 'texto-suave' }, `${nombreEmpresa(g.empresa)} · empresa, usuarios, permisos y clientes`)),
      empresas.length > 1 ? el('div', { class: 'segmento', role: 'group', 'aria-label': 'Empresa' }, empresas.map((x) =>
        el('button', { type: 'button', 'aria-pressed': String(x.empresa.id === g.empresa.id), onclick: () => cambiar({ empresa: x.empresa.id }) }, marcaEmpresa(x.empresa)))) : null),
    el('nav', { class: 'pestanas', 'aria-label': 'Pantalla' }, disponibles.map(([id, label]) =>
      el('a', { class: 'pestana', href: '#', 'aria-current': id === estado.pantalla ? 'page' : null, onclick: (ev) => { ev.preventDefault(); cambiar({ pantalla: id }); } }, label))),
    contenido);
}
