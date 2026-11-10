// Indicadores del mes: contactos nuevos, clientes ganados, conversión, sin atender, por origen, por campaña y resultados
// de las publicaciones. Excel con el membrete de la empresa.
import { el } from '../../../core/ui/dom.js?v=0ddac6e';
import { icono } from '../../../core/ui/iconos.js?v=0ddac6e';
import { boton } from '../../../core/ui/tabla.js?v=0ddac6e';
import { dinero, hoyISO, rangoMes, moverMes, nombreMes } from '../../../core/ui/formato.js?v=0ddac6e';
import { nuevoExcel } from '../../../core/excel.js?v=0ddac6e';
import { cargarBase, cargarCss, nombreOrigen, diasDesde, DIAS_SIN_ATENDER } from '../datos.js?v=0ddac6e';

const estado = { mes: hoyISO().slice(0, 7) };

export default async function vista(ctx) {
  cargarCss();
  const base = await cargarBase(ctx);
  const e = ctx.empresa.id;
  const { desde, hasta } = rangoMes(estado.mes);
  const ini = new Date(`${desde}T00:00`).toISOString();
  const finTs = new Date(`${moverMes(estado.mes, 1)}-01T00:00`).toISOString();
  const [rc, rv, rp] = await Promise.all([
    ctx.api.from('mkt_contactos').select('id, created_at, origen, campana_id, etapa_id, tercero_id, valor_estimado, ultimo_contacto_at, responsable_id').eq('empresa_id', e).is('deleted_at', null).limit(10000),
    // Pasos a una etapa ganada o perdida durante el mes
    ctx.api.from('mkt_eventos').select('contacto_id, etapa_despues, created_at').eq('empresa_id', e).eq('tipo', 'etapa').gte('created_at', ini).lt('created_at', finTs).limit(10000),
    ctx.api.from('mkt_publicaciones').select('estado, alcance, interacciones, clics, leads, redes').eq('empresa_id', e).is('deleted_at', null).gte('fecha', desde).lte('fecha', hasta)]);
  for (const r of [rc, rv, rp]) if (r.error) throw r.error;
  const tipo = new Map(base.etapas.map((x) => [x.id, x.tipo]));
  const primera = base.etapas[0]?.id;
  const nuevos = rc.data.filter((c) => c.created_at >= ini && c.created_at < finTs);
  const vivos = new Set(rc.data.map((c) => c.id));
  const ganadosMes = new Set(rv.data.filter((v) => tipo.get(v.etapa_despues) === 'ganada' && vivos.has(v.contacto_id)).map((v) => v.contacto_id));
  const perdidosMes = new Set(rv.data.filter((v) => tipo.get(v.etapa_despues) === 'perdida' && vivos.has(v.contacto_id)).map((v) => v.contacto_id));
  const ganadosDeNuevos = nuevos.filter((c) => tipo.get(c.etapa_id) === 'ganada').length;
  const conversion = nuevos.length ? Math.round((ganadosDeNuevos / nuevos.length) * 100) : null;
  const sinAtender = rc.data.filter((c) => c.etapa_id === primera && (diasDesde(c.ultimo_contacto_at ?? c.created_at) ?? 0) >= DIAS_SIN_ATENDER).length;
  const enCurso = rc.data.filter((c) => tipo.get(c.etapa_id) === 'abierta');
  const valorCurso = enCurso.reduce((s, c) => s + Number(c.valor_estimado || 0), 0);
  const gastoMes = base.campanas.filter((c) => (c.inicio ?? '0000') <= hasta && (c.fin ?? '9999') >= desde).reduce((s, c) => s + Number(c.gasto || 0), 0);

  // Por origen y por campaña (contactos nuevos del mes)
  const agrupar = (lista, clave) => { const m = new Map(); for (const c of lista) { const k = clave(c) ?? ''; const a = m.get(k) ?? { n: 0, ganados: 0 }; a.n += 1; if (tipo.get(c.etapa_id) === 'ganada') a.ganados += 1; m.set(k, a); } return [...m].sort((a, b) => b[1].n - a[1].n); };
  const porOrigen = agrupar(nuevos, (c) => c.origen);
  const nombreCampana = new Map(base.campanas.map((c) => [c.id, c]));
  const porCampana = agrupar(nuevos.filter((c) => c.campana_id), (c) => c.campana_id);
  const porResp = agrupar(enCurso, (c) => c.responsable_id);

  const pubs = rp.data;
  const publicadas = pubs.filter((p) => p.estado === 'publicada');
  const suma = (k) => publicadas.reduce((s, p) => s + (p[k] || 0), 0);

  const kpi = (titulo, valor, ic, clase = '') => el('div', { class: `ind-kpi ${clase}` }, el('span', { class: 'ind-kpi-icono' }, icono(ic, { tam: 20 })),
    el('span', {}, el('span', { class: 'ind-kpi-titulo' }, titulo), el('strong', {}, String(valor))));
  const barras = (filas, nombre) => {
    const max = Math.max(1, ...filas.map(([, a]) => a.n));
    return filas.length ? el('div', { class: 'mkt-barras' }, filas.map(([k, a]) => el('div', { class: 'mkt-barras-fila' },
      el('span', { class: 'texto-chico' }, nombre(k)),
      el('span', { class: 'mkt-barra' }, el('span', { style: `width: ${Math.round((a.n / max) * 100)}%` })),
      el('span', { class: 'texto-chico mkt-num' }, `${a.n}${a.ganados ? ` · ${a.ganados} cliente${a.ganados === 1 ? '' : 's'}` : ''}`))))
      : el('p', { class: 'texto-suave texto-chico' }, 'Sin datos en el mes.');
  };

  const excel = async () => {
    const x = await nuevoExcel(ctx, { titulo: 'Indicadores de marketing', subtitulo: nombreMes(estado.mes) });
    x.tabla({ titulo: 'Resumen', columnas: ['Indicador', { t: 'Valor', tipo: 'numero' }], filas: [
      ['Contactos nuevos', nuevos.length], ['Pasaron a cliente en el mes', ganadosMes.size], ['Perdidos en el mes', perdidosMes.size],
      ['Conversión de los nuevos (%)', conversion ?? 0], ['Sin atender hoy', sinAtender], ['Contactos en curso', enCurso.length], ['Valor estimado en curso', valorCurso],
      ['Gasto en campañas del mes', gastoMes], ['Publicaciones publicadas', publicadas.length], ['Alcance', suma('alcance')], ['Interacciones', suma('interacciones')], ['Contactos desde publicaciones', suma('leads')]] });
    x.tabla({ titulo: 'Por origen', columnas: ['Origen', { t: 'Contactos', tipo: 'numero' }, { t: 'Clientes', tipo: 'numero' }], filas: porOrigen.map(([k, a]) => [nombreOrigen[k] ?? k, a.n, a.ganados]) });
    x.tabla({ titulo: 'Por campaña', columnas: ['Campaña', { t: 'Contactos', tipo: 'numero' }, { t: 'Clientes', tipo: 'numero' }], filas: porCampana.map(([k, a]) => [nombreCampana.get(k)?.nombre ?? '', a.n, a.ganados]) });
    await x.guardar(`indicadores-marketing-${estado.mes}`);
  };

  return el('section', { class: 'listado indicadores' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Indicadores'),
      el('div', { class: 'listado-acciones' },
        boton('', { icono: 'volver', 'aria-label': 'Mes anterior', title: 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); ctx.refrescar(); } }),
        el('strong', { class: 'mkt-mes-titulo' }, nombreMes(estado.mes)),
        boton('', { icono: 'derecha', 'aria-label': 'Mes siguiente', title: 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); ctx.refrescar(); } }),
        ctx.puede('mkt', 'exportar') ? boton('Excel', { icono: 'descargar', onclick: excel }) : null)),
    el('div', { class: 'ind-kpis' },
      kpi('Contactos nuevos', nuevos.length, 'users'),
      kpi('Pasaron a cliente', ganadosMes.size, 'check'),
      kpi('Conversión de los nuevos', conversion == null ? '—' : `${conversion}%`, 'grafico'),
      kpi('Sin atender hoy', sinAtender, 'alerta', sinAtender ? 'ind-mal' : ''),
      kpi('En curso', `${enCurso.length}${valorCurso ? ` · ${dinero(valorCurso)}` : ''}`, 'columnas'),
      kpi('Costo por contacto', gastoMes && nuevos.length ? dinero(Math.round(gastoMes / nuevos.length)) : '—', 'dinero')),
    el('div', { class: 'ind-paneles' },
      el('div', { class: 'ficha' }, el('h2', {}, 'Cómo llegaron (nuevos del mes)'), barras(porOrigen, (k) => nombreOrigen[k] ?? k)),
      el('div', { class: 'ficha' }, el('h2', {}, 'Por campaña (nuevos del mes)'), barras(porCampana, (k) => nombreCampana.get(k)?.nombre ?? 'Campaña eliminada')),
      el('div', { class: 'ficha' }, el('h2', {}, 'En curso por responsable'), barras(porResp, (k) => base.nombreUsuario.get(k) ?? 'Sin responsable')),
      el('div', { class: 'ficha' }, el('h2', {}, 'Publicaciones del mes'),
        el('div', { class: 'mkt-cifras' }, [['Planificadas', pubs.length], ['Publicadas', publicadas.length], ['Alcance', suma('alcance').toLocaleString('es-CL')],
          ['Interacciones', suma('interacciones').toLocaleString('es-CL')], ['Clics o mensajes', suma('clics').toLocaleString('es-CL')], ['Contactos generados', suma('leads')]]
          .map(([t, v]) => el('div', {}, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v))))),
        el('p', { class: 'texto-suave texto-chico' }, 'Los resultados se anotan en cada publicación (desde Metricool o las estadísticas de Instagram y Facebook).'))),
    el('p', { class: 'texto-suave texto-chico' }, `Sin atender: contactos en "${base.etapas[0]?.nombre ?? 'la primera etapa'}" sin actividad registrada en ${DIAS_SIN_ATENDER} días o más.`));
}
