// Conteo físico: se cuenta un almacén y se registra un solo ajuste con las diferencias.
// Solo cuentan los productos con cantidad escrita. La diferencia se calcula con el stock al momento de
// registrar (por si hubo movimientos mientras se contaba). El borrador del conteo se guarda en este navegador.
import { el } from '../../../core/ui/dom.js?v=605af68';
import { icono } from '../../../core/ui/iconos.js?v=605af68';
import { boton } from '../../../core/ui/tabla.js?v=605af68';
import { abrirFormulario } from '../../../core/ui/modal.js?v=605af68';
import { avisar } from '../../../core/ui/aviso.js?v=605af68';
import { dinero, hoyISO, fechaLarga } from '../../../core/ui/formato.js?v=605af68';
import { cargarBase, cargarProductos, cargarStock, registrar, cant } from '../datos.js?v=605af68';

const estado = { almacen: null, buscar: '' };
const clave = (e, a) => `isg.conteo.${e}.${a}`;
const leer = (e, a) => { try { return JSON.parse(localStorage.getItem(clave(e, a)) || '{}'); } catch { return {}; } };
const guardar = (e, a, v) => { try { localStorage.setItem(clave(e, a), JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [base, productos, stock] = await Promise.all([cargarBase(ctx), cargarProductos(ctx), cargarStock(ctx)]);
  const almacenes = base.almacenes.filter((a) => a.activo);
  const volver = el('a', { class: 'volver', href: ctx.ruta('inventario.stock') }, icono('volver', { tam: 16 }), 'Stock');
  if (!almacenes.length) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Primero crea un almacén'));
  if (!almacenes.some((a) => a.id === estado.almacen)) estado.almacen = almacenes[0].id;
  const alm = estado.almacen;
  const contado = leer(e, alm);   // producto_id → cantidad contada (texto)
  const sistema = (pid) => stock.get(pid)?.[alm] ?? 0;

  const resumen = el('div', { class: 'fin-tarjetas' });
  const pintarResumen = () => {
    const ids = Object.keys(contado).filter((k) => contado[k] !== '');
    const difs = ids.map((id) => { const p = productos.find((x) => x.id === id); const d = Number(contado[id]) - sistema(id); return { d, valor: d * (p?.costo ?? 0) }; }).filter((x) => x.d !== 0);
    resumen.replaceChildren(
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Productos contados'), el('strong', {}, `${ids.length} de ${productos.length}`)),
      el('div', { class: `ficha doc-grupo fin-tarjeta ${difs.length ? 'fin-alerta' : ''}` }, el('span', { class: 'texto-suave texto-chico' }, 'Con diferencia'), el('strong', {}, String(difs.length))),
      el('div', { class: 'ficha doc-grupo fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, 'Valor de la diferencia (último costo)'), el('strong', {}, dinero(difs.reduce((s, x) => s + x.valor, 0)))));
  };

  const selAlm = el('select', { class: 'campo', 'aria-label': 'Almacén' }, almacenes.map((a) => el('option', { value: a.id, selected: a.id === alm }, `${a.nombre} (${a.codigo})`)));
  selAlm.addEventListener('change', () => { estado.almacen = selAlm.value; ctx.refrescar(); });
  const buscador = el('input', { class: 'campo', type: 'search', placeholder: 'Buscar producto o SKU…', value: estado.buscar, 'aria-label': 'Buscar producto' });

  const cuerpo = el('tbody');
  const pintar = () => {
    const b = estado.buscar.trim().toLowerCase();
    cuerpo.replaceChildren(...productos.filter((p) => !b || `${p.sku} ${p.nombre}`.toLowerCase().includes(b)).map((p) => {
      const sis = sistema(p.id);
      const dif = el('td', { class: 'num' });
      const input = el('input', { class: 'campo campo-num', type: 'number', step: 'any', min: 0, value: contado[p.id] ?? '', 'aria-label': `Contado de ${p.nombre}` });
      const pintarDif = () => {
        if (input.value === '') { dif.replaceChildren(''); return; }
        const d = Number(input.value) - sis;
        dif.replaceChildren(el('strong', { class: d > 0 ? 'pct-bien' : d < 0 ? 'pct-mal' : 'texto-suave' }, d ? `${d > 0 ? '+' : ''}${cant(d)}` : 'igual'));
      };
      input.addEventListener('input', () => {
        if (input.value === '') delete contado[p.id]; else contado[p.id] = input.value;
        guardar(e, alm, contado); pintarDif(); pintarResumen();
      });
      pintarDif();
      return el('tr', {},
        el('td', {}, el('strong', {}, p.nombre), el('div', { class: 'texto-suave texto-chico' }, `SKU ${p.sku}`)),
        el('td', {}, p.udm ?? ''),
        el('td', { class: 'num' }, cant(sis)),
        el('td', { class: 'num' }, input),
        dif);
    }));
  };
  buscador.addEventListener('input', () => { estado.buscar = buscador.value; pintar(); });

  const registrarAjuste = () => {
    const ids = Object.keys(contado).filter((k) => contado[k] !== '');
    if (!ids.length) { avisar('Escribe al menos una cantidad contada.', 'error'); return; }
    abrirFormulario({
      titulo: `Registrar conteo · ${base.almacenDe.get(alm)?.nombre}`,
      mensaje: 'Se registra un ajuste con las diferencias contra el stock actual. Los productos sin cantidad escrita no se tocan.',
      campos: [{ id: 'fecha', etiqueta: 'Fecha del conteo', tipo: 'date', requerido: true, valor: hoyISO() },
        { id: 'motivo', etiqueta: 'Motivo', requerido: true, valor: `Conteo físico ${fechaLarga(hoyISO())}` }],
      textoGuardar: 'Registrar ajuste',
      alGuardar: async (v) => {
        const actual = await cargarStock(ctx);   // stock al momento de registrar
        const lineas = ids.map((id) => ({ producto_id: id, cantidad: Math.round((Number(contado[id]) - (actual.get(id)?.[alm] ?? 0)) * 100) / 100 })).filter((l) => l.cantidad !== 0);
        if (!lineas.length) { guardar(e, alm, {}); avisar('Sin diferencias: el stock coincide con lo contado.'); ctx.refrescar(); return; }
        const doc = await registrar(ctx, { tipo: 'ajuste', fecha: v.fecha, almacen: alm, lineas, motivo: v.motivo.trim() });
        guardar(e, alm, {});
        avisar(`Ajuste registrado con ${lineas.length} ${lineas.length === 1 ? 'producto' : 'productos'}.`);
        location.hash = ctx.ruta('inventario.documento', { id: doc });
      },
    });
  };

  pintar(); pintarResumen();
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Conteo físico'),
      el('div', { class: 'listado-acciones' }, selAlm,
        boton('Limpiar conteo', { onclick: () => { guardar(e, alm, {}); ctx.refrescar(); } }),
        ctx.puede('inventario', 'crear') ? boton('Registrar ajuste', { icono: 'check', tipo: 'primario', onclick: registrarAjuste }) : null)),
    resumen,
    buscador,
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Producto'), el('th', {}, 'UdM'), el('th', { class: 'num' }, 'Sistema'), el('th', { class: 'num' }, 'Contado'), el('th', { class: 'num' }, 'Diferencia'))),
      cuerpo)),
    el('p', { class: 'texto-suave texto-chico' }, 'El conteo en curso se guarda en este navegador hasta registrarlo o limpiarlo.'));
}
