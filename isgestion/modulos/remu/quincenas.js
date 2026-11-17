// Quincenas (Remuneraciones 009, pedido de Enzo 2026-11-16): registrar la quincena del mes en tres pasos.
// 1) "Registrar quincena": empresa, mes, fecha de pago, quiénes y cuánto → queda en borrador (se pueden cambiar los
//    montos de cada uno, agregar o quitar personas). 2) Adjuntar el comprobante del pago (foto o PDF; varias fotos se
//    juntan en un PDF). 3) Confirmar: la base crea un movimiento "Quincena" del mes por persona, que el Cierre de
//    remuneraciones resta de A pagar (ya se pagó; no cambia el costo). Anular con motivo quita esos movimientos.
// La usan Remuneraciones → Quincenas (una empresa) y Grupo → Quincenas (todas las empresas con Remuneraciones).
import { el } from '../../core/ui/dom.js?v=3743624';
import { icono } from '../../core/ui/iconos.js?v=3743624';
import { boton } from '../../core/ui/tabla.js?v=3743624';
import { avisar } from '../../core/ui/aviso.js?v=3743624';
import { dinero, hoyISO, moverMes, nombreMes, fechaLarga } from '../../core/ui/formato.js?v=3743624';
import { abrirFormulario } from '../../core/ui/modal.js?v=3743624';
import { nombreEmpresa } from '../../core/empresas.js?v=3743624';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=3743624';
import { comprimirFoto } from '../../core/imagenes.js?v=3743624';
import { cargarBase, nombreCompleto } from './datos.js?v=3743624';

const estado = { mes: hoyISO().slice(0, 7) };
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ESTADOS = { borrador: ['Borrador', 'chip-pend'], confirmada: ['Confirmada', 'chip-ok'], anulada: ['Anulada', 'chip'] };

const err = (e) => { throw new Error(e.message); };
const total = (q) => q.lineas.reduce((s, l) => s + (Number(l.monto) || 0), 0);

async function cargar(ctx, empresas, mes) {
  return Promise.all(empresas.map(async (g) => {
    const ctxE = { ...ctx, empresa: g.empresa, puede: g.puede };
    try {
      const [base, q] = await Promise.all([cargarBase(ctxE),
        ctx.api.from('remu_quincenas').select('*').eq('empresa_id', g.empresa.id).eq('mes', mes).order('created_at')]);
      if (q.error) throw q.error;
      const personas = new Map(base.todos.map((v) => [v.persona_id, v]));
      return { ...g, ctxE, base, personas, quincenas: q.data ?? [] };
    } catch (e) { return { ...g, error: e.message, quincenas: [] }; }
  }));
}

const esFijo = (v) => v.condicion?.modo === 'fijo';
const nombreDe = (d, pid) => { const v = d.personas.get(pid); return v ? nombreCompleto(v.personas) : 'Persona'; };
// Trabajadores que se pueden elegir: activos (fijos primero)
const elegibles = (d) => d.base.vinculos.filter((v) => v.estado === 'activo')
  .sort((a, b) => (esFijo(b) - esFijo(a)) || nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));

async function guardar(ctx, d, q, cambios) {
  const v = { mes: q.mes, pagado_el: q.pagado_el, lineas: q.lineas, nota: q.nota, ...cambios };
  const { data, error } = await ctx.api.rpc('remu_quincena_guardar', { p_empresa: d.empresa.id, p_id: q.id ?? null, p_mes: v.mes, p_pagado_el: v.pagado_el, p_lineas: v.lineas, p_nota: v.nota ?? null });
  if (error) err(error);
  return data;
}

// ---------------------------------------------------------------- Registrar

function registrar(ctx, datos) {
  const ok = datos.filter((d) => !d.error && d.puede('remu', 'crear'));
  if (ok.length === 1) return formulario(ctx, ok[0]);
  abrirFormulario({
    titulo: 'Registrar quincena',
    campos: [{ id: 'empresa', etiqueta: 'Empresa', opciones: ok.map((d) => [d.empresa.id, nombreEmpresa(d.empresa)]) }],
    textoGuardar: 'Siguiente',
    alGuardar: (v) => { queueMicrotask(() => formulario(ctx, ok.find((d) => d.empresa.id === v.empresa))); },
  });
}

