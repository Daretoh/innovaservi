// Quincenas (Remuneraciones 009, pedido de Enzo 2026-11-16; lista compacta y monto por persona 2026-11-17).
// Lista general (todas, sin cambiar de mes; filtros por mes, estado, empresa y trabajador, 2026-11-17): una fila por quincena (fecha de pago, empresa, trabajadores, total, comprobante, estado); tocarla abre
// su detalle (montos por persona, editar si está en borrador, comprobante, confirmar o anular).
// "Registrar quincena": empresa, mes, fecha de pago, cada trabajador con su monto (o "Monto para los marcados" para
// llenar varios de una vez) y el comprobante (opcional). "Guardar borrador" o "Guardar y confirmar" (con comprobante).
// Al confirmar, la base crea un movimiento "Quincena" del mes por persona, que el Cierre de remuneraciones resta de
// A pagar (ya se pagó; no cambia el costo). Anular con motivo quita esos movimientos.
// La usan Remuneraciones → Quincenas (una empresa) y Grupo → Quincenas (todas las empresas con Remuneraciones).
import { el } from '../../core/ui/dom.js?v=66a4b1f';
import { icono } from '../../core/ui/iconos.js?v=66a4b1f';
import { boton } from '../../core/ui/tabla.js?v=66a4b1f';
import { avisar } from '../../core/ui/aviso.js?v=66a4b1f';
import { dinero, hoyISO, nombreMes, fechaLarga } from '../../core/ui/formato.js?v=66a4b1f';
import { abrirFormulario } from '../../core/ui/modal.js?v=66a4b1f';
import { nombreEmpresa } from '../../core/empresas.js?v=66a4b1f';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=66a4b1f';
import { comprimirFoto, prepararArchivos } from '../../core/imagenes.js?v=66a4b1f';
import { cargarBase, nombreCompleto } from './datos.js?v=66a4b1f';

const estado = { mes: hoyISO().slice(0, 7), abierta: null, f: { mes: '', estado: '', empresa: '', buscar: '' } };
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ESTADOS = { borrador: ['Borrador', 'chip-pend'], confirmada: ['Confirmada', 'chip-ok'], anulada: ['Anulada', 'chip'] };

const err = (e) => { throw new Error(e.message); };
const total = (q) => q.lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);

async function cargar(ctx, empresas) {
  return Promise.all(empresas.map(async (g) => {
    const ctxE = { ...ctx, empresa: g.empresa, puede: g.puede };
    try {
      const [base, q] = await Promise.all([cargarBase(ctxE),
        ctx.api.from('remu_quincenas').select('*').eq('empresa_id', g.empresa.id).order('pagado_el', { ascending: false }).order('created_at', { ascending: false }).limit(2000)]);
      if (q.error) throw q.error;
      const personas = new Map(base.todos.map((v) => [v.persona_id, v]));
      return { ...g, ctxE, base, personas, quincenas: q.data ?? [] };
    } catch (e) { return { ...g, error: e.message, quincenas: [] }; }
  }));
}

const esFijo = (v) => v?.condicion?.modo === 'fijo';
const nombreDe = (d, pid) => { const v = d.personas.get(pid); return v ? nombreCompleto(v.personas) : 'Persona'; };
const corto = (d, pid) => { const p = d.personas.get(pid)?.personas; return p ? [p.nombres?.split(' ')[0], p.apellido_paterno].filter(Boolean).join(' ') : 'Persona'; };
// Trabajadores que se pueden elegir: activos (fijos primero)
const elegibles = (d) => d.base.vinculos.filter((v) => v.estado === 'activo')
  .sort((a, b) => (esFijo(b) - esFijo(a)) || nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));

async function guardar(ctx, d, q, cambios) {
  const v = { mes: q.mes, pagado_el: q.pagado_el, lineas: q.lineas, nota: q.nota, ...cambios };
  const { data, error } = await ctx.api.rpc('remu_quincena_guardar', { p_empresa: d.empresa.id, p_id: q.id ?? null, p_mes: v.mes, p_pagado_el: v.pagado_el, p_lineas: v.lineas, p_nota: v.nota ?? null });
  if (error) err(error);
  return data;
}

