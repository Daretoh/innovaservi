// Contactos: todos en una tabla con búsqueda, filtro por etapa y Excel con el membrete de la empresa.
import { el } from '../../../core/ui/dom.js?v=065bd32';
import { listado, boton } from '../../../core/ui/tabla.js?v=065bd32';
import { dinero, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=065bd32';
import { exportarExcel } from '../../../core/excel.js?v=065bd32';
import { cargarBase, cargarCss, nombreOrigen } from '../datos.js?v=065bd32';
import { formContacto } from '../formularios.js?v=065bd32';

const estado = { etapa: '' };

export default async function vista(ctx) {
  cargarCss();
  const base = await cargarBase(ctx);
  const { data, error } = await ctx.api.from('mkt_contactos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(5000);
  if (error) throw error;
  const etapa = new Map(base.etapas.map((x) => [x.id, x]));
  const campana = new Map(base.campanas.map((x) => [x.id, x.nombre]));
  const filas = data.filter((c) => !estado.etapa || c.etapa_id === estado.etapa);
  const abrir = (c) => { location.hash = ctx.ruta('mkt.contacto', { id: c.id }); };

  const columnas = [
    { titulo: 'Nombre', valor: (c) => el('span', {}, el('strong', {}, c.nombre), c.organizacion ? el('span', { class: 'texto-suave texto-chico' }, ` · ${c.organizacion}`) : null) },
    { titulo: 'Contacto', valor: (c) => [c.telefono, c.instagram ? `@${c.instagram}` : null, c.correo].filter(Boolean).join(' · ') },
    { titulo: 'Le interesa', valor: (c) => c.interes ?? '' },
    { titulo: 'Origen', valor: (c) => nombreOrigen[c.origen] ?? c.origen },
    { titulo: 'Campaña', valor: (c) => campana.get(c.campana_id) ?? '' },
    { titulo: 'Etapa', valor: (c) => el('span', { class: `chip ${{ ganada: 'chip-ok', perdida: 'chip-venc' }[etapa.get(c.etapa_id)?.tipo] ?? 'chip-pend'}` }, etapa.get(c.etapa_id)?.nombre ?? 'Sin etapa') },
    { titulo: 'Responsable', valor: (c) => base.nombreUsuario.get(c.responsable_id) ?? '' },
    { titulo: 'Creado', valor: (c) => fechaLarga(diaLocal(c.created_at)) },
  ];

  const filtro = el('select', { class: 'campo', 'aria-label': 'Etapa' }, el('option', { value: '' }, 'Todas las etapas'),
    base.etapas.map((x) => el('option', { value: x.id, selected: x.id === estado.etapa }, x.nombre)));
  filtro.addEventListener('change', () => { estado.etapa = filtro.value; ctx.refrescar(); });

  const excel = () => exportarExcel(ctx, {
    titulo: 'Contactos de marketing', nombre: 'contactos-marketing',
    columnas: ['Nombre', 'Empresa', 'Teléfono', 'Instagram', 'Correo', 'Le interesa', 'Origen', 'Campaña', 'Etapa', 'Responsable',
      { t: 'Valor estimado', tipo: 'dinero' }, 'Acepta promociones', { t: 'Creado', tipo: 'fecha' }, { t: 'Último contacto', tipo: 'fecha' }],
    filas: filas.map((c) => [c.nombre, c.organizacion ?? '', c.telefono ?? '', c.instagram ?? '', c.correo ?? '', c.interes ?? '', nombreOrigen[c.origen] ?? c.origen,
      campana.get(c.campana_id) ?? '', etapa.get(c.etapa_id)?.nombre ?? '', base.nombreUsuario.get(c.responsable_id) ?? '', Number(c.valor_estimado) || null,
      c.consentimiento ? 'Sí' : 'No', diaLocal(c.created_at), c.ultimo_contacto_at ? diaLocal(c.ultimo_contacto_at) : '']),
  });

  const total = filas.reduce((s, c) => s + Number(c.valor_estimado || 0), 0);
  const nodo = listado({
    titulo: 'Contactos', columnas, filas, alFila: abrir,
    vacio: 'Todavía no hay contactos. Crea el primero con "Nuevo contacto".',
    acciones: [filtro,
      ctx.puede('mkt', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: excel }) : null,
      ctx.puede('mkt', 'crear') ? boton('Nuevo contacto', { icono: 'mas', tipo: 'primario', onclick: () => formContacto(ctx, base, null, { alGuardar: abrir }) }) : null],
  });
  if (total) nodo.querySelector('.listado-cabecera').after(el('p', { class: 'texto-suave texto-chico' }, `Valor estimado de la vista: ${dinero(total)}`));
  return nodo;
}
