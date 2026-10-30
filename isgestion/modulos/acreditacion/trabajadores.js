// Acreditación de trabajadores por cliente (como InnovaGestión, 2026-10-27): qué documentos de RRHH pide el cliente a
// cada trabajador (general o por lugar), estado de cada uno (Validado, Por vencer, Listo para enviar, Enviado, Faltan
// documentos), marca de validación con vigencia, "a quién validar" (faenas de los próximos 14 días y validaciones por
// vencer) y ZIP con lo que pide el cliente (LEEME con faltantes y lo que va desde Buk; fotos achicadas; partes de 20 MB).
import { el } from '../../core/ui/dom.js?v=25e9201';
import { icono } from '../../core/ui/iconos.js?v=25e9201';
import { boton } from '../../core/ui/tabla.js?v=25e9201';
import { abrirFormulario } from '../../core/ui/modal.js?v=25e9201';
import { avisar } from '../../core/ui/aviso.js?v=25e9201';
import { urlsFirmadas } from '../../core/adjuntos.js?v=25e9201';
import { comprimirFoto } from '../../core/imagenes.js?v=25e9201';
import { fechaLarga, fechaCorta, hoyISO, sumarDias, diaLocal } from '../../core/ui/formato.js?v=25e9201';

const CHIP_DOC = { ok: 'chip-ok', prox: 'chip-prox', venc: 'chip-venc', pend: 'chip-venc', na: 'chip-na' };
export const ESTADOS = { validado: ['Validado', 'chip-ok'], por_vencer: ['Por vencer', 'chip-prox'], listo: ['Listo para enviar', 'chip-pend'], enviado: ['Enviado', 'chip-pend'], rechazado: ['Rechazado', 'chip-venc'], faltan: ['Faltan documentos', 'chip-venc'] };
const CERO = '00000000-0000-0000-0000-000000000000';
const AVISO_DIAS = 15;
const MAX_PARTE = 20 * 1024 * 1024;

// Datos de acreditación de trabajadores de la empresa (todos los clientes)
export async function cargarAcreditacion(ctx) {
  const e = ctx.empresa.id;
  const m = await import('../rrhh/datos.js?v=25e9201');
  const [rrhh, req, val, sit] = await Promise.all([
    m.cargarRrhh(ctx),
    ctx.api.from('acr_req_trabajador').select('*').eq('empresa_id', e).order('orden'),
    ctx.api.from('acr_validaciones').select('*').eq('empresa_id', e),
    ctx.puede('ope', 'ver') ? ctx.api.from('ope_sitios').select('id, tercero_id, nombre').eq('empresa_id', e) : Promise.resolve({ data: [] }),
  ]);
  return { m, rrhh, req: req.data ?? [], val: val.data ?? [], sitios: sit.data ?? [] };
}

// Lo que pide el cliente en un lugar (los generales + los del lugar)
export const requisitosDe = (d, terceroId, sitioId = null) => d.req.filter((r) => r.tercero_id === terceroId && (!r.sitio_id || r.sitio_id === sitioId));

// Estado de un trabajador ante un cliente (y lugar)
export function estadoTrabajador(d, terceroId, sitioId, personaId) {
  const hoy = hoyISO();
  const reqs = requisitosDe(d, terceroId, sitioId);
  const faltan = []; const buk = []; const proximos = [];
  for (const r of reqs) {
    const t = d.rrhh.tipos.find((x) => x.slug === r.tipo_slug);
    if (!t) continue;
    if (t.fuente === 'buk') { buk.push(t); continue; }
    const e = d.m.estadoDoc(t, d.rrhh.doc(personaId, t.slug));
    if (e.k === 'pend' || e.k === 'venc') faltan.push(t);
    else if (e.k === 'prox') proximos.push(t);
  }
  const v = d.val.find((x) => x.tercero_id === terceroId && x.persona_id === personaId && (x.sitio_id ?? CERO) === (sitioId ?? CERO))
    ?? d.val.find((x) => x.tercero_id === terceroId && x.persona_id === personaId && !x.sitio_id);
  let k;
  if (v?.estado === 'validado' && (!v.hasta || v.hasta >= hoy)) k = (v.hasta && v.hasta <= sumarDias(hoy, AVISO_DIAS)) || proximos.length || faltan.length ? 'por_vencer' : 'validado';
  else if (v?.estado === 'enviado') k = 'enviado';
  else if (faltan.length) k = 'faltan';
  else if (v?.estado === 'rechazado') k = 'rechazado';
  else k = 'listo';
  return { k, texto: ESTADOS[k][0], clase: ESTADOS[k][1], v, faltan, buk, proximos, reqs };
}