function formulario(ctx, d) {
  const lista = elegibles(d);
  abrirFormulario({
    titulo: `Registrar quincena · ${nombreEmpresa(d.empresa)}`,
    mensaje: 'Queda en borrador: después puedes cambiar el monto de cada uno, adjuntar el comprobante y confirmar.',
    campos: [
      { id: 'mes', etiqueta: 'Mes de la quincena', tipo: 'month', requerido: true, valor: estado.mes },
      { id: 'pagado_el', etiqueta: 'Fecha de pago', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto para cada uno ($)', tipo: 'number', requerido: true, ayuda: 'El mismo para todos; si alguno recibe otro monto, lo cambias en el borrador.' },
      { id: 'personas', etiqueta: 'Trabajadores', tipo: 'checks', valor: lista.filter(esFijo).map((v) => v.persona_id),
        opciones: lista.map((v) => [v.persona_id, `${nombreCompleto(v.personas)}${esFijo(v) ? ' · fijo' : ''}`]) },
      { id: 'nota', etiqueta: 'Nota (opcional)', ayuda: 'Ej.: transferencia del 15.' },
    ],
    textoGuardar: 'Crear borrador',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto.');
      if (!v.personas.length) throw new Error('Elige al menos un trabajador.');
      await guardar(ctx, d, { mes: v.mes, pagado_el: v.pagado_el, nota: v.nota, lineas: v.personas.map((p) => ({ persona_id: p, monto })) }, {});
      if (v.mes !== estado.mes) estado.mes = v.mes;
      avisar('Quincena en borrador. Revisa los montos, adjunta el comprobante y confirma.');
      ctx.refrescar();
    },
  });
}

function agregarPersonas(ctx, d, q) {
  const ya = new Set(q.lineas.map((l) => l.persona_id));
  const lista = elegibles(d).filter((v) => !ya.has(v.persona_id));
  if (!lista.length) { avisar('Ya están todos los trabajadores activos.'); return; }
  abrirFormulario({
    titulo: 'Agregar a la quincena',
    campos: [
      { id: 'personas', etiqueta: 'Trabajadores', tipo: 'checks', opciones: lista.map((v) => [v.persona_id, `${nombreCompleto(v.personas)}${esFijo(v) ? ' · fijo' : ''}`]) },
      { id: 'monto', etiqueta: 'Monto para cada uno ($)', tipo: 'number', requerido: true, valor: q.lineas[0]?.monto ?? '' },
    ],
    textoGuardar: 'Agregar',
    alGuardar: async (v) => {
      const monto = Math.round(Number(v.monto));
      if (!(monto > 0)) throw new Error('Indica el monto.');
      if (!v.personas.length) throw new Error('Elige al menos un trabajador.');
      await guardar(ctx, d, q, { lineas: [...q.lineas, ...v.personas.map((p) => ({ persona_id: p, monto }))] });
      ctx.refrescar();
    },
  });
}

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

// ---------------------------------------------------------------- Comprobante, confirmar y anular

