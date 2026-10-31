// Empresas y módulos: matriz módulo × empresa para activar o desactivar (con_modulo) y suspender o reactivar
// una empresa (con_empresa_activa). En un módulo activo, "Pantallas" elige cuáles de sus pantallas (pestañas) ve la
// empresa (con_pantallas): por ejemplo, de Asistencia solo el Registro de horas. Al activar un módulo se activan
// también los que necesita; no se desactiva uno del que dependen otros activos. Los del núcleo siempre quedan activos. Ruta: #/empresas (?e= resalta una).
import { el } from '../../core/ui/dom.js?v=66a811d';
import { icono } from '../../core/ui/iconos.js?v=66a811d';
import { boton } from '../../core/ui/tabla.js?v=66a811d';
import { abrirFormulario } from '../../core/ui/modal.js?v=66a811d';
import { avisar } from '../../core/ui/aviso.js?v=66a811d';
import { cargarTodo } from './datos.js?v=66a811d';
import { cargarManifiestos } from '../../core/modulos.js?v=66a811d';

export default async function vista(ctx) {
  const [d, mods, pant, manifiestos] = await Promise.all([cargarTodo(ctx), ctx.api.rpc('con_modulos'), ctx.api.rpc('con_pantallas_todas'), cargarManifiestos()]);
  if (mods.error) throw new Error(mods.error.message);
  if (pant.error) throw new Error(pant.error.message);
  const ocultasDe = (e, m) => new Set(pant.data.find((x) => x.empresa_id === e.empresa_id && x.modulo_id === m.id)?.ocultas ?? []);
  const pantallasDe = (m) => manifiestos.find((x) => x.id === m.id)?.menu.filter((it) => !it.oculto) ?? [];
  const modulos = mods.data;
  const nombreMod = Object.fromEntries(modulos.map((m) => [m.id, m.nombre]));
  const clienteDe = (e) => d.clientes.find((c) => c.id === e.cliente_id)?.nombre ?? 'Sin cliente';
  const activos = new Map(d.empresas.map((e) => [e.empresa_id, new Set(e.modulos)]));

  const cambiar = async (e, m, activar, caja) => {
    const set = activos.get(e.empresa_id);
    const nombreE = e.nombre_fantasia || e.razon_social;
    try {
      if (activar) {
        // Primero lo que necesita (recursivo)
        const faltan = [];
        const visitar = (id) => { for (const dep of modulos.find((x) => x.id === id)?.depende ?? []) if (!set.has(dep) && !faltan.includes(dep)) { visitar(dep); faltan.push(dep); } };
        visitar(m.id);
        for (const dep of faltan) { const { error } = await ctx.api.rpc('con_modulo', { p_empresa: e.empresa_id, p_modulo: dep, p_activo: true }); if (error) throw new Error(error.message); }
        const { error } = await ctx.api.rpc('con_modulo', { p_empresa: e.empresa_id, p_modulo: m.id, p_activo: true });
        if (error) throw new Error(error.message);
        avisar(`${m.nombre} activado en ${nombreE}${faltan.length ? ` (también: ${faltan.map((x) => nombreMod[x]).join(', ')})` : ''}.`);
      } else {
        const dependen = modulos.filter((x) => set.has(x.id) && x.depende.includes(m.id));
        if (dependen.length) throw new Error(`No se puede desactivar ${m.nombre}: lo usan ${dependen.map((x) => x.nombre).join(', ')}.`);
        const { error } = await ctx.api.rpc('con_modulo', { p_empresa: e.empresa_id, p_modulo: m.id, p_activo: false });
        if (error) throw new Error(error.message);
        avisar(`${m.nombre} desactivado en ${nombreE}. Los datos se conservan.`);
      }
      ctx.refrescar();
    } catch (err) { caja.checked = !activar; avisar(err.message, 'error'); }
  };

  // Elegir las pantallas que ve la empresa en un módulo activo
  const pantallas = (e, m) => {
    const todas = pantallasDe(m); const ocultas = ocultasDe(e, m);
    abrirFormulario({
      titulo: `${m.nombre} en ${e.nombre_fantasia || e.razon_social}`,
      mensaje: 'Marca las pantallas que verá la empresa. Las demás no aparecen en su menú (sus datos y permisos no cambian).',
      campos: [{ id: 'ver', etiqueta: 'Pantallas', tipo: 'checks', opciones: todas.map((it) => [it.id, it.label]), valor: todas.filter((it) => !ocultas.has(it.id)).map((it) => it.id) }],
      alGuardar: async (v) => {
        if (!v.ver.length) throw new Error('Deja al menos una pantalla (o desactiva el módulo).');
        const { error } = await ctx.api.rpc('con_pantallas', { p_empresa: e.empresa_id, p_modulo: m.id, p_ocultas: todas.map((it) => it.id).filter((id) => !v.ver.includes(id)) });
        if (error) throw new Error(error.message);
        avisar(v.ver.length === todas.length ? 'Se ven todas las pantallas.' : `Se ven ${v.ver.length} de ${todas.length} pantallas.`); ctx.refrescar();
      },
    });
  };

  const suspender = (e) => abrirFormulario({
    titulo: `${e.activa ? 'Suspender' : 'Reactivar'} ${e.nombre_fantasia || e.razon_social}`,
    mensaje: e.activa ? 'Sus usuarios dejan de ver la empresa hasta reactivarla. Los datos no se borran.' : 'La empresa vuelve a estar disponible para sus usuarios.',
    campos: [], textoGuardar: e.activa ? 'Suspender' : 'Reactivar',
    alGuardar: async () => {
      const { error } = await ctx.api.rpc('con_empresa_activa', { p_empresa: e.empresa_id, p_activa: !e.activa });
      if (error) throw new Error(error.message);
      avisar(e.activa ? 'Empresa suspendida.' : 'Empresa reactivada.'); ctx.refrescar();
    },
  });

  // Agrupar módulos por categoría
  const grupos = new Map();
  for (const m of modulos) { const k = m.categoria || 'Núcleo'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(m); }
  const resaltada = ctx.params.e;
  const tabla = el('table', { class: 'tabla con-matriz' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Módulo'), d.empresas.map((e) => el('th', { class: e.empresa_id === resaltada ? 'resaltada' : '' },
      el('div', { class: 'con-col-empresa' },
        el('span', { class: 'punto', style: `background:${e.color || 'var(--empresa)'}` }),
        el('span', {}, el('strong', {}, e.nombre_fantasia || e.razon_social), el('span', { class: 'texto-suave texto-chico' }, clienteDe(e))),
        e.activa ? null : el('span', { class: 'chip chip-venc' }, 'Suspendida')))))),
    el('tbody', {}, [...grupos].flatMap(([cat, ms]) => [
      el('tr', { class: 'con-grupo' }, el('td', { colspan: d.empresas.length + 1 }, cat)),
      ...ms.map((m) => el('tr', {},
        el('td', {}, el('strong', {}, m.nombre), m.depende.length ? el('span', { class: 'texto-suave texto-chico' }, ` · usa ${m.depende.map((x) => nombreMod[x] ?? x).join(', ')}`) : null),
        d.empresas.map((e) => {
          const caja = el('input', { type: 'checkbox', checked: activos.get(e.empresa_id).has(m.id) || m.es_nucleo, disabled: m.es_nucleo, 'aria-label': `${m.nombre} en ${e.nombre_fantasia || e.razon_social}`, title: m.es_nucleo ? 'Núcleo: siempre activo' : '' });
          caja.addEventListener('change', () => cambiar(e, m, caja.checked, caja));
          const activo = activos.get(e.empresa_id).has(m.id);
          const todas = pantallasDe(m); const ocultas = ocultasDe(e, m);
          const botonPant = activo && todas.length > 1
            ? el('button', { type: 'button', class: `boton-enlace con-pantallas${ocultas.size ? ' con-pantallas-parcial' : ''}`, title: 'Elegir las pantallas que ve esta empresa', onclick: () => pantallas(e, m) },
              ocultas.size ? `${todas.length - ocultas.size}/${todas.length}` : 'Pantallas')
            : null;
          return el('td', { class: e.empresa_id === resaltada ? 'resaltada' : '' }, el('div', { class: 'con-celda' }, caja, botonPant));
        }))),
    ])));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Empresas y módulos')),
    el('div', { class: 'fin-tarjetas' }, d.empresas.map((e) => el('div', { class: `ficha doc-grupo fin-tarjeta ${e.activa ? '' : 'fin-alerta'}` },
      el('span', { class: 'texto-suave texto-chico' }, clienteDe(e)),
      el('strong', {}, e.nombre_fantasia || e.razon_social),
      el('span', { class: 'texto-suave texto-chico' }, `${e.modulos.length} módulos · ${e.trabajadores} trabajadores · ${e.usuarios} usuarios`),
      boton(e.activa ? 'Suspender' : 'Reactivar', { icono: e.activa ? 'cerrar' : 'check', onclick: () => suspender(e) })))),
    el('div', { class: 'tabla-contenedor' }, tabla),
    el('p', { class: 'texto-suave texto-chico' }, icono('alerta', { tam: 14 }), ' Desactivar un módulo solo lo oculta: sus datos se conservan y vuelven al activarlo. Los cambios quedan en la auditoría.'));
}
