// Datos y reglas compartidas de Taller.

// [clave, nombre, texto del botón para avanzar desde este estado]
export const ESTADOS = [
  ['agendado', 'Agendado', 'Ingresó'],
  ['espera', 'En espera', 'Comenzar'],
  ['proceso', 'En proceso', 'Terminar'],
  ['terminado', 'Terminado', 'Entregar'],
  ['entregado', 'Entregado', null],
];
export const nombreEstado = { ...Object.fromEntries(ESTADOS.map(([k, n]) => [k, n])), anulada: 'Anulada' };
// Marca de tiempo que se llena al llegar a cada estado
export const MARCA_DE = { espera: 'ingreso_at', proceso: 'inicio_at', terminado: 'termino_at', entregado: 'entregado_at' };

export const PRIORIDADES = [['urgente', 'Urgente'], ['prioridad', 'Prioridad'], ['normal', 'Normal'], ['programado', 'Programado']];
export const CHIP_PRIORIDAD = { urgente: 'chip-venc', prioridad: 'chip-prox', normal: 'chip-ok', programado: 'chip-pend' };
export const TIPOS_VENTA = [['normal', 'Normal'], ['regalo', 'Regalo'], ['sorteo', 'Sorteo'], ['cortesia', 'Cortesía'], ['garantia', 'Garantía']];
export const MODOS_PAGO = [['', 'Sin indicar'], ['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['debito', 'Débito'], ['credito', 'Crédito']];
export const CATEGORIAS_MEDIA = [['exterior', 'Exterior'], ['interior', 'Interior'], ['motor', 'Motor'], ['boleta', 'Boleta'], ['factura', 'Factura'], ['respaldo', 'Respaldo'], ['otro', 'Otro']];
export const TALLAS = ['S', 'M', 'L', 'XL'];
export const IVA = 0.19;

export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';
// Patente: se guarda sin separadores; se muestra ABCD-12 si tiene 6 caracteres
export const normalizarPatente = (t) => (t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
export const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');
export const nombreVehiculo = (v) => [v?.marca, v?.modelo].filter(Boolean).join(' ') || 'Vehículo';
export const precioTalla = (s, talla) => s?.[`precio_${(talla || 'M').toLowerCase()}`] ?? null;

// ¿El cliente es empresa? (RUT de 50.000.000 o más, como las sociedades en Chile). A una empresa se le hace factura:
// al agendar, la orden queda con Factura y el cobro suma el IVA (como el OS de IS Performance, 2026-10-22).
export const esEmpresa = (t) => { const n = Number(String(t?.rut ?? '').replace(/[^0-9kK]/g, '').slice(0, -1)); return n >= 50000000; };

// Totales de una orden: neto (servicios − descuento), IVA si es factura, total, abono y saldo.
// Venta no normal (regalo, sorteo, cortesía, garantía): no se cobra; el ingreso es solo el abono.
export function totales(o, servicios) {
  const bruto = servicios.reduce((s, x) => s + Number(x.precio || 0), 0);
  const neto = Math.max(0, bruto - Number(o.descuento || 0));
  const normal = o.tipo_venta === 'normal';
  const iva = normal && o.doc_tipo === 'factura' ? Math.round(neto * IVA) : 0;
  const total = normal ? neto + iva : 0;
  const abono = Number(o.abono || 0);
  return { bruto, neto, iva, total, abono, saldo: Math.max(0, total - abono), ingreso: normal ? total : abono };
}

// Minutos de trabajo: del inicio al término (o a ahora) menos el tiempo muerto
export function minutosTrabajo(o) {
  if (!o.inicio_at) return null;
  const fin = o.termino_at ? new Date(o.termino_at) : new Date();
  return Math.max(0, Math.round((fin - new Date(o.inicio_at)) / 60000) - (o.t_muerto_min || 0));
}
export const textoMinutos = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`);
export const hora = (ts) => (ts ? new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');
export const fechaHora = (ts) => (ts ? new Date(ts).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '');

export const SELECT_ORDEN = '*, tal_vehiculos(id, patente, marca, modelo, anio, talla, color), terceros(id, razon_social, nombre_fantasia, telefono), tal_orden_servicios(id, servicio_id, nombre, precio, orden)';

// Trabajadores activos de la empresa (para asignar órdenes)
export async function cargarTrabajadores(ctx) {
  const { data, error } = await ctx.api.from('persona_empresa').select('persona_id, estado, cargo, personas(nombres, apellido_paterno)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null);
  if (error) throw error;
  const lista = data.map((v) => ({ id: v.persona_id, estado: v.estado, nombre: `${(v.personas?.nombres ?? '').split(' ')[0]} ${v.personas?.apellido_paterno ?? ''}`.trim() }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { lista, de: new Map(lista.map((p) => [p.id, p])) };
}

export async function cargarServicios(ctx, { todos = false } = {}) {
  let q = ctx.api.from('tal_servicios').select('*').eq('empresa_id', ctx.empresa.id).order('orden').order('nombre');
  if (!todos) q = q.eq('activo', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// Siguiente número de orden (correlativo por empresa)
export async function siguienteNumero(ctx) {
  const { data, error } = await ctx.api.rpc('siguiente_correlativo', { p_empresa: ctx.empresa.id, p_modulo: 'taller', p_clave: 'taller.orden' });
  if (error) throw new Error(error.message);
  return data;
}
