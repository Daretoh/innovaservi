// Vehículos de los clientes: búsqueda por patente, marca, modelo o cliente, con su última visita.
import { el } from '../../../core/ui/dom.js?v=64a4e9f';
import { listado, boton } from '../../../core/ui/tabla.js?v=64a4e9f';
import { fechaLarga } from '../../../core/ui/formato.js?v=64a4e9f';
import { verPatente, nombreVehiculo, nombreTercero } from '../datos.js?v=64a4e9f';
import { recepcion } from '../recepcion.js?v=64a4e9f';

let buscar = '';

export default async function vista(ctx) {
  const [v, o] = await Promise.all([
    ctx.api.from('tal_vehiculos').select('*, terceros(razon_social, nombre_fantasia)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(2000),
    ctx.api.from('tal_ordenes').select('vehiculo_id, fecha_cita, estado').eq('empresa_id', ctx.empresa.id).neq('estado', 'anulada'),
  ]);
  if (v.error) throw v.error;
  if (o.error) throw o.error;
  const visitas = new Map();
  for (const x of o.data) { const a = visitas.get(x.vehiculo_id) ?? { n: 0, ultima: null }; a.n += 1; if (x.fecha_cita && (!a.ultima || x.fecha_cita > a.ultima)) a.ultima = x.fecha_cita; visitas.set(x.vehiculo_id, a); }
  const q = buscar.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '');
  const filas = v.data.filter((x) => !q || [x.patente, x.marca, x.modelo, nombreTercero(x.terceros)].filter(Boolean).join(' ').toLowerCase().includes(q));

  const buscador = el('input', { class: 'campo campo-filtro', type: 'search', placeholder: 'Patente, marca o cliente…', value: buscar, 'aria-label': 'Buscar vehículo' });
  buscador.addEventListener('input', () => { buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const acciones = [buscador];
  if (ctx.puede('taller', 'crear')) acciones.push(boton('Agendar vehículo', { icono: 'mas', tipo: 'primario', onclick: () => recepcion(ctx) }));

  return listado({
    titulo: 'Vehículos de clientes',
    filas,
    acciones,
    vacio: q ? 'Sin resultados.' : 'Aún no hay vehículos.',
    columnas: [
      { titulo: 'Patente', valor: (x) => el('a', { href: ctx.ruta('taller.vehiculo', { id: x.id }) }, el('strong', {}, verPatente(x.patente) || 'Sin patente')) },
      { titulo: 'Vehículo', valor: (x) => `${nombreVehiculo(x)}${x.anio ? ` ${x.anio}` : ''}` },
      { titulo: 'Talla', valor: (x) => x.talla },
      { titulo: 'Cliente', valor: (x) => nombreTercero(x.terceros) },
      { titulo: 'Visitas', valor: (x) => visitas.get(x.id)?.n ?? 0 },
      { titulo: 'Última', valor: (x) => (visitas.get(x.id)?.ultima ? fechaLarga(visitas.get(x.id).ultima) : '') },
    ],
  });
}
