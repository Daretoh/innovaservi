// Motor del generador de documentos: arma las plantillas con los datos de la empresa y abre el documento en un editor
// a pantalla completa (como en InnovaGestión): los campos subrayados se escriben ahí mismo, los bloques opcionales se
// quitan con la ×, se elige el formato (variante) y los trabajadores que firman; luego se imprime, se descarga en PDF
// o se guarda donde corresponde (RRHH o Prevención SST), según lo que pase quien abre el documento.
import { el } from '../../core/ui/dom.js?v=384ede1';
import { icono } from '../../core/ui/iconos.js?v=384ede1';
import { boton } from '../../core/ui/tabla.js?v=384ede1';
import { avisar } from '../../core/ui/aviso.js?v=384ede1';
import { cargarJsPdf, cargarLogo, sellar } from '../../core/pdf.js?v=384ede1';
import { crearPlantillas } from './plantillas.js?v=384ede1';
import { pdfDesde } from './pdf.js?v=384ede1';

let estilos = null;
function cargarEstilos() {
  estilos ??= new Promise((ok) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('./documentos.css?v=384ede1', import.meta.url).href;
    l.onload = ok; l.onerror = ok;
    document.head.append(l);
  });
  return estilos;
}

// Las ediciones de PTS se insertan como texto del documento: sin < ni > (aunque alguien las guarde por la API)
const sinEtiquetas = (x) => (typeof x === 'string' ? x.replace(/</g, '‹').replace(/>/g, '›')
  : Array.isArray(x) ? x.map(sinEtiquetas) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, sinEtiquetas(v)])) : x);

const escaparTodo = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')]));

