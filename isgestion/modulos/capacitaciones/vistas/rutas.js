// Capacitaciones → Rutas: listas de contenidos que debe ver un grupo de trabajadores (ej.: "Inducción pulidor").
// Muestra cuántos contenidos y personas tiene cada una y su avance (visto / aprobado).
// Ruta: #/capacitaciones.rutas
import { el } from '../../../core/ui/dom.js?v=a90bd70';
import { boton, listado } from '../../../core/ui/tabla.js?v=a90bd70';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a90bd70';
import { avisar } from '../../../core/ui/aviso.js?v=a90bd70';
import { cargarEstilos } from '../datos.js?v=a90bd70';
import { cargarRutas, barraAvance } from './ruta.js?v=a90bd70';

export default async function vista(ctx) {
  cargarEstilos();
  const d = await cargarRutas(ctx);
  const filas = d.rutas.map((r) => {
    const items = d.itemsDe(r.id).filter((i) => d.contenidoDe.has(i.contenido_id));
    const pers = d.personasDe(r.id);
    let vistos = 0; let aprobados = 0;
    for (const p of pers) for (const i of items) {
      const a = d.avance.get(`${i.contenido_id}|${p.persona_id}`);
      if (a?.visto_at) vistos++;
      if (a?.aprobado) aprobados++;
    }
    return { r, items: items.length, personas: pers.length, total: items.length * pers.length, vistos, aprobados };
  });
  const acciones = ctx.puede('capacitaciones', 'crear') ? [boton('Nueva ruta', { icono: 'mas', tipo: 'primario', onclick: () => nuevaRuta(ctx) })] : [];
  const vista = listado({
    titulo: 'Rutas de capacitación',
    acciones,
    vacio: 'Aún no hay rutas. Una ruta junta los contenidos que debe ver un cargo (ej.: Inducción pulidor).',
    alFila: (f) => { location.hash = ctx.ruta('capacitaciones.ruta', { id: f.r.id }); },
    columnas: [
      { titulo: 'Ruta', valor: (f) => el('span', {}, el('strong', {}, f.r.nombre), f.r.activa ? null : el('span', { class: 'chip chip-na', style: 'margin-left:6px' }, 'Inactiva')) },
      { titulo: 'Cargo', valor: (f) => f.r.cargo ?? '' },
      { titulo: 'Contenidos', valor: (f) => String(f.items) },
      { titulo: 'Trabajadores', valor: (f) => String(f.personas) },
      { titulo: 'Avance', valor: (f) => (f.total ? barraAvance(f.vistos, f.aprobados, f.total) : el('span', { class: 'texto-suave' }, '—')) },
    ],
    filas,
  });
  return vista;
}

function nuevaRuta(ctx) {
  abrirFormulario({
    titulo: 'Nueva ruta',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, ayuda: 'Ej.: Inducción pulidor, Lavado básico.' },
      { id: 'cargo', etiqueta: 'Cargo al que apunta (opcional)', ayuda: 'Sirve para agregar de una vez a todos los de ese cargo.' },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', filas: 2 },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const { data, error } = await ctx.api.from('cap_rutas').insert({ empresa_id: ctx.empresa.id, nombre: v.nombre.trim(), cargo: v.cargo.trim() || null, descripcion: v.descripcion.trim() || null }).select('id').single();
      if (error) throw new Error(error.message);
      avisar('Ruta creada.');
      location.hash = ctx.ruta('capacitaciones.ruta', { id: data.id });
    },
  });
}
