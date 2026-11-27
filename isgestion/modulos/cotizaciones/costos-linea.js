// Costos internos de una línea o de una sección (lo que nos cotizó el proveedor: producto, flete, instalación…)
// con el margen y el precio de venta que sale de ellos. Es solo interno: nunca sale en el PDF ni lo ve el cliente.
// Cada costo se guarda en cot_lineas.costos (jsonb): { tipo, desc, proveedor, monto, archivo_ruta?, archivo_nombre?, registro_id? }.
// Los antiguos ({ desc, monto }) se leen igual y reciben un tipo al guardarlos.
import { el } from '../../core/ui/dom.js?v=625a797';
import { icono } from '../../core/ui/iconos.js?v=625a797';
import { boton } from '../../core/ui/tabla.js?v=625a797';
import { avisar } from '../../core/ui/aviso.js?v=625a797';
import { dinero } from '../../core/ui/formato.js?v=625a797';
import { subirArchivo, urlFirmada } from '../../core/adjuntos.js?v=625a797';
import { totalLinea } from './datos.js?v=625a797';

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
  document.head.append(el('link', { id: 'cot-costos-css', rel: 'stylesheet', href: new URL('./costos.css?v=625a797', import.meta.url).href }));
}

const claveMargen = (ctx) => `isg.cot.margen.${ctx.empresa.id}`;
const claveRedondeo = (ctx) => `isg.cot.redondeo.${ctx.empresa.id}`;

// linea: la línea o la sección. items: las líneas que cobran (la misma línea, o las de la sección).
// costoItems: costos que ya tienen esas líneas (solo en una sección: se suman al margen).
// guardar(costos) guarda los costos; aplicarPrecios([[linea, precio]]) pone los precios nuevos.
export function abrirCostos({ ctx, linea, items, costoItems = 0, proveedores = [], editable, guardar, aplicarPrecios, alCerrar = null }) {
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
  const agregar = (tipo = 'producto') => {
    const k = { tipo, desc: '', proveedor: '', monto: 0, archivo: null };
    filas.push(k);
    const f = filaCosto(k);
    lista.append(f);
    f.querySelector('input')?.focus();
  };

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
      boton('+ Producto', { onclick: () => agregar('producto') }),
      boton('+ Flete', { onclick: () => agregar('flete') }),
      boton('+ Instalación', { onclick: () => agregar('instalacion') }),
      boton('+ Otro', { onclick: () => agregar('otro') })) : null,
    resumen,
    !editable ? null : el('div', { class: 'cc-precio' },
      el('label', {}, 'Margen deseado sobre la venta (%)', margen),
      el('label', {}, 'Redondear hacia arriba', paso),
      el('div', { class: 'cc-precio-res' }, el('span', { class: 'texto-chico texto-suave' }, esSeccion ? 'Total de la sección con ese margen' : 'Total de la línea con ese margen'), sugerido),
      btnUsar),
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