async function subirComprobante(ctx, d, id, archivo) {
  const a = archivo.type.startsWith('image/') ? await comprimirFoto(archivo) : archivo;
  const { ruta } = await subirArchivo(ctx.api, { empresaId: d.empresa.id, modulo: 'remu', archivo: a, tabla: 'remu_quincenas', registroId: id, tipos: TIPOS });
  const { error } = await ctx.api.rpc('remu_quincena_comprobante', { p_id: id, p_ruta: ruta, p_nombre: archivo.name });
  if (error) err(error);
}

// ---------------------------------------------------------------- Editor: quiénes y cuánto (nueva o agregar)

// q = quincena en borrador para agregar personas; sin q, registra una nueva
function editor(ctx, datos, q = null, dq = null) {
  const ok = q ? [dq] : datos.filter((d) => !d.error && d.puede('remu', 'crear'));
  if (!ok.length) return;
  let d = ok[0];
  const ya = new Set(q?.lineas.map((l) => l.persona_id) ?? []);
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const totalEl = el('strong', {}, dinero(0));
  const lista = el('div', { class: 'qn-lista' });
  const montos = new Map();   // persona → input

  const pintarLista = () => {
    montos.clear();
    const vs = elegibles(d).filter((v) => !ya.has(v.persona_id));
    lista.replaceChildren(...(vs.length ? vs.map((v) => {
      const marca = el('input', { type: 'checkbox', 'aria-label': `Incluir a ${nombreCompleto(v.personas)}` });
      const monto = el('input', { class: 'campo qn-monto', type: 'number', min: '1', step: '1', inputmode: 'numeric', placeholder: '$', 'aria-label': `Monto de ${nombreCompleto(v.personas)}` });
      monto.addEventListener('input', () => { marca.checked = Number(monto.value) > 0; sumar(); });
      marca.addEventListener('change', () => { if (marca.checked && !monto.value && todos.value) monto.value = todos.value; if (!marca.checked) monto.value = ''; sumar(); if (marca.checked && !monto.value) monto.focus(); });
      montos.set(v.persona_id, { marca, monto });
      return el('label', { class: 'qn-persona' }, marca, el('span', { class: 'qn-nombre' }, nombreCompleto(v.personas), esFijo(v) ? el('span', { class: 'chip chip-fijo' }, 'fijo') : null), monto);
    }) : [el('p', { class: 'texto-suave' }, 'Ya están todos los trabajadores activos.')]));
    sumar();
  };
  const elegidos = () => [...montos].filter(([, x]) => x.marca.checked).map(([persona_id, x]) => ({ persona_id, monto: Math.round(Number(x.monto.value) || 0) }));
  const sumar = () => { const l = elegidos(); totalEl.textContent = `${dinero(l.reduce((s, x) => s + x.monto, 0))} · ${l.length} ${l.length === 1 ? 'persona' : 'personas'}`; };

  const todos = el('input', { class: 'campo qn-monto', type: 'number', min: '1', step: '1', inputmode: 'numeric', placeholder: '$', 'aria-label': 'Monto para los marcados' });
  const aplicar = boton('Poner a los marcados', { onclick: () => { for (const x of montos.values()) if (x.marca.checked) x.monto.value = todos.value; sumar(); } });
  const mes = el('input', { class: 'campo', type: 'month', value: q?.mes ?? estado.mes, required: true });
  const fecha = el('input', { class: 'campo', type: 'date', value: hoyISO(), required: true });
  const nota = el('input', { class: 'campo', placeholder: 'Ej.: transferencia del 15' });
  const archivo = el('input', { class: 'campo', type: 'file', accept: 'image/*,application/pdf,.heic,.heif', multiple: true });
  const selEmpresa = ok.length > 1 ? el('select', { class: 'campo' }, ok.map((x) => el('option', { value: x.empresa.id }, nombreEmpresa(x.empresa)))) : null;
  selEmpresa?.addEventListener('change', () => { d = ok.find((x) => x.empresa.id === selEmpresa.value); pintarLista(); });
  const fila = (t, c) => el('label', { class: 'form-fila' }, el('span', {}, t), c);

  const bBorrador = boton(q ? 'Agregar' : 'Guardar borrador', { tipo: q ? 'primario' : 'secundario', onclick: () => enviar(false) });
  const bConfirmar = q || !d.puede('remu', 'editar') ? null : boton('Guardar y confirmar', { tipo: 'primario', icono: 'check', onclick: () => enviar(true) });
  const dialogo = el('dialog', { class: 'modal qn-modal', 'aria-label': q ? 'Agregar a la quincena' : 'Registrar quincena' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, q ? 'Agregar a la quincena' : 'Registrar quincena'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' },
      q ? null : el('div', { class: 'rejilla-campos' }, selEmpresa ? fila('Empresa', selEmpresa) : null, fila('Mes', mes), fila('Fecha de pago', fecha)),
      el('div', { class: 'qn-todos' }, el('span', { class: 'texto-suave texto-chico' }, 'Marca a quienes reciben y escribe su monto. Para dar el mismo a varios:'), todos, aplicar),
      lista,
      el('div', { class: 'qn-total' }, 'Total ', totalEl),
      q ? null : el('div', { class: 'rejilla-campos' }, fila('Comprobante (opcional, se puede adjuntar después)', archivo), fila('Nota (opcional)', nota)),
      error),
    el('div', { class: 'modal-pie' }, boton('Cancelar', { onclick: () => cerrar() }), bBorrador, bConfirmar));
  const cerrar = () => { dialogo.close(); dialogo.remove(); };

  async function enviar(confirmar) {
    error.textContent = '';
    const l = elegidos();
    if (!l.length) { error.textContent = 'Marca al menos un trabajador.'; return; }
    const sin = l.find((x) => !(x.monto > 0));
    if (sin) { error.textContent = `Falta el monto de ${nombreDe(d, sin.persona_id)}.`; return; }
    if (confirmar && !archivo.files.length) { error.textContent = 'Para confirmar, adjunta el comprobante (o guarda como borrador).'; return; }
    for (const b of [bBorrador, bConfirmar]) if (b) { b.disabled = true; }
    try {
      if (q) { await guardar(ctx, d, q, { lineas: [...q.lineas, ...l] }); cerrar(); ctx.refrescar(); return; }
      const id = await guardar(ctx, d, { mes: mes.value, pagado_el: fecha.value, nota: nota.value.trim() || null, lineas: l }, {});
      estado.mes = mes.value; estado.abierta = id;
      if (archivo.files.length) await subirComprobante(ctx, d, id, await prepararArchivos(archivo.files));
      if (confirmar) {
        const { error: e } = await ctx.api.rpc('remu_quincena_confirmar', { p_id: id });
        if (e) err(e);
        estado.abierta = null;
      }
      avisar(confirmar ? 'Quincena confirmada: ya está en el cierre del mes.' : 'Quincena guardada en borrador.');
      cerrar(); ctx.refrescar();
    } catch (e) {
      error.textContent = e.message;
      ctx.refrescar();
    } finally { for (const b of [bBorrador, bConfirmar]) if (b) b.disabled = false; }
  }

  pintarLista();
  document.body.append(dialogo);
  dialogo.showModal();
}

