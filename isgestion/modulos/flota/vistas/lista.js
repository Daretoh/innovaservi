// Flota: vehículos, maquinaria y equipos con su estado, documentos por vencer y gasto del año.
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { listado, boton } from '../../../core/ui/tabla.js?v=a7f53fa';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a7f53fa';
import { dinero } from '../../../core/ui/formato.js?v=a7f53fa';
import { cargarFlota, alertas, textoVence, TIPOS, ESTADOS, normalizarPatente } from '../datos.js?v=a7f53fa';

let verInactivos = false;
const nombreTipo = Object.fromEntries(TIPOS);
const CHIP_ESTADO = { activo: ['chip-ok', 'Activo'], taller: ['chip-prox', 'En taller'], inactivo: ['chip-na', 'Inactivo'] };

export default async function vista(ctx) {
  const anio = new Date().getFullYear();
  const flota = await cargarFlota(ctx, { desde: `${anio}-01-01` });
  const visibles = flota.filter((v) => verInactivos || v.estado !== 'inactivo');
  const gastoAnio = (v) => v.registros.filter((r) => r.fecha >= `${anio}-01-01`).reduce((s, r) => s + Number(r.monto), 0);
  const conAlerta = flota.filter((v) => v.estado !== 'inactivo' && alertas(v.registros).length).length;

  const filtro = el('label', { class: 'casilla' }, el('input', { type: 'checkbox', class: 'interruptor', checked: verInactivos, onchange: (ev) => { verInactivos = ev.target.checked; ctx.refrescar(); } }), 'Ver inactivos');
  const acciones = [filtro];
  if (ctx.puede('flota', 'crear')) acciones.push(boton('Nuevo vehículo', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx) }));

  const lista = listado({
    titulo: 'Flota',
    filas: visibles,
    acciones,
    vacio: flota.length ? 'No hay vehículos activos.' : 'Aún no hay vehículos ni maquinaria.',
    columnas: [
      { titulo: 'Vehículo', valor: (v) => el('div', {}, el('a', { href: ctx.ruta('flota.vehiculo', { id: v.id }) }, el('strong', {}, v.nombre)),
        el('div', { class: 'texto-suave texto-chico' }, [nombreTipo[v.tipo], [v.marca, v.modelo, v.anio].filter(Boolean).join(' ')].filter(Boolean).join(' · '))) },
      { titulo: 'Patente', valor: (v) => v.patente ?? '' },
      { titulo: 'Estado', valor: (v) => el('span', { class: `chip ${CHIP_ESTADO[v.estado][0]}` }, CHIP_ESTADO[v.estado][1]) },
      { titulo: 'Documentos', valor: (v) => { const a = alertas(v.registros); return a.length ? el('div', { class: 'chips-fila' }, a.map((x) => el('span', { class: `chip ${x.k === 'venc' ? 'chip-venc' : 'chip-prox'}` }, textoVence(x)))) : el('span', { class: 'texto-suave' }, 'Al día'); } },
      { titulo: 'Km', valor: (v) => (v.km != null ? v.km.toLocaleString('es-CL') : '') },
      { titulo: `Gasto ${anio}`, valor: (v) => dinero(gastoAnio(v)) },
    ],
  });
  if (conAlerta) lista.insertBefore(el('div', { class: 'resumen-chips' }, el('span', { class: 'chip chip-venc' }, `${conAlerta} ${conAlerta === 1 ? 'vehículo con documentos vencidos o por vencer' : 'vehículos con documentos vencidos o por vencer'}`)), lista.children[1]);
  return lista;
}

function nuevo(ctx) {
  abrirFormulario({
    titulo: 'Nuevo vehículo',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS, valor: 'vehiculo' },
      { id: 'marca', etiqueta: 'Marca' },
      { id: 'modelo', etiqueta: 'Modelo' },
      { id: 'anio', etiqueta: 'Año', tipo: 'number' },
      { id: 'patente', etiqueta: 'Patente (si tiene)' },
      { id: 'nombre', etiqueta: 'Nombre para mostrar', ayuda: 'Si lo dejas vacío se usa marca y modelo. Ej.: Camioneta roja.' },
      { id: 'km', etiqueta: 'Kilometraje actual', tipo: 'number' },
      { id: 'estado', etiqueta: 'Estado', opciones: ESTADOS, valor: 'activo' },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const patente = normalizarPatente(v.patente);
      const nombre = v.nombre.trim() || [v.marca.trim(), v.modelo.trim()].filter(Boolean).join(' ') || patente;
      if (!nombre) throw new Error('Indica marca y modelo, un nombre o la patente.');
      const { data, error } = await ctx.api.from('flo_vehiculos').insert({
        empresa_id: ctx.empresa.id, nombre, tipo: v.tipo, marca: v.marca.trim() || null, modelo: v.modelo.trim() || null,
        anio: v.anio ? Number(v.anio) : null, patente, km: v.km ? Number(v.km) : null, estado: v.estado,
      }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Ya hay un vehículo con esa patente.' : error.message);
      location.hash = ctx.ruta('flota.vehiculo', { id: data.id });
    },
  });
}
