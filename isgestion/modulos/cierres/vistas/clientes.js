// Clientes con cierre mensual: sus órdenes del taller se cobran en un cierre por mes (no una a una).
// Los precios salen de la lista de precios del cliente (Cotizaciones → Listas de precios).
import { el } from '../../../core/ui/dom.js?v=e4cf9a2';
import { boton } from '../../../core/ui/tabla.js?v=e4cf9a2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=e4cf9a2';
import { avisar } from '../../../core/ui/aviso.js?v=e4cf9a2';
import { nombreTercero } from '../datos.js?v=e4cf9a2';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [cli, ter, pre] = await Promise.all([
    ctx.api.from('cie_clientes').select('*, terceros(id, razon_social, nombre_fantasia)').eq('empresa_id', e),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.puede('cotizaciones', 'ver') ? ctx.api.from('cot_precios').select('tercero_id').eq('empresa_id', e) : Promise.resolve({ data: null }),
  ]);
  if (cli.error) throw cli.error;
  const conLista = pre.data ? new Set(pre.data.map((p) => p.tercero_id)) : null;
  const libres = (ter.data ?? []).filter((t) => !cli.data.some((c) => c.tercero_id === t.id));
  const editar = ctx.puede('cierres', 'editar');

  const formulario = (c) => abrirFormulario({
    titulo: c ? nombreTercero(c.terceros) : 'Cliente con cierre mensual',
    mensaje: c ? null : 'Sus órdenes del taller y sus faenas enviadas se cobrarán en un cierre por mes. Mientras esté activo, la orden del taller no se puede cobrar sola.',
    campos: [
      ...(c ? [] : [{ id: 'tercero', etiqueta: 'Cliente', opciones: libres.map((t) => [t.id, nombreTercero(t)]) }]),
      { id: 'iva', etiqueta: 'IVA', opciones: [['si', 'Afecto a IVA (19 %)'], ['no', 'Sin IVA']], valor: c && !c.afecto_iva ? 'no' : 'si' },
      { id: 'nota', etiqueta: 'Nota al pie del resumen (opcional)', tipo: 'textarea', valor: c?.nota ?? '' },
      ...(c ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo (sus órdenes vuelven a cobrarse una a una)']], valor: String(c.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { afecto_iva: v.iva === 'si', nota: v.nota.trim() || null, ...(c ? { activo: v.activo === 'true' } : {}) };
      const r = c ? await ctx.api.from('cie_clientes').update(datos).eq('id', c.id)
        : await ctx.api.from('cie_clientes').insert({ ...datos, empresa_id: e, tercero_id: v.tercero });
      if (r.error) throw new Error(r.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Clientes con cierre mensual'),
      editar && libres.length ? el('div', { class: 'listado-acciones' }, boton('Agregar cliente', { icono: 'mas', tipo: 'primario', onclick: () => formulario(null) })) : null),
    el('div', { class: 'ficha doc-grupo' },
      cli.data.length ? cli.data.map((c) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' },
          editar ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); formulario(c); } }, el('strong', {}, nombreTercero(c.terceros))) : el('strong', {}, nombreTercero(c.terceros)),
          el('span', { class: 'texto-suave texto-chico' }, [c.afecto_iva ? 'afecto a IVA' : 'sin IVA', c.activo ? null : 'inactivo',
            conLista ? (conLista.has(c.tercero_id) ? 'con lista de precios' : 'sin lista de precios') : null].filter(Boolean).join(' · '))),
        conLista && ctx.puede('cotizaciones', 'ver') ? el('a', { class: 'texto-chico', href: ctx.ruta('cotizaciones.precios') }, 'Lista de precios') : null))
        : el('p', { class: 'texto-suave' }, 'Sin clientes con cierre mensual.')),
    el('p', { class: 'texto-suave texto-chico' }, 'En Taller, al agregar un servicio a una orden de un cliente con lista de precios, se usa el precio de su lista según la talla.'));
}
