// Accidentes, enfermedades profesionales e incidentes: listado por año con indicadores simples.
import { el } from '../../../core/ui/dom.js?v=30360b8';
import { icono } from '../../../core/ui/iconos.js?v=30360b8';
import { listado, boton } from '../../../core/ui/tabla.js?v=30360b8';
import { abrirFormulario } from '../../../core/ui/modal.js?v=30360b8';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=30360b8';
import { TIPOS_ACC, GRAVEDAD, nombreDe, cargarPersonas, cargarClientes } from '../datos.js?v=30360b8';

const estado = { anio: new Date().getFullYear() };
const tipo = nombreDe(TIPOS_ACC);
const grav = nombreDe(GRAVEDAD);

export default async function vista(ctx) {
  const [{ data, error }, personas, clientes] = await Promise.all([
    ctx.api.from('sst_accidentes').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
      .gte('fecha', `${estado.anio}-01-01`).lte('fecha', `${estado.anio}-12-31`).order('fecha', { ascending: false }),
    cargarPersonas(ctx, { todas: true }),
    cargarClientes(ctx),
  ]);
  if (error) throw error;
  const cli = new Map(clientes.map((c) => [c.id, c.nombre]));
  const conLesion = data.filter((a) => a.tipo !== 'incidente');
  const dias = data.reduce((s, a) => s + a.dias_perdidos, 0);

  const mover = (n) => { estado.anio += n; ctx.refrescar(); };
  const acciones = [
    el('div', { class: 'nav-periodo' },
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año anterior', onclick: () => mover(-1) }, icono('volver')),
      el('strong', {}, String(estado.anio)),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Año siguiente', onclick: () => mover(1) }, icono('derecha'))),
  ];
  if (ctx.puede('sst', 'crear')) acciones.push(boton('Registrar', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx, personas, clientes) }));

  const lista = listado({
    titulo: 'Accidentes e incidentes',
    filas: data,
    acciones,
    vacio: `Sin registros en ${estado.anio}.`,
    columnas: [
      { titulo: 'Fecha', valor: (a) => fechaLarga(a.fecha) },
      { titulo: 'Tipo', valor: (a) => el('a', { href: ctx.ruta('sst.accidente', { id: a.id }) }, tipo[a.tipo]) },
      { titulo: 'Persona', valor: (a) => personas.de.get(a.persona_id)?.nombre ?? '—' },
      { titulo: 'Mandante / lugar', valor: (a) => [cli.get(a.tercero_id), a.lugar].filter(Boolean).join(' · ') },
      { titulo: 'Gravedad', valor: (a) => el('span', { class: `chip ${a.gravedad === 'leve' ? 'chip-prox' : 'chip-venc'}` }, grav[a.gravedad]) },
      { titulo: 'Días perdidos', valor: (a) => a.dias_perdidos },
      { titulo: 'Estado', valor: (a) => el('span', { class: `chip ${a.estado === 'cerrado' ? 'chip-ok' : 'chip-pend'}` }, a.estado === 'cerrado' ? 'Cerrado' : 'Abierto') },
    ],
  });
  lista.insertBefore(el('div', { class: 'resumen-chips' },
    el('span', { class: 'chip chip-pend' }, `${conLesion.length} con lesión o enfermedad`),
    el('span', { class: 'chip chip-pend' }, `${data.length - conLesion.length} incidentes`),
    el('span', { class: 'chip chip-pend' }, `${dias} días perdidos`),
    data.some((a) => a.estado === 'abierto') ? el('span', { class: 'chip chip-venc' }, `${data.filter((a) => a.estado === 'abierto').length} abiertos`) : null), lista.children[1]);
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Un accidente del trabajo o de trayecto se denuncia al organismo administrador (DIAT) dentro de 24 horas. Los graves y fatales además se informan de inmediato a la Inspección del Trabajo y a la SEREMI de Salud.'));
  return lista;
}

function nuevo(ctx, personas, clientes) {
  abrirFormulario({
    titulo: 'Registrar accidente o incidente',
    mensaje: 'Después completas la investigación (causas, medidas y testigos) en el detalle.',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ACC, valor: 'trabajo' },
      { id: 'persona_id', etiqueta: 'Persona afectada', opciones: [['', 'Sin lesionado (incidente)'], ...personas.lista.filter((p) => p.estado === 'activo').map((p) => [p.id, p.nombre])] },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'hora', etiqueta: 'Hora', tipo: 'time' },
      { id: 'gravedad', etiqueta: 'Gravedad', opciones: GRAVEDAD, valor: 'leve' },
      { id: 'tercero_id', etiqueta: 'Mandante donde ocurrió', opciones: [['', 'Ninguno / interno'], ...clientes.map((c) => [c.id, c.nombre])] },
      { id: 'lugar', etiqueta: 'Lugar' },
      { id: 'descripcion', etiqueta: 'Qué ocurrió', tipo: 'textarea', requerido: true },
    ],
    textoGuardar: 'Registrar',
    alGuardar: async (v) => {
      if (v.tipo !== 'incidente' && !v.persona_id) throw new Error('Indica la persona afectada (o elige "Incidente").');
      const { data, error } = await ctx.api.from('sst_accidentes').insert({
        empresa_id: ctx.empresa.id, tipo: v.tipo, persona_id: v.persona_id || null, fecha: v.fecha, hora: v.hora || null, gravedad: v.gravedad,
        tercero_id: v.tercero_id || null, lugar: v.lugar.trim() || null, descripcion: v.descripcion.trim(),
      }).select('id').single();
      if (error) throw new Error(error.message);
      location.hash = ctx.ruta('sst.accidente', { id: data.id });
    },
  });
}
