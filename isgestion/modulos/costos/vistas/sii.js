// Cuadre con el SII (OpenFactura, Núcleo 021, 2026-11-10): compara lo que el SII tiene de un mes con lo de ISgestión.
// - Totales del Registro de Compras y Ventas (RCV) por tipo de documento contra Costos (compras) y Facturas (ventas).
// - Documento a documento: facturas en el SII que no están en ISgestión, al revés y con montos distintos.
// "Sincronizar con el SII" pide a OpenFactura actualizar el RCV desde el SII (tarda unos minutos; el SII limita
// cuántas veces). Las boletas (de la TUU) se comparan solo por totales. Solo con costos.aprobar.
import { el } from '../../../core/ui/dom.js?v=882cc93';
import { icono } from '../../../core/ui/iconos.js?v=882cc93';
import { boton } from '../../../core/ui/tabla.js?v=882cc93';
import { avisar } from '../../../core/ui/aviso.js?v=882cc93';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=882cc93';
import { llamarDte, estadoDte, avisoPrueba, NOMBRE_DTE } from '../../../core/dte.js?v=882cc93';
import { sinPermiso } from './flujo.js?v=882cc93';
import { formRegistrar } from '../../cotizaciones/emitidas.js?v=882cc93';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (p) => `${MESES[(p % 100) - 1]} ${Math.floor(p / 100)}`;
const nombreTipo = (t) => NOMBRE_DTE[t] ?? `Tipo ${t}`;
// Notas de crédito restan
const signo = (t) => (Number(t) === 61 ? -1 : 1);

// Totales del RCV por tipo: compras trae un arreglo por estado (se suman Registro y Pendiente); ventas, un objeto
function totalesRcv(datos, compras) {
  const m = new Map();
  if (!datos || datos.error) return m;
  const bloques = compras ? (Array.isArray(datos) ? datos : []).filter((b) => !/no_incluir|reclam/i.test(b.estado ?? '')) : [datos];
  for (const b of bloques) for (const r of b.registros ?? []) {
    const x = m.get(r.tipoDocumento) ?? { cant: 0, total: 0 };
    x.cant += Number(r.cantDocumentos) || 0; x.total += Number(r.totalMntTotal) || 0; m.set(r.tipoDocumento, x);
  }
  return m;
}

