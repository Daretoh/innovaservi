// Tipos de documento de la empresa activa (antes estaban fijos en el código de InnovaGestión).
import { el } from '../../../core/ui/dom.js?v=af5b0f2';
import { icono } from '../../../core/ui/iconos.js?v=af5b0f2';
import { listado, boton } from '../../../core/ui/tabla.js?v=af5b0f2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=af5b0f2';
import { avisar } from '../../../core/ui/aviso.js?v=af5b0f2';
import sugeridos from '../tipos-sugeridos.js?v=af5b0f2';

const SI_NO = [['true', 'Sí'], ['false', 'No']];
const si = (b) => (b ? 'Sí' : 'No');

export default async function vista(ctx) {
  const [{ data, error }, cli] = await Promise.all([ctx.api.from('rrhh_tipos_doc').select('*, terceros(razon_social, nombre_fantasia)')
    .eq('empresa_id', ctx.empresa.id).order('orden').order('nombre'),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social')]);
  if (error) throw error;
  const clientes = cli.data ?? [];
  const editable = ctx.puede('rrhh', 'editar');

  const acciones = [];
  if (editable) {
    if (!data.length) acciones.push(boton('Cargar tipos sugeridos', { icono: 'copiar', onclick: () => cargarSugeridos(ctx) }));
    acciones.push(boton('Nuevo tipo', { icono: 'mas', tipo: 'primario', onclick: () => editar(ctx, null, data, clientes) }));
  }

  const columnas = [
    { titulo: 'Nombre', valor: (t) => t.nombre },
    { titulo: 'Corto', valor: (t) => t.corto },
    { titulo: 'Categoría', valor: (t) => (t.categoria === 'capacitacion' ? 'Capacitación' : 'Documento') },
    { titulo: 'Ámbito', valor: (t) => el('span', { class: 'etiqueta', title: t.ambito === 'persona' ? 'Uno por persona, sirve para todas las empresas' : 'Uno por empresa' }, t.ambito === 'persona' ? 'Personal' : 'Empresa') },
    { titulo: 'Vence', valor: (t) => (t.vence ? `Sí (aviso ${t.dias_aviso} d)` : 'No') },
    { titulo: 'No aplica', valor: (t) => si(t.permite_na) },
    { titulo: 'Cuenta en %', valor: (t) => si(t.cuenta && t.fuente !== 'buk' && !t.tercero_id) },
    { titulo: 'Dónde', valor: (t) => el('span', { class: 'etiqueta' }, t.fuente === 'buk' ? 'Buk (no se sube)' : t.tercero_id ? `Propio de ${t.terceros?.nombre_fantasia || t.terceros?.razon_social}` : 'Set base') },
    { titulo: 'Estado', valor: (t) => el('span', { class: `chip ${t.activo ? 'chip-ok' : 'chip-na'}` }, t.activo ? 'Activo' : 'Inactivo') },
  ];
  if (editable) {
    columnas.push({
      titulo: '',
      valor: (t) => el('button', { type: 'button', class: 'boton-icono', title: 'Editar', 'aria-label': `Editar ${t.nombre}`, onclick: () => editar(ctx, t, data, clientes) }, icono('editar', { tam: 16 })),
    });
  }

  const vistaListado = listado({ titulo: 'Tipos de documento', filas: data, acciones, columnas, vacio: 'Esta empresa aún no tiene tipos de documento.' });
  vistaListado.append(el('p', { class: 'texto-suave texto-chico' },
    'Personal: la cédula o los antecedentes se suben una vez y sirven en todas las empresas del grupo. Empresa: cada empresa lleva el suyo. ',
    'Para dejar de pedir un documento, márcalo como inactivo: su historial se conserva. Buk: se firma y guarda en Buk (no se sube aquí y no frena la acreditación). Propio de un cliente: solo lo pide ese cliente y no cuenta en el % base.'));
  return vistaListado;
}

const slugDe = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 't_$1').slice(0, 40) || 'tipo';

function editar(ctx, t, todos, clientes = []) {
  abrirFormulario({
    titulo: t ? `Editar ${t.nombre}` : 'Nuevo tipo de documento',
    mensaje: t ? null : 'El ámbito no se puede cambiar después: define si el documento es de la persona o de cada empresa.',
    campos: [
      { id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: t?.nombre },
      { id: 'corto', etiqueta: 'Nombre corto (columna de la matriz)', valor: t?.corto },
      { id: 'categoria', etiqueta: 'Categoría', opciones: [['documento', 'Documento'], ['capacitacion', 'Capacitación']], valor: t?.categoria ?? 'documento' },
      ...(t ? [] : [{ id: 'ambito', etiqueta: 'Ámbito', opciones: [['empresa', 'Empresa (uno por empresa)'], ['persona', 'Personal (sirve para todas)']], valor: 'empresa' }]),
      { id: 'vence', etiqueta: '¿Tiene vencimiento?', opciones: SI_NO, valor: String(t?.vence ?? false) },
      { id: 'dias_aviso', etiqueta: 'Avisar "por vencer" con estos días de anticipación', tipo: 'number', valor: String(t?.dias_aviso ?? 30) },
      { id: 'permite_na', etiqueta: '¿Se puede marcar "No aplica"?', opciones: SI_NO, valor: String(t?.permite_na ?? false) },
      { id: 'cuenta', etiqueta: '¿Cuenta en el % de cumplimiento?', opciones: SI_NO, valor: String(t?.cuenta ?? true) },
      { id: 'fuente', etiqueta: 'Dónde se guarda', opciones: [['propio', 'Se sube aquí'], ['buk', 'Buk (se firma y guarda allá)']], valor: t?.fuente ?? 'propio' },
      { id: 'tercero_id', etiqueta: 'Set', opciones: [['', 'Set base (todos los clientes)'], ...clientes.map((c) => [c.id, `Propio de ${c.nombre_fantasia || c.razon_social}`])], valor: t?.tercero_id ?? '' },
      { id: 'orden', etiqueta: 'Orden', tipo: 'number', valor: String(t?.orden ?? (todos.length + 1)) },
      ...(t ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activo'], ['false', 'Inactivo']], valor: String(t.activo) }] : []),
    ],
    alGuardar: async (v) => {
      const cambios = {
        nombre: v.nombre.trim(), corto: v.corto.trim() || null, categoria: v.categoria,
        vence: v.vence === 'true', dias_aviso: Number(v.dias_aviso) || 0,
        permite_na: v.permite_na === 'true', cuenta: v.cuenta === 'true', orden: Number(v.orden) || 0, fuente: v.fuente, tercero_id: v.tercero_id || null,
        ...(t ? { activo: v.activo === 'true' } : {}),
      };
      let r;
      if (t) {
        r = await ctx.api.from('rrhh_tipos_doc').update(cambios).eq('id', t.id).select('id');
      } else {
        let slug = slugDe(cambios.nombre);
        const usados = new Set(todos.map((x) => x.slug));
        for (let i = 2; usados.has(slug); i++) slug = `${slugDe(cambios.nombre)}_${i}`;
        r = await ctx.api.from('rrhh_tipos_doc').insert({ ...cambios, ambito: v.ambito, slug, empresa_id: ctx.empresa.id }).select('id');
      }
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error('No tienes permiso para cambiar los tipos de documento.');
      avisar(t ? 'Tipo actualizado.' : 'Tipo creado.');
      ctx.refrescar();
    },
  });
}

async function cargarSugeridos(ctx) {
  const filas = sugeridos.map((t, i) => ({ ...t, orden: i + 1, empresa_id: ctx.empresa.id }));
  const { error } = await ctx.api.from('rrhh_tipos_doc').insert(filas);
  if (error) { avisar(error.message, 'error'); return; }
  avisar(`Se cargaron ${filas.length} tipos sugeridos.`);
  ctx.refrescar();
}