// ---------------------------------------------------------------- Acciones

function editarDatos(ctx, d, q) {
  abrirFormulario({
    titulo: 'Datos de la quincena',
    campos: [
      { id: 'mes', etiqueta: 'Mes de la quincena', tipo: 'month', requerido: true, valor: q.mes },
      { id: 'pagado_el', etiqueta: 'Fecha de pago', tipo: 'date', requerido: true, valor: q.pagado_el },
      { id: 'nota', etiqueta: 'Nota (opcional)', valor: q.nota ?? '' },
    ],
    alGuardar: async (v) => { await guardar(ctx, d, q, v); estado.mes = v.mes; ctx.refrescar(); },
  });
}

function adjuntar(ctx, d, q) {
  abrirFormulario({
    titulo: 'Comprobante del pago',
    mensaje: `${dinero(total(q))}. Varias fotos se juntan en un PDF.`,
    campos: [{ id: 'archivo', etiqueta: 'Foto o PDF', tipo: 'file', accept: 'image/*,application/pdf', requerido: true }],
    textoGuardar: 'Adjuntar',
    alGuardar: async (v) => {
      const f = Array.isArray(v.archivo) ? v.archivo[0] : v.archivo;
      if (!f) throw new Error('Elige el comprobante.');
      await subirComprobante(ctx, d, q.id, f);
      avisar('Comprobante adjunto.'); ctx.refrescar();
    },
  });
}