export default async function vista(ctx) {
  if (!ctx.puede('costos', 'aprobar')) return sinPermiso();
  const hoy = hoyISO();
  const pDef = Number(hoy.slice(8, 10)) < 12   // a principio de mes se cuadra el anterior
    ? (Number(hoy.slice(5, 7)) === 1 ? (Number(hoy.slice(0, 4)) - 1) * 100 + 12 : Number(hoy.slice(0, 4)) * 100 + Number(hoy.slice(5, 7)) - 1)
    : Number(hoy.slice(0, 4)) * 100 + Number(hoy.slice(5, 7));
  const mes = el('input', { type: 'month', class: 'campo campo-filtro', value: `${Math.floor(pDef / 100)}-${String(pDef % 100).padStart(2, '0')}`, max: hoy.slice(0, 7), 'aria-label': 'Mes' });
  const periodo = () => Number(mes.value.replace('-', ''));
  const zona = el('div', { class: 'sii-zona' });
  const estado = el('div', {});

  const est = await estadoDte(ctx, { forzar: true });
  estado.replaceChildren(...[est.conectado
    ? el('p', { class: 'texto-suave' }, icono('check', { tam: 16 }), ` Conectado a OpenFactura como ${est.emisor?.razon ?? ''} (${est.emisor?.rut ?? ''}).`)
    : el('p', { class: 'aviso-bandeja lec-mal' }, icono('alerta', { tam: 16 }), ` OpenFactura no está conectado: ${est.error ?? `falta la clave (${est.falta_clave})`}.`),
  est.prueba ? avisoPrueba('Ambiente de pruebas de OpenFactura: los datos del SII son de la empresa de pruebas de Haulmer, así que no van a cuadrar con ISgestión. Sirve para probar la pantalla.')
    : est.ambiente === 'lectura' ? avisoPrueba('Modo lectura: datos reales del SII; registrar y enlazar sí guarda en ISgestión, pero emitir es de prueba.') : null].filter(Boolean));

  const sincronizar = async (ev) => {
    const b = ev.currentTarget; b.disabled = true; b.classList.add('cargando');
    try {
      const r = await llamarDte(ctx, 'sincronizar', { periodo: periodo() });
      avisar(`Compras: ${r.compras} Ventas: ${r.ventas}`);
    } catch (err) { avisar(err.message, 'error'); } finally { b.disabled = false; b.classList.remove('cargando'); }
  };

  // ---- Tablas
  const tablaTotales = (sii, isg, compras) => {
    const tipos = [...new Set([...sii.keys(), ...Object.keys(isg).map(Number)])].sort((a, b) => a - b);
    if (!tipos.length) return el('p', { class: 'texto-suave' }, 'Sin documentos ese mes.');
    return el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Documento'), el('th', { class: 'num' }, 'SII'), el('th', { class: 'num' }, 'Total SII'),
        el('th', { class: 'num' }, 'ISgestión'), el('th', { class: 'num' }, 'Total ISgestión'), el('th', { class: 'num' }, 'Diferencia'))),
      el('tbody', {}, tipos.map((t) => {
        const s = sii.get(t); const i = isg[t];
        const comparable = compras ? [33, 34, 46, 61, 56].includes(t) : [33, 34].includes(t);
        const dif = comparable ? (s?.total ?? 0) - (i?.total ?? 0) : null;
        return el('tr', {}, el('td', {}, `${t} · ${nombreTipo(t)}`), el('td', { class: 'num' }, s?.cant ?? 0), el('td', { class: 'num' }, dinero(s?.total ?? 0)),
          el('td', { class: 'num' }, comparable ? i?.cant ?? 0 : '—'), el('td', { class: 'num' }, comparable ? dinero(i?.total ?? 0) : '—'),
          el('td', { class: `num ${dif ? 'sii-dif' : ''}` }, dif == null ? el('span', { class: 'texto-suave' }, 'Solo SII') : dif ? dinero(dif) : el('span', { class: 'chip chip-ok' }, 'Cuadra')));
      }))));
  };
  const tablaDocs = (titulo, lista, { extra = null, vacio } = {}) => el('div', { class: 'sii-lista' },
    el('h3', {}, `${titulo} (${lista.length})`),
    lista.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Documento'), el('th', {}, 'Fecha'), el('th', {}, 'Contraparte'), el('th', { class: 'num' }, 'Total'), extra ? el('th', {}, extra.titulo) : null)),
      el('tbody', {}, lista.map((d) => el('tr', {},
        el('td', {}, d.tipo ? `${nombreTipo(d.tipo)} N° ${d.folio}` : `N° ${d.folio}`), el('td', {}, d.fecha ? fechaLarga(d.fecha) : ''),
        el('td', {}, el('strong', {}, d.razon ?? ''), d.rut ? el('span', { class: 'texto-suave texto-chico' }, ` ${d.rut}`) : null),
        el('td', { class: 'num' }, dinero(signo(d.tipo) * Number(d.total || 0))), extra ? el('td', {}, extra.celda(d)) : null)))))
      : el('p', { class: 'texto-suave texto-chico' }, vacio));

  const pintar = (r) => {
    const tc = totalesRcv(r.totales.purchase, true); const tv = totalesRcv(r.totales.sales, false);
    const sync = (reg) => r.sync.find((s) => s.registro === reg);
    const aPorCargar = (ev, d) => {
      const b = ev.currentTarget; b.disabled = true; b.classList.add('cargando');
      llamarDte(ctx, 'compra_a_bandeja', { rut: d.rut, tipo: d.tipo, folio: d.folio })
        .then(() => { b.replaceWith(el('a', { href: ctx.ruta('costos.bandeja') }, 'En Por cargar')); avisar(`${nombreTipo(d.tipo)} N° ${d.folio} quedó en Por cargar.`); })
        .catch((err) => { avisar(err.message, 'error'); b.disabled = false; b.classList.remove('cargando'); });
    };
    const linkGasto = { titulo: '', celda: (d) => (d.registro_id ? el('span', {}, el('a', { href: ctx.ruta('costos.registro', { id: d.registro_id }) }, 'Ver gasto'),
        d.sugerencia ? el('span', { class: 'texto-chico sii-sugerencia' }, ` · ¿Folio mal anotado? En el SII es ${nombreTipo(d.sugerencia.tipo).toLowerCase()} N° ${d.sugerencia.folio} por el mismo monto.`) : null)
      : d.sugerido ? el('span', { class: 'texto-chico sii-sugerencia' }, 'Parece estar en Costos con otro folio: ', el('a', { href: ctx.ruta('costos.registro', { id: d.sugerido }) }, 'ver gasto'))
      : d.en_bandeja ? el('a', { href: ctx.ruta('costos.bandeja') }, 'En Por cargar')
      : !r.prueba && [33, 34, 46].includes(Number(d.tipo)) && ctx.puede('costos', 'editar') ? boton('A Por cargar', { icono: 'descargar', class: 'boton boton-secundario boton-chico', onclick: (ev) => aPorCargar(ev, d) }) : '') };
    const difGasto = { titulo: 'En ISgestión', celda: (d) => el('span', {}, dinero(d.isg_total), ' ', el('a', { href: ctx.ruta('costos.registro', { id: d.registro_id }) }, 'Ver')) };
    const linkFac = { titulo: '', celda: (d) => (d.factura_id ? el('a', { href: ctx.ruta('cotizaciones.oc') }, 'Ver en Facturas') : '') };
    const difFac = { titulo: 'En ISgestión', celda: (d) => dinero(d.isg_total) };
    // Registrar en Facturas una factura emitida por la máquina (cotizaciones y clientes se cargan al primer uso)
    let listas = null;
    const registrar = async (d) => {
      listas ??= await Promise.all([
        ctx.api.from('cot_cotizaciones').select('id, numero, cliente_nombre, tercero_id').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).is('madre_id', null).in('estado', ['enviada', 'aceptada']).order('numero', { ascending: false }).limit(500),
        ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).order('razon_social').limit(5000),
      ]).then(([cs, ts]) => ({ cotizaciones: cs.data ?? [], clientes: ts.data ?? [] }));
      formRegistrar(ctx, d, { ...listas, ordenes: [], prueba: r.prueba, alGuardar: () => cuadrar() });
    };
    const accionVenta = { titulo: '', celda: (d) => (d.token && [33, 34].includes(Number(d.tipo)) && ctx.puede('cotizaciones', 'crear')
      ? boton(r.prueba ? 'Ver' : 'Registrar', { icono: 'mas', class: 'boton boton-secundario boton-chico', onclick: () => registrar(d) }) : '') };
    // Resumen arriba: lo que falta revisar
    const pend = r.compras.solo_sii.filter((d) => !d.en_bandeja).length;
    const boletasSii = (tv.get(39)?.total ?? 0) + (tv.get(41)?.total ?? 0);
    const chip = (ok, texto) => el('span', { class: `chip ${ok ? 'chip-ok' : 'chip-venc'}` }, texto);
    const resumen = el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, `Resumen · ${nombreMes(r.periodo)}`),
      el('div', { class: 'resumen-chips' },
        chip(!pend, pend ? `Compras sin cargar: ${pend}` : 'Compras: todo en Costos'),
        r.compras.solo_sii.length - pend ? el('span', { class: 'chip chip-prox' }, `En Por cargar: ${r.compras.solo_sii.length - pend}`) : null,
        r.compras.distinto.length ? chip(false, `Compras con montos distintos: ${r.compras.distinto.length}`) : null,
        r.compras.solo_isg.length ? chip(false, `Gastos con folio que el SII no tiene: ${r.compras.solo_isg.length}`) : null,
        chip(!r.ventas.solo_sii.length, r.ventas.solo_sii.length ? `Facturas sin registrar: ${r.ventas.solo_sii.length}` : 'Ventas: todas las facturas registradas'),
        r.ventas.distinto.length ? chip(false, `Facturas con montos distintos: ${r.ventas.distinto.length}`) : null,
        r.ventas.solo_isg.length + r.ventas.sin_numero.length ? chip(false, `En Facturas y no en el SII: ${r.ventas.solo_isg.length + r.ventas.sin_numero.length}`) : null,
        boletasSii ? el('span', { class: 'chip chip-prox' }, `Boletas del mes en el SII: ${dinero(boletasSii)} · ligadas a órdenes: ${r.boletas?.ligadas ?? 0} (${dinero(r.boletas?.total_ligadas ?? 0)})`) : null));
    zona.replaceChildren(
      resumen,
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, `Compras · ${nombreMes(r.periodo)}`),
        r.totales.purchase?.error ? el('p', { class: 'texto-suave' }, `Registro de compras: ${r.totales.purchase.error}`) : null,
        sync('purchase')?.sync_at ? el('p', { class: 'texto-suave texto-chico' }, `Última sincronización pedida: ${new Date(sync('purchase').sync_at).toLocaleString('es-CL')}. ${sync('purchase').sync_mensaje ?? ''}`) : null,
        tablaTotales(tc, r.isg.compras, true),
        el('p', { class: 'texto-suave texto-chico' }, `Cuadran documento a documento: ${r.compras.cuadran}.${r.completo.compras ? '' : ' Solo se revisaron los primeros 300 documentos del mes.'}`),
        tablaDocs('En el SII y no en Costos', r.compras.solo_sii, { extra: linkGasto, vacio: 'Todo lo del SII está en Costos.' }),
        tablaDocs('Con montos distintos', r.compras.distinto, { extra: difGasto, vacio: 'Ninguno.' }),
        tablaDocs('En Costos y no en el SII', r.compras.solo_isg, { extra: linkGasto, vacio: 'Ninguno: todo lo registrado con folio está en el SII.' })),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, `Ventas · ${nombreMes(r.periodo)}`),
        r.totales.sales?.error ? el('p', { class: 'texto-suave' }, `Registro de ventas: ${r.totales.sales.error}`) : null,
        tablaTotales(tv, r.isg.ventas, false),
        el('p', { class: 'texto-suave texto-chico' }, `Facturas que cuadran: ${r.ventas.cuadran}. Las boletas se comparan solo por el total del SII.${r.completo.ventas ? '' : ' Solo se revisaron los primeros 300 documentos del mes.'}`),
        tablaDocs('En el SII y no en Facturas', r.ventas.solo_sii, { extra: accionVenta, vacio: 'Todas las facturas del SII están en Facturas.' }),
        tablaDocs('Con montos distintos', r.ventas.distinto, { extra: difFac, vacio: 'Ninguna.' }),
        tablaDocs('En Facturas y no en el SII', [...r.ventas.solo_isg, ...r.ventas.sin_numero], { extra: linkFac, vacio: 'Ninguna.' }),
        r.ventas.otros.length ? tablaDocs('Notas de crédito, guías y otros emitidos', r.ventas.otros, { vacio: '' }) : null));
  };
  const cuadrar = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.classList.add('cargando'); }
    zona.replaceChildren(el('p', { class: 'texto-suave' }, `Consultando el SII (${nombreMes(periodo())})… puede tardar un minuto.`));
    try { pintar(await llamarDte(ctx, 'cuadre', { periodo: periodo() })); }
    catch (err) { zona.replaceChildren(el('p', { class: 'aviso-bandeja lec-mal' }, err.message)); }
    finally { if (b) { b.disabled = false; b.classList.remove('cargando'); } }
  };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Cuadre con el SII'),
        el('p', { class: 'texto-suave' }, 'Lo que el SII tiene del mes contra Costos (compras) y Facturas (ventas).'))),
    estado,
    est.conectado ? el('div', { class: 'listado-acciones' }, mes,
      boton('Cuadrar', { icono: 'check', tipo: 'primario', onclick: cuadrar }),
      boton('Sincronizar con el SII', { icono: 'descargar', title: 'Pide al SII el registro de compras y ventas actualizado (tarda unos minutos)', onclick: sincronizar })) : null,
    est.conectado ? el('p', { class: 'texto-suave texto-chico' }, 'Si el SII muestra algo reciente que aquí no aparece, toca "Sincronizar con el SII", espera unos minutos y vuelve a cuadrar.') : null,
    zona);
}
