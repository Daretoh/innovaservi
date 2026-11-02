// Partes de trabajo: listado, pendientes de clientes que piden informe y creación desde las faenas.
import { el } from '../../../core/ui/dom.js?v=ed8e78f';
import { icono } from '../../../core/ui/iconos.js?v=ed8e78f';
import { listado, boton } from '../../../core/ui/tabla.js?v=ed8e78f';
import { abrirFormulario } from '../../../core/ui/modal.js?v=ed8e78f';
import { avisar } from '../../../core/ui/aviso.js?v=ed8e78f';
import { hoyISO, sumarDias, fechaLarga } from '../../../core/ui/formato.js?v=ed8e78f';
import { faenasSinParte, nombreTercero } from '../datos.js?v=ed8e78f';

let estado = 'todos';
// El filtro Todos / Borradores / Confirmados repinta con lo ya cargado (antes volvía a pedir todo y tardaba 2–3 s sin
// cambiar la pantalla: parecía que no funcionaba; Enzo, 2026-11-02)
let cache = null;
let soloPintar = false;

async function cargar(ctx) {
  const reusar = soloPintar && cache?.empresa === ctx.empresa.id;
  soloPintar = false;
  if (reusar) return cache;
  const [partes, pideInforme, sinParte] = await Promise.all([
    ctx.api.from('rep_partes')
      .select('id, fecha, estado, lugar, terceros(razon_social, nombre_fantasia), rep_parte_faenas(fecha, ope_faenas(titulo)), rep_media(id)')
      .eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('fecha', { ascending: false }).limit(500),
    ctx.api.from('ope_clientes').select('tercero_id').eq('empresa_id', ctx.empresa.id).eq('pide_informe', true),
    faenasSinParte(ctx, sumarDias(hoyISO(), -30), hoyISO()),
  ]);
  if (partes.error) throw partes.error;
  // Faenas ya hechas (últimos 30 días) que llevan informe (marcado en la faena o, si no, por su cliente) y aún no tienen parte
  const clientesInforme = new Set((pideInforme.data ?? []).map((c) => c.tercero_id));
  cache = { empresa: ctx.empresa.id, partes: partes.data, pendientes: sinParte.filter((f) => f.pide_informe ?? clientesInforme.has(f.tercero_id)) };
  return cache;
}

export default async function vista(ctx) {
  const { partes: todas, pendientes } = await cargar(ctx);
  const partes = { data: estado === 'todos' ? todas : todas.filter((p) => p.estado === estado) };

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Estado' },
    [['todos', `Todos (${todas.length})`], ['borrador', `Borradores (${todas.filter((p) => p.estado === 'borrador').length})`], ['confirmado', `Confirmados (${todas.filter((p) => p.estado === 'confirmado').length})`]].map(([v, t]) =>
      el('button', { type: 'button', 'aria-pressed': String(estado === v), onclick: () => { estado = v; soloPintar = true; ctx.refrescar(); } }, t)));

  const acciones = [segmento];
  if (ctx.puede('reportes', 'crear')) acciones.push(boton('Nuevo parte', { icono: 'mas', tipo: 'primario', onclick: () => nuevo(ctx, null) }));

  const lista = listado({
    titulo: 'Partes de trabajo',
    filas: partes.data,
    acciones,
    vacio: 'No hay partes.',
    columnas: [
      { titulo: 'Fecha', valor: (p) => fechaLarga(p.fecha) },
      { titulo: 'Cliente', valor: (p) => el('a', { href: ctx.ruta('reportes.parte', { id: p.id }) }, nombreTercero(p.terceros)) },
      { titulo: 'Faenas', valor: (p) => p.rep_parte_faenas.map((x) => x.ope_faenas?.titulo).filter(Boolean).join(' · ') || p.lugar || '' },
      { titulo: 'Fotos', valor: (p) => p.rep_media.length },
      { titulo: 'Estado', valor: (p) => el('span', { class: `chip ${p.estado === 'confirmado' ? 'chip-ok' : 'chip-prox'}` }, p.estado === 'confirmado' ? 'Confirmado' : 'Borrador') },
    ],
  });
  if (pendientes.length) {
    lista.insertBefore(el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, icono('alerta', { tam: 16 }), ` Faenas que llevan informe y no tienen parte (${pendientes.length})`),
      pendientes.map((f) => el('div', { class: 'doc-fila' },
        el('span', { class: 'doc-nombre' }, f.etiqueta),
        ctx.puede('reportes', 'crear') ? boton('Crear parte', { onclick: () => nuevo(ctx, f) }) : null))), lista.children[1]);
  }
  return lista;
}

