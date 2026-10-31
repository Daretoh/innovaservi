// Balance de gestión (como Finanzas de InnovaGestión): cuentas (banco, caja, tarjetas) con su último saldo, por cobrar,
// por pagar, deudas y préstamos con otras empresas del grupo. No es el balance tributario: sirve para saber cuánto se
// tiene y cuánto se debe hoy. Solo con costos.aprobar.
import { el } from '../../../core/ui/dom.js?v=a7f53fa';
import { icono } from '../../../core/ui/iconos.js?v=a7f53fa';
import { boton } from '../../../core/ui/tabla.js?v=a7f53fa';
import { abrirFormulario } from '../../../core/ui/modal.js?v=a7f53fa';
import { avisar } from '../../../core/ui/aviso.js?v=a7f53fa';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=a7f53fa';
import { cargarCuentas, cargarPendientes, cargarDeudas } from '../tesoreria.js?v=a7f53fa';
import { sinPermiso } from './flujo.js?v=a7f53fa';

const TIPOS_CUENTA = [['banco', 'Banco'], ['caja', 'Caja'], ['tarjeta', 'Tarjeta de crédito'], ['otro', 'Otra']];
const TIPOS_DEUDA = [['prestamo', 'Préstamo'], ['leasing', 'Leasing'], ['linea', 'Línea de crédito'], ['otro', 'Otra']];

