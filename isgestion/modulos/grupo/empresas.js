// Empresas del Grupo donde el usuario puede usar un módulo (activo en la empresa y con el permiso), y el contexto de
// cada una (ctx con su empresa y sus permisos) para usar las funciones de los módulos tal cual.
import { el } from '../../core/ui/dom.js?v=60a60f0';
import { nombreEmpresa } from '../../core/empresas.js?v=60a60f0';

export const empresasCon = (ctx, modulo, accion = 'ver') => (ctx.grupo ?? []).filter((g) => g.modulos.has(modulo) && g.puede(modulo, accion));
export const ctxDe = (ctx, g) => ({ ...ctx, empresa: g.empresa, puede: g.puede });

// Nombre de la empresa con su color
export const marcaEmpresa = (e) => el('span', { class: 'ger-empresa' }, el('i', { style: `background:${e.color || 'var(--empresa)'}` }), nombreEmpresa(e));

// Enlace a una pantalla de una empresa: cambia a esa empresa y la abre
export const enlaceEmpresa = (ctx, empresa, hash, ...hijos) => el('a', { href: hash, onclick: (ev) => { ev.preventDefault(); ctx.abrirEnEmpresa(empresa, hash); } }, ...hijos);
