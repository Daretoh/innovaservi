// Leer boleta o factura (migrado del lector beta de InnovaGestión): el timbre electrónico con la cámara o
// desde fotos, PDF o XML; se revisan los datos y se registra el gasto (proveedor por RUT, documento, neto e IVA,
// faena, fotos). Cada dato muestra de dónde salió: Timbre SII, XML, IA, Revisar (texto de la foto) o Calculado.
// IA (como InnovaGestión, 2026-10-29): al agregar fotos, Gemini las lee en el servidor (core/lector-ia.js) y sus datos
// mandan sobre el texto de la foto; el timbre y el XML siguen mandando. Si la IA no está o falla, queda el lector local.
// Si el documento es un gasto a cuenta de un trabajador (compra que se le descuenta), se marca "Descontar a un
// trabajador": además del gasto queda un descuento en Remuneraciones (semana o mes según la empresa), ligado al
// documento (remu_items.origen_id). Requiere poder crear en Remuneraciones.
// Ruta: #/costos.lector
import { el } from '../../../core/ui/dom.js?v=af5b0f2';
import { icono } from '../../../core/ui/iconos.js?v=af5b0f2';
import { boton } from '../../../core/ui/tabla.js?v=af5b0f2';
import { avisar } from '../../../core/ui/aviso.js?v=af5b0f2';
import { subirArchivo, almacen } from '../../../core/adjuntos.js?v=af5b0f2';
import { dinero, hoyISO, sumarDias, fechaLarga, lunesDe } from '../../../core/ui/formato.js?v=af5b0f2';
import { TIPOS_DTE, docTipoDe, CAMPOS_DTE, leerParte, combinar, validar, escanearCamara, aJPEG, fmtRut, limpioRut, rutValido, num } from '../../../core/lector-dte.js?v=af5b0f2';
import { cargarBase, nombreTercero, opcionesACuenta } from '../datos.js?v=af5b0f2';
import { leerConIA, iaDisponible, numIA, fechaIA, pagadoAlComprar, textoModelo } from '../../../core/lector-ia.js?v=af5b0f2';
import { esImagen } from '../../../core/imagenes.js?v=af5b0f2';

