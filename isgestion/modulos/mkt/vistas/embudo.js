// Embudo: contactos en columnas por etapa (como Kommo o Leadsales). Arrastrar una tarjeta a otra columna cambia la
// etapa (la base lo anota en la actividad); la tarjeta abre la ficha. Filtros por responsable, origen y campaña.
// "Sin atender": en la primera etapa y sin actividad en DIAS_SIN_ATENDER días.
import { el } from '../../../core/ui/dom.js?v=772212b';
import { icono } from '../../../core/ui/iconos.js?v=772212b';
import { boton } from '../../../core/ui/tabla.js?v=772212b';
import { avisar } from '../../../core/ui/aviso.js?v=772212b';
import { dinero, fechaCorta } from '../../../core/ui/formato.js?v=772212b';
import { cargarBase, cargarCss, nombreOrigen, ORIGENES, diasDesde, diasHasta, DIAS_SIN_ATENDER, opcionesUsuarios, MOTIVOS } from '../datos.js?v=772212b';
import { abrirFormulario } from '../../../core/ui/modal.js?v=772212b';
import { formContacto } from '../formularios.js?v=772212b';

const estado = { responsable: '', origen: '', campana: '', buscar: '', cerradas: false };

export default async function vista(ctx) {
  cargarCss();
  // Enlace desde Campañas: ?campana= filtra una vez y la dirección vuelve al embudo
  if (ctx.params?.campana) { estado.campana = ctx.params.campana; history.replaceState(null, '', ctx.ruta('mkt.embudo')); }
  const base = await cargarBase(ctx);
  const { data, error } = await ctx.api.from('mkt_contactos').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(2000);
  if (error) throw error;
  const editar = ctx.puede('mkt', 'editar');
  const primera = base.etapas[0]?.id;

  const q = estado.buscar.trim().toLowerCase();
  const hace60 = Date.now() - 60 * 864e5;
  const tipoEtapa = new Map(base.etapas.map((x) => [x.id, x.tipo]));
  const filas = data.filter((c) => (!estado.responsable || c.responsable_id === estado.responsable)
    && (!estado.origen || c.origen === estado.origen) && (!estado.campana || c.campana_id === estado.campana)
    // Ganadas y perdidas: solo las de los últimos 60 días, salvo que se pidan todas
    && (estado.cerradas || tipoEtapa.get(c.etapa_id) === 'abierta' || !c.etapa_id || new Date(c.updated_at ?? c.created_at) > hace60)
    && (!q || [c.nombre, c.telefono, c.instagram, c.correo, c.organizacion, c.interes].join(' ').toLowerCase().includes(q)));

  const sinAtender = (c) => c.etapa_id === primera && (diasDesde(c.ultimo_contacto_at ?? c.created_at) ?? 0) >= DIAS_SIN_ATENDER;
  const abrir = (c) => { location.hash = ctx.ruta('mkt.contacto', { id: c.id }); };

  const tarjeta = (c) => {
    const prox = c.proximo_contacto ? diasHasta(c.proximo_contacto) : null;
    const nodo = el('button', { type: 'button', class: `mkt-tarjeta${sinAtender(c) ? ' mkt-sin-atender' : ''}`, draggable: editar ? 'true' : null, onclick: () => abrir(c) },
      el('strong', {}, c.nombre),
      c.interes || c.organizacion ? el('span', { class: 'texto-chico' }, [c.organizacion, c.interes].filter(Boolean).join(' · ')) : null,
      el('span', { class: 'mkt-tarjeta-pie texto-chico texto-suave' },
        el('span', { class: 'chip chip-pend' }, nombreOrigen[c.origen] ?? c.origen),
        c.valor_estimado ? el('span', {}, dinero(c.valor_estimado)) : null,
        c.responsable_id ? el('span', {}, base.nombreUsuario.get(c.responsable_id) ?? '') : el('span', {}, 'Sin responsable')),
      sinAtender(c) ? el('span', { class: 'texto-chico texto-error' }, icono('alerta', { tam: 12 }), ` Sin atender hace ${diasDesde(c.ultimo_contacto_at ?? c.created_at)} días`)
        : prox != null ? el('span', { class: `texto-chico ${prox < 0 ? 'texto-error' : prox === 0 ? 'mkt-hoy' : 'texto-suave'}` }, icono('reloj', { tam: 12 }),
          prox < 0 ? ` Contactar (atrasado ${fechaCorta(c.proximo_contacto)})` : prox === 0 ? ' Contactar hoy' : ` Contactar ${fechaCorta(c.proximo_contacto)}`) : null);
    if (editar) nodo.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', c.id); ev.dataTransfer.effectAllowed = 'move'; nodo.classList.add('mkt-arrastrando'); });
    nodo.addEventListener('dragend', () => nodo.classList.remove('mkt-arrastrando'));
    return nodo;
  };

  const columna = (et) => {
    const lista = filas.filter((c) => c.etapa_id === et.id || (!c.etapa_id && et.id === primera));
    const total = lista.reduce((s, c) => s + Number(c.valor_estimado || 0), 0);
    const col = el('div', { class: `mkt-columna mkt-col-${et.tipo}` },
      el('header', { class: 'mkt-columna-cab' }, el('strong', {}, et.nombre), el('span', { class: 'texto-suave texto-chico' }, `${lista.length}${total ? ` · ${dinero(total)}` : ''}`)),
      lista.length ? lista.map(tarjeta) : el('p', { class: 'texto-suave texto-chico mkt-vacio' }, editar ? 'Arrastra aquí' : 'Sin contactos'));
    if (editar) {
      col.addEventListener('dragover', (ev) => { ev.preventDefault(); col.classList.add('mkt-sobre'); });
      col.addEventListener('dragleave', (ev) => { if (!col.contains(ev.relatedTarget)) col.classList.remove('mkt-sobre'); });
      col.addEventListener('drop', async (ev) => {
        ev.preventDefault(); col.classList.remove('mkt-sobre');
        const id = ev.dataTransfer.getData('text/plain');
        const c = data.find((x) => x.id === id);
        if (!c || c.etapa_id === et.id) return;
        const mover = async (cambio) => {
          const { error: e2 } = await ctx.api.from('mkt_contactos').update({ etapa_id: et.id, ...cambio }).eq('id', id);
          if (e2) throw new Error(e2.message);
          avisar(`${c.nombre} pasó a ${et.nombre}.`);
          ctx.refrescar();
        };
        if (et.tipo !== 'perdida') { mover({}).catch((e) => avisar(e.message, 'error')); return; }
        abrirFormulario({
          titulo: `Pasar a ${et.nombre}`, mensaje: c.nombre, textoGuardar: 'Guardar',
          campos: [{ id: 'motivo', etiqueta: 'Por qué se perdió', valor: c.motivo_perdida ?? '', sugerencias: MOTIVOS }],
          alGuardar: (v) => mover({ motivo_perdida: v.motivo.trim() || null }),
        });
      });
    }
    return col;
  };

  const select = (opciones, valor, etiqueta, alCambiar) => {
    const s = el('select', { class: 'campo', 'aria-label': etiqueta }, opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t)));
    s.addEventListener('change', () => alCambiar(s.value));
    return s;
  };
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar nombre, teléfono, interés…', value: estado.buscar, 'aria-label': 'Buscar' });
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; clearTimeout(buscador.t); buscador.t = setTimeout(() => ctx.refrescar(), 300); });
  const nSinAtender = filas.filter(sinAtender).length;
  const nHoy = filas.filter((c) => c.proximo_contacto && diasHasta(c.proximo_contacto) <= 0 && tipoEtapa.get(c.etapa_id) === 'abierta').length;

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Embudo'),
      el('div', { class: 'listado-acciones' },
        ctx.puede('mkt', 'crear') ? boton('Nuevo contacto', { icono: 'mas', tipo: 'primario', onclick: () => formContacto(ctx, base, null, { alGuardar: (c) => abrir(c) }) }) : null)),
    el('div', { class: 'listado-acciones mkt-filtros' },
      select(opcionesUsuarios(base.usuarios, 'Todos los responsables'), estado.responsable, 'Responsable', (v) => { estado.responsable = v; ctx.refrescar(); }),
      select([['', 'Todos los orígenes'], ...ORIGENES], estado.origen, 'Origen', (v) => { estado.origen = v; ctx.refrescar(); }),
      select([['', 'Todas las campañas'], ...base.campanas.map((c) => [c.id, c.nombre])], estado.campana, 'Campaña', (v) => { estado.campana = v; ctx.refrescar(); }),
      el('label', { class: 'casilla' }, el('input', { type: 'checkbox', checked: estado.cerradas, onchange: (ev) => { estado.cerradas = ev.target.checked; ctx.refrescar(); } }), 'Ganados y perdidos antiguos'),
      el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador)),
    el('p', { class: 'texto-suave texto-chico' }, `${filas.length} contacto${filas.length === 1 ? '' : 's'}`,
      nSinAtender ? el('span', { class: 'texto-error' }, ` · ${nSinAtender} sin atender`) : null,
      nHoy ? ` · ${nHoy} para contactar hoy o atrasados` : null,
      editar ? ' · arrastra una tarjeta para cambiarla de etapa' : null),
    el('div', { class: 'mkt-tablero', style: `--columnas: ${base.etapas.length}` }, base.etapas.map(columna)));
}