// Sección en la ficha del mandante
export async function seccionTrabajadores(ctx, cliente) {
  const d = await cargarAcreditacion(ctx);
  const editable = ctx.puede('acreditacion', 'editar');
  const sitios = d.sitios.filter((s) => s.tercero_id === cliente.id);
  const reqs = d.req.filter((r) => r.tercero_id === cliente.id);
  const nombreSitio = (id) => sitios.find((s) => s.id === id)?.nombre ?? 'lugar';
  const activos = d.rrhh.vinculos.filter((v) => v.estado === 'activo');

  const configurar = () => abrirFormulario({
    titulo: `Qué pide ${cliente.nombre_fantasia || cliente.razon_social} a cada trabajador`,
    mensaje: 'Marca los documentos de RRHH que pide. Los de Buk se informan en el LEEME del ZIP pero no se suben ni frenan la validación.',
    campos: [
      ...(sitios.length ? [{ id: 'sitio', etiqueta: 'Para', opciones: [['', 'Todos los lugares'], ...sitios.map((s) => [s.id, `Solo ${s.nombre}`])] }] : []),
      { id: 'tipos', etiqueta: 'Documentos', tipo: 'checks', opciones: d.rrhh.tiposActivos.filter((t) => !t.tercero_id || t.tercero_id === cliente.id).map((t) => [t.slug, `${t.nombre}${t.fuente === 'buk' ? ' (Buk)' : ''}${t.tercero_id ? ' (propio del cliente)' : ''}`]),
        valor: reqs.filter((r) => !r.sitio_id).map((r) => r.tipo_slug) },
    ],
    alGuardar: async (x) => {
      const sitio = x.sitio || null;
      const actuales = reqs.filter((r) => (r.sitio_id ?? null) === sitio);
      const quitar = actuales.filter((r) => !x.tipos.includes(r.tipo_slug));
      const poner = x.tipos.filter((s) => !actuales.some((r) => r.tipo_slug === s));
      if (quitar.length) { const { error } = await ctx.api.from('acr_req_trabajador').delete().in('id', quitar.map((r) => r.id)); if (error) throw new Error(error.message); }
      if (poner.length) { const { error } = await ctx.api.from('acr_req_trabajador').insert(poner.map((s, i) => ({ empresa_id: ctx.empresa.id, tercero_id: cliente.id, sitio_id: sitio, tipo_slug: s, orden: i }))); if (error) throw new Error(error.message); }
      avisar('Requisitos guardados.'); ctx.refrescar();
    },
  });

  const marcar = (v, est) => abrirFormulario({
    titulo: `${d.m.nombreCompleto(v.personas)} · ${cliente.nombre_fantasia || cliente.razon_social}`,
    campos: [
      { id: 'estado', etiqueta: 'Estado', opciones: [['enviado', 'Enviado al cliente'], ['validado', 'Validado por el cliente'], ['rechazado', 'Rechazado'], ...(est.v ? [['quitar', 'Quitar la marca']] : [])], valor: est.v?.estado ?? (est.k === 'listo' ? 'enviado' : 'validado') },
      ...(sitios.length ? [{ id: 'sitio', etiqueta: 'Lugar', opciones: [['', 'Todos los lugares'], ...sitios.map((s) => [s.id, s.nombre])], valor: est.v?.sitio_id ?? '' }] : []),
      { id: 'desde', etiqueta: 'Desde', tipo: 'date', valor: est.v?.desde ?? hoyISO() },
      { id: 'hasta', etiqueta: 'Vigente hasta (vacío = sin vencimiento)', tipo: 'date', valor: est.v?.hasta ?? '' },
      { id: 'nota', etiqueta: 'Nota', valor: est.v?.nota ?? '' },
    ],
    alGuardar: async (x) => {
      if (x.estado === 'quitar') { const { error } = await ctx.api.from('acr_validaciones').delete().eq('id', est.v.id); if (error) throw new Error(error.message); ctx.refrescar(); return; }
      const fila = { estado: x.estado, sitio_id: x.sitio || null, desde: x.desde || null, hasta: x.hasta || null, nota: x.nota.trim() || null };
      const r = est.v ? await ctx.api.from('acr_validaciones').update(fila).eq('id', est.v.id)
        : await ctx.api.from('acr_validaciones').insert({ ...fila, empresa_id: ctx.empresa.id, tercero_id: cliente.id, persona_id: v.persona_id });
      if (r.error) throw new Error(r.error.code === '23505' ? 'Ya hay una marca para este trabajador en ese lugar.' : r.error.message);
      avisar('Guardado.'); ctx.refrescar();
    },
  });

  const filas = activos.map((v) => ({ v, est: estadoTrabajador(d, cliente.id, null, v.persona_id) }));
  const listos = filas.filter((f) => f.est.k !== 'faltan');
  const orden = { faltan: 0, rechazado: 1, por_vencer: 2, listo: 3, enviado: 4, validado: 5 };
  filas.sort((a, b) => orden[a.est.k] - orden[b.est.k] || d.m.nombreCompleto(a.v.personas).localeCompare(d.m.nombreCompleto(b.v.personas)));

  return el('div', { class: 'ficha doc-grupo' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Acreditación de trabajadores'),
      el('div', { class: 'listado-acciones' },
        editable ? boton('Qué pide', { icono: 'ajustes', onclick: configurar }) : null,
        reqs.length && listos.length ? boton(`ZIP (${listos.length})`, { icono: 'descargar', onclick: (ev) => descargarZip(ctx, d, cliente, listos.map((f) => f.v), ev.currentTarget) }) : null)),
    reqs.length ? el('div', { class: 'resumen-chips' }, reqs.map((r) => {
      const t = d.rrhh.tipos.find((x) => x.slug === r.tipo_slug);
      return el('span', { class: 'chip chip-na' }, `${t?.corto || t?.nombre || r.tipo_slug}${t?.fuente === 'buk' ? ' (Buk)' : ''}${r.sitio_id ? ` · solo ${nombreSitio(r.sitio_id)}` : ''}`);
    })) : el('p', { class: 'texto-suave' }, 'Aún no se configura qué documentos pide a cada trabajador.'),
    reqs.length ? el('div', { class: 'resumen-chips' }, Object.entries(ESTADOS).map(([k, [n, c]]) => { const x = filas.filter((f) => f.est.k === k).length; return x ? el('span', { class: `chip ${c}` }, `${n} ${x}`) : null; })) : null,
    reqs.length ? filas.map(({ v, est }) => el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('a', { href: ctx.ruta('rrhh.ficha', { p: v.persona_id }) }, el('strong', {}, d.m.nombreCompleto(v.personas))),
        el('span', { class: 'texto-suave texto-chico' }, [v.cargo,
          est.faltan.length ? `Falta: ${est.faltan.map((t) => t.corto || t.nombre).join(', ')}` : null,
          est.proximos.length ? `Por vencer: ${est.proximos.map((t) => t.corto || t.nombre).join(', ')}` : null,
          est.v?.hasta ? `validado hasta ${fechaLarga(est.v.hasta)}` : null].filter(Boolean).join(' · ')),
        // Cada documento que pide el cliente, con su estado y la fecha en que se cargó (como InnovaGestión)
        el('div', { class: 'resumen-chips' }, est.reqs.map((r) => {
          const t = d.rrhh.tipos.find((x) => x.slug === r.tipo_slug);
          if (!t || t.fuente === 'buk') return null;
          const doc = d.rrhh.doc(v.persona_id, t.slug); const e = d.m.estadoDoc(t, doc);
          const cargado = doc?.estado === 'entregado' ? diaLocal(doc.created_at) : null;
          return el('span', { class: `chip ${CHIP_DOC[e.k] ?? 'chip-na'}`, title: `${t.nombre} · ${e.texto}${cargado ? ` · cargado el ${fechaLarga(cargado)}` : ''}` },
            `${t.corto || t.nombre}${cargado ? ` · ${fechaCorta(cargado)}` : ''}`);
        }))),
      el('span', { class: `chip ${est.clase}` }, est.texto),
      el('div', { class: 'doc-acciones' },
        editable ? el('button', { type: 'button', class: 'boton boton-secundario boton-chico', onclick: () => marcar(v, est) }, est.v ? 'Cambiar' : 'Marcar') : null,
        el('button', { type: 'button', class: 'boton-icono', title: 'Descargar ZIP de este trabajador', 'aria-label': 'Descargar ZIP', onclick: (ev) => descargarZip(ctx, d, cliente, [v], ev.currentTarget) }, icono('descargar', { tam: 14 }))))) : null);
}

