// Costos internos de una línea o de una sección (lo que nos cotizó el proveedor: producto, flete, instalación…)
// con el margen y el precio de venta que sale de ellos. Es solo interno: nunca sale en el PDF ni lo ve el cliente.
// Cada costo se guarda en cot_lineas.costos (jsonb): { tipo, desc, proveedor, monto, archivo_ruta?, archivo_nombre?, registro_id? }.
// Los antiguos ({ desc, monto }) se leen igual y reciben un tipo al guardarlos.
import { el } from '../../core/ui/dom.js?v=2d079ab';
import { icono } from '../../core/ui/iconos.js?v=2d079ab';
import { boton } from '../../core/ui/tabla.js?v=2d079ab';
import { avisar } from '../../core/ui/aviso.js?v=2d079ab';
import { dinero } from '../../core/ui/formato.js?v=2d079ab';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=2d079ab';
import { totalLinea } from './datos.js?v=2d079ab';
import { leerArchivosConIA, numIA } from '../../core/lector-ia.js?v=2d079ab';

export const TIPOS_COSTO = [
  ['producto', 'Producto'],
  ['flete', 'Flete'],
  ['instalacion', 'Instalación'],
  ['tercero', 'Trabajo tercero'],
  ['otro', 'Otro'],
];
const NOMBRE_TIPO = new Map(TIPOS_COSTO);
const TIPOS_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Tipo de un costo antiguo (sin tipo) según su detalle
export function tipoCosto(k) {
  if (k.tipo && NOMBRE_TIPO.has(k.tipo)) return k.tipo;
  const d = String(k.desc ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/envio|flete|despacho|starken|chilexpress|transporte/.test(d)) return 'flete';
  if (/instala/.test(d)) return 'instalacion';
  if (/d&p|daniel|desaboll|pintura|tercero/.test(d)) return 'tercero';
  return 'producto';
}

