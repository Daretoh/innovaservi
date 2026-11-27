// Todos los proveedores: modalidad de pago y plazo en días. El plazo da el vencimiento de las facturas por pagar.
// "Factura una vez al mes" y "Lleva cuenta" los dejan con seguimiento en Proveedores y cuentas (2026-11-24).
// Se abre desde Proveedores y cuentas (y desde Administración → Módulos).
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { listado } from '../../../core/ui/tabla.js';
import { avisar } from '../../../core/ui/aviso.js';
import { nombreTercero } from '../datos.js';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [ter, cfg, regs] = await Promise.all([
    ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).order('razon_social'),
    ctx.api.from('fin_proveedores').select('*').eq('empresa_id', e),
    ctx.api.from('fin_registros').select('tercero_id').eq('empresa_id', e).eq('tipo', 'gasto').is('deleted_at', null).not('tercero_id', 'is', null),
  ]);
  if (ter.error) throw ter.error;
  const cfgDe = new Map((cfg.data ?? []).map((c) => [c.tercero_id, c]));
  const compras = new Map();
  for (const r of regs.data ?? []) compras.set(r.tercero_id, (compras.get(r.tercero_id) ?? 0) + 1);
  const filas = ter.data.filter((t) => t.tipo?.includes('proveedor') || compras.has(t.id)).sort((a, b) => (compras.get(b.id) ?? 0) - (compras.get(a.id) ?? 0));
  const puede = ctx.puede('costos', 'editar');

  const guardar = async (t, cambios) => {
    const actual = cfgDe.get(t.id);
    const res = actual
      ? await ctx.api.from('fin_proveedores').update(cambios).eq('id', actual.id).select('*').single()
      : await ctx.api.from('fin_proveedores').insert({ empresa_id: e, tercero_id: t.id, ...cambios }).select('*').single();
    if (res.error) { avisar(res.error.message, 'error'); return; }
    cfgDe.set(t.id, res.data); avisar(`${nombreTercero(t)}: guardado.`);
  };

  const lista = listado({
    titulo: 'Todos los proveedores',
    filas,
    vacio: 'No hay proveedores. Se agregan en Clientes y proveedores o al leer una boleta o factura.',
    columnas: [
      { titulo: 'Proveedor', valor: (t) => el('div', {}, el('strong', {}, nombreTercero(t)), t.rut ? el('div', { class: 'texto-suave texto-chico' }, t.rut) : null) },
      { titulo: 'Compras', valor: (t) => String(compras.get(t.id) ?? 0) },
      { titulo: 'Modalidad', valor: (t) => {
        const s = el('select', { class: 'campo', disabled: !puede, 'aria-label': 'Modalidad' },
          [['por_compra', 'Paga cada compra (sin seguimiento)'], ['mensual', 'Factura una vez al mes'], ['cuenta', 'Lleva cuenta (se le paga antes o por partes; a un contratista se le descuentan compras)']].map(([k, n]) => el('option', { value: k, selected: (cfgDe.get(t.id)?.modalidad ?? 'por_compra') === k }, n)));
        s.addEventListener('change', () => guardar(t, { modalidad: s.value }));
        return s;
      } },
      { titulo: 'Plazo (días)', valor: (t) => {
        const i = el('input', { class: 'campo', type: 'number', min: 0, max: 180, value: cfgDe.get(t.id)?.plazo_dias ?? 30, disabled: !puede, style: 'width:90px', 'aria-label': 'Plazo en días' });
        i.addEventListener('change', () => { const n = Math.max(0, Math.min(180, Math.round(Number(i.value) || 0))); i.value = n; guardar(t, { plazo_dias: n }); });
        return i;
      } },
    ],
  });
  lista.querySelector('.listado-cabecera').before(el('a', { class: 'volver', href: ctx.ruta('costos.pagos') }, icono('volver', { tam: 16 }), 'Proveedores y cuentas'));
  lista.querySelector('.listado-cabecera').after(el('p', { class: 'texto-suave texto-chico' }, 'Los que "pagan cada compra" no necesitan seguimiento: su factura se paga y listo. Los que facturan a fin de mes o llevan cuenta aparecen en Proveedores y cuentas con su saldo.'));
  return lista;
}
