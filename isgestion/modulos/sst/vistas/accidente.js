// Detalle e investigación de un accidente o incidente. Los campos se guardan al salir de cada uno.
// Ruta: #/sst.accidente?id=<id>
import { el } from '../../../core/ui/dom.js?v=89cd423';
import { icono } from '../../../core/ui/iconos.js?v=89cd423';
import { boton } from '../../../core/ui/tabla.js?v=89cd423';
import { abrirFormulario } from '../../../core/ui/modal.js?v=89cd423';
import { avisar } from '../../../core/ui/aviso.js?v=89cd423';
import { fechaLarga, hhmm } from '../../../core/ui/formato.js?v=89cd423';
import { TIPOS_ACC, GRAVEDAD, nombreDe, cargarPersonas, cargarClientes } from '../datos.js?v=89cd423';

export default async function vista(ctx) {
  const [{ data: a, error }, personas, clientes] = await Promise.all([
    ctx.api.from('sst_accidentes').select('*').eq('id', ctx.params.id).maybeSingle(),
    cargarPersonas(ctx, { todas: true }),
    cargarClientes(ctx),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('sst.accidentes') }, icono('volver', { tam: 16 }), 'Accidentes e incidentes');
  if (!a || a.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Registro no encontrado'));
  const editable = ctx.puede('sst', 'editar');

  const guardar = async (cambios) => {
    const { error: e } = await ctx.api.from('sst_accidentes').update(cambios).eq('id', a.id);
    if (e) { avisar(e.message, 'error'); return false; }
    Object.assign(a, cambios); avisar('Guardado.'); return true;
  };

  // Campo genérico: texto, número, fecha, hora, área de texto, lista o casilla
  const campo = (id, etiqueta, { tipo = 'text', opciones, ayuda } = {}) => {
    let c;
    if (opciones) c = el('select', { class: 'campo', id: `a-${id}`, disabled: !editable }, opciones.map(([v, t]) => el('option', { value: v, selected: String(a[id] ?? '') === v }, t)));
    else if (tipo === 'textarea') c = Object.assign(el('textarea', { class: 'campo', id: `a-${id}`, rows: 3, disabled: !editable }), { value: a[id] ?? '' });
    else if (tipo === 'checkbox') c = el('input', { type: 'checkbox', id: `a-${id}`, checked: !!a[id], disabled: !editable });
    else c = el('input', { class: 'campo', id: `a-${id}`, type: tipo, value: tipo === 'time' ? hhmm(a[id]) : (a[id] ?? ''), disabled: !editable, min: tipo === 'number' ? 0 : null });
    c.addEventListener('change', () => {
      let v = tipo === 'checkbox' ? c.checked : c.value.trim();
      if (tipo === 'number') v = Math.max(0, Number(v) || 0);
      else if (tipo !== 'checkbox' && v === '') v = null;
      guardar({ [id]: v });
    });
    if (tipo === 'checkbox') return el('label', { class: 'casilla' }, c, etiqueta);
    return el('div', { class: 'form-fila' }, el('label', { for: `a-${id}` }, etiqueta), c, ayuda ? el('span', { class: 'texto-suave texto-chico' }, ayuda) : null);
  };

  // Listas editables (medidas y testigos)
  const listaFilas = (col, columnas, titulo) => {
    const filas = a[col] ?? [];
    const quitar = (i) => guardar({ [col]: filas.filter((_, j) => j !== i) }).then((ok) => ok && ctx.refrescar());
    return el('div', {},
      el('h3', {}, titulo),
      filas.length ? filas.map((f, i) => el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, f[columnas[0][0]] ?? ''), el('span', { class: 'texto-suave' }, columnas.slice(1).map(([k, t]) => f[k] ? `${t}: ${f[k]}` : '').filter(Boolean).join(' · '))),
        editable ? el('div', { class: 'doc-acciones' }, el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar', onclick: () => quitar(i) }, icono('basura', { tam: 16 }))) : null))
        : el('p', { class: 'texto-suave' }, 'Sin registros.'),
      editable ? boton('Agregar', { icono: 'mas', onclick: () => abrirFormulario({
        titulo,
        campos: columnas.map(([k, t], i) => ({ id: k, etiqueta: t, requerido: i === 0 })),
        textoGuardar: 'Agregar',
        alGuardar: async (v) => {
          const fila = Object.fromEntries(columnas.map(([k]) => [k, v[k].trim()]));
          if (!(await guardar({ [col]: [...filas, fila] }))) throw new Error('No se pudo guardar.');
          ctx.refrescar();
        },
      }) }) : null);
  };

  const cerrado = a.estado === 'cerrado';
  const acciones = [];
  if (editable) acciones.push(boton(cerrado ? 'Reabrir' : 'Cerrar investigación', { icono: cerrado ? 'editar' : 'check', tipo: cerrado ? 'secundario' : 'primario',
    onclick: async () => { if (await guardar({ estado: cerrado ? 'abierto' : 'cerrado' })) ctx.refrescar(); } }));
  if (ctx.puede('sst', 'eliminar')) acciones.push(boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar registro', mensaje: 'El registro deja de aparecer en el listado y en los informes.', campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { if (!(await guardar({ deleted_at: new Date().toISOString() }))) throw new Error('No se pudo eliminar.'); location.hash = ctx.ruta('sst.accidentes'); },
  }) }));

  const tipo = nombreDe(TIPOS_ACC);
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, tipo[a.tipo]),
        el('p', { class: 'texto-suave' }, [personas.de.get(a.persona_id)?.nombre, fechaLarga(a.fecha)].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${cerrado ? 'chip-ok' : 'chip-pend'}` }, cerrado ? 'Cerrado' : 'Abierto'), acciones)),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        campo('tipo', 'Tipo', { opciones: TIPOS_ACC }),
        campo('persona_id', 'Persona afectada', { opciones: [['', 'Sin lesionado (incidente)'], ...personas.lista.map((p) => [p.id, p.nombre])] }),
        el('div', { class: 'rejilla-campos' }, campo('fecha', 'Fecha', { tipo: 'date' }), campo('hora', 'Hora', { tipo: 'time' })),
        campo('gravedad', 'Gravedad', { opciones: GRAVEDAD }),
        campo('tercero_id', 'Mandante donde ocurrió', { opciones: [['', 'Ninguno / interno'], ...clientes.map((c) => [c.id, c.nombre])] }),
        campo('lugar', 'Lugar'),
        el('div', { class: 'rejilla-campos' }, campo('dias_perdidos', 'Días perdidos', { tipo: 'number' }), campo('denuncia', 'N° de denuncia (DIAT)'))),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Investigación'),
        campo('actividad', 'Actividad que realizaba'),
        campo('descripcion', 'Qué ocurrió', { tipo: 'textarea' }),
        campo('lesion', 'Consecuencia y parte del cuerpo lesionada'),
        el('div', { class: 'rejilla-campos' }, campo('accion_insegura', 'Acción insegura', { tipo: 'checkbox' }), campo('condicion_insegura', 'Condición insegura', { tipo: 'checkbox' })),
        campo('causas', 'Causas', { tipo: 'textarea' }))),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' }, listaFilas('medidas', [['accion', 'Acción de mejora'], ['responsable', 'Responsable'], ['plazo', 'Plazo']], 'Acciones para evitar que se repita')),
      el('div', { class: 'ficha doc-grupo' }, listaFilas('testigos', [['nombre', 'Nombre'], ['cargo', 'Cargo']], 'Testigos'))),
  );
}
