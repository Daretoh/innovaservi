// Requisitos por mandante: resumen de cumplimiento de cada cliente que acredita a la empresa.
import { el } from '../../../core/ui/dom.js?v=bd56179';
import { icono } from '../../../core/ui/iconos.js?v=bd56179';
import { nombreMes, moverMes } from '../../../core/ui/formato.js?v=bd56179';
import { cargarDocumentos, cumplimientoMandante, nombreTercero, mesActual } from '../datos.js?v=bd56179';
import { aQuienValidar } from '../trabajadores.js?v=bd56179';
import { avancePorMandante } from '../entregas.js?v=bd56179';
import { barraAvance, cargarDestinos } from '../../sst/acreditacion.js?v=bd56179';
import { fechaLarga } from '../../../core/ui/formato.js?v=bd56179';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [clientes, req, cum, docs] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('acr_requisitos').select('*').eq('empresa_id', e).order('orden'),
    ctx.api.from('acr_cumplimientos').select('requisito_id, periodo, estado').eq('empresa_id', e),
    cargarDocumentos(ctx),
  ]);
  for (const r of [clientes, req, cum]) if (r.error) throw r.error;
  const firmas = await avancePorMandante(ctx);
  const dest = firmas?.size || req.data.some((r) => r.sitio_id) ? await cargarDestinos(ctx).catch(() => null) : null;
  // Documentos firmados en Prevención para este mandante, y por lugar (ej.: SAL LOBOS → Camanchaca, Ensenada)
  const barraFirmas = (c) => {
    const f = firmas?.get(c.id); if (!f) return null;
    const lugares = [...f.lugares.entries()].filter(([s]) => s);
    return el('div', {}, el('span', { class: 'texto-chico texto-suave' }, 'Documentos firmados'), barraAvance(f.firmados, f.total),
      lugares.map(([s, l]) => el('div', { class: 'texto-chico' }, `${dest?.sitios.find((x) => x.id === s)?.nombre ?? 'Lugar'}: ${l.firmados} de ${l.total}`)));
  };
  const validar = ctx.puede('rrhh', 'ver') ? await aQuienValidar(ctx).catch(() => null) : null;
  const nomCli = (id) => nombreTercero(clientes.data.find((c) => c.id === id) ?? {});
  const anterior = moverMes(mesActual(), -1);

  const tarjeta = (c) => {
    const propios = req.data.filter((r) => r.tercero_id === c.id);
    const href = ctx.ruta('acreditacion.mandante', { id: c.id });
    if (!propios.length) {
      return el('a', { class: 'ficha doc-grupo tarjeta-enlace', href },
        el('h2', {}, nombreTercero(c)), el('p', { class: 'texto-suave' }, 'Sin requisitos configurados.'), barraFirmas(c));
    }
    // % general (lo que piden todos sus lugares) y el de cada lugar con requisitos propios (general + propios)
    const calc = (rs) => { const is = new Set(rs.map((r) => r.id)); return cumplimientoMandante(rs, cum.data.filter((x) => is.has(x.requisito_id)), docs.tipos); };
    const generales = propios.filter((r) => !r.sitio_id);
    const k = calc(generales.length ? generales : propios);
    const lugares = [...new Set(propios.filter((r) => r.sitio_id).map((r) => r.sitio_id))]
      .map((sid) => ({ sid, nombre: dest?.sitios.find((x) => x.id === sid)?.nombre ?? 'Lugar', k: calc(propios.filter((r) => !r.sitio_id || r.sitio_id === sid)) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const faltaAnterior = k.filas.filter((f) => f.meses?.includes(anterior) && !f.de.some((x) => x.periodo === anterior)).length;
    return el('a', { class: 'ficha doc-grupo tarjeta-enlace', href },
      el('div', { class: 'listado-cabecera' },
        el('h2', {}, nombreTercero(c)),
        el('span', { class: `chip ${k.pct === 100 ? 'chip-ok' : k.pct >= 80 ? 'chip-prox' : 'chip-venc'}` }, `${k.pct}% al día`)),
      el('div', {}, el('span', { class: 'texto-chico texto-suave' }, lugares.length ? 'Requisitos generales' : 'Requisitos de empresa'), barraAvance(k.pct, 100, `${k.pct}%`)),
      lugares.map((l) => el('div', {}, el('span', { class: 'texto-chico texto-suave' }, l.nombre), barraAvance(l.k.pct, 100, `${l.k.pct}%`))),
      barraFirmas(c),
      el('p', { class: 'texto-suave' }, `${propios.filter((r) => r.activo).length} requisitos${lugares.length ? ` (${lugares.length} lugar${lugares.length === 1 ? "" : "es"} con propios)` : ""} · ${k.pendientes ? `${k.pendientes} ${k.pendientes === 1 ? 'pendiente' : 'pendientes'}` : 'nada pendiente'}`),
      faltaAnterior ? el('p', { class: 'texto-chico' }, icono('alerta', { tam: 14 }), ` Faltan ${faltaAnterior} de ${nombreMes(anterior)}`) : null);
  };

  const activo = (c) => req.data.some((r) => r.tercero_id === c.id) || firmas?.has(c.id);
  const con = clientes.data.filter(activo);
  const sin = clientes.data.filter((c) => !activo(c));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Requisitos por mandante')),
    el('p', { class: 'texto-suave' }, 'Lo que pide cada cliente para acreditar a la empresa, mes a mes. Entra a un mandante para configurar sus requisitos y marcar lo subido.'),
    validar && (validar.pendientes.length || validar.porVencer.length) ? el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, 'A quién tengo que validar'),
      el('p', { class: 'texto-suave texto-chico' }, 'Trabajadores asignados a faenas de los próximos 14 días que aún no están validados en ese cliente, y validaciones que vencen en 15 días.'),
      validar.pendientes.map((x) => { const v = validar.d.rrhh.vinculos.find((y) => y.persona_id === x.persona_id);
        return el('a', { class: 'doc-fila', href: ctx.ruta('acreditacion.mandante', { id: x.tercero_id }) },
          el('div', { class: 'doc-nombre' }, el('strong', {}, v ? validar.d.m.nombreCompleto(v.personas) : 'Trabajador'), el('span', { class: 'texto-suave texto-chico' }, `${nomCli(x.tercero_id)} · ${x.faena} · ${fechaLarga(x.fecha)}${x.est.faltan.length ? ` · falta ${x.est.faltan.map((t) => t.corto || t.nombre).join(', ')}` : ''}`)),
          el('span', { class: `chip ${x.est.clase}` }, x.est.texto)); }),
      validar.porVencer.map((x) => { const v = validar.d.rrhh.vinculos.find((y) => y.persona_id === x.persona_id);
        return el('a', { class: 'doc-fila', href: ctx.ruta('acreditacion.mandante', { id: x.tercero_id }) },
          el('div', { class: 'doc-nombre' }, el('strong', {}, v ? validar.d.m.nombreCompleto(v.personas) : 'Trabajador'), el('span', { class: 'texto-suave texto-chico' }, `${nomCli(x.tercero_id)} · validación hasta ${fechaLarga(x.hasta)}`)),
          el('span', { class: 'chip chip-prox' }, 'Por vencer')); })) : null,
    el('div', { class: 'tarjetas-grid' }, con.map(tarjeta)),
    sin.length ? el('div', {}, el('h2', {}, 'Otros clientes'), el('div', { class: 'tarjetas-grid' }, sin.map(tarjeta))) : null,
    !clientes.data.length ? el('p', { class: 'texto-suave' }, 'No hay clientes. Créalos en Clientes y proveedores.') : null);
}
