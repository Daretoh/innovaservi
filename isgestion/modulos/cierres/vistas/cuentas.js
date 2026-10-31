// Cuentas corrientes: cotizaciones aceptadas de un cliente con sus abonos y saldo.
import { el } from '../../../core/ui/dom.js?v=0e371c2';
import { listado, boton } from '../../../core/ui/tabla.js?v=0e371c2';
import { abrirFormulario } from '../../../core/ui/modal.js?v=0e371c2';
import { dinero } from '../../../core/ui/formato.js?v=0e371c2';
import { nombreTercero, totalesCuenta, estadoCuenta } from '../datos.js?v=0e371c2';

const estado = { ver: 'abiertas' };
export const SELECT_CUENTA = '*, terceros(*), cie_cuenta_cotizaciones(*, cot_cotizaciones(id, numero, fecha, estado, con_iva, desc_adic_pct, tercero_id, cot_grupos(id, titulo, patente, orden_id), cot_lineas(tipo, cantidad, precio, desc_pct))), cie_abonos(*)';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  let q = ctx.api.from('cie_cuentas').select(SELECT_CUENTA).eq('empresa_id', e).order('created_at', { ascending: false });
  if (estado.ver !== 'todas') q = q.eq('estado', estado.ver === 'abiertas' ? 'abierta' : 'cerrada');
  const [{ data, error }, ter] = await Promise.all([q,
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social')]);
  if (error) throw error;
  const filas = data.map((k) => ({ k, t: totalesCuenta(k.cie_cuenta_cotizaciones, k.cie_abonos) }));

  const nueva = () => abrirFormulario({
    titulo: 'Nueva cuenta corriente',
    mensaje: 'Agrupa cotizaciones aceptadas de un cliente para llevar sus abonos y saldo.',
    campos: [{ id: 'tercero', etiqueta: 'Cliente', opciones: (ter.data ?? []).map((t) => [t.id, nombreTercero(t)]) },
      { id: 'nombre', etiqueta: 'Nombre de la cuenta', requerido: true, ayuda: 'Ej.: el cliente o el proyecto' }],
    textoGuardar: 'Crear',
    alGuardar: async (v) => {
      const { data: k, error: er } = await ctx.api.from('cie_cuentas').insert({ empresa_id: e, tercero_id: v.tercero, nombre: v.nombre.trim() }).select('id').single();
      if (er) throw new Error(er.message);
      location.hash = ctx.ruta('cierres.cuenta', { id: k.id });
    },
  });

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['abiertas', 'Abiertas'], ['cerradas', 'Cerradas'], ['todas', 'Todas']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, n)));
  const acciones = [segmento];
  if (ctx.puede('cierres', 'crear')) acciones.push(boton('Nueva cuenta', { icono: 'mas', tipo: 'primario', onclick: nueva }));
  const saldo = filas.filter((f) => f.k.estado === 'abierta').reduce((s, f) => s + Math.max(0, f.t.saldo), 0);

  const tabla = listado({
    titulo: 'Cuentas corrientes',
    filas,
    acciones,
    vacio: 'Sin cuentas.',
    columnas: [
      { titulo: 'Cuenta', valor: (f) => el('div', {}, el('a', { href: ctx.ruta('cierres.cuenta', { id: f.k.id }) }, el('strong', {}, f.k.nombre)),
        el('div', { class: 'texto-suave texto-chico' }, nombreTercero(f.k.terceros))) },
      { titulo: 'Cotizaciones', valor: (f) => String(f.k.cie_cuenta_cotizaciones.length) },
      { titulo: 'Total', valor: (f) => dinero(f.t.total) },
      { titulo: 'Abonado', valor: (f) => dinero(f.t.abonado) },
      { titulo: 'Saldo', valor: (f) => el('strong', {}, dinero(f.t.saldo)) },
      { titulo: 'Avance de pago', valor: (f) => { const p = f.t.total ? Math.min(100, Math.round((f.t.abonado / f.t.total) * 100)) : 0; return el('div', { class: 'cie-barra', title: `${p}% pagado` }, el('i', { style: `width:${p}%` })); } },
      { titulo: 'Estado', valor: (f) => { const [n, c] = estadoCuenta(f.k, f.t); return el('span', { class: `chip ${c}` }, n); } },
    ],
  });
  tabla.querySelector('.listado-cabecera').after(el('div', { class: 'fin-tarjetas' },
    el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Saldo por cobrar (cuentas abiertas)'), el('strong', {}, dinero(saldo)))));
  return tabla;
}
