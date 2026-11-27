// Cuadre con el SII (OpenFactura, Núcleo 021, 2026-11-10): compara lo que el SII tiene de un mes con lo de ISgestión.
// - Totales del Registro de Compras y Ventas (RCV) por tipo de documento contra Costos (compras) y Facturas (ventas).
// - Documento a documento: facturas en el SII que no están en ISgestión, al revés y con montos distintos.
// "Sincronizar con el SII" pide a OpenFactura actualizar el RCV desde el SII (tarda unos minutos; el SII limita
// cuántas veces). Las boletas (de la TUU) se comparan solo por totales. Solo con costos.aprobar.
import { el } from '../../../core/ui/dom.js?v=5ec3c84';
import { icono } from '../../../core/ui/iconos.js?v=5ec3c84';
import { boton } from '../../../core/ui/tabla.js?v=5ec3c84';
import { avisar } from '../../../core/ui/aviso.js?v=5ec3c84';
import { dinero, fechaLarga, hoyISO } from '../../../core/ui/formato.js?v=5ec3c84';
import { llamarDte, estadoDte, avisoPrueba, NOMBRE_DTE } from '../../../core/dte.js?v=5ec3c84';
import { sinPermiso } from './flujo.js?v=5ec3c84';
import { formRegistrar } from '../../cotizaciones/emitidas.js?v=5ec3c84';

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
  // (2026-11-24) Sin la clave de producción, OpenFactura responde con su empresa de pruebas (HOSTY SPA): se explica en palabras
  est.prueba ? avisoPrueba(`${ctx.empresa.nombre_fantasia || ctx.empresa.razon_social} todavía no está conectada al SII real: falta cargar su clave de producción de OpenFactura (Haulmer). Mientras tanto se ven los datos de la empresa de pruebas de Haulmer (${est.emisor?.razon ?? 'HOSTY SPA'}), que no tienen nada que ver con los nuestros. Toca "Revisar con los datos de prueba" solo para probar la pantalla.`)
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
        .then(() => { b.replaceWith(el('a', { href: ctx.ruta('costos.bandeja') }, 'En la Bandeja')); avisar(`${nombreTipo(d.tipo)} N° ${d.folio} quedó en la Bandeja.`); })
        .catch((err) => { avisar(err.message, 'error'); b.disabled = false; b.classList.remove('cargando'); });
    };
    const linkGasto = { titulo: '', celda: (d) => (d.registro_id ? el('span', {}, el('a', { href: ctx.ruta('costos.registro', { id: d.registro_id }) }, 'Ver gasto'),
        d.sugerencia ? el('span', { class: 'texto-chico sii-sugerencia' }, ` · ¿Folio mal anotado? En el SII es ${nombreTipo(d.sugerencia.tipo).toLowerCase()} N° ${d.sugerencia.folio} por el mismo monto.`) : null)
      : d.sugerido ? el('span', { class: 'texto-chico sii-sugerencia' }, 'Parece estar en Costos con otro folio: ', el('a', { href: ctx.ruta('costos.registro', { id: d.sugerido }) }, 'ver gasto'))
      : d.en_bandeja ? el('a', { href: ctx.ruta('costos.bandeja') }, 'En la Bandeja')
      : !r.prueba && [33, 34, 46].includes(Number(d.tipo)) && ctx.puede('costos', 'editar') ? boton('A la Bandeja', { icono: 'descargar', class: 'boton boton-secundario boton-chico', onclick: (ev) => aPorCargar(ev, d) }) : '') };
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
    // (2026-11-24, pedido de Enzo: "no se entiende a simple vista") Arriba, dos respuestas: ¿cuadran las compras? y
    // ¿cuadran las ventas?, con lo que dice el SII contra lo que hay en ISgestión en palabras. Después, solo lo que hay
    // que hacer (cada lista con su acción). Las tablas por tipo de documento quedan plegadas.
    const pend = r.compras.solo_sii.filter((d) => !d.en_bandeja);
    const enBandeja = r.compras.solo_sii.length - pend.length;
    const boletasSii = (tv.get(39)?.total ?? 0) + (tv.get(41)?.total ?? 0);
    const suma = (m, tipos) => tipos.reduce((s, t) => s + signo(t) * (m instanceof Map ? m.get(t)?.total ?? 0 : m[t]?.total ?? 0), 0);
    const cuenta = (m, tipos) => tipos.reduce((s, t) => s + (m instanceof Map ? m.get(t)?.cant ?? 0 : m[t]?.cant ?? 0), 0);
    const TC = [33, 34, 46, 56, 61]; const TV = [33, 34];
    const probCompras = pend.length + r.compras.distinto.length + r.compras.solo_isg.length;
    const probVentas = r.ventas.solo_sii.length + r.ventas.distinto.length + r.ventas.solo_isg.length + r.ventas.sin_numero.length;
    const tarjeta = (titulo, problemas, siiTotal, siiCant, isgTotal, isgDonde, extra) => el('div', { class: `ficha doc-grupo sii-respuesta ${problemas ? 'sii-mal' : 'sii-bien'}` },
      el('span', { class: 'texto-suave texto-chico' }, titulo),
      el('strong', {}, problemas ? `Falta revisar ${problemas === 1 ? '1 documento' : `${problemas} documentos`}` : 'Cuadra'),
      el('span', { class: 'texto-chico' }, `El SII tiene ${siiCant === 1 ? '1 factura' : `${siiCant} facturas`} por ${dinero(siiTotal)}; en ${isgDonde} hay ${dinero(isgTotal)}.`),
      extra);
    const respuestas = el('div', { class: 'sii-respuestas' },
      tarjeta(`¿Cuadran las compras de ${nombreMes(r.periodo)}?`, probCompras, suma(tc, TC), cuenta(tc, TC), suma(r.isg.compras, TC), 'Gastos',
        enBandeja ? el('span', { class: 'texto-chico texto-suave' }, `${enBandeja} ya ${enBandeja === 1 ? 'está' : 'están'} en la Bandeja: falta cargarlas.`) : null),
      tarjeta(`¿Cuadran las ventas con factura de ${nombreMes(r.periodo)}?`, probVentas, suma(tv, TV), cuenta(tv, TV), suma(r.isg.ventas, TV), 'Facturas', null),
      boletasSii ? el('div', { class: 'ficha doc-grupo sii-respuesta' },
        el('span', { class: 'texto-suave texto-chico' }, 'Ventas con boleta (máquina TUU)'),
        el('strong', {}, dinero(boletasSii)),
        el('span', { class: 'texto-chico' }, `Son ventas del mes con boleta según el SII. ${r.boletas?.ligadas ?? 0} boletas (${dinero(r.boletas?.total_ligadas ?? 0)}) están ligadas a órdenes del taller.`)) : null);
    const que = [
      pend.length ? tablaDocs('Compras que están en el SII y no en Gastos', pend, { extra: linkGasto, vacio: '' }) : null,
      r.compras.distinto.length ? tablaDocs('Compras con un monto distinto en Gastos', r.compras.distinto, { extra: difGasto, vacio: '' }) : null,
      r.compras.solo_isg.length ? tablaDocs('Gastos con N° de factura que el SII no tiene (¿N° mal anotado?)', r.compras.solo_isg, { extra: linkGasto, vacio: '' }) : null,
      r.ventas.solo_sii.length ? tablaDocs('Facturas emitidas que faltan en Facturas', r.ventas.solo_sii, { extra: accionVenta, vacio: '' }) : null,
      r.ventas.distinto.length ? tablaDocs('Facturas con un monto distinto', r.ventas.distinto, { extra: difFac, vacio: '' }) : null,
      r.ventas.solo_isg.length + r.ventas.sin_numero.length ? tablaDocs('En Facturas y no en el SII', [...r.ventas.solo_isg, ...r.ventas.sin_numero], { extra: linkFac, vacio: '' }) : null,
    ].filter(Boolean);
    zona.replaceChildren(...[
      respuestas,
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Qué hay que hacer'),
        que.length ? que : el('p', { class: 'texto-suave' }, 'Nada: todo lo del SII está en ISgestión y con el mismo monto.')),
      el('details', { class: 'ficha doc-grupo sii-detalle' }, el('summary', {}, 'Ver el detalle por tipo de documento'),
        el('h3', {}, 'Compras'),
        r.totales.purchase?.error ? el('p', { class: 'texto-suave' }, `Registro de compras: ${r.totales.purchase.error}`) : null,
        sync('purchase')?.sync_at ? el('p', { class: 'texto-suave texto-chico' }, `Última sincronización pedida: ${new Date(sync('purchase').sync_at).toLocaleString('es-CL')}. ${sync('purchase').sync_mensaje ?? ''}`) : null,
        tablaTotales(tc, r.isg.compras, true),
        el('p', { class: 'texto-suave texto-chico' }, `Cuadran documento a documento: ${r.compras.cuadran}.${r.completo.compras ? '' : ' Solo se revisaron los primeros 300 documentos del mes.'}`),
        el('h3', {}, 'Ventas'),
        r.totales.sales?.error ? el('p', { class: 'texto-suave' }, `Registro de ventas: ${r.totales.sales.error}`) : null,
        tablaTotales(tv, r.isg.ventas, false),
        el('p', { class: 'texto-suave texto-chico' }, `Facturas que cuadran: ${r.ventas.cuadran}. "Solo SII" = documentos que ISgestión no compara uno a uno (boletas, guías).${r.completo.ventas ? '' : ' Solo se revisaron los primeros 300 documentos del mes.'}`),
        r.ventas.otros.length ? tablaDocs('Notas de crédito, guías y otros emitidos', r.ventas.otros, { vacio: '' }) : null),
    ].filter(Boolean));
  };
  const cuadrar = async (ev) => {
    const b = ev?.currentTarget; if (b) { b.disabled = true; b.classList.add('cargando'); }
    zona.replaceChildren(el('p', { class: 'texto-suave' }, `Consultando el SII (${nombreMes(periodo())})… puede tardar un minuto.`));
    try { pintar(await llamarDte(ctx, 'cuadre', { periodo: periodo() })); }
    catch (err) {
      // OpenFactura limita las consultas por minuto: se reintenta solo una vez pasado el minuto
      if (/límite|esperar|429/i.test(err.message) && !reintento) {
        reintento = setTimeout(() => { reintento = null; if (zona.isConnected) cuadrar(); }, 60e3);
        zona.replaceChildren(el('p', { class: 'aviso-bandeja' }, icono('reloj', { tam: 16 }), ' OpenFactura pide esperar un minuto entre consultas. Se vuelve a revisar solo en un minuto; no hace falta tocar nada.'));
      } else zona.replaceChildren(el('p', { class: 'aviso-bandeja lec-mal' }, err.message));
    }
    finally { if (b) { b.disabled = false; b.classList.remove('cargando'); } }
  };

  // Se cuadra solo al abrir y al cambiar el mes
  let reintento = null;
  mes.addEventListener('change', () => cuadrar());
  // En pruebas no se consulta solo (son datos de Haulmer y gastan el límite de consultas)
  if (est.conectado && !est.prueba) cuadrar();
  else if (est.prueba) zona.replaceChildren(boton('Revisar con los datos de prueba', { icono: 'check', onclick: cuadrar }));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Cuadre con el SII'),
        el('p', { class: 'texto-suave' }, 'Revisa que lo que el SII tiene del mes (Registro de Compras y Ventas) esté en ISgestión: las compras en Gastos y las ventas en Facturas.'))),
    estado,
    est.conectado ? el('div', { class: 'listado-acciones' }, mes,
      boton('Volver a revisar', { icono: 'check', onclick: cuadrar }),
      boton('Pedir datos nuevos al SII', { icono: 'descargar', title: 'Pide al SII el registro de compras y ventas actualizado (tarda unos minutos; el SII limita cuántas veces)', onclick: sincronizar })) : null,
    est.conectado ? el('p', { class: 'texto-suave texto-chico' }, 'Si algo reciente del SII no aparece, toca "Pedir datos nuevos al SII", espera unos minutos y vuelve a revisar.') : null,
    zona);
}