async function nuevo(ctx, preseleccion) {
  const disponibles = await faenasSinParte(ctx, sumarDias(hoyISO(), -45), sumarDias(hoyISO(), 14));
  const { data: clientes } = await ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).contains('tipo', ['cliente']).is('deleted_at', null).order('razon_social');
  // La faena desde la que se creó va primera (marcada) y luego las del mismo cliente: antes quedaba marcada al fondo
  // de la lista, detrás de las futuras, y parecía que no se había elegido (Enzo, 2026-11-02)
  if (preseleccion) {
    const k = (f) => (f.id === preseleccion.id && f.fecha === preseleccion.fecha ? 0 : f.tercero_id === preseleccion.tercero_id ? 1 : 2);
    disponibles.sort((a, b) => k(a) - k(b));
  }
  abrirFormulario({
    titulo: 'Nuevo parte de trabajo',
    mensaje: 'Elige una o varias faenas-día del mismo cliente (un parte consolidado), o deja sin faenas y elige el cliente.',
    campos: [
      { id: 'faenas', etiqueta: 'Faenas (últimas 6 semanas y próximas 2)', tipo: 'checks', opciones: disponibles.map((f) => [`${f.id}|${f.fecha}`, f.etiqueta]), valor: preseleccion ? [`${preseleccion.id}|${preseleccion.fecha}`] : [] },
      { id: 'tercero_id', etiqueta: 'Cliente (solo si no eliges faenas)', opciones: [['', '—'], ...(clientes ?? []).map((c) => [c.id, nombreTercero(c)])] },
      { id: 'fecha', etiqueta: 'Fecha (solo si no eliges faenas)', tipo: 'date', valor: hoyISO() },
    ],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const elegidas = disponibles.filter((f) => v.faenas.includes(`${f.id}|${f.fecha}`));
      const clientesElegidos = new Set(elegidas.map((f) => f.tercero_id ?? ''));
      if (clientesElegidos.size > 1) throw new Error('Las faenas de un parte deben ser del mismo cliente.');
      if (!elegidas.length && !v.tercero_id) throw new Error('Elige faenas o un cliente.');
      const { data: cfg } = await ctx.api.from('rep_config').select('responsable').eq('empresa_id', ctx.empresa.id).maybeSingle();
      const base = elegidas[0];
      const sitios = new Set(elegidas.map((f) => f.sitio_id).filter(Boolean));
      const { data: parte, error } = await ctx.api.from('rep_partes').insert({
        empresa_id: ctx.empresa.id,
        tercero_id: base ? base.tercero_id : v.tercero_id,
        sitio_id: sitios.size === 1 ? [...sitios][0] : null,
        lugar: sitios.size === 1 ? base.sitio : null,
        fecha: elegidas.length ? elegidas.map((f) => f.fecha).sort()[0] : v.fecha,
        responsable: cfg?.responsable ?? null,
      }).select('id').single();
      if (error) throw new Error(error.message);
      if (elegidas.length) {
        const { error: e2 } = await ctx.api.from('rep_parte_faenas').insert(elegidas.map((f) => ({ parte_id: parte.id, empresa_id: ctx.empresa.id, faena_id: f.id, fecha: f.fecha })));
        if (e2) throw new Error(e2.code === '23505' ? 'Alguna de esas faenas ya está en otro parte.' : e2.message);
      }
      avisar('Parte creado. Agrega las fotos.');
      location.hash = ctx.ruta('reportes.parte', { id: parte.id });
    },
  });
}
