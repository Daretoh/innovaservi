// Cargos y tratos (trato = pago de un día completo; valor hora = trato ÷ horas por trato).
import { el } from '../../../core/ui/dom.js?v=cb36eb2';
import { icono } from '../../../core/ui/iconos.js?v=cb36eb2';
import { listado, boton } from '../../../core/ui/tabla.js?v=cb36eb2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=cb36eb2';
import { avisar } from '../../../core/ui/aviso.js?v=cb36eb2';
import { dinero } from '../../../core/ui/formato.js?v=cb36eb2';

export default async function vista(ctx) {
  const [cargos, config] = await Promise.all([
    ctx.api.from('remu_cargos').select('*').eq('empresa_id', ctx.empresa.id).order('orden').order('nombre'),
    ctx.api.from('remu_config').select('horas_trato').eq('empresa_id', ctx.empresa.id).maybeSingle(),
  ]);
  if (cargos.error) throw cargos.error;
  const ht = Number(config.data?.horas_trato ?? 8);
  const editable = ctx.puede('remu', 'editar');

  const columnas = [
    { titulo: 'Cargo', valor: (c) => c.nombre },
    { titulo: 'Trato (día)', valor: (c) => (c.trato ? dinero(c.trato) : el('span', { class: 'texto-suave' }, 'Sin trato')) },
    { titulo: 'Valor hora', valor: (c) => (c.trato ? dinero(Math.round(c.trato / ht)) : '—') },
    { titulo: 'Estado', valor: (c) => el('span', { class: `chip ${c.activo ? 'chip-ok' : 'chip-na'}` }, c.activo ? 'Activo' : 'Inactivo') },
  ];
  if (editable) {
    columnas.push({ titulo: '', valor: (c) => el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${c.nombre}`, onclick: () => editar(ctx, c, cargos.data) }, icono('editar', { tam: 16 })) });
  }
  const lista = listado({
    titulo: 'Cargos y tratos',
    filas: cargos.data,
    columnas,
    acciones: ctx.puede('remu', 'crear') ? [boton('Nuevo cargo', { icono: 'mas', tipo: 'primario', onclick: () => editar(ctx, null, cargos.data) })] : [],
    vacio: 'Aún no hay cargos.',
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, `Valor hora = trato ÷ ${ht} (se cambia en Parámetros). Un cargo sin trato usa el valor hora propio de la persona o el general.`));
  return lista;
}

function editar(ctx, c, todos) {
  abrirFormulario({
    titulo: c ? `Editar ${c.nombre}` : 'Nuevo cargo',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre },
      { id: 'trato', etiqueta: 'Trato por día ($)', tipo: 'number', valor: String(c?.trato ?? 0) },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: String(c?.orden ?? todos.length + 1) },
      ...(c ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(c.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const datos = { nombre: v.nombre.trim(), trato: Math.max(0, Number(v.trato) || 0), orden: Number(v.orden) || 0, ...(c ? { activo: v.activo === 'true' } : {}) };
      const r = c
        ? await ctx.api.from('remu_cargos').update(datos).eq('id', c.id).select('id')
        : await ctx.api.from('remu_cargos').insert({ ...datos, empresa_id: ctx.empresa.id }).select('id');
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe un cargo con ese nombre.' : r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso.');
      avisar(c ? 'Cargo actualizado.' : 'Cargo creado.');
      ctx.refrescar();
    },
  });
}
