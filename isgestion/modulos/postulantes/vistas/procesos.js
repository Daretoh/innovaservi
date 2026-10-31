// Procesos de selección: vacante o cargo, cupos, requisitos (lista que se marca en cada postulante), abrir o cerrar.
import { el } from '../../../core/ui/dom.js?v=66a811d';
import { icono } from '../../../core/ui/iconos.js?v=66a811d';
import { listado, boton } from '../../../core/ui/tabla.js?v=66a811d';
import { abrirFormulario } from '../../../core/ui/modal.js?v=66a811d';
import { avisar } from '../../../core/ui/aviso.js?v=66a811d';
import { fechaLarga } from '../../../core/ui/formato.js?v=66a811d';
import { cargarBase } from '../datos.js?v=66a811d';

export default async function vista(ctx) {
  const base = await cargarBase(ctx);
  const { data: post, error } = await ctx.api.from('sel_postulantes').select('proceso_id, estado').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).not('proceso_id', 'is', null);
  if (error) throw error;
  const cuenta = (id, est) => post.filter((p) => p.proceso_id === id && p.estado === est).length;
  const editar = ctx.puede('postulantes', 'editar');
  const filtrarPor = (id) => { try { sessionStorage.setItem('sel.proceso', id); } catch { /* sin almacenamiento */ } location.hash = ctx.ruta('postulantes.tablero'); };

  return listado({
    titulo: 'Procesos de selección',
    filas: base.procesos,
    vacio: 'Aún no hay procesos. Crea uno para ordenar a los postulantes por vacante y revisar sus requisitos.',
    acciones: ctx.puede('postulantes', 'crear') ? [boton('Nuevo proceso', { icono: 'mas', tipo: 'primario', onclick: () => formulario(ctx) })] : [],
    columnas: [
      { titulo: 'Proceso', valor: (x) => el('div', { class: 'doc-nombre' }, el('strong', {}, x.nombre), x.cargo ? el('span', { class: 'texto-suave texto-chico' }, x.cargo) : null) },
      { titulo: 'Estado', valor: (x) => el('span', { class: `chip ${x.estado === 'abierto' ? 'chip-ok' : 'chip-na'}` }, x.estado === 'abierto' ? 'Abierto' : `Cerrado${x.fecha_cierre ? ` ${fechaLarga(x.fecha_cierre)}` : ''}`) },
      { titulo: 'Contratados', valor: (x) => `${cuenta(x.id, 'contratado')}${x.vacantes ? ` de ${x.vacantes}` : ''}` },
      { titulo: 'En proceso', valor: (x) => el('button', { type: 'button', class: 'boton-enlace', onclick: () => filtrarPor(x.id) }, String(cuenta(x.id, 'activo'))) },
      { titulo: 'Requisitos', valor: (x) => (x.requisitos.length ? el('span', { title: x.requisitos.join('
') }, `${x.requisitos.length} requisito${x.requisitos.length === 1 ? '' : 's'}`) : '—') },
      { titulo: '', valor: (x) => (editar ? el('div', { class: 'doc-acciones' },
        el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${x.nombre}`, onclick: () => formulario(ctx, x) }, icono('editar', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-enlace', onclick: () => cambiar(ctx, x, x.estado === 'abierto' ? { estado: 'cerrado', fecha_cierre: new Date().toISOString().slice(0, 10) } : { estado: 'abierto', fecha_cierre: null }, x.estado === 'abierto' ? 'Proceso cerrado.' : 'Proceso reabierto.') },
          x.estado === 'abierto' ? 'Cerrar' : 'Reabrir'),
        ctx.puede('postulantes', 'eliminar') && !post.some((p) => p.proceso_id === x.id)
          ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${x.nombre}`, onclick: () => cambiar(ctx, x, { deleted_at: new Date().toISOString() }, 'Proceso eliminado.') }, icono('basura', { tam: 16 })) : null) : null) },
    ],
  });
}

async function cambiar(ctx, x, cambios, aviso) {
  const { error } = await ctx.api.from('sel_procesos').update(cambios).eq('id', x.id);
  if (error) avisar(error.message, 'error'); else { avisar(aviso); ctx.refrescar(); }
}

function formulario(ctx, x = null) {
  abrirFormulario({
    titulo: x ? 'Editar proceso' : 'Nuevo proceso de selección',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: x?.nombre ?? '', ayuda: 'Ej.: Operarios temporada 2026' },
      { id: 'cargo', etiqueta: 'Cargo', valor: x?.cargo ?? '' },
      { id: 'vacantes', etiqueta: 'Vacantes (opcional)', tipo: 'number', valor: x?.vacantes ?? '' },
      { id: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', valor: x?.descripcion ?? '' },
      { id: 'requisitos', etiqueta: 'Requisitos (uno por línea)', tipo: 'textarea', filas: 6, valor: (x?.requisitos ?? []).join('\n'),
        ayuda: 'Ej.: Certificado de antecedentes, Licencia clase B. Se marcan en la ficha de cada postulante.' },
    ],
    alGuardar: async (v) => {
      const vac = v.vacantes ? Number(v.vacantes) : null;
      if (vac != null && !(vac > 0)) throw new Error('Las vacantes deben ser un número mayor que cero.');
      const requisitos = [...new Set(v.requisitos.split('\n').map((r) => r.trim()).filter(Boolean))];
      const datos = { nombre: v.nombre.trim(), cargo: v.cargo.trim() || null, vacantes: vac, descripcion: v.descripcion.trim() || null, requisitos };
      const r = x ? await ctx.api.from('sel_procesos').update(datos).eq('id', x.id) : await ctx.api.from('sel_procesos').insert({ ...datos, empresa_id: ctx.empresa.id });
      if (r.error) throw new Error(r.error.message);
      avisar(x ? 'Proceso guardado.' : 'Proceso creado.'); ctx.refrescar();
    },
  });
}
