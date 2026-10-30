// Vehículo de un cliente: datos (se guardan al salir del campo) e historial de órdenes.
// Ruta: #/taller.vehiculo?id=<id>
import { el } from '../../../core/ui/dom.js?v=14ad9ff';
import { icono } from '../../../core/ui/iconos.js?v=14ad9ff';
import { boton } from '../../../core/ui/tabla.js?v=14ad9ff';
import { avisar } from '../../../core/ui/aviso.js?v=14ad9ff';
import { dinero, fechaLarga } from '../../../core/ui/formato.js?v=14ad9ff';
import { TALLAS, verPatente, normalizarPatente, nombreVehiculo, nombreTercero, nombreEstado, totales } from '../datos.js?v=14ad9ff';
import { recepcion } from '../recepcion.js?v=14ad9ff';

export default async function vista(ctx) {
  const [{ data: v, error }, ords, clientes] = await Promise.all([
    ctx.api.from('tal_vehiculos').select('*').eq('id', ctx.params.id).maybeSingle(),
    ctx.api.from('tal_ordenes').select('*, tal_orden_servicios(nombre, precio)').eq('vehiculo_id', ctx.params.id).order('numero', { ascending: false }),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('taller.vehiculos') }, icono('volver', { tam: 16 }), 'Vehículos de clientes');
  if (!v || v.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Vehículo no encontrado'));
  const editable = ctx.puede('taller', 'editar');

  const campo = (id, etiqueta, { tipo = 'text', opciones } = {}) => {
    const c = opciones
      ? el('select', { class: 'campo', id: `v-${id}`, disabled: !editable }, opciones.map(([k, t]) => el('option', { value: k, selected: String(v[id] ?? '') === k }, t)))
      : el('input', { class: 'campo', id: `v-${id}`, type: tipo, value: id === 'patente' ? verPatente(v.patente) : v[id] ?? '', disabled: !editable });
    c.addEventListener('change', async () => {
      let val = c.value.trim();
      if (id === 'patente') val = normalizarPatente(val);
      else if (tipo === 'number') val = val === '' ? null : Number(val);
      else if (val === '') val = null;
      const { error: e } = await ctx.api.from('tal_vehiculos').update({ [id]: val }).eq('id', v.id);
      if (e) { avisar(e.code === '23505' ? 'Ya hay un vehículo con esa patente.' : e.message, 'error'); return; }
      v[id] = val; avisar('Guardado.');
      if (id === 'patente') c.value = verPatente(val);
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `v-${id}` }, etiqueta), c);
  };

  const historial = (ords.data ?? []).map((o) => {
    const t = totales(o, o.tal_orden_servicios);
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' },
        el('a', { href: ctx.ruta('taller.orden', { id: o.id }) }, el('strong', {}, `N° ${o.numero} · ${o.fecha_cita ? fechaLarga(o.fecha_cita) : 'sin fecha'}`)),
        el('span', { class: 'texto-suave texto-chico' }, o.tal_orden_servicios.map((s) => s.nombre).join(', ') || 'Sin servicios')),
      el('span', { class: `chip ${o.estado === 'anulada' ? 'chip-na' : o.estado === 'entregado' ? 'chip-ok' : 'chip-prox'}` }, nombreEstado[o.estado]),
      el('strong', {}, o.estado === 'anulada' ? '' : dinero(t.ingreso)));
  });

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, `${nombreVehiculo(v)}${v.anio ? ` ${v.anio}` : ''}`), el('p', { class: 'texto-suave' }, [verPatente(v.patente), `Talla ${v.talla}`, v.color].filter(Boolean).join(' · '))),
      ctx.puede('taller', 'crear') ? el('div', { class: 'listado-acciones' }, boton('Agendar', { icono: 'calendario', tipo: 'primario', onclick: () => recepcion(ctx, { vehiculo: v }) })) : null),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        el('div', { class: 'rejilla-campos' }, campo('patente', 'Patente'), campo('talla', 'Talla', { opciones: TALLAS.map((t) => [t, t]) })),
        el('div', { class: 'rejilla-campos' }, campo('marca', 'Marca'), campo('modelo', 'Modelo')),
        el('div', { class: 'rejilla-campos' }, campo('anio', 'Año', { tipo: 'number' }), campo('color', 'Color')),
        campo('tercero_id', 'Cliente habitual', { opciones: [['', 'Sin cliente'], ...(clientes.data ?? []).map((c) => [c.id, nombreTercero(c)])] }),
        campo('notas', 'Notas')),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, `Historial (${historial.length})`),
        historial.length ? historial : el('p', { class: 'texto-suave' }, 'Sin órdenes.'))));
}