function adjuntar(ctx, d, q) {
  abrirFormulario({
    titulo: 'Comprobante del pago',
    mensaje: `Quincena de ${nombreMes(q.mes)} · ${dinero(total(q))}. El comprobante de la transferencia (o varios: elige todas las fotos y se juntan en un PDF).`,
    campos: [{ id: 'archivo', etiqueta: 'Foto o PDF', tipo: 'file', accept: 'image/*,application/pdf', requerido: true }],
    textoGuardar: 'Adjuntar',
    alGuardar: async (v) => {
      const f = Array.isArray(v.archivo) ? v.archivo[0] : v.archivo;
      if (!f) throw new Error('Elige el comprobante.');
      const a = f.type.startsWith('image/') ? await comprimirFoto(f) : f;
      const { ruta } = await subirArchivo(ctx.api, { empresaId: d.empresa.id, modulo: 'remu', archivo: a, tabla: 'remu_quincenas', registroId: q.id, tipos: TIPOS });
      const { error } = await ctx.api.rpc('remu_quincena_comprobante', { p_id: q.id, p_ruta: ruta, p_nombre: f.name });
      if (error) err(error);
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

async function confirmar(ctx, d, q, b) {
  const n = q.lineas.filter((l) => l.monto > 0).length;
  if (!confirm(`¿Confirmar la quincena de ${nombreMes(q.mes)}? ${n} ${n === 1 ? 'persona' : 'personas'} · ${dinero(total(q))}. Queda como pagada y se resta de A pagar en el cierre de remuneraciones.`)) return;
  b.disabled = true;
  const { error } = await ctx.api.rpc('remu_quincena_confirmar', { p_id: q.id });
  b.disabled = false;
  if (error) { avisar(error.message, 'error'); return; }
  avisar('Quincena confirmada: ya está en el cierre del mes.'); ctx.refrescar();
}

function anular(ctx, q) {
  abrirFormulario({
    titulo: q.estado === 'borrador' ? 'Descartar borrador' : 'Anular quincena',
    mensaje: q.estado === 'borrador' ? 'El borrador queda descartado (no cuenta en el cierre).' : 'Se quitan sus movimientos del cierre del mes. La quincena queda registrada como anulada.',
    campos: [{ id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: q.estado === 'borrador' ? 'Descartado' : '' }],
    textoGuardar: q.estado === 'borrador' ? 'Descartar' : 'Anular',
    alGuardar: async (v) => {
      const { error } = await ctx.api.rpc('remu_quincena_anular', { p_id: q.id, p_motivo: v.motivo });
      if (error) err(error);
      avisar(q.estado === 'borrador' ? 'Borrador descartado.' : 'Quincena anulada.'); ctx.refrescar();
    },
  });
}

// ---------------------------------------------------------------- Tarjeta de una quincena

function tarjeta(ctx, d, q, varias) {
  const borrador = q.estado === 'borrador';
  const editable = borrador && d.puede('remu', 'crear');
  const [tEstado, cEstado] = ESTADOS[q.estado];
  const cambiarMonto = async (pid, valor, input) => {
    const monto = Math.round(Number(valor));
    if (!(monto >= 0)) { input.value = q.lineas.find((l) => l.persona_id === pid)?.monto ?? 0; return; }
    try { await guardar(ctx, d, q, { lineas: q.lineas.map((l) => (l.persona_id === pid ? { ...l, monto } : l)) }); ctx.refrescar(); }
    catch (e) { avisar(e.message, 'error'); }
  };
  const quitar = async (pid) => {
    if (q.lineas.length === 1) { avisar('Es la única persona: descarta el borrador si no va.'); return; }
    try { await guardar(ctx, d, q, { lineas: q.lineas.filter((l) => l.persona_id !== pid) }); ctx.refrescar(); }
    catch (e) { avisar(e.message, 'error'); }
  };
  const lineas = [...q.lineas].sort((a, b) => nombreDe(d, a.persona_id).localeCompare(nombreDe(d, b.persona_id)));

  return el('article', { class: `ficha quincena quincena-${q.estado}` },
    el('header', { class: 'quincena-cabecera' },
      el('div', {},
        el('h3', {}, varias ? el('i', { class: 'cierre-punto', style: `background:${d.empresa.color || 'var(--empresa)'}` }) : null,
          `Quincena ${nombreMes(q.mes)}`, varias ? el('span', { class: 'texto-suave' }, ` · ${nombreEmpresa(d.empresa)}`) : null),
        el('p', { class: 'texto-suave texto-chico' }, `Pagada el ${fechaLarga(q.pagado_el)} · ${q.lineas.length} ${q.lineas.length === 1 ? 'persona' : 'personas'}${q.nota ? ` · ${q.nota}` : ''}`)),
      el('div', { class: 'quincena-total' }, el('span', { class: `chip ${cEstado}` }, tEstado), el('strong', {}, dinero(total(q))))),
    q.estado === 'anulada' ? el('p', { class: 'texto-suave texto-chico' }, `Motivo: ${q.anulada_motivo ?? ''}`) : null,
    q.estado === 'anulada' ? null : el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla quincena-tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Trabajador'), el('th', { class: 'num' }, 'Monto'), editable ? el('th', {}) : null)),
      el('tbody', {}, lineas.map((l) => el('tr', { class: esFijo(d.personas.get(l.persona_id) ?? {}) ? 'fila-fijo' : '' },
        el('td', {}, nombreDe(d, l.persona_id)),
        el('td', { class: 'num' }, editable
          ? el('input', { class: 'campo quincena-monto', type: 'number', min: '0', step: '1', value: l.monto, 'aria-label': `Monto de ${nombreDe(d, l.persona_id)}`,
            onchange: (ev) => cambiarMonto(l.persona_id, ev.target.value, ev.target) })
          : dinero(l.monto)),
        editable ? el('td', {}, el('button', { type: 'button', class: 'boton-icono', 'aria-label': `Quitar a ${nombreDe(d, l.persona_id)}`, title: 'Quitar', onclick: () => quitar(l.persona_id) }, icono('basura', { tam: 16 }))) : null))),
      el('tfoot', {}, el('tr', {}, el('td', {}, el('strong', {}, 'Total')), el('td', { class: 'num' }, el('strong', {}, dinero(total(q)))), editable ? el('td', {}) : null)))),
    q.estado === 'anulada' ? null : el('div', { class: 'quincena-pasos' },
      el('div', { class: 'quincena-comprobante' }, icono('documento', { tam: 16 }),
        q.comprobante_ruta
          ? [el('span', {}, q.comprobante_nombre || 'Comprobante'),
            boton('Ver', { icono: 'ojo', onclick: (ev) => verComprobante(ctx, q, ev.currentTarget) }),
            editable ? boton('Quitar', { onclick: () => quitarComprobante(ctx, q) }) : null]
          : [el('span', { class: 'texto-suave' }, 'Sin comprobante'), editable ? boton('Adjuntar comprobante', { icono: 'documento', tipo: borrador ? 'primario' : 'secundario', onclick: () => adjuntar(ctx, d, q) }) : null]),
      el('div', { class: 'quincena-acciones' },
        editable ? [boton('Agregar trabajadores', { icono: 'mas', onclick: () => agregarPersonas(ctx, d, q) }), boton('Datos', { icono: 'lapiz', onclick: () => editarDatos(ctx, d, q) })] : null,
        borrador && d.puede('remu', 'editar') ? boton('Confirmar quincena', { icono: 'check', tipo: 'primario', disabled: !q.comprobante_ruta,
          title: q.comprobante_ruta ? null : 'Primero adjunta el comprobante', onclick: (ev) => confirmar(ctx, d, q, ev.currentTarget) }) : null,
        (borrador ? d.puede('remu', 'crear') : d.puede('remu', 'editar')) ? boton(borrador ? 'Descartar' : 'Anular', { onclick: () => anular(ctx, q) }) : null)),
    borrador && !q.comprobante_ruta ? el('p', { class: 'texto-suave texto-chico' }, 'Falta el comprobante para confirmar. Mientras esté en borrador no cuenta en el cierre.') : null);
}

// ---------------------------------------------------------------- Vista

export async function vistaQuincenas(ctx, { empresas, cierre = '#/remu.mes' }) {
  const mes = estado.mes;
  const datos = await cargar(ctx, empresas, mes);
  const varias = empresas.length > 1;
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const todas = datos.flatMap((d) => d.quincenas.map((q) => ({ d, q })));
  const orden = { borrador: 0, confirmada: 1, anulada: 2 };
  todas.sort((a, b) => orden[a.q.estado] - orden[b.q.estado] || String(a.q.pagado_el).localeCompare(String(b.q.pagado_el)));
  const confirmado = todas.filter((x) => x.q.estado === 'confirmada').reduce((s, x) => s + total(x.q), 0);
  const puedeCrear = datos.some((d) => !d.error && d.puede('remu', 'crear'));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Quincenas'),
        el('p', { class: 'texto-suave' }, 'Lo pagado a mitad de mes. Al confirmarla se resta de A pagar en el ', el('a', { href: cierre }, 'cierre de remuneraciones'), '.')),
      el('div', { class: 'nav-periodo' },
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
        el('strong', {}, nombreMes(mes)),
        el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha'))),
      puedeCrear ? boton('Registrar quincena', { icono: 'mas', tipo: 'primario', onclick: () => registrar(ctx, datos) }) : null),
    datos.filter((d) => d.error).map((d) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEmpresa(d.empresa)}: ${d.error}`)),
    confirmado ? el('p', { class: 'texto-suave' }, 'Confirmado en ', nombreMes(mes), ': ', el('strong', {}, dinero(confirmado))) : null,
    todas.length
      ? el('div', { class: 'quincenas' }, todas.map(({ d, q }) => tarjeta(ctx, d, q, varias)))
      : el('p', { class: 'tabla-vacia' }, `No hay quincenas registradas en ${nombreMes(mes)}.`));
}