async function verComprobante(ctx, q, b) {
  b.disabled = true;
  try { window.open(await urlFirmada(ctx.api, q.comprobante_ruta, 300), '_blank', 'noopener'); }
  catch (e) { avisar(e.message, 'error'); } finally { b.disabled = false; }
}

async function quitarComprobante(ctx, q) {
  if (!confirm('¿Quitar el comprobante?')) return;
  const { error } = await ctx.api.rpc('remu_quincena_comprobante', { p_id: q.id, p_ruta: null, p_nombre: null });
  if (error) { avisar(error.message, 'error'); return; }
  ctx.refrescar();
}

async function confirmar(ctx, q, b) {
  const n = q.lineas.filter((l) => l.monto > 0).length;
  if (!confirm(`¿Confirmar la quincena? ${n} ${n === 1 ? 'persona' : 'personas'} · ${dinero(total(q))}. Queda como pagada y se resta de A pagar en el cierre.`)) return;
  b.disabled = true;
  const { error } = await ctx.api.rpc('remu_quincena_confirmar', { p_id: q.id });
  b.disabled = false;
  if (error) { avisar(error.message, 'error'); return; }
  estado.abierta = null;
  avisar('Quincena confirmada: ya está en el cierre del mes.'); ctx.refrescar();
}

function anular(ctx, q) {
  const borr = q.estado === 'borrador';
  abrirFormulario({
    titulo: borr ? 'Descartar borrador' : 'Anular quincena',
    mensaje: borr ? 'El borrador queda descartado (no cuenta en el cierre).' : 'Se quitan sus montos del cierre del mes. La quincena queda registrada como anulada.',
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: borr ? 'Descartado' : '' }],
    textoGuardar: borr ? 'Descartar' : 'Anular',
    alGuardar: async (v) => {
      const { error } = await ctx.api.rpc('remu_quincena_anular', { p_id: q.id, p_motivo: v.motivo });
      if (error) err(error);
      avisar(borr ? 'Borrador descartado.' : 'Quincena anulada.'); ctx.refrescar();
    },
  });
}

// ---------------------------------------------------------------- Detalle de una quincena (al abrir su fila)