// Margen sobre la venta y recargo sobre el costo, en %
export const margenPct = (venta, costo) => (venta > 0 ? Math.round(((venta - costo) / venta) * 1000) / 10 : null);
const recargoPct = (venta, costo) => (costo > 0 && venta > 0 ? Math.round(((venta - costo) / costo) * 1000) / 10 : null);
const pct = (n) => (n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`);
const redondear = (n, paso) => (paso > 1 ? Math.ceil(n / paso) * paso : Math.round(n));

// Carga la hoja de estilos del módulo una vez
function estilos() {
  if (document.getElementById('cot-costos-css')) return;
  document.head.append(el('link', { id: 'cot-costos-css', rel: 'stylesheet', href: new URL('./costos.css?v=2d079ab', import.meta.url).href }));
}

const claveMargen = (ctx) => `isg.cot.margen.${ctx.empresa.id}`;
const claveRedondeo = (ctx) => `isg.cot.redondeo.${ctx.empresa.id}`;

// linea: la línea o la sección. items: las líneas que cobran (la misma línea, o las de la sección).
// costoItems: costos que ya tienen esas líneas (solo en una sección: se suman al margen).
// guardar(costos) guarda los costos; aplicarPrecios([[linea, precio]]) pone los precios nuevos.
// grupoId: el vehículo de la cotización (para cargar la compra real en Costos ligada a él).
export function abrirCostos({ ctx, linea, items, costoItems = 0, proveedores = [], editable, guardar, aplicarPrecios, alCerrar = null, grupoId = null }) {
  estilos();
  const esSeccion = linea.tipo === 'seccion';
  let cambio = false;
  const filas = (linea.costos ?? []).map((k) => ({ ...k, tipo: tipoCosto(k), archivo: null }));
  const lista = el('div', { class: 'cc-lista' });
  const resumen = el('div', { class: 'cc-resumen' });
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const idLista = `cc-prov-${linea.id}`;
  const datalist = el('datalist', { id: idLista }, proveedores.map((p) => el('option', { value: p })));

  const venta = () => items.reduce((s, l) => s + totalLinea(l), 0);
  const costoTotal = () => filas.reduce((s, k) => s + (Number(k.monto) || 0), 0) + costoItems;

  const filaCosto = (k) => {
    const tipo = el('select', { class: 'campo', 'aria-label': 'Tipo de costo', disabled: !editable, 'data-nativo': '' },
      TIPOS_COSTO.map(([v, t]) => el('option', { value: v, selected: v === k.tipo }, t)));
    const desc = el('input', { class: 'campo', value: k.desc ?? '', placeholder: 'Detalle (ej.: Lona retráctil)', disabled: !editable, 'aria-label': 'Detalle' });
    const prov = el('input', { class: 'campo', value: k.proveedor ?? '', placeholder: 'Proveedor', list: idLista, disabled: !editable, 'aria-label': 'Proveedor' });
    const monto = el('input', { class: 'campo campo-num', type: 'number', min: 0, value: k.monto ?? '', placeholder: 'Neto', disabled: !editable || !!k.registro_id, 'aria-label': 'Monto neto' });
    tipo.addEventListener('change', () => { k.tipo = tipo.value; });
    desc.addEventListener('input', () => { k.desc = desc.value; });
    prov.addEventListener('input', () => { k.proveedor = prov.value; });
    monto.addEventListener('input', () => { k.monto = Math.max(0, Math.round(Number(monto.value) || 0)); pintar(); });

    // Cotización del proveedor (PDF o foto): se sube al guardar
    const entradaArchivo = el('input', { type: 'file', accept: TIPOS_ARCHIVO.join(','), hidden: true });
    const btnArchivo = el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cotización del proveedor' }, icono('documento', { tam: 16 }));
    const marcarArchivo = () => {
      const nombre = k.archivo?.name ?? k.archivo_nombre;
      btnArchivo.classList.toggle('cc-con-archivo', !!nombre);
      btnArchivo.title = nombre ? `Cotización del proveedor: ${nombre}${k.archivo ? ' (se sube al guardar)' : ''}` : 'Adjuntar la cotización del proveedor';
    };
    btnArchivo.addEventListener('click', async () => {
      if (k.archivo_ruta && !k.archivo) {
        try { window.open(await urlFirmada(ctx.api, k.archivo_ruta), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); }
        return;
      }
      if (editable) entradaArchivo.click();
    });
    entradaArchivo.addEventListener('change', () => { k.archivo = entradaArchivo.files[0] ?? null; marcarArchivo(); });
    marcarArchivo();
    const cambiarArchivo = editable && k.archivo_ruta
      ? el('button', { type: 'button', class: 'boton-icono', title: 'Cambiar el archivo', 'aria-label': 'Cambiar el archivo', onclick: () => entradaArchivo.click() }, icono('editar', { tam: 16 })) : null;

    const quitar = editable ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar costo', onclick: () => { filas.splice(filas.indexOf(k), 1); fila.remove(); pintar(); } }, icono('cerrar', { tam: 16 })) : null;
    const fila = el('div', { class: 'cc-fila', title: k.registro_id ? 'Traído de Costos y gastos: el monto se cambia allá' : null },
      tipo, desc, prov, monto, el('span', { class: 'cc-fila-acc' }, btnArchivo, cambiarArchivo, entradaArchivo, quitar));
    return fila;
  };
  const agregar = (tipo = 'producto', datos = {}, foco = true) => {
    const k = { tipo, desc: '', proveedor: '', monto: 0, archivo: null, ...datos };
    filas.push(k);
    const f = filaCosto(k);
    lista.append(f);
    if (foco) f.querySelector('input')?.focus();
  };
  const vacia = (k) => !k.desc?.trim() && !Number(k.monto) && !k.archivo && !k.archivo_ruta && !k.registro_id;

  // Leer la cotización del proveedor con IA (Claude): llena las filas con sus ítems y deja el archivo adjunto
  const entradaLeer = el('input', { type: 'file', accept: TIPOS_ARCHIVO.join(','), multiple: true, hidden: true });
  const estadoLeer = el('p', { class: 'texto-chico texto-suave', role: 'status' });
  const btnLeer = boton('Leer cotización del proveedor', { icono: 'documento', title: 'PDF o fotos (hasta 4) de la cotización o factura del proveedor: la IA llena los costos', onclick: () => entradaLeer.click() });
  entradaLeer.addEventListener('change', async () => {
    const archivos = [...entradaLeer.files].slice(0, 4); entradaLeer.value = '';
    if (!archivos.length) return;
    btnLeer.disabled = true; btnLeer.classList.add('cargando'); error.textContent = ''; estadoLeer.textContent = 'Leyendo con IA…';
    try {
      const r = await leerArchivosConIA(ctx.api, { empresaId: ctx.empresa.id, modulo: 'cotizaciones', modo: 'cotizacion_proveedor', fuentes: archivos });
      const d = r?.datos ?? {};
      const its = (Array.isArray(d.items) ? d.items : []).map((x) => ({
        tipo: NOMBRE_TIPO.has(x.tipo) ? x.tipo : 'producto',
        desc: [Number(x.cantidad) > 1 ? `${x.cantidad} ×` : null, String(x.descripcion ?? '').trim()].filter(Boolean).join(' ').slice(0, 200),
        monto: Math.max(0, numIA(x.neto) ?? 0),
      })).filter((x) => x.desc || x.monto);
      if (!its.length && numIA(d.neto)) its.push({ tipo: 'producto', desc: 'Según cotización del proveedor', monto: numIA(d.neto) });
      if (!its.length) throw new Error('No se encontraron ítems con monto en el documento.');
      // Las filas vacías se reemplazan por lo leído
      for (const k of filas.filter(vacia)) filas.splice(filas.indexOf(k), 1);
      lista.replaceChildren(...filas.map(filaCosto));
      const proveedor = String(d.proveedor ?? '').trim();
      its.forEach((x, i) => agregar(x.tipo, { ...x, proveedor, archivo: i === 0 ? archivos[0] : null }, false));
      pintar();
      const sumaNeto = its.reduce((s, x) => s + x.monto, 0);
      const netoDoc = numIA(d.neto);
      estadoLeer.textContent = [`${its.length} ítem${its.length === 1 ? '' : 's'} leído${its.length === 1 ? '' : 's'}${proveedor ? ` de ${proveedor}` : ''}`,
        d.numero ? `cotización N° ${d.numero}` : null,
        netoDoc != null && Math.abs(netoDoc - sumaNeto) > its.length ? `ojo: el neto del documento es ${dinero(netoDoc)} y los ítems suman ${dinero(sumaNeto)}` : null,
        d.con_iva_incluido ? 'los precios venían con IVA y se pasaron a neto' : null,
        archivos.length > 1 ? 'se adjunta el primer archivo' : null].filter(Boolean).join(' · ') + '. Revisa los montos antes de guardar.';
    } catch (e) {
      estadoLeer.textContent = ''; error.textContent = `No se pudo leer: ${e.message}`;
    } finally { btnLeer.disabled = false; btnLeer.classList.remove('cargando'); }
  });

  // Compra real (Costos 016): la boleta o factura del proveedor se carga en Costos ligada a este vehículo; su costo
  // aparece en "Costos de este vehículo" y en el margen real de la cotización
  const sinArchivo = (k) => { const { archivo, ...r } = k; return r; };
  const inicial = JSON.stringify(filas.map(sinArchivo));
  const salir = (extra = {}) => {
    const sucio = filas.some((k) => k.archivo) || JSON.stringify(filas.filter((k) => !vacia(k)).map(sinArchivo)) !== inicial;
    if (sucio && !confirm('Los cambios de esta ventana no se han guardado. ¿Ir a cargar la compra igual?')) return;
    cerrar();
    location.hash = ctx.ruta('costos.lector', { grupo: grupoId, ...extra });
  };
  const zonaSii = el('div', {});
  const compraSii = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const { data, error: er } = await ctx.api.from('fin_bandeja').select('id, nombre, dte, created_at')
      .eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente').eq('origen', 'sii').order('created_at', { ascending: false }).limit(300);
    b.disabled = false;
    if (er) { error.textContent = er.message; return; }
    if (!data.length) { error.textContent = 'No hay compras del SII esperando en la Bandeja de Costos. Tráelas desde Costos → Bandeja.'; return; }
    const texto = (x) => { const d = x.dte ?? {}; return [d.razon ?? d.rut ?? x.nombre, d.folio ? `N° ${d.folio}` : null, d.fecha ?? null, d.total != null ? dinero(Number(d.total)) : null].filter(Boolean).join(' · '); };
    const sel = el('select', { class: 'campo', 'aria-label': 'Compra del SII' }, el('option', { value: '' }, 'Elige la compra del SII…'), data.map((x) => el('option', { value: x.id }, texto(x))));
    sel.addEventListener('change', () => { if (sel.value) salir({ bandeja: sel.value }); });
    zonaSii.replaceChildren(sel); sel.focus();
  };
  const conCompra = !!grupoId && ctx.puede('costos', 'crear');

  // Precio con margen
  const margen = el('input', { class: 'campo campo-num', type: 'number', min: 0, max: 95, step: 'any', value: localStorage.getItem(claveMargen(ctx)) ?? 30, disabled: !editable, 'aria-label': 'Margen deseado %' });
  const paso = el('select', { class: 'campo', disabled: !editable, 'data-nativo': '', 'aria-label': 'Redondeo' },
    [[1, 'Sin redondear'], [100, 'A $100'], [1000, 'A $1.000'], [10000, 'A $10.000']].map(([v, t]) => el('option', { value: v, selected: String(v) === (localStorage.getItem(claveRedondeo(ctx)) ?? '1000') }, t)));
  const sugerido = el('strong', { class: 'cc-sugerido' });
  const btnUsar = boton(esSeccion ? 'Repartir en la sección' : 'Usar este precio', { tipo: 'primario', disabled: !editable });
  margen.addEventListener('input', () => pintar());
  paso.addEventListener('change', () => pintar());
  const objetivo = () => {
    const m = Math.min(95, Math.max(0, Number(margen.value) || 0));
    const c = costoTotal();
    return c > 0 ? redondear(c / (1 - m / 100), Number(paso.value)) : 0;
  };

  function pintar() {
    const v = venta(); const c = costoTotal(); const m = margenPct(v, c);
    resumen.replaceChildren(...[
      el('div', {}, el('span', {}, 'Costo total (neto)'), el('strong', {}, dinero(c))),
      costoItems ? el('div', { class: 'texto-chico texto-suave' }, el('span', {}, 'Incluye costos de las líneas de la sección'), el('span', {}, dinero(costoItems))) : null,
      el('div', {}, el('span', {}, esSeccion ? 'Venta de la sección (neto)' : 'Venta de la línea (neto)'), el('strong', {}, dinero(v))),
      el('div', { class: v - c < 0 ? 'cc-negativo' : '' }, el('span', {}, 'Margen'), el('strong', {}, `${dinero(v - c)} · ${pct(m)}`)),
      el('div', { class: 'texto-chico texto-suave' }, el('span', {}, 'Recargo sobre el costo'), el('span', {}, pct(recargoPct(v, c))))].filter(Boolean));
    const t = objetivo();
    sugerido.textContent = t ? `${dinero(t)}  (recargo ${pct(recargoPct(t, costoTotal()))})` : '—';
    btnUsar.disabled = !editable || !t || !items.length;
  }

  // Precios para llegar al total t: en una línea, el precio unitario; en una sección, se reparte en proporción
  // a lo que ya tiene cada línea (si todas están en 0, va entero a la primera)
  const precios = (t) => {
    const unit = (l, total) => { const f = Number(l.cantidad) * (1 - Number(l.desc_pct || 0) / 100); return f > 0 ? Math.round(total / f) : null; };
    const v = venta();
    const cobran = items.filter((l) => Number(l.cantidad) > 0 && Number(l.desc_pct || 0) < 100);
    if (!cobran.length) return null;
    if (!v) return [[cobran[0], unit(cobran[0], t)]];
    const res = cobran.map((l) => [l, Math.round(Number(l.precio) * (t / v))]);
    // la diferencia por redondeo va a la línea más grande con cantidad 1 y sin descuento
    const suma = res.reduce((s, [l, p]) => s + totalLinea({ ...l, precio: p }), 0);
    const ajustable = res.filter(([l]) => Number(l.cantidad) === 1 && !Number(l.desc_pct)).sort((a, b) => b[1] - a[1])[0];
    if (ajustable && suma !== t) ajustable[1] += t - suma;
    return res;
  };

  // Sube los archivos nuevos y deja los costos listos para guardar
  const listos = async () => {
    const out = [];
    for (const k of filas) {
      if (!k.desc?.trim() && !Number(k.monto) && !k.archivo && !k.archivo_ruta) continue;
      const { archivo, ...resto } = k;
      if (archivo) {
        const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'cotizaciones', archivo, tabla: 'cot_lineas', registroId: linea.id, tipos: TIPOS_ARCHIVO });
        resto.archivo_ruta = ruta; resto.archivo_nombre = archivo.name;
        k.archivo = null; k.archivo_ruta = ruta; k.archivo_nombre = archivo.name;
      }
      out.push({ ...resto, desc: (resto.desc ?? '').trim() || NOMBRE_TIPO.get(resto.tipo), proveedor: (resto.proveedor ?? '').trim() || undefined, monto: Math.round(Number(resto.monto) || 0) });
    }
    return out;
  };

  const btnGuardar = boton('Guardar', { tipo: 'primario', disabled: !editable });
  const conEspera = (b, fn) => async () => {
    error.textContent = ''; b.disabled = true;
    try { await fn(); } catch (e) { error.textContent = e.message; } finally { b.disabled = !editable; }
  };
  btnGuardar.addEventListener('click', conEspera(btnGuardar, async () => {
    await guardar(await listos()); cambio = true;
    cerrar();
  }));
  btnUsar.addEventListener('click', conEspera(btnUsar, async () => {
    const cambios = precios(objetivo());
    if (!cambios || cambios.some(([, p]) => p == null)) throw new Error('Las líneas no tienen cantidad para poner un precio.');
    localStorage.setItem(claveMargen(ctx), margen.value);
    localStorage.setItem(claveRedondeo(ctx), paso.value);
    await guardar(await listos()); cambio = true;
    await aplicarPrecios(cambios); cambio = true;
    cerrar();
  }));

  for (const k of filas) lista.append(filaCosto(k));
  if (!filas.length && editable) agregar('producto');
  pintar();

  const cuerpo = el('div', { class: 'modal-cuerpo' },
    el('p', { class: 'modal-mensaje' }, 'Lo que nos cotizaron a nosotros, en neto. Es interno: no sale en el PDF ni lo ve el cliente.'),
    el('div', { class: 'cc-fila cc-cab' }, el('span', {}, 'Tipo'), el('span', {}, 'Detalle'), el('span', {}, 'Proveedor'), el('span', {}, 'Monto neto'), el('span')),
    lista, datalist,
    editable ? el('div', { class: 'cc-agregar' },
      btnLeer, entradaLeer,
      boton('+ Producto', { onclick: () => agregar('producto') }),
      boton('+ Flete', { onclick: () => agregar('flete') }),
      boton('+ Instalación', { onclick: () => agregar('instalacion') }),
      boton('+ Otro', { onclick: () => agregar('otro') })) : null,
    estadoLeer,
    resumen,
    !editable ? null : el('div', { class: 'cc-precio' },
      el('label', {}, 'Margen deseado sobre la venta (%)', margen),
      el('label', {}, 'Redondear hacia arriba', paso),
      el('div', { class: 'cc-precio-res' }, el('span', { class: 'texto-chico texto-suave' }, esSeccion ? 'Total de la sección con ese margen' : 'Total de la línea con ese margen'), sugerido),
      btnUsar),
    conCompra ? el('div', { class: 'cc-compra' },
      el('span', { class: 'texto-chico texto-suave' }, 'Cuando llegue la boleta o factura del proveedor, cárgala en Costos ligada a este vehículo: queda como costo real y se compara con lo cotizado.'),
      el('div', { class: 'cc-agregar' },
        boton('Subir compra', { icono: 'documento', onclick: () => salir() }),
        boton('Compra del SII', { icono: 'buscar', onclick: compraSii })),
      zonaSii) : null,
    error,
    el('div', { class: 'modal-pie' }, boton(editable ? 'Cancelar' : 'Cerrar', { onclick: () => cerrar() }), editable ? btnGuardar : null));

  const dialogo = el('dialog', { class: 'modal cc-modal', 'aria-label': 'Costos internos' },
    el('header', { class: 'modal-cabecera' },
      el('h2', {}, `Costos internos · ${linea.descripcion || (esSeccion ? 'sección' : 'línea')}`),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
    cuerpo);
  function cerrar() { dialogo.close(); dialogo.remove(); alCerrar?.(cambio); }
  dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
  document.body.append(dialogo);
  dialogo.showModal();
}