// A quién validar: asignados a faenas de los próximos 14 días sin validación vigente y validaciones por vencer
export async function aQuienValidar(ctx) {
  if (!ctx.puede('ope', 'ver')) return null;
  const d = await cargarAcreditacion(ctx);
  if (!d.req.length) return null;
  const hoy = hoyISO();
  const { data: planes } = await ctx.api.from('ope_plan').select('fecha, ope_faenas(tercero_id, sitio_id, titulo), ope_plan_personas(persona_id)')
    .eq('empresa_id', ctx.empresa.id).gte('fecha', hoy).lte('fecha', sumarDias(hoy, 14));
  const pendientes = new Map();
  for (const p of planes ?? []) {
    const f = p.ope_faenas; if (!f?.tercero_id || !d.req.some((r) => r.tercero_id === f.tercero_id)) continue;
    for (const x of p.ope_plan_personas ?? []) {
      const est = estadoTrabajador(d, f.tercero_id, f.sitio_id, x.persona_id);
      if (est.k === 'validado') continue;
      const k = `${f.tercero_id}|${x.persona_id}`;
      if (!pendientes.has(k) || p.fecha < pendientes.get(k).fecha) pendientes.set(k, { tercero_id: f.tercero_id, persona_id: x.persona_id, fecha: p.fecha, faena: f.titulo, est });
    }
  }
  const porVencer = d.val.filter((v) => v.estado === 'validado' && v.hasta && v.hasta >= hoy && v.hasta <= sumarDias(hoy, AVISO_DIAS));
  return { d, pendientes: [...pendientes.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)), porVencer };
}

