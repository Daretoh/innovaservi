// Registros de entrega (capacitación, charla, EPP, PTS): se arma la lista, se imprime para firmar y
// se sube el escaneo; al subirlo, cada persona queda con el documento de RRHH entregado.
import { el } from '../../../core/ui/dom.js?v=9d0da9e';
import { listado, boton } from '../../../core/ui/tabla.js?v=9d0da9e';
import { abrirFormulario } from '../../../core/ui/modal.js?v=9d0da9e';
import { fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=9d0da9e';
import { TIPOS_ENTREGA, nombreDe, cargarPersonas } from '../datos.js?v=9d0da9e';

let filtro = 'todos';
const nombreTipo = nombreDe(TIPOS_ENTREGA);

// "Casco de seguridad 2", "Guantes; 3" o "Lentes x 1" → { item, cantidad }
export const leerItems = (texto) => texto.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(.*?)[\s;,x×]+(\d+)$/i);
  return m ? { item: m[1].trim(), cantidad: Number(m[2]) } : { item: l, cantidad: 1 };
});

// Tipos de documento de RRHH (de la empresa) que una entrega puede marcar
export async function tiposRrhh(ctx) {
  if (!ctx.puede('rrhh', 'ver')) return [];
  const { data } = await ctx.api.from('rrhh_tipos_doc').select('slug, nombre, vence').eq('empresa_id', ctx.empresa.id)
    .eq('ambito', 'empresa').eq('activo', true).order('orden');
  return data ?? [];
}

export default async function vista(ctx) {
  let q = ctx.api.from('sst_entregas').select('id, tipo, tema, fecha, relator, estado, tipo_doc, sst_entrega_personas(persona_id)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }).limit(300);
  if (filtro !== 'todos') q = q.eq('estado', filtro);
  const { data, error } = await q;
  if (error) throw error;

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    [['todos', 'Todos'], ['pendiente', 'Por firmar'], ['firmado', 'Firmados']].map(([v, t]) =>
      el('button', { type: 'button', 'aria-pressed': String(filtro === v), onclick: () => { filtro = v; ctx.refrescar(); } }, t)));
  const acciones = [segmento];
  if (ctx.puede('sst', 'crear')) acciones.push(boton('Nuevo registro', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx) }));

  const lista = listado({
    titulo: 'Registros de entrega',
    filas: data,
    acciones,
    vacio: 'No hay registros.',
    columnas: [
      { titulo: 'Fecha', valor: (r) => fechaLarga(r.fecha) },
      { titulo: 'Tipo', valor: (r) => nombreTipo[r.tipo] },
      { titulo: 'Tema', valor: (r) => el('a', { href: ctx.ruta('sst.entrega', { id: r.id }) }, r.tema) },
      { titulo: 'Personas', valor: (r) => r.sst_entrega_personas.length },
      { titulo: 'Estado', valor: (r) => el('span', { class: `chip ${r.estado === 'firmado' ? 'chip-ok' : 'chip-prox'}` }, r.estado === 'firmado' ? 'Firmado' : 'Por firmar') },
    ],
  });
  lista.append(el('p', { class: 'texto-suave texto-chico' }, 'Imprime el registro, hazlo firmar y sube el escaneo: si elegiste un documento de RRHH, queda entregado en la ficha de cada persona con ese archivo.'));
  return lista;
}

async function nuevo(ctx) {
  const [personas, tipos] = await Promise.all([cargarPersonas(ctx), tiposRrhh(ctx)]);
  abrirFormulario({
    titulo: 'Nuevo registro de entrega',
    campos: [
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_ENTREGA, valor: 'capacitacion' },
      { id: 'tema', etiqueta: 'Tema', requerido: true, ayuda: 'Ej.: Primeros auxilios, Entrega de EPP de invierno, PTS trabajo en altura.' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'relator', etiqueta: 'Relator o responsable' },
      { id: 'duracion', etiqueta: 'Duración', ayuda: 'Ej.: 1 hora.' },
      { id: 'contenido', etiqueta: 'Contenido o instrucciones (una línea por punto)', tipo: 'textarea' },
      { id: 'items', etiqueta: 'Solo EPP: elementos entregados (uno por línea, con cantidad al final)', tipo: 'textarea', ayuda: 'Ej.: Casco de seguridad 1' },
      { id: 'tipo_doc', etiqueta: 'Documento de RRHH que marca al subir el registro firmado', opciones: [['', 'Ninguno'], ...tipos.map((t) => [t.slug, t.nombre])] },
      { id: 'vence', etiqueta: 'Vencimiento del documento (si aplica)', tipo: 'date' },
      { id: 'personas', etiqueta: 'Participantes', tipo: 'checks', opciones: personas.lista.map((p) => [p.id, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]) },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      if (!v.personas.length) throw new Error('Marca al menos un participante.');
      const tipoDoc = tipos.find((t) => t.slug === v.tipo_doc);
      if (tipoDoc?.vence && !v.vence) throw new Error(`"${tipoDoc.nombre}" vence: indica la fecha de vencimiento.`);
      const { data, error } = await ctx.api.from('sst_entregas').insert({
        empresa_id: ctx.empresa.id, tipo: v.tipo, tema: v.tema.trim(), fecha: v.fecha, relator: v.relator.trim() || null, duracion: v.duracion.trim() || null,
        contenido: v.contenido.trim() || null, items: v.tipo === 'epp' ? leerItems(v.items) : [], tipo_doc: v.tipo_doc || null, vence: v.vence || null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await ctx.api.from('sst_entrega_personas').insert(v.personas.map((id) => ({
        entrega_id: data.id, empresa_id: ctx.empresa.id, persona_id: id, cargo: personas.de.get(id)?.cargo ?? null,
      })));
      if (e2) throw new Error(e2.message);
      location.hash = ctx.ruta('sst.entrega', { id: data.id });
    },
  });
}
