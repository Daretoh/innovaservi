// Marketing → Clientes: la base de clientes de la empresa (Clientes y proveedores), sin copiarla: siempre al día. Para
// cada uno, teléfono revisado (+56 9 XXXX XXXX, avisa si falta un número o si es fijo), correo, última visita al taller
// (si la empresa tiene Taller) y si está en el embudo. Acciones: WhatsApp con respuesta guardada, "Al embudo" (crea el
// contacto ligado al cliente para una oportunidad nueva) y "Revisar datos" (nombres y teléfonos con formato estándar,
// se aplican con un clic; necesita editar clientes).
import { el } from '../../../core/ui/dom.js?v=9ecb423';
import { icono } from '../../../core/ui/iconos.js?v=9ecb423';
import { boton } from '../../../core/ui/tabla.js?v=9ecb423';
import { avisar } from '../../../core/ui/aviso.js?v=9ecb423';
import { abrirFormulario } from '../../../core/ui/modal.js?v=9ecb423';
import { revisarTelefono, nombrePropio, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=9ecb423';
import { exportarExcel } from '../../../core/excel.js?v=9ecb423';
import { cargarBase, cargarCss, enlaceWhatsapp, diasDesde } from '../datos.js?v=9ecb423';
import { formContacto } from '../formularios.js?v=9ecb423';

const estado = { ver: 'todos', buscar: '' };
const nombreDe = (t) => t.nombre_fantasia || t.razon_social || '';

export default async function vista(ctx) {
  cargarCss();
  const e = ctx.empresa.id;
  const conTaller = ctx.puede('taller', 'ver');
  const [base, rt, rc, ro, rr] = await Promise.all([cargarBase(ctx),
    ctx.api.from('terceros').select('*').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social').limit(10000),
    ctx.api.from('mkt_contactos').select('id, tercero_id, etapa_id, telefono').eq('empresa_id', e).is('deleted_at', null).not('tercero_id', 'is', null).limit(10000),
    conTaller ? ctx.api.from('tal_ordenes').select('tercero_id, fecha_cita, ingreso_at, termino_at, estado').eq('empresa_id', e).neq('estado', 'anulada').not('tercero_id', 'is', null).limit(20000) : Promise.resolve({ data: [] }),
    ctx.api.from('mkt_respuestas').select('*').eq('empresa_id', e).is('deleted_at', null).order('orden').order('titulo')]);
  for (const r of [rt, rc]) if (r.error) throw r.error;
  const etapa = new Map(base.etapas.map((x) => [x.id, x]));
  const enEmbudo = new Map(rc.data.map((c) => [c.tercero_id, c]));
  const ultima = new Map();
  for (const o of ro.data ?? []) {
    const f = o.termino_at ? diaLocal(o.termino_at) : o.ingreso_at ? diaLocal(o.ingreso_at) : o.fecha_cita;
    if (f && (!ultima.has(o.tercero_id) || f > ultima.get(o.tercero_id))) ultima.set(o.tercero_id, f);
  }
  const respuestas = rr.data ?? [];
  const puedeEditarClientes = ctx.puede('terceros', 'editar');

  const clientes = rt.data.map((t) => {
    const tel = revisarTelefono(t.telefono);
    const nombre = nombreDe(t);
    const nombreSugerido = nombrePropio(nombre);
    return { t, nombre, tel, cambiaNombre: nombreSugerido !== nombre ? nombreSugerido : null, cambiaTel: t.telefono && tel.valor !== t.telefono ? tel.valor : null,
      ultima: ultima.get(t.id) ?? null, contacto: enEmbudo.get(t.id) ?? null };
  });
  const porRevisar = clientes.filter((c) => c.cambiaNombre || c.cambiaTel);
  const b = estado.buscar.trim().toLowerCase();
  const filas = clientes.filter((c) => ({
    todos: true, sin_tel: !c.t.telefono, revisar: c.tel.aviso && c.t.telefono || c.cambiaNombre || c.cambiaTel,
    inactivos: c.ultima && diasDesde(c.ultima) >= 90, fuera: !c.contacto,
  })[estado.ver]).filter((c) => !b || [c.nombre, c.t.razon_social, c.t.telefono, c.t.email, c.t.representante, c.t.contacto].join(' ').toLowerCase().includes(b));

  // WhatsApp con respuesta guardada; si el cliente está en el embudo, queda en su actividad
  const whatsapp = (c) => {
    const primerNombre = String(c.t.representante || c.t.contacto || c.nombre).trim().split(/\s+/)[0] ?? '';
    const llenar = (x) => String(x ?? '').replaceAll('{nombre}', primerNombre).replaceAll('{empresa}', ctx.empresa.nombre_fantasia ?? ctx.empresa.razon_social ?? '');
    abrirFormulario({
      titulo: 'Escribir por WhatsApp', mensaje: `${c.nombre} · ${c.tel.valor}`, textoGuardar: 'Abrir WhatsApp',
      campos: [
        respuestas.length ? { id: 'respuesta', etiqueta: 'Respuesta guardada', opciones: [['', 'Escribir un mensaje nuevo'], ...respuestas.map((r) => [r.id, r.titulo])], valor: '',
          alCambiar: ({ valor, poner }) => poner('texto', llenar(respuestas.find((r) => r.id === valor)?.texto ?? '')) } : null,
        { id: 'texto', etiqueta: 'Mensaje', tipo: 'textarea', filas: 6, requerido: true, valor: '' },
      ].filter(Boolean),
      alGuardar: async (v) => {
        window.open(enlaceWhatsapp(c.tel.valor, v.texto.trim()), '_blank', 'noopener');
        if (c.contacto && ctx.puede('mkt', 'crear')) await ctx.api.from('mkt_eventos').insert({ empresa_id: e, contacto_id: c.contacto.id, tipo: 'whatsapp', texto: v.texto.trim() });
      },
    });
  };
  // Al embudo: contacto nuevo con los datos del cliente, ligado a él
  const alEmbudo = (c) => formContacto(ctx, base, null, {
    inicial: { nombre: c.t.clase === 'empresa' && c.t.representante ? c.t.representante : c.nombre, organizacion: c.t.clase === 'empresa' ? c.nombre : null,
      telefono: c.tel.valor, correo: c.t.email, origen: 'cliente', tercero_id: c.t.id },
    alGuardar: (x) => { location.hash = ctx.ruta('mkt.contacto', { id: x.id }); },
  });

  // Revisar datos: nombres y teléfonos con el formato estándar
  const revisar = () => abrirFormulario({
    titulo: 'Revisar datos de clientes', textoGuardar: `Corregir ${porRevisar.length}`,
    mensaje: `Se aplica el formato estándar a ${porRevisar.length} cliente${porRevisar.length === 1 ? '' : 's'} en Clientes y proveedores: nombres con mayúscula inicial y teléfonos +56 9 XXXX XXXX. Desmarca los que no quieras cambiar.`,
    campos: [{ id: 'ids', etiqueta: 'Cambios', tipo: 'checks', valor: porRevisar.map((c) => c.t.id),
      opciones: porRevisar.map((c) => [c.t.id, [c.cambiaNombre ? `${c.nombre} → ${c.cambiaNombre}` : c.nombre, c.cambiaTel ? `${c.t.telefono} → ${c.cambiaTel}` : null].filter(Boolean).join(' · ')]) }],
    alGuardar: async (v) => {
      let n = 0;
      for (const c of porRevisar.filter((x) => v.ids.includes(x.t.id))) {
        const cambios = {};
        if (c.cambiaTel) cambios.telefono = c.cambiaTel;
        if (c.cambiaNombre) cambios[c.t.nombre_fantasia ? 'nombre_fantasia' : 'razon_social'] = c.cambiaNombre;
        const { error } = await ctx.api.from('terceros').update(cambios).eq('id', c.t.id);
        if (error) throw new Error(`${c.nombre}: ${error.message}`);
        n += 1;
      }
      avisar(`${n} cliente${n === 1 ? '' : 's'} corregido${n === 1 ? '' : 's'}.`);
      ctx.refrescar();
    },
  });

  const excel = () => exportarExcel(ctx, {
    titulo: 'Clientes para marketing', nombre: 'clientes-marketing',
    columnas: ['Cliente', 'Teléfono', 'Aviso del teléfono', 'Correo', ...(conTaller ? [{ t: 'Última visita', tipo: 'fecha' }, { t: 'Días sin venir', tipo: 'numero' }] : []), 'En el embudo'],
    filas: filas.map((c) => [c.nombre, c.tel.valor ?? '', c.tel.aviso ?? '', c.t.email ?? '', ...(conTaller ? [c.ultima ?? '', c.ultima ? diasDesde(c.ultima) : null] : []),
      c.contacto ? etapa.get(c.contacto.etapa_id)?.nombre ?? 'Sí' : '']),
  });

  const celdaTel = (c) => (c.t.telefono
    ? el('span', {}, c.tel.grave ? c.tel.valor : el('a', { href: enlaceWhatsapp(c.tel.valor), target: '_blank', rel: 'noopener', onclick: (ev) => ev.stopPropagation() }, c.tel.valor),
      c.tel.aviso ? el('span', { class: `texto-chico ${c.tel.grave ? 'texto-error' : 'mkt-hoy'}` }, el('br'), icono('alerta', { tam: 12 }), ` ${c.tel.aviso}`) : null)
    : el('span', { class: 'texto-error texto-chico' }, icono('alerta', { tam: 12 }), ' Falta el teléfono'));
  const columnas = ['Cliente', 'Teléfono', 'Correo', ...(conTaller ? ['Última visita'] : []), 'En el embudo', ''];
  const fila = (c) => el('tr', {},
    el('td', {}, el('strong', {}, c.nombre), c.t.clase === 'empresa' && c.t.representante ? el('span', { class: 'texto-suave texto-chico' }, el('br'), c.t.representante) : null,
      c.cambiaNombre ? el('span', { class: 'texto-chico mkt-hoy' }, el('br'), `Formato sugerido: ${c.cambiaNombre}`) : null),
    el('td', {}, celdaTel(c)),
    el('td', {}, c.t.email ?? el('span', { class: 'texto-suave' }, '—')),
    conTaller ? el('td', {}, c.ultima ? el('span', {}, fechaLarga(c.ultima), el('span', { class: `texto-chico ${diasDesde(c.ultima) >= 90 ? 'texto-error' : 'texto-suave'}` }, el('br'), `hace ${diasDesde(c.ultima)} días`)) : el('span', { class: 'texto-suave' }, 'Sin visitas')) : null,
    el('td', {}, c.contacto ? el('a', { href: ctx.ruta('mkt.contacto', { id: c.contacto.id }), class: 'chip chip-ok' }, etapa.get(c.contacto.etapa_id)?.nombre ?? 'En el embudo') : el('span', { class: 'texto-suave' }, '—')),
    el('td', {}, el('div', { class: 'listado-acciones' },
      c.t.telefono && !c.tel.grave ? boton('WhatsApp', { icono: 'chat', class: 'boton boton-secundario boton-chico', onclick: () => whatsapp(c) }) : null,
      !c.contacto && ctx.puede('mkt', 'crear') ? boton('Al embudo', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => alEmbudo(c) }) : null)));

  const cuenta = (k) => clientes.filter((c) => ({ sin_tel: !c.t.telefono, revisar: c.tel.aviso && c.t.telefono || c.cambiaNombre || c.cambiaTel, inactivos: c.ultima && diasDesde(c.ultima) >= 90, fuera: !c.contacto, todos: true })[k]).length;
  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['todos', 'Todos'], ['sin_tel', 'Sin teléfono'], ['revisar', 'Datos por revisar'], ...(conTaller ? [['inactivos', '+90 días sin venir']] : []), ['fuera', 'Fuera del embudo']].map(([k, n]) =>
      el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, `${n} (${cuenta(k)})`)));
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar cliente, teléfono o correo…', value: estado.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Clientes'),
      el('div', { class: 'listado-acciones' },
        puedeEditarClientes && porRevisar.length ? boton(`Revisar datos (${porRevisar.length})`, { icono: 'check', onclick: revisar }) : null,
        ctx.puede('mkt', 'exportar') && filas.length ? boton('Excel', { icono: 'descargar', onclick: excel }) : null)),
    el('p', { class: 'texto-suave texto-chico' }, 'Son los clientes de Clientes y proveedores (no se copian: siempre al día). Los contactos del embudo son oportunidades; "Al embudo" crea una ligada al cliente.'),
    el('div', { class: 'listado-acciones mkt-filtros' }, segmento, el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador)),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, columnas.map((t) => el('th', {}, t)))),
      el('tbody', {}, filas.length ? filas.map(fila) : el('tr', {}, el('td', { colspan: columnas.length, class: 'tabla-vacia' }, icono('carpeta', { tam: 28 }), 'No hay clientes en esta vista.'))))));
}