function detalle(ctx, datos, d, q) {
  const borrador = q.estado === 'borrador';
  const editable = borrador && d.puede('remu', 'crear');
  const cambiarMonto = async (pid, input) => {
    const monto = Math.round(Number(input.value));
    if (!(monto > 0)) { input.value = q.lineas.find((l) => l.persona_id === pid)?.monto ?? ''; avisar('El monto debe ser mayor que cero.', 'error'); return; }
    try { await guardar(ctx, d, q, { lineas: q.lineas.map((l) => (l.persona_id === pid ? { ...l, monto } : l)) }); ctx.refrescar(); }
    catch (e) { avisar(e.message, 'error'); }
  };
  const quitar = async (pid) => {
    if (q.lineas.length === 1) { avisar('Es la única persona: descarta el borrador si no va.'); return; }
    try { await guardar(ctx, d, q, { lineas: q.lineas.filter((l) => l.persona_id !== pid) }); ctx.refrescar(); }
    catch (e) { avisar(e.message, 'error'); }
  };
  const lineas = [...q.lineas].sort((a, b) => nombreDe(d, a.persona_id).localeCompare(nombreDe(d, b.persona_id)));
  return el('div', { class: 'qn-detalle' },
    q.estado === 'anulada' ? el('p', { class: 'texto-suave texto-chico' }, `Anulada: ${q.anulada_motivo ?? ''}`) : null,
    el('ul', { class: 'qn-lineas' }, lineas.map((l) => el('li', {},
      el('span', {}, nombreDe(d, l.persona_id), esFijo(d.personas.get(l.persona_id)) ? el('span', { class: 'chip chip-fijo' }, 'fijo') : null),
      editable
        ? el('input', { class: 'campo qn-monto', type: 'number', min: '1', step: '1', value: l.monto, 'aria-label': `Monto de ${nombreDe(d, l.persona_id)}`, onchange: (ev) => cambiarMonto(l.persona_id, ev.target) })
        : el('strong', {}, dinero(l.monto)),
      editable ? el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Quitar a ${nombreDe(d, l.persona_id)}`, title: 'Quitar', onclick: () => quitar(l.persona_id) }, icono('basura', { tam: 16 })) : null))),
    q.nota ? el('p', { class: 'texto-suave texto-chico' }, q.nota) : null,
    q.estado === 'anulada' ? null : el('div', { class: 'qn-acciones' },
      q.comprobante_ruta
        ? [boton('Ver comprobante', { icono: 'ojo', onclick: (ev) => verComprobante(ctx, q, ev.currentTarget) }), editable ? boton('Quitar comprobante', { onclick: () => quitarComprobante(ctx, q) }) : null]
        : editable ? boton('Adjuntar comprobante', { icono: 'documento', onclick: () => adjuntar(ctx, d, q) }) : null,
      editable ? [boton('Agregar trabajadores', { icono: 'mas', onclick: () => editor(ctx, datos, q, d) }), boton('Fecha y nota', { icono: 'lapiz', onclick: () => editarDatos(ctx, d, q) })] : null,
      borrador && d.puede('remu', 'editar') ? boton('Confirmar', { icono: 'check', tipo: 'primario', disabled: !q.comprobante_ruta, title: q.comprobante_ruta ? null : 'Primero adjunta el comprobante', onclick: (ev) => confirmar(ctx, q, ev.currentTarget) }) : null,
      (borrador ? d.puede('remu', 'crear') : d.puede('remu', 'editar')) ? boton(borrador ? 'Descartar' : 'Anular', { onclick: () => anular(ctx, q) }) : null));
}

// ---------------------------------------------------------------- Vista

export async function vistaQuincenas(ctx, { empresas, cierre = '#/remu.mes' }) {
  const datos = await cargar(ctx, empresas);
  const varias = empresas.length > 1;
  const todas = datos.flatMap((d) => d.quincenas.map((q) => ({ d, q })));
  const orden = { borrador: 0, confirmada: 1, anulada: 2 };
  todas.sort((a, b) => orden[a.q.estado] - orden[b.q.estado] || String(b.q.pagado_el).localeCompare(String(a.q.pagado_el)));
  const puedeCrear = datos.some((d) => !d.error && d.puede('remu', 'crear'));
  const cols = varias ? 8 : 7;
  const F = estado.f;
  const meses = [...new Set(todas.map((x) => x.q.mes))].sort().reverse();
  if (F.mes && !meses.includes(F.mes)) F.mes = '';

  const cuerpo = el('div');
  const fila = (d, q) => {
    const abierta = estado.abierta === q.id;
    const [tEstado, cEstado] = ESTADOS[q.estado];
    const nombres = [...q.lineas].sort((a, b) => b.monto - a.monto).map((l) => corto(d, l.persona_id));
    const abrir = () => { estado.abierta = abierta ? null : q.id; pintar(); };
    return [
      el('tr', { class: `fila-clic${abierta ? ' qn-abierta' : ''}${q.estado === 'anulada' ? ' qn-anulada' : ''}`, onclick: abrir, tabindex: '0', 'aria-expanded': String(abierta), onkeydown: (ev) => { if (ev.key === 'Enter') abrir(); } },
        el('td', { class: 'qn-nowrap' }, icono(abierta ? 'abajo' : 'derecha', { tam: 14 }), ' ', fechaLarga(q.pagado_el)),
        el('td', { class: 'qn-nowrap' }, nombreMes(q.mes)),
        varias ? el('td', {}, el('span', { class: 'ger-empresa' }, el('i', { style: `background:${d.empresa.color || 'var(--empresa)'}` }), nombreEmpresa(d.empresa))) : null,
        el('td', { class: 'qn-nombres', title: nombres.join(', ') }, nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más` : nombres.join(', ')),
        el('td', { class: 'num' }, el('strong', {}, dinero(total(q)))),
        el('td', {}, q.comprobante_ruta ? el('span', { class: 'chip chip-ok' }, 'Comprobante') : q.estado === 'borrador' ? el('span', { class: 'chip chip-prox' }, 'Falta') : '—'),
        el('td', {}, el('span', { class: `chip ${cEstado}` }, tEstado)),
        el('td', { class: 'qn-nowrap', onclick: (ev) => ev.stopPropagation() },
          q.estado === 'borrador' && d.puede('remu', 'crear') && !q.comprobante_ruta ? boton('Adjuntar', { icono: 'documento', onclick: () => adjuntar(ctx, d, q) }) : null,
          q.estado === 'borrador' && q.comprobante_ruta && d.puede('remu', 'editar') ? boton('Confirmar', { icono: 'check', tipo: 'primario', onclick: (ev) => confirmar(ctx, q, ev.currentTarget) }) : null)),
      abierta ? el('tr', { class: 'qn-fila-detalle' }, el('td', { colspan: cols }, detalle(ctx, datos, d, q))) : null,
    ].filter(Boolean);
  };

  const pintar = () => {
    const b = F.buscar.trim().toLowerCase();
    const vistas = todas.filter(({ d, q }) => (!F.mes || q.mes === F.mes) && (F.estado === 'todas' || (F.estado ? q.estado === F.estado : q.estado !== 'anulada')) && (!F.empresa || d.empresa.id === F.empresa)
      && (!b || q.lineas.some((l) => nombreDe(d, l.persona_id).toLowerCase().includes(b))));
    const conf = vistas.filter((x) => x.q.estado === 'confirmada');
    const borr = vistas.filter((x) => x.q.estado === 'borrador');
    const suma = (l) => l.reduce((s, x) => s + total(x.q), 0);
    cuerpo.replaceChildren(...[
      el('p', { class: 'texto-suave texto-chico' }, `${vistas.length} ${vistas.length === 1 ? 'quincena' : 'quincenas'} · confirmado `, el('strong', {}, dinero(suma(conf))),
        borr.length ? ` · ${borr.length} en borrador por ${dinero(suma(borr))} (no cuentan hasta confirmarlas)` : ''),
      vistas.length
        ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla qn-tabla' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Pagada el'), el('th', {}, 'Mes'), varias ? el('th', {}, 'Empresa') : null, el('th', {}, 'Trabajadores'), el('th', { class: 'num' }, 'Total'), el('th', {}, 'Comprobante'), el('th', {}, 'Estado'), el('th', {}))),
          el('tbody', {}, vistas.flatMap(({ d, q }) => fila(d, q)))))
        : el('p', { class: 'tabla-vacia' }, todas.length ? (F.estado ? 'Nada con estos filtros.' : 'No hay quincenas vigentes (las anuladas se ven en el filtro de estado).') : 'Todavía no hay quincenas registradas.')]);
  };

  const sel = (k, etiqueta, opciones) => {
    const s = el('select', { class: 'campo', 'aria-label': etiqueta }, el('option', { value: '' }, etiqueta), opciones.map(([v, t]) => el('option', { value: v, selected: F[k] === v }, t)));
    s.addEventListener('change', () => { F[k] = s.value; pintar(); });
    return s;
  };
  const buscar = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar trabajador', value: F.buscar, 'aria-label': 'Buscar trabajador' });
  buscar.addEventListener('input', () => { F.buscar = buscar.value; pintar(); });
  pintar();

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Quincenas'),
        el('p', { class: 'texto-suave' }, 'Al confirmarla se resta de A pagar en el ', el('a', { href: cierre }, 'cierre de remuneraciones'), ' de su mes.')),
      puedeCrear ? boton('Registrar quincena', { icono: 'mas', tipo: 'primario', onclick: () => editor(ctx, datos) }) : null),
    datos.filter((d) => d.error).map((d) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEmpresa(d.empresa)}: ${d.error}`)),
    todas.length ? el('div', { class: 'qn-filtros' },
      sel('mes', 'Todos los meses', meses.map((m) => [m, nombreMes(m)])),
      sel('estado', 'Sin anuladas', [['borrador', 'Borrador'], ['confirmada', 'Confirmada'], ['anulada', 'Anuladas'], ['todas', 'Todas, con anuladas']]),
      varias ? sel('empresa', 'Todas las empresas', datos.filter((d) => !d.error).map((d) => [d.empresa.id, nombreEmpresa(d.empresa)])) : null,
      buscar) : null,
    cuerpo);
}
