// Cierres mensuales: un cierre por cliente con cierre mensual y mes, con su estado y total.
import { el } from '../../../core/ui/dom.js?v=89cd423';
import { icono } from '../../../core/ui/iconos.js?v=89cd423';
import { listado, boton } from '../../../core/ui/tabla.js?v=89cd423';
import { avisar } from '../../../core/ui/aviso.js?v=89cd423';
import { dinero, hoyISO, nombreMes, moverMes } from '../../../core/ui/formato.js?v=89cd423';
import { nombreTercero, nombreEstado, CHIP_ESTADO, numeroTexto } from '../datos.js?v=89cd423';

const estado = { mes: hoyISO().slice(0, 7) };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [cli, cie] = await Promise.all([
    ctx.api.from('cie_clientes').select('*, terceros(id, razon_social, nombre_fantasia)').eq('empresa_id', e).eq('activo', true),
    ctx.api.from('cie_cierres').select('*, cie_lineas(monto, excluida), terceros(id, razon_social, nombre_fantasia)').eq('empresa_id', e).eq('mes', estado.mes),
  ]);
  if (cli.error) throw cli.error;
  if (cie.error) throw cie.error;
  // Una fila por cliente activo + cierres del mes de clientes que ya no están activos
  const porCliente = new Map(cie.data.map((c) => [c.tercero_id, c]));
  const filas = [
    ...cli.data.map((x) => ({ tercero: x.terceros, cierre: porCliente.get(x.tercero_id) ?? null })),
    ...cie.data.filter((c) => !cli.data.some((x) => x.tercero_id === c.tercero_id)).map((c) => ({ tercero: c.terceros, cierre: c })),
  ].sort((a, b) => nombreTercero(a.tercero).localeCompare(nombreTercero(b.tercero), 'es'));
  const neto = (c) => (c.estado === 'borrador' ? c.cie_lineas.filter((l) => !l.excluida).reduce((s, l) => s + l.monto, 0) : c.neto);

  const abrir = async (t, b) => {
    b.disabled = true;
    const { data: id, error } = await ctx.api.rpc('cie_abrir', { p_empresa: e, p_tercero: t.id, p_mes: estado.mes });
    if (error) { avisar(error.message, 'error'); b.disabled = false; return; }
    location.hash = ctx.ruta('cierres.cierre', { id });
  };
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const acciones = [el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')))];
  if (ctx.puede('cierres', 'editar')) acciones.push(boton('Clientes con cierre', { icono: 'users', onclick: () => { location.hash = ctx.ruta('cierres.clientes'); } }));

  const tabla = listado({
    titulo: 'Cierres mensuales',
    filas,
    acciones,
    vacio: 'No hay clientes con cierre mensual. Agrégalos en "Clientes con cierre".',
    columnas: [
      { titulo: 'Cliente', valor: (f) => el('strong', {}, nombreTercero(f.tercero)) },
      { titulo: 'Cierre', valor: (f) => (f.cierre ? el('a', { href: ctx.ruta('cierres.cierre', { id: f.cierre.id }) }, f.cierre.numero ? `N° ${numeroTexto(f.cierre.numero)}` : 'Borrador') : el('span', { class: 'texto-suave' }, 'Sin abrir')) },
      { titulo: 'Estado', valor: (f) => (f.cierre ? el('span', { class: `chip ${CHIP_ESTADO[f.cierre.estado]}` }, nombreEstado[f.cierre.estado]) : '') },
      { titulo: 'Líneas', valor: (f) => (f.cierre ? String(f.cierre.cie_lineas.filter((l) => !l.excluida).length) : '') },
      { titulo: 'Neto', valor: (f) => (f.cierre ? dinero(neto(f.cierre)) : '') },
      { titulo: 'Total', valor: (f) => (f.cierre ? (f.cierre.estado === 'borrador' ? el('span', { class: 'texto-suave' }, 'al emitir') : el('strong', {}, dinero(f.cierre.total))) : '') },
      { titulo: '', valor: (f) => (f.cierre ? boton('Abrir', { icono: 'derecha', onclick: () => { location.hash = ctx.ruta('cierres.cierre', { id: f.cierre.id }); } })
        : ctx.puede('cierres', 'crear') ? boton('Abrir cierre', { icono: 'mas', tipo: 'primario', onclick: (ev) => abrir(f.tercero, ev.currentTarget) }) : '') },
    ],
  });
  return tabla;
}