export default async function vista(ctx) {
  if (!ctx.puede('costos', 'aprobar')) return sinPermiso();
  const e = ctx.empresa.id;
  const [cuentas, pend, deudas, pres] = await Promise.all([cargarCuentas(ctx), cargarPendientes(ctx), cargarDeudas(ctx),
    ctx.api.from('fin_prestamos').select('*').eq('empresa_id', e).is('deleted_at', null).order('fecha', { ascending: false })]);
  const prestamos = pres.data ?? [];
  const activas = cuentas.filter((c) => c.activo);
  const saldo = (c) => Number(c.ultimo?.saldo ?? 0);
  const enCaja = activas.filter((c) => c.tipo !== 'tarjeta').reduce((s, c) => s + saldo(c), 0);
  const tarjetas = activas.filter((c) => c.tipo === 'tarjeta').reduce((s, c) => s + saldo(c), 0);
  const porCobrar = pend.filter((p) => p.lado === 'cobrar').reduce((s, p) => s + p.monto, 0);
  const porPagar = pend.filter((p) => p.lado === 'pagar').reduce((s, p) => s + p.monto, 0);
  const deuda = deudas.filter((d) => d.activo).reduce((s, d) => s + Number(d.saldo), 0);
  // Préstamos del grupo: neto por contraparte (positivo = nos deben)
  const porContraparte = new Map();
  for (const p of prestamos) porContraparte.set(p.contraparte, (porContraparte.get(p.contraparte) ?? 0) + (p.sentido === 'otorgado' ? 1 : -1) * Number(p.monto));
  const nosDeben = [...porContraparte.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  const debemos = -[...porContraparte.values()].filter((v) => v < 0).reduce((s, v) => s + v, 0);
  const activos = enCaja + porCobrar + nosDeben;
  const pasivos = tarjetas + porPagar + deuda + debemos;

  // ---- Formularios
  const cuenta = (c) => abrirFormulario({
    titulo: c ? c.nombre : 'Nueva cuenta',
    campos: [{ id: 'nombre', etiqueta: 'Nombre', requerido: true, valor: c?.nombre ?? '', ayuda: 'Ej.: Banco Estado cuenta corriente, Caja chica, Tarjeta Santander.' },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_CUENTA, valor: c?.tipo ?? 'banco' },
      ...(c ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['si', 'Activa'], ['no', 'Inactiva']], valor: c.activo ? 'si' : 'no' }] : [])],
    alGuardar: async (x) => {
      const fila = { nombre: x.nombre.trim(), tipo: x.tipo, ...(c ? { activo: x.activo === 'si' } : {}) };
      const r = c ? await ctx.api.from('fin_cuentas').update(fila).eq('id', c.id) : await ctx.api.from('fin_cuentas').insert({ empresa_id: e, ...fila });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya hay una cuenta con ese nombre.' : r.error.message);
      ctx.refrescar();
    },
  });
  const anotarSaldo = (c) => abrirFormulario({
    titulo: `Saldo · ${c.nombre}`,
    mensaje: c.tipo === 'tarjeta' ? 'Lo que se debe en la tarjeta (en positivo).' : 'Lo que hay en la cuenta hoy (puede ser negativo si hay sobregiro).',
    campos: [{ id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() }, { id: 'saldo', etiqueta: 'Saldo', tipo: 'number', requerido: true, valor: c.ultimo?.saldo ?? '' }],
    alGuardar: async (x) => {
      const fila = { empresa_id: e, cuenta_id: c.id, fecha: x.fecha, saldo: Math.round(Number(x.saldo) || 0) };
      const { data: ya } = await ctx.api.from('fin_saldos').select('id').eq('cuenta_id', c.id).eq('fecha', x.fecha).maybeSingle();
      const r = ya ? await ctx.api.from('fin_saldos').update({ saldo: fila.saldo }).eq('id', ya.id) : await ctx.api.from('fin_saldos').insert(fila);
      if (r.error) throw new Error(r.error.message);
      avisar('Saldo anotado.'); ctx.refrescar();
    },
  });
  const deudaForm = (d) => abrirFormulario({
    titulo: d ? d.acreedor : 'Nueva deuda',
    campos: [
      { id: 'acreedor', etiqueta: 'Acreedor', requerido: true, valor: d?.acreedor ?? '', ayuda: 'Ej.: Banco de Chile, crédito Fogape.' },
      { id: 'tipo', etiqueta: 'Tipo', opciones: TIPOS_DEUDA, valor: d?.tipo ?? 'prestamo' },
      { id: 'saldo', etiqueta: 'Saldo adeudado', tipo: 'number', requerido: true, valor: d?.saldo ?? '' },
      { id: 'fecha_saldo', etiqueta: 'Saldo a la fecha', tipo: 'date', valor: d?.fecha_saldo ?? hoyISO() },
      { id: 'cuota', etiqueta: 'Cuota mensual', tipo: 'number', valor: d?.cuota ?? '' },
      { id: 'dia', etiqueta: 'Día de pago', tipo: 'number', valor: d?.dia ?? '' },
      { id: 'hasta', etiqueta: 'Última cuota', tipo: 'date', valor: d?.hasta ?? '' },
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: d?.notas ?? '' },
      ...(d ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['si', 'Vigente'], ['no', 'Pagada']], valor: d.activo ? 'si' : 'no' }] : []),
    ],
    alGuardar: async (x) => {
      const n = (v) => Math.max(0, Math.round(Number(v) || 0));
      const fila = { acreedor: x.acreedor.trim(), tipo: x.tipo, saldo: n(x.saldo), fecha_saldo: x.fecha_saldo || hoyISO(), cuota: n(x.cuota),
        dia: x.dia ? Math.min(31, Math.max(1, n(x.dia))) : null, hasta: x.hasta || null, notas: x.notas.trim() || null, ...(d ? { activo: x.activo === 'si' } : {}) };
      const r = d ? await ctx.api.from('fin_deudas').update(fila).eq('id', d.id) : await ctx.api.from('fin_deudas').insert({ empresa_id: e, ...fila });
      if (r.error) throw new Error(r.error.message);
      ctx.refrescar();
    },
  });
  const prestamo = () => abrirFormulario({
    titulo: 'Préstamo con otra empresa del grupo',
    mensaje: 'No es gasto ni ingreso: solo queda la deuda entre las empresas.',
    campos: [
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'contraparte', etiqueta: 'Empresa', requerido: true, ayuda: 'Ej.: IS Performance.' },
      { id: 'sentido', etiqueta: 'Sentido', opciones: [['otorgado', 'Le prestamos (nos debe)'], ['recibido', 'Nos prestó (le debemos)']] },
      { id: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true },
      { id: 'concepto', etiqueta: 'Concepto', requerido: true, ayuda: 'Ej.: pago de sueldos de octubre, devolución.' },
    ],
    alGuardar: async (x) => {
      const monto = Math.round(Number(x.monto));
      if (!(monto > 0)) throw new Error('El monto debe ser mayor a cero.');
      const { error } = await ctx.api.from('fin_prestamos').insert({ empresa_id: e, fecha: x.fecha, contraparte: x.contraparte.trim(), sentido: x.sentido, monto, concepto: x.concepto.trim() });
      if (error) throw new Error(error.message);
      ctx.refrescar();
    },
  });
  const quitarPrestamo = (p) => abrirFormulario({ titulo: 'Eliminar movimiento', mensaje: `${p.concepto} · ${dinero(p.monto)}`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { const { error } = await ctx.api.from('fin_prestamos').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw new Error(error.message); ctx.refrescar(); } });

  const linea = (texto, monto, extra = null, clase = '') => el('div', { class: `bal-linea ${clase}` }, el('span', {}, texto, extra), el('strong', {}, dinero(monto)));
  const editarBtn = (f, t) => el('button', { type: 'button', class: 'boton-icono', title: t, 'aria-label': t, onclick: f }, icono('editar', { tam: 14 }));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Balance de gestión'),
      el('div', { class: 'listado-acciones' }, boton('Cuenta', { icono: 'mas', onclick: () => cuenta(null) }), boton('Deuda', { icono: 'mas', onclick: () => deudaForm(null) }), boton('Préstamo del grupo', { icono: 'mas', onclick: prestamo }))),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Lo que tenemos', dinero(activos), 'caja, por cobrar y préstamos a otras empresas'),
      tarjeta('Lo que debemos', dinero(pasivos), 'tarjetas, por pagar, deudas y préstamos recibidos'),
      tarjeta('Diferencia', dinero(activos - pasivos), 'patrimonio de gestión', activos - pasivos < 0 ? 'fin-alerta' : '')),
    el('div', { class: 'bal-columnas' },
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Lo que tenemos'),
        activas.filter((c) => c.tipo !== 'tarjeta').map((c) => linea(c.nombre, saldo(c),
          el('span', { class: 'texto-suave texto-chico' }, c.ultimo ? ` · ${fechaLarga(c.ultimo.fecha)} ` : ' · sin saldo ', el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => anotarSaldo(c) }, 'Anotar saldo'), editarBtn(() => cuenta(c), 'Editar cuenta')))),
        activas.some((c) => c.tipo !== 'tarjeta') ? null : el('p', { class: 'texto-suave texto-chico' }, 'Agrega tus cuentas de banco y caja.'),
        linea('Por cobrar', porCobrar, el('span', { class: 'texto-suave texto-chico' }, ` · ${pend.filter((p) => p.lado === 'cobrar').length} documentos`)),
        nosDeben ? linea('Préstamos a otras empresas', nosDeben) : null,
        linea('Total', activos, null, 'bal-total')),
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Lo que debemos'),
        activas.filter((c) => c.tipo === 'tarjeta').map((c) => linea(c.nombre, saldo(c),
          el('span', { class: 'texto-suave texto-chico' }, c.ultimo ? ` · ${fechaLarga(c.ultimo.fecha)} ` : ' · sin saldo ', el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => anotarSaldo(c) }, 'Anotar saldo'), editarBtn(() => cuenta(c), 'Editar cuenta')))),
        linea('Por pagar', porPagar, el('span', { class: 'texto-suave texto-chico' }, ` · ${pend.filter((p) => p.lado === 'pagar').length} documentos`)),
        deudas.filter((d) => d.activo).map((d) => linea(d.acreedor, Number(d.saldo),
          el('span', { class: 'texto-suave texto-chico' }, ` · ${TIPOS_DEUDA.find((t) => t[0] === d.tipo)[1].toLowerCase()}${d.cuota ? `, cuota ${dinero(d.cuota)}${d.dia ? ` el día ${d.dia}` : ''}` : ''} · al ${fechaLarga(d.fecha_saldo)} `, editarBtn(() => deudaForm(d), 'Editar deuda')))),
        debemos ? linea('Préstamos de otras empresas', debemos) : null,
        linea('Total', pasivos, null, 'bal-total'))),
    prestamos.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Préstamos con empresas del grupo'),
      el('div', { class: 'resumen-chips' }, [...porContraparte].map(([k, v]) => el('span', { class: `chip ${v >= 0 ? 'chip-ok' : 'chip-prox'}` }, `${k}: ${v >= 0 ? 'nos debe' : 'le debemos'} ${dinero(Math.abs(v))}`))),
      prestamos.map((p) => el('div', { class: 'bal-linea' }, el('span', {}, `${fechaLarga(p.fecha)} · ${p.contraparte} · ${p.concepto}`, el('span', { class: 'texto-suave texto-chico' }, p.sentido === 'otorgado' ? ' · le prestamos' : ' · nos prestó'),
        el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar movimiento', onclick: () => quitarPrestamo(p) }, icono('basura', { tam: 14 }))), el('strong', {}, dinero(p.monto))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, 'Balance de gestión, no tributario. Por cobrar y por pagar en total (con IVA). Los saldos de las cuentas se anotan a mano.'));
}

const tarjeta = (titulo, valor, nota, clase = '') => el('div', { class: `ficha doc-grupo fin-tarjeta ${clase}` },
  el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