// ---- ZIP
let jszip = null;
async function cargarJsZip() {
  if (jszip) return jszip;
  await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el generador de ZIP.'));
    document.head.append(s);
  });
  jszip = window.JSZip;
  return jszip;
}
const limpio = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .()-]+/g, '').trim().slice(0, 60) || 'archivo';

export async function descargarZip(ctx, d, cliente, vinculos, b) {
  b?.classList.add('cargando'); if (b) b.disabled = true;
  try {
    const Zip = await cargarJsZip();
    const nombreCli = limpio(cliente.nombre_fantasia || cliente.razon_social);
    const leeme = [`Acreditación para ${cliente.nombre_fantasia || cliente.razon_social} · ${fechaLarga(hoyISO())}`, ''];
    const archivos = [];   // { carpeta, nombre, ruta }
    for (const v of vinculos) {
      const est = estadoTrabajador(d, cliente.id, null, v.persona_id);
      const carpeta = limpio(`${v.personas.apellido_paterno ?? ''} ${v.personas.nombres ?? ''} (${v.personas.rut ?? ''})`);
      leeme.push(`${d.m.nombreCompleto(v.personas)} (${v.personas.rut ?? 'sin RUT'}): ${est.texto}`);
      if (est.faltan.length) leeme.push(`  Faltan: ${est.faltan.map((t) => t.nombre).join(', ')}`);
      if (est.buk.length) leeme.push(`  Van desde Buk: ${est.buk.map((t) => t.nombre).join(', ')}`);
      for (const r of est.reqs) {
        const t = d.rrhh.tipos.find((x) => x.slug === r.tipo_slug);
        if (!t || t.fuente === 'buk') continue;
        const doc = d.rrhh.doc(v.persona_id, t.slug);
        if (!doc || doc.estado !== 'entregado') continue;
        [doc.archivo, doc.archivo2].filter(Boolean).forEach((ruta, i) => archivos.push({ carpeta, nombre: `${limpio(t.nombre)}${i ? ' (reverso)' : ''}`, ruta }));
      }
    }
    leeme.push('', 'Generado con ISgestión.');
    const urls = await urlsFirmadas(ctx.api, archivos.map((a) => a.ruta), 600);
    const partes = [];
    let zip = new Zip(); let tam = 0;
    const cerrar = async () => { zip.file('LEEME.txt', leeme.join('\r\n')); partes.push(await zip.generateAsync({ type: 'blob' })); zip = new Zip(); tam = 0; };
    for (const a of archivos) {
      const url = urls.get(a.ruta); if (!url) continue;
      let blob = await (await fetch(url)).blob();
      const ext = (a.ruta.match(/\.(\w+)$/)?.[1] ?? 'pdf').toLowerCase();
      if (/^(jpe?g|png|webp|heic|heif)$/.test(ext)) blob = await comprimirFoto(new File([blob], `x.${ext}`, { type: blob.type || 'image/jpeg' }), 1600);
      if (tam && tam + blob.size > MAX_PARTE) await cerrar();
      zip.file(`${a.carpeta}/${a.nombre}.${/^(jpe?g|png|webp|heic|heif)$/.test(ext) ? 'jpg' : ext}`, blob);
      tam += blob.size;
    }
    await cerrar();
    partes.forEach((p, i) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(p);
      a.download = `Acreditacion ${nombreCli} ${hoyISO()}${partes.length > 1 ? ` parte ${i + 1}` : ''}.zip`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    });
    avisar(`ZIP descargado${partes.length > 1 ? ` en ${partes.length} partes` : ''}: ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}.`);
  } catch (err) { avisar(err.message, 'error'); } finally { b?.classList.remove('cargando'); if (b) b.disabled = false; }
}
