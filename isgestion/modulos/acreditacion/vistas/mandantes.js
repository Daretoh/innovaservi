// Requisitos por mandante: resumen de cumplimiento de cada cliente que acredita a la empresa.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { nombreMes, moverMes } from '../../../core/ui/formato.js';
import { cargarDocumentos, cumplimientoMandante, nombreTercero, mesActual } from '../datos.js';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [clientes, req, cum, docs] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('acr_requisitos').select('*').eq('empresa_id', e).order('orden'),
    ctx.api.from('acr_cumplimientos').select('requisito_id, periodo, estado').eq('empresa_id', e),
    cargarDocumentos(ctx),
  ]);
  for (const r of [clientes, req, cum]) if (r.error) throw r.error;
  const anterior = moverMes(mesActual(), -1);

  const tarjeta = (c) => {
    const propios = req.data.filter((r) => r.tercero_id === c.id);
    const href = ctx.ruta('acreditacion.mandante', { id: c.id });
    if (!propios.length) {
      return el('a', { class: 'ficha doc-grupo tarjeta-enlace', href },
        el('h2', {}, nombreTercero(c)), el('p', { class: 'texto-suave' }, 'Sin requisitos configurados.'));
    }
    const ids = new Set(propios.map((r) => r.id));
    const k = cumplimientoMandante(propios, cum.data.filter((x) => ids.has(x.requisito_id)), docs.tipos);
    const faltaAnterior = k.filas.filter((f) => f.meses?.includes(anterior) && !f.de.some((x) => x.periodo === anterior)).length;
    return el('a', { class: 'ficha doc-grupo tarjeta-enlace', href },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, nombreTercero(c)),
        el('span', { class: `chip ${k.pct === 100 ? 'chip-ok' : k.pct >= 80 ? 'chip-prox' : 'chip-venc'}` }, `${k.pct}% al día`)),
      el('p', { class: 'texto-suave' }, `${k.filas.length} requisitos · ${k.pendientes ? `${k.pendientes} ${k.pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'nada pendiente'}`),
      faltaAnterior ? el('p', { class: 'texto-chico' }, icono('alerta', { tam: 14 }), ` Faltan ${faltaAnterior} de ${nombreMes(anterior)}`) : null);
  };

  const con = clientes.data.filter((c) => req.data.some((r) => r.tercero_id === c.id));
  const sin = clientes.data.filter((c) => !req.data.some((r) => r.tercero_id === c.id));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Requisitos por mandante')),
    el('p', { class: 'texto-suave' }, 'Lo que pide cada cliente para acreditar a la empresa, mes a mes. Entra a un mandante para configurar sus requisitos y marcar lo subido.'),
    el('div', { class: 'tarjetas-grid' }, con.map(tarjeta)),
    sin.length ? el('div', {}, el('h2', {}, 'Otros clientes'), el('div', { class: 'tarjetas-grid' }, sin.map(tarjeta))) : null,
    !clientes.data.length ? el('p', { class: 'texto-suave' }, 'No hay clientes. Créalos en Clientes y proveedores.') : null);
}