// Datos de la empresa y plantillas listas (una vez por vista)
export async function cargarPlantillas(ctx) {
  const e = ctx.empresa;
  const [cfgR, ptsR, sstR] = await Promise.all([
    ctx.api.from('gen_config').select('*').eq('empresa_id', e.id).maybeSingle(),
    ctx.api.from('gen_pts').select('slug, version, datos, cambio, created_at').eq('empresa_id', e.id).order('created_at'),
    ctx.puede('sst', 'ver') ? ctx.api.from('sst_config').select('representante, cargo_rep, firma_ruta, timbre_ruta').eq('empresa_id', e.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (cfgR.error) throw cfgR.error;
  const c = cfgR.data ?? {};
  const sst = sstR.data ?? {};
  // Firmas: las del generador; si no hay, las de Prevención SST
  const [logo, firma, timbre, firmaPrev] = await Promise.all([
    cargarLogo(ctx.api, e.logo_url), cargarLogo(ctx.api, c.firma_ruta || sst.firma_ruta), cargarLogo(ctx.api, c.timbre_ruta || sst.timbre_ruta), cargarLogo(ctx.api, c.firma_prev_ruta),
  ]);
  // Ediciones de PTS: la última versión de cada uno, con el historial de cambios
  const ptsEdit = {};
  for (const p of ptsR.data ?? []) ptsEdit[p.slug] = sinEtiquetas(p.datos);
  const representante = c.representante || sst.representante || '';
  // Los datos de la empresa entran a las plantillas como HTML: se escapan aquí, una sola vez
  const h = (x) => escaparTodo(x);
  const D = {
    EMP: {
      ...h({ rz: e.razon_social, rut: e.rut, dir: [c.direccion, c.ciudad].filter(Boolean).join(', '), rep: representante, repRut: c.rep_rut || '',
        ciudad: c.ciudad || '', direccion: c.direccion || '', region: c.region || '', mutual: c.mutual || 'Mutual de Seguridad' }),
      logo: logo?.dataUrl || '',
    },
    EMP_PREV: h({ nombre: c.prevencionista || '', cargo: c.prev_cargo || 'Técnico en Prevención de Riesgos' }),
    KARIN: h({ resp: c.karin_responsable || 'Gerencia General', receptor: c.karin_receptor || representante, correo: c.karin_correo || '', canal: c.karin_canal || c.karin_correo || '' }),
    firma: firma?.dataUrl || '', timbre: timbre?.dataUrl || '', firmaPrev: firmaPrev?.dataUrl || '',
    ptsEdit,
  };
  return { P: crearPlantillas(D), D, config: c, faltan: [!c.ciudad && 'ciudad', !representante && 'representante legal', !c.prevencionista && 'prevencionista'].filter(Boolean) };
}

// Sueldo base de los contratos fijos (Remuneraciones → Condiciones de pago), si se puede ver: vínculo → monto
export async function sueldosBase(ctx) {
  if (!ctx.puede('remu', 'ver')) return new Map();
  const { data } = await ctx.api.from('remu_condiciones').select('vinculo_id, sueldo_base').eq('empresa_id', ctx.empresa.id).not('sueldo_base', 'is', null);
  return new Map((data ?? []).map((x) => [x.vinculo_id, x.sueldo_base]));
}

// Trabajador para las plantillas, desde su ficha (persona + vínculo con la empresa)
export function trabajador(v, extra = {}) {
  const p = v.personas ?? {};
  return {
    id: v.persona_id, nombre: [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' '), rut: p.rut ?? '', cargo: v.cargo ?? '',
    fecha_ingreso: v.fecha_ingreso ?? '', direccion: p.direccion ?? '', numero: p.numero ?? '', poblacion: p.poblacion ?? '', comuna: p.comuna ?? '', nacionalidad: p.nacionalidad ?? '',
    estado_civil: p.estado_civil ?? '', nacimiento: p.fecha_nacimiento ?? p.nacimiento ?? '', email: p.email ?? '', telefono: p.telefono ?? '',
    afp: p.afp ?? '', salud: p.salud ?? '', ...extra,
  };
}

// Abre un documento. o: { titulo, construir(variante, personas) → html, variantes?: [{v, n}], variante?,
//   personas?: 'una' | 'lista', elegibles?: [trabajador], elegidos?: [trabajador], guardar?: { texto, alGuardar(blob, { variante, personas }) },
//   nombreArchivo }
export async function abrirDocumento(o) {
  await cargarEstilos();
  let variante = o.variante ?? o.variantes?.[0]?.v ?? null;
  let personas = o.elegidos ?? [];
  const hoja = el('div', { class: 'dg-doc' });
  // Color de la empresa en títulos y bandas del documento
  const color = getComputedStyle(document.documentElement).getPropertyValue('--empresa').trim();
  if (color) hoja.style.setProperty('--doc-color', color);
  const pintar = () => {
    hoja.innerHTML = o.construir(variante, personas);   // plantillas: todo dato pasa por esc()/ce()
    for (const img of hoja.querySelectorAll('img[onerror]')) img.removeAttribute('onerror');
    for (const img of hoja.querySelectorAll('img')) if (!img.getAttribute('src')) img.remove();
  };
  // Quitar bloques opcionales; recordar lo escrito en campos con data-ls (relator, horario…)
  hoja.addEventListener('click', (ev) => { const x = ev.target.closest('.dg-x'); if (x) x.closest('.dg-opt')?.remove(); });
  hoja.addEventListener('input', (ev) => {
    const k = ev.target.getAttribute?.('data-ls');
    if (k) try { localStorage.setItem(k, ev.target.textContent.trim()); } catch { /* */ }
    ev.target.classList?.remove('dg-vacio');
  });

  const selVariante = o.variantes ? el('select', { class: 'campo', 'aria-label': 'Formato', onchange: (ev) => { variante = ev.currentTarget.value; pintar(); } },
    o.variantes.map((x) => el('option', { value: x.v, selected: x.v === variante }, x.n))) : null;
  const botonPersonas = o.personas ? boton(textoPersonas(personas), { icono: 'users', onclick: () => elegirPersonas(o, personas, (L) => { personas = L; botonPersonas.lastChild.textContent = textoPersonas(L); pintar(); }) }) : null;

  const cerrar = () => { capa.remove(); document.removeEventListener('keydown', tecla); document.body.style.overflow = ''; };
  const tecla = (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) cerrar(); };
  const accion = (fn) => async (ev) => {
    const b = ev.currentTarget;
    if (!revisarVacios(hoja)) return;
    b.classList.add('cargando'); b.disabled = true;
    try { await fn(); } catch (e) { avisar(e.message || 'No se pudo generar el PDF.', 'error'); } finally { b.classList.remove('cargando'); b.disabled = false; }
  };
  const pdf = async () => {
    const jsPDF = await cargarJsPdf();
    hoja.classList.add('dg-capturando');
    try { return sellar(await pdfDesde(hoja, jsPDF), { autor: o.autor ?? '', titulo: o.titulo }); } finally { hoja.classList.remove('dg-capturando'); }
  };
  const nombre = () => `${(o.nombreArchivo || o.titulo).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`;

  const barra = el('div', { class: 'dg-barra' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', title: 'Cerrar', onclick: cerrar }, icono('cerrar')),
    el('strong', { class: 'dg-barra-t' }, o.titulo),
    selVariante, botonPersonas,
    el('span', { class: 'dg-barra-acc' },
      boton('Imprimir', { icono: 'documento', onclick: accion(async () => window.open(URL.createObjectURL((await pdf()).output('blob')), '_blank')) }),
      boton('Descargar PDF', { icono: 'descargar', onclick: accion(async () => (await pdf()).save(nombre())) }),
      o.guardar ? boton(o.guardar.texto ?? 'Guardar', { icono: 'check', tipo: 'primario', onclick: accion(async () => {
        await o.guardar.alGuardar((await pdf()).output('blob'), { variante, personas, nombre: nombre() });
        cerrar();
      }) }) : null));
  const capa = el('div', { class: 'dg-capa', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titulo },
    barra,
    el('p', { class: 'dg-ayuda' }, 'Los campos subrayados se escriben directo en el documento. Los bloques marcados se pueden quitar si no aplican.'),
    hoja);
  pintar();
  document.body.append(capa);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', tecla);
}

const textoPersonas = (L) => (L.length ? `Trabajadores (${L.length})` : 'Trabajadores');

// Campos vacíos: los marca y pregunta si seguir igual (para completarlos a mano después)
function revisarVacios(hoja) {
  const vacios = [...hoja.querySelectorAll('[contenteditable]')].filter((x) => !x.closest('[data-html2canvas-ignore]') && !(x.textContent || '').replace(/[\s_.\-—]/g, ''));
  if (!vacios.length) return true;
  for (const x of vacios) x.classList.add('dg-vacio');
  if (confirm(`Hay ${vacios.length} campo${vacios.length === 1 ? '' : 's'} sin completar (marcados en naranjo). ¿Seguir igual? Quedarán en blanco para completarlos a mano.`)) {
    for (const x of vacios) x.classList.remove('dg-vacio');
    return true;
  }
  vacios[0].scrollIntoView({ block: 'center', behavior: 'smooth' }); vacios[0].focus();
  return false;
}

// Selector de trabajadores que firman (una o varias personas)
function elegirPersonas(o, actuales, listo) {
  const marcados = new Set(actuales.map((t) => t.id));
  const buscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar por nombre o RUT', 'aria-label': 'Buscar' });
  const lista = el('div', { class: 'dg-lista' }, (o.elegibles ?? []).map((t) => el('label', { class: 'casilla dg-lista-it', 'data-q': `${t.nombre} ${t.rut}`.toLowerCase() },
    el('input', { type: o.personas === 'una' ? 'radio' : 'checkbox', name: 'dg-persona', value: t.id, checked: marcados.has(t.id) }), `${t.nombre}${t.rut ? ` · ${t.rut}` : ''}`)));
  buscar.addEventListener('input', () => { const q = buscar.value.trim().toLowerCase(); for (const x of lista.children) x.hidden = !!q && !x.dataset.q.includes(q); });
  const dialogo = el('dialog', { class: 'modal', 'aria-label': 'Trabajadores' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, o.personas === 'una' ? 'Trabajador' : 'Trabajadores que firman'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => dialogo.remove() }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' },
      el('p', { class: 'texto-suave texto-chico' }, 'Se completan su nombre, RUT y cargo en el documento. Sin elegir a nadie, sale en blanco.'),
      buscar, lista,
      el('div', { class: 'modal-pie' },
        boton('Ninguno', { onclick: () => { dialogo.remove(); listo([]); } }),
        boton('Usar seleccionados', { tipo: 'primario', onclick: () => {
          const ids = new Set([...lista.querySelectorAll('input:checked')].map((x) => x.value));
          dialogo.remove(); listo((o.elegibles ?? []).filter((t) => ids.has(t.id)));
        } }))));
  document.body.append(dialogo);
  dialogo.showModal();
}