const ETIQUETA = { timbre: ['Timbre SII', 'chip-ok'], xml: ['XML', 'chip-ok'], ia: ['IA', 'chip-ok'], ocr: ['Revisar', 'chip-prox'], calc: ['Calculado', 'chip-pend'] };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const conFaenas = ctx.puede('ope', 'ver');
  const conDescuento = ctx.puede('remu', 'crear');
  const [base, ruts, faenas, personas, remuCfg] = await Promise.all([
    cargarBase(ctx),
    ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia, tipo').eq('empresa_id', e).is('deleted_at', null).not('rut', 'is', null),
    conFaenas ? ctx.api.from('ope_faenas').select('id, titulo, fecha_inicio, fecha_fin').eq('empresa_id', e).is('deleted_at', null).neq('estado', 'cancelada')
      .gte('fecha_fin', sumarDias(hoyISO(), -60)).lte('fecha_inicio', sumarDias(hoyISO(), 14)).order('fecha_inicio', { ascending: false }) : Promise.resolve({ data: [] }),
    conDescuento ? ctx.api.from('persona_empresa').select('persona_id, personas(nombres, apellido_paterno, apellido_materno, rut)').eq('empresa_id', e).eq('estado', 'activo').is('deleted_at', null) : Promise.resolve({ data: [] }),
    conDescuento ? ctx.api.from('remu_config').select('periodo').eq('empresa_id', e).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const mensual = remuCfg.data?.periodo === 'mensual';
  const volver = el('a', { class: 'volver', href: ctx.ruta('costos.registros') }, icono('volver', { tam: 16 }), 'Gastos e ingresos');
  const categorias = base.categorias.filter((c) => c.activo && c.clase !== 'ingreso');
  if (!categorias.length) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Primero crea una categoría de gasto en Categorías y centros'));
  const terceroPorRut = new Map((ruts.data ?? []).map((t) => [limpioRut(t.rut), t]));
  const propios = [ctx.empresa.rut];

  const partes = [];     // { id, archivo, nombre, thumb, estado, ted, xml, texto, foto }
  let datos = { origen: {}, items: [] };
  const editados = new Set();
  let camara = null;

  // ---- 1. Documento: cámara, fotos o archivos
  const fotos = el('div', { class: 'lec-fotos' });
  const estado = el('div', {});
  const iaEstado = el('p', { class: 'texto-chico lec-ia', hidden: true });
  let ia = null; let tokIA = 0;
  const leerIA = async () => {
    const imgs = partes.filter((p) => p.archivo && esImagen(p.archivo)).map((p) => p.archivo);
    ia = null;
    if (!imgs.length || !iaDisponible()) { iaEstado.hidden = true; return; }
    const t = ++tokIA; iaEstado.hidden = false; iaEstado.textContent = 'Leyendo el documento con IA…';
    try {
      const r = await leerConIA(ctx.api, { empresaId: e, modo: 'compra', archivos: imgs });
      if (t !== tokIA) return;
      ia = r; iaEstado.textContent = `${textoModelo(r)}. Revisa y corrige antes de guardar.${r.datos?.observaciones ? ` ${r.datos.observaciones}` : ''}`;
      recombinar();
    } catch (err) { if (t === tokIA) iaEstado.textContent = `${err.message}. Se usan los datos del timbre o del texto de la foto.`; }
  };
  const aviso = (txt, tipo = 'pend') => estado.replaceChildren(txt ? el('p', { class: `aviso-bandeja lec-${tipo}` }, txt) : '');
  const pintarFotos = () => fotos.replaceChildren(...partes.map((p) => el('div', { class: 'lec-foto' },
    p.thumb ? el('img', { src: p.thumb, alt: p.nombre }) : el('span', { class: 'lec-doc' }, p.xml || /xml/i.test(p.nombre) ? 'XML' : 'PDF'),
    el('span', { class: 'lec-estado' }, p.estado),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar', onclick: () => { partes.splice(partes.indexOf(p), 1); pintarFotos(); recombinar(); leerIA(); } }, icono('cerrar', { tam: 14 })))));
  let cola = Promise.resolve();
  const agregar = (archivos) => {
    for (const a of archivos) {
      const p = { id: crypto.randomUUID(), archivo: a, nombre: a.name, estado: 'En cola', thumb: a.type.startsWith('image/') ? URL.createObjectURL(a) : null };
      partes.push(p);
      cola = cola.then(async () => {
        if (!partes.includes(p)) return;
        try {
          const r = await leerParte(a, { propios, avance: (t) => { p.estado = t; pintarFotos(); } });
          Object.assign(p, r);
          if (r.foto && !p.thumb) p.thumb = URL.createObjectURL(r.foto);
          p.estado = r.xml ? 'XML leído' : r.ted ? 'Timbre y texto' : 'Texto leído';
        } catch (err) { p.estado = 'No se pudo leer'; p.error = err.message; }
        pintarFotos(); recombinar();
      });
    }
    pintarFotos(); formulario.hidden = false;
    aviso('Leyendo… la primera vez tarda un poco más (se descargan los lectores).');
    leerIA();
  };
  const inFoto = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, hidden: true });
  const inArch = el('input', { type: 'file', accept: 'image/*,application/pdf,.xml,text/xml,application/xml', multiple: true, hidden: true });
  inFoto.addEventListener('change', () => { agregar([...inFoto.files]); inFoto.value = ''; });
  inArch.addEventListener('change', () => { agregar([...inArch.files]); inArch.value = ''; });
  const video = el('video', { class: 'lec-video', playsinline: true, muted: true });
  const cajaCam = el('div', { class: 'lec-camara', hidden: true }, video,
    el('div', { class: 'lec-marco' }),
    el('div', { class: 'listado-acciones' }, boton('Cerrar cámara', { icono: 'cerrar', onclick: () => { camara?.detener(); cajaCam.hidden = true; aviso(''); } })));
  const escanear = async () => {
    cajaCam.hidden = false; aviso('Apunta al timbre (el código de barras grande) y mantén el teléfono quieto.');
    camara = await escanearCamara(video, (ted, blob) => {
      cajaCam.hidden = true;
      partes.push({ id: crypto.randomUUID(), archivo: new File([blob], 'timbre.jpg', { type: 'image/jpeg' }), nombre: 'timbre.jpg', thumb: URL.createObjectURL(blob), foto: blob, estado: 'Timbre leído', ted, texto: '' });
      pintarFotos(); formulario.hidden = false; recombinar();
      aviso('Timbre leído. Para completar neto e IVA, agrega una foto del documento completo.', 'ok');
    }, (msg) => { cajaCam.hidden = true; aviso(msg, 'mal'); });
  };

  // ---- 2. Revisar
  const campos = {};
  const tags = {};
  const ctl = (k, etiqueta, attrs = {}) => {
    const c = attrs.opciones
      ? el('select', { class: 'campo', id: `lec-${k}` }, attrs.opciones.map(([v, t]) => el('option', { value: v }, t)))
      : el('input', { class: `campo ${attrs.num ? 'campo-num' : ''}`, id: `lec-${k}`, type: attrs.tipo ?? 'text', inputmode: attrs.num ? 'numeric' : null });
    c.addEventListener('input', () => { editados.add(k); tags[k].hidden = true; revisar(); });
    campos[k] = c; tags[k] = el('span', { class: 'chip', hidden: true });
    return el('div', { class: 'form-fila' }, el('label', { for: `lec-${k}` }, etiqueta, ' ', tags[k]), c);
  };
  const filaTipos = ctl('td', 'Tipo de documento', { opciones: [['', 'Elige…'], ...Object.entries(TIPOS_DTE).map(([k, t]) => [k, `${k !== '0' ? `${k} · ` : ''}${t}`])] });
  const proveedor = el('p', { class: 'texto-chico' });
  const categoria = el('select', { class: 'campo', id: 'lec-cat' }, categorias.map((c) => el('option', { value: c.id }, c.nombre)));
  const centro = el('select', { class: 'campo', id: 'lec-cen' }, el('option', { value: '' }, 'Sin centro de costo'), base.centros.filter((c) => c.activo).map((c) => el('option', { value: c.id }, c.nombre)));
  const hoy = hoyISO();
  const aCuenta = el('select', { class: 'campo', id: 'lec-acu' }, opcionesACuenta(base).map(([v, t]) => el('option', { value: v }, t)));
  const faena = el('select', { class: 'campo', id: 'lec-fae' }, el('option', { value: '' }, 'Sin faena (gasto general)'),
    (faenas.data ?? []).map((f) => el('option', { value: f.id, selected: f.fecha_inicio <= hoy && f.fecha_fin >= hoy && (faenas.data ?? []).filter((x) => x.fecha_inicio <= hoy && x.fecha_fin >= hoy).length === 1 }, `${fechaLarga(f.fecha_inicio)} · ${f.titulo}`)));
  const concepto = el('input', { class: 'campo', id: 'lec-con', placeholder: 'Se completa con el proveedor y el documento' });
  const pagado = el('input', { type: 'checkbox', id: 'lec-pag' });
  let pagadoTocado = false;
  pagado.addEventListener('change', () => { pagadoTocado = true; });
  // Descuento a un trabajador (compra a su cuenta)
  const descontar = el('input', { type: 'checkbox', class: 'interruptor', id: 'lec-desc' });
  const trabajador = el('select', { class: 'campo', id: 'lec-trab', disabled: true }, el('option', { value: '' }, 'Elige el trabajador…'),
    (personas.data ?? []).map((p) => [p.persona_id, [p.personas?.nombres, p.personas?.apellido_paterno, p.personas?.apellido_materno].filter(Boolean).join(' ')])
      .sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => el('option', { value: id }, n)));
  descontar.addEventListener('change', () => { trabajador.disabled = !descontar.checked; if (descontar.checked) trabajador.focus(); });
  const cuadre = el('div', {});
  const detalle = el('tbody');
  const textoLeido = el('pre', { class: 'lec-texto' });

  const recombinar = () => {
    datos = combinar(partes, propios);
    // IA: manda sobre el texto de la foto (no sobre el timbre ni el XML)
    if (ia?.datos) {
      const d = ia.datos;
      const m = { td: d.tipo == null ? null : Number(d.tipo), folio: d.folio ? String(d.folio) : null, fecha: fechaIA(d.fecha), rut: d.rut ? limpioRut(d.rut) : null, razon: d.razon || null,
        neto: numIA(d.neto), iva: numIA(d.iva), otros: numIA(d.otros), total: numIA(d.total) };
      for (const [k, v] of Object.entries(m)) if (v != null && v !== '' && !['timbre', 'xml'].includes(datos.origen[k])) { datos[k] = v; datos.origen[k] = 'ia'; }
      if (!datos.items?.length && Array.isArray(d.items)) datos.items = d.items.map((i) => ({ nombre: i.descripcion, cant: i.cantidad, monto: numIA(i.total) }));
      if (!pagadoTocado && pagadoAlComprar(d)) pagado.checked = true;
    }
    for (const k of CAMPOS_DTE) {
      if (!editados.has(k)) { const v = datos[k]; campos[k].value = v == null ? '' : k === 'rut' ? fmtRut(v) : String(v); }
      const o = editados.has(k) ? null : datos.origen[k];
      tags[k].hidden = !o; if (o) { tags[k].textContent = ETIQUETA[o][0]; tags[k].className = `chip ${ETIQUETA[o][1]}`; }
    }
    detalle.replaceChildren(...(datos.items?.length ? datos.items.map((l) => el('tr', {}, el('td', {}, l.nombre ?? ''), el('td', { class: 'num' }, l.cant ?? ''), el('td', { class: 'num' }, l.precio != null ? dinero(l.precio) : ''), el('td', { class: 'num' }, l.monto != null ? dinero(l.monto) : '')))
      : [el('tr', {}, el('td', { colspan: 4, class: 'tabla-vacia' }, 'El detalle de ítems solo viene en el XML.'))]));
    textoLeido.textContent = datos.texto || '';
    const leyendo = partes.some((p) => /Buscando|Leyendo|cola/.test(p.estado));
    if (leyendo) aviso('Leyendo… la primera vez tarda un poco más (se descargan los lectores).');
    else if (partes.length && Object.values(datos.origen).includes('ocr')) aviso('Listo. Revisa los datos marcados con "Revisar": salen del texto de la foto y pueden tener errores. Si el documento es largo, agrega otra foto.');
    else if (partes.length) aviso(`Listo: datos leídos ${datos.origen.total === 'xml' ? 'del XML' : 'del timbre electrónico'}.`, 'ok');
    revisar();
  };
  const valores = () => ({
    td: campos.td.value === '' ? null : Number(campos.td.value), folio: campos.folio.value.trim() || null, fecha: campos.fecha.value || null,
    rut: campos.rut.value.trim() || null, razon: campos.razon.value.trim() || null,
    neto: num(campos.neto.value), iva: num(campos.iva.value), exento: num(campos.exento.value), otros: num(campos.otros.value), total: num(campos.total.value),
  });
  let duplicado = null;
  const revisar = async () => {
    const v = valores();
    const t = v.rut ? terceroPorRut.get(limpioRut(v.rut)) : null;
    proveedor.replaceChildren(v.rut ? (t ? el('span', {}, icono('check', { tam: 14 }), ` Proveedor: ${nombreTercero(t)}`) : el('span', { class: 'texto-suave' }, ctx.puede('terceros', 'crear') ? 'Proveedor nuevo: se crea en Clientes y proveedores al guardar.' : 'Proveedor no registrado: se guarda sin proveedor.')) : '');
    if (!concepto.dataset.editado) concepto.value = [v.razon ?? (t ? nombreTercero(t) : null), v.td != null ? `${(TIPOS_DTE[v.td] ?? 'Documento').replace(' electrónica', '')}${v.folio ? ` N° ${v.folio}` : ''}` : null].filter(Boolean).join(' · ');
    const avisos = validar(v);
    campos.rut.classList.toggle('campo-error', !!v.rut && !rutValido(v.rut));
    duplicado = null;
    if (v.rut && v.folio && v.td != null) {
      const { data } = await ctx.api.from('fin_registros').select('id, concepto').eq('empresa_id', e).is('deleted_at', null)
        .eq('dte->>rut', fmtRut(v.rut)).eq('dte->>folio', v.folio).eq('dte->>td', String(v.td)).limit(1);
      duplicado = data?.[0] ?? null;
      if (duplicado) avisos.push('Este documento ya está registrado (mismo emisor, tipo y folio).');
    }
    if (v.total == null && partes.length && !partes.some((p) => /Buscando|Leyendo|cola/.test(p.estado))) avisos.push('No se encontró el total: escríbelo a mano.');
    cuadre.replaceChildren(avisos.length ? el('p', { class: 'aviso-bandeja lec-mal' }, avisos.join(' ')) : v.total != null ? el('p', { class: 'aviso-bandeja lec-ok' }, icono('check', { tam: 16 }), 'Montos y RUT cuadran.') : '');
    if (duplicado) cuadre.append(el('a', { href: ctx.ruta('costos.registro', { id: duplicado.id }) }, `Ver el registro: ${duplicado.concepto}`));
  };
  concepto.addEventListener('input', () => { concepto.dataset.editado = '1'; });

  // ---- Guardar
  const guardar = async (ev) => {
    const b = ev.currentTarget;
    if (partes.some((p) => /Buscando|Leyendo|cola/.test(p.estado))) { avisar('Espera a que terminen de leerse los archivos.', 'error'); return; }
    const v = valores();
    if (!v.total || v.total <= 0) { avisar('Falta el total.', 'error'); return; }
    if (duplicado) { avisar('Este documento ya está registrado.', 'error'); return; }
    if (!concepto.value.trim()) { avisar('Escribe el concepto.', 'error'); return; }
    if (descontar.checked && !trabajador.value) { avisar('Elige a qué trabajador se le descuenta.', 'error'); return; }
    b.disabled = true; b.classList.add('cargando');
    const subidas = [];
    try {
      // Proveedor por RUT (si no existe y se puede, se crea)
      let tercero = v.rut ? terceroPorRut.get(limpioRut(v.rut)) ?? null : null;
      if (!tercero && v.rut && rutValido(v.rut) && ctx.puede('terceros', 'crear')) {
        const { data, error } = await ctx.api.from('terceros').insert({ empresa_id: e, rut: `${limpioRut(v.rut).slice(0, -1)}-${limpioRut(v.rut).slice(-1)}`, razon_social: v.razon || fmtRut(v.rut), tipo: ['proveedor'] }).select('id, rut, razon_social, nombre_fantasia, tipo').single();
        if (error) throw new Error(`No se pudo crear el proveedor: ${error.message}`);
        tercero = data; terceroPorRut.set(limpioRut(v.rut), data);
      }
      // Fotos y XML: el primero es el archivo principal, el resto va a adjuntos
      for (const p of partes) {
        const esXml = /\.xml$/i.test(p.nombre);
        const blob = esXml ? p.archivo : await aJPEG(p.foto ?? p.archivo, 1800);
        const archivo = new File([blob], esXml ? p.nombre : `${p.nombre.replace(/\.\w+$/, '')}.jpg`, { type: esXml ? 'text/xml' : 'image/jpeg' });
        subidas.push((await subirArchivo(ctx.api, { empresaId: e, modulo: 'costos', archivo, tabla: 'fin_registros' })).ruta);
      }
      const o = datos.origen.total;
      const origen = editados.has('total') ? 'manual' : o === 'timbre' ? 'timbre' : o === 'xml' ? 'xml' : o === 'ocr' ? 'ocr' : o === 'ia' ? 'ia' : 'manual';
      const doc = docTipoDe(v.td);
      const iva = doc === 'factura' ? v.iva ?? 0 : 0;
      const { data, error } = await ctx.api.from('fin_registros').insert({
        empresa_id: e, tipo: 'gasto', fecha: v.fecha || hoyISO(), concepto: concepto.value.trim(), categoria_id: categoria.value, centro_id: centro.value || null,
        tercero_id: tercero?.id ?? null, doc_tipo: doc, doc_numero: v.folio, total: v.total, neto: v.total - iva, iva,
        // Boleta o ticket: pagado al comprar (salvo que se desmarque a mano); factura: por pagar
        ...(!ctx.puede('costos', 'editar') ? { estado_pago: 'pendiente' } : (pagadoTocado ? pagado.checked : pagado.checked || doc !== 'factura') ? { estado_pago: 'pagado', fecha_pago: v.fecha || hoyISO() } : { estado_pago: 'listo' }), archivo: subidas[0] ?? null, adjuntos: subidas.slice(1), faena_id: faena.value || null, a_cuenta_de: aCuenta.value || null,
        dte: { ...v, rut: v.rut ? fmtRut(v.rut) : null, td: v.td == null ? null : String(v.td), items: datos.items ?? [], origen },
      }).select('id').single();
      if (error) throw new Error(error.code === '23505' ? 'Este documento ya estaba registrado (mismo emisor, tipo y folio).' : error.message);
      if (descontar.checked) {
        const fecha = v.fecha || hoyISO();
        const { error: e2 } = await ctx.api.from('remu_items').insert({
          empresa_id: e, persona_id: trabajador.value, tipo: 'descuento', concepto: `Descuento: ${concepto.value.trim()}`.slice(0, 200), monto: v.total,
          origen_id: data.id, ...(mensual ? { mes: fecha.slice(0, 7) } : { semana: lunesDe(fecha) }),
        });
        if (e2) { avisar(`Gasto registrado, pero no se pudo cargar el descuento: ${e2.message}`, 'error'); location.hash = ctx.ruta('costos.registro', { id: data.id }); return; }
        avisar(`Gasto registrado y descuento de ${dinero(v.total)} cargado en Remuneraciones (${mensual ? 'mes' : 'semana'} del documento).`);
        location.hash = ctx.ruta('costos.registro', { id: data.id });
        return;
      }
      avisar('Gasto registrado desde el documento.');
      location.hash = ctx.ruta('costos.registro', { id: data.id });
    } catch (err) {
      for (const r of subidas) await almacen(ctx.api).remove([r]).catch(() => {});
      avisar(err.message, 'error'); b.disabled = false; b.classList.remove('cargando');
    }
  };

  const fila = (etq, c) => el('div', { class: 'form-fila' }, el('label', { for: c.id }, etq), c);
  const formulario = el('div', { class: 'ficha doc-grupo lec-form', hidden: true },
    el('h2', {}, '2. Revisar y guardar'),
    estado, iaEstado,
    el('div', { class: 'rejilla-campos' }, filaTipos, ctl('folio', 'Folio', { num: true }), ctl('fecha', 'Fecha', { tipo: 'date' })),
    el('div', { class: 'rejilla-campos' }, ctl('rut', 'RUT del emisor'), ctl('razon', 'Razón social')),
    proveedor,
    el('div', { class: 'rejilla-campos lec-montos' }, ctl('neto', 'Neto', { num: true }), ctl('iva', 'IVA', { num: true }), ctl('exento', 'Exento', { num: true }), ctl('otros', 'Otros impuestos', { num: true }), ctl('total', 'Total', { num: true })),
    cuadre,
    el('div', { class: 'rejilla-campos' }, fila('Categoría', categoria), fila('Centro de costo', centro), conFaenas ? fila('Faena', faena) : null),
    el('div', { class: 'rejilla-campos' }, fila('¿Por cuenta de un tercero?', aCuenta)),
    fila('Concepto', concepto),
    el('label', { class: 'casilla' }, pagado, 'Ya está pagado (boletas y tickets quedan pagados solos; la factura queda por pagar)'),
    conDescuento ? el('div', { class: 'lec-descuento' },
      el('label', { class: 'casilla' }, descontar, 'Descontar a un trabajador (compra a su cuenta)'),
      el('div', { class: 'form-fila' }, trabajador),
      el('p', { class: 'texto-suave texto-chico' }, `Se carga como descuento en Remuneraciones, en ${mensual ? 'el mes' : 'la semana'} de la fecha del documento, por el total.`)) : null,
    el('details', { class: 'lec-mas' }, el('summary', {}, 'Detalle y texto leído'),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' }, el('thead', {}, el('tr', {}, el('th', {}, 'Ítem'), el('th', { class: 'num' }, 'Cant.'), el('th', { class: 'num' }, 'Precio'), el('th', { class: 'num' }, 'Monto'))), detalle)),
      textoLeido),
    el('div', { class: 'listado-acciones' },
      ctx.puede('costos', 'crear') ? boton('Registrar gasto', { icono: 'check', tipo: 'primario', onclick: guardar }) : null,
      boton('Descartar', { onclick: () => ctx.refrescar() })));

  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Leer boleta o factura'),
      el('p', { class: 'texto-suave' }, 'Lee el timbre electrónico, el XML o el texto de la foto y registra el gasto. Todo se procesa en este equipo.'))),
    el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, '1. Documento'),
      el('div', { class: 'listado-acciones lec-botones' },
        boton('Escanear timbre', { icono: 'camara', tipo: 'primario', onclick: escanear }),
        boton('Tomar foto', { icono: 'camara', onclick: () => inFoto.click() }),
        boton('Subir PDF, XML o imagen', { icono: 'descargar', onclick: () => inArch.click() }), inFoto, inArch),
      cajaCam, fotos,
      el('p', { class: 'texto-suave texto-chico' }, 'Puedes agregar varias fotos del mismo documento (por ejemplo, una boleta larga). El XML trae todos los datos y el detalle.')),
    formulario);
}
