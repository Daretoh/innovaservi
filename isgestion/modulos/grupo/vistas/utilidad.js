// Grupo → Utilidad por empresa (2026-11-24, pedido de Enzo: Resultados sale del menú de cada empresa y queda en el Grupo).
// Como Administración: se elige la empresa y la pantalla (Por orden, Por cliente, Por cobrar y pagar); cada pantalla es
// la de modulos/resultados con el contexto y los permisos del usuario en esa empresa. Los enlaces a pantallas de la
// empresa (una orden, una cotización) se abren en ella. El Estado de resultados consolidado está en Resultados del grupo.
import { el } from '../../../core/ui/dom.js?v=cd68dd0';
import { nombreEmpresa } from '../../../core/empresas.js?v=cd68dd0';
import { empresasCon, ctxDe, marcaEmpresa } from '../empresas.js?v=cd68dd0';

const PANTALLAS = [
  ['resultados.ordenes', 'Por orden', () => import('../../resultados/vistas/ordenes.js?v=cd68dd0')],
  ['resultados.clientes', 'Por cliente', () => import('../../resultados/vistas/clientes.js?v=cd68dd0')],
  ['resultados.pendientes', 'Por cobrar y pagar', () => import('../../resultados/vistas/pendientes.js?v=cd68dd0')],
  ['resultados.estado', 'Estado de resultados', () => import('../../resultados/vistas/estado.js?v=cd68dd0')],
];
const estado = { empresa: '', pantalla: 'resultados.ordenes' };

export default async function vista(ctx) {
  const empresas = empresasCon(ctx, 'resultados');
  if (!empresas.length) return el('section', { class: 'listado' }, el('h1', {}, 'Utilidad por empresa'), el('p', { class: 'texto-suave' }, 'No ves Resultados en ninguna empresa del grupo.'));
  const g = empresas.find((x) => x.empresa.id === estado.empresa) ?? empresas[0];
  estado.empresa = g.empresa.id;
  // Por orden solo donde hay Taller
  const disponibles = PANTALLAS.filter(([id]) => id !== 'resultados.ordenes' || g.modulos.has('taller'));
  const actual = disponibles.find(([id]) => id === estado.pantalla) ?? disponibles[0];
  estado.pantalla = actual[0];

  const ctxE = { ...ctxDe(ctx, g), params: {} };
  const contenido = await (await actual[2]()).default(ctxE);
  contenido.addEventListener?.('click', (ev) => {
    const a = ev.target.closest('a[href^="#/"]');
    if (!a || a.getAttribute('href').startsWith('#/grupo.')) return;
    ev.preventDefault(); ctx.abrirEnEmpresa(g.empresa, a.getAttribute('href'));
  });

  const cambiar = (c) => { Object.assign(estado, c); ctx.refrescar(); };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Utilidad por empresa'), el('p', { class: 'texto-suave' }, `${nombreEmpresa(g.empresa)} · cuánto deja cada orden y cada cliente, y lo que falta cobrar y pagar`)),
      empresas.length > 1 ? el('div', { class: 'segmento', role: 'group', 'aria-label': 'Empresa' }, empresas.map((x) =>
        el('button', { type: 'button', 'aria-pressed': String(x.empresa.id === g.empresa.id), onclick: () => cambiar({ empresa: x.empresa.id }) }, marcaEmpresa(x.empresa)))) : null),
    el('nav', { class: 'pestanas', 'aria-label': 'Pantalla' }, disponibles.map(([id, label]) =>
      el('a', { class: 'pestana', href: '#', 'aria-current': id === estado.pantalla ? 'page' : null, onclick: (ev) => { ev.preventDefault(); cambiar({ pantalla: id }); } }, label))),
    contenido);
}
