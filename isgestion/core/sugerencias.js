// Sugerencias desde el chat de Ayuda (Núcleo 024, 2026-11-19): formulario por puntos (área y pestaña sugeridas según la
// pantalla abierta, texto, urgencia y pantallazos con Ctrl+V, arrastrar o adjuntar) y "Mis sugerencias" con el estado y
// la respuesta de cada punto. Cada pantallazo se puede rayar antes de enviar (marcarFoto, el editor de Reportes). Los pantallazos se achican en el navegador y van a R2 privado
// (<empresa>/soporte/<usuario>/…); la sugerencia se crea con sug_enviar. Solo el equipo las ve todas (Consola).
import { el } from './ui/dom.js?v=591477d';
import { icono } from './ui/iconos.js?v=591477d';
import { avisar } from './ui/aviso.js?v=591477d';
import { almacen, urlsFirmadas } from './adjuntos.js?v=591477d';
import { comprimirFoto, esImagen } from './imagenes.js?v=591477d';
import { marcarFoto } from './ui/marcar.js?v=591477d';

export const TIPOS = [['mejora', 'Mejora'], ['error', 'Algo no funciona'], ['idea', 'Idea nueva']];
export const ESTADOS = { recibida: ['Recibida', 'chip-na'], revision: ['En revisión', 'chip-prox'], planificada: ['Planificada', 'chip-prox'], hecha: ['Hecha', 'chip-ok'], descartada: ['Descartada', 'chip-venc'] };
const MAX_FOTOS = 10;
const MAX_MB = 8;
const BORRADOR = 'isg.sugerencia.borrador';

const leerBorrador = () => { try { return JSON.parse(localStorage.getItem(BORRADOR) ?? 'null'); } catch { return null; } };
const guardarBorrador = (b) => { try { localStorage.setItem(BORRADOR, JSON.stringify(b)); } catch { /* sin almacenamiento */ } };
const borrarBorrador = () => { try { localStorage.removeItem(BORRADOR); } catch { /* sin almacenamiento */ } };

// db · empresaId() · usuarioId · pantallas(): [{ id, nombre, modulo, moduloNombre, oculto }] · actual(): id de la pantalla abierta
export function formularioSugerencia({ db, empresaId, usuarioId, pantallas, actual, alEnviar }) {
  const b = leerBorrador();
  const estado = { tipo: b?.tipo ?? 'mejora', puntos: [], foco: 0, enviando: false };
  const nuevoPunto = (p = {}) => ({ pantalla: p.pantalla ?? actual() ?? '', texto: p.texto ?? '', urgente: !!p.urgente, fotos: [] });
  estado.puntos = b?.puntos?.length ? b.puntos.map(nuevoPunto) : [nuevoPunto()];

  const lista = () => pantallas();
  const datosPantalla = (id) => lista().find((p) => p.id === id);
  const guardar = () => guardarBorrador({ tipo: estado.tipo, puntos: estado.puntos.map(({ pantalla, texto, urgente }) => ({ pantalla, texto, urgente })) });

  const cont = el('div', { class: 'sug-puntos' });
  const tipos = el('div', { class: 'sug-tipos', role: 'radiogroup', 'aria-label': 'Tipo de sugerencia' });
  const pintarTipos = () => tipos.replaceChildren(...TIPOS.map(([v, t]) => el('button', {
    type: 'button', class: `sug-tipo${estado.tipo === v ? ' activo' : ''}`, role: 'radio', 'aria-checked': String(estado.tipo === v),
    onclick: () => { estado.tipo = v; guardar(); pintarTipos(); },
  }, t)));

  async function agregarFotos(i, archivos) {
    const p = estado.puntos[i];
    for (const f of archivos) {
      if (!esImagen(f)) { avisar('Solo imágenes (pantallazos o fotos).', 'error'); continue; }
      if (p.fotos.length >= MAX_FOTOS) { avisar(`Máximo ${MAX_FOTOS} pantallazos por punto.`, 'error'); break; }
      const blob = await comprimirFoto(f, 1800).catch(() => f);
      if (blob.size > MAX_MB * 1024 * 1024) { avisar(`Una imagen pesa más de ${MAX_MB} MB.`, 'error'); continue; }
      p.fotos.push({ blob, nombre: f.name && f.name !== 'image.png' ? f.name : `pantallazo-${p.fotos.length + 1}.jpg`, url: URL.createObjectURL(blob) });
    }
    pintar();
  }

  // Rayar el pantallazo: la versión marcada reemplaza a la original (todavía no se ha subido)
  async function marcar(f) {
    let archivo;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--empresa').trim() || null;
    try { archivo = await marcarFoto(f.blob, { titulo: 'Marcar pantallazo', colorEmpresa: color, textoGuardar: 'Listo' }); } catch (e) { avisar(e.message, 'error'); return; }
    if (!archivo) return;
    URL.revokeObjectURL(f.url);
    f.blob = archivo; f.url = URL.createObjectURL(archivo);
    pintar();
  }

  function tarjeta(p, i) {
    const opciones = lista().filter((x) => !x.oculto || x.id === p.pantalla);
    const grupos = new Map();
    for (const x of opciones) { if (!grupos.has(x.moduloNombre)) grupos.set(x.moduloNombre, []); grupos.get(x.moduloNombre).push(x); }
    const select = el('select', { class: 'sug-pantalla', 'aria-label': `Área y pestaña del punto ${i + 1}` },
      el('option', { value: '' }, 'General (no es de una pantalla)'),
      ...[...grupos].map(([mod, xs]) => el('optgroup', { label: mod }, ...xs.map((x) => el('option', { value: x.id, selected: x.id === p.pantalla }, x.nombre)))));
    select.addEventListener('change', () => { p.pantalla = select.value; guardar(); });
    const texto = el('textarea', { class: 'sug-texto', rows: 3, maxlength: 3000, placeholder: 'Qué pasa o qué sugieres…', 'aria-label': `Texto del punto ${i + 1}` });
    texto.value = p.texto;
    texto.addEventListener('input', () => { p.texto = texto.value; guardar(); });
    texto.addEventListener('focus', () => { estado.foco = i; });
    const archivo = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    archivo.addEventListener('change', () => { agregarFotos(i, [...archivo.files]); archivo.value = ''; });
    const fotos = el('div', { class: 'sug-fotos' },
      ...p.fotos.map((f, k) => el('span', { class: 'sug-foto' },
        el('button', { type: 'button', class: 'sug-foto-ver', title: 'Marcar o rayar este pantallazo', 'aria-label': `Marcar ${f.nombre}`, onclick: () => marcar(f) }, el('img', { src: f.url, alt: f.nombre })),
        el('span', { class: 'sug-foto-lapiz', 'aria-hidden': 'true' }, icono('lapiz', { tam: 11 })),
        el('button', { type: 'button', class: 'sug-foto-quitar', title: 'Quitar', 'aria-label': `Quitar ${f.nombre}`, onclick: () => { URL.revokeObjectURL(f.url); p.fotos.splice(k, 1); pintar(); } }, icono('cerrar', { tam: 12 })))),
      el('button', { type: 'button', class: 'sug-foto-agregar', title: 'Adjuntar pantallazo o foto', onclick: () => archivo.click() }, icono('camara', { tam: 16 }), el('span', {}, 'Pantallazo')),
      archivo);
    const caja = el('div', { class: `sug-punto${p.urgente ? ' urgente' : ''}` },
      el('div', { class: 'sug-punto-cabeza' },
        el('span', { class: 'sug-num' }, String(i + 1)),
        select,
        estado.puntos.length > 1 ? el('button', { type: 'button', class: 'boton-icono', title: 'Quitar este punto', 'aria-label': `Quitar el punto ${i + 1}`, onclick: () => { p.fotos.forEach((f) => URL.revokeObjectURL(f.url)); estado.puntos.splice(i, 1); guardar(); pintar(); } }, icono('basura', { tam: 14 })) : null),
      texto, fotos,
      el('label', { class: 'sug-urgente' }, (() => { const c = el('input', { type: 'checkbox', checked: p.urgente }); c.addEventListener('change', () => { p.urgente = c.checked; caja.classList.toggle('urgente', c.checked); guardar(); }); return c; })(), 'Urgente'));
    // Arrastrar imágenes sobre el punto
    caja.addEventListener('dragover', (ev) => { if ([...(ev.dataTransfer?.items ?? [])].some((x) => x.kind === 'file')) { ev.preventDefault(); caja.classList.add('soltar'); } });
    caja.addEventListener('dragleave', () => caja.classList.remove('soltar'));
    caja.addEventListener('drop', (ev) => { ev.preventDefault(); caja.classList.remove('soltar'); agregarFotos(i, [...ev.dataTransfer.files]); });
    caja.addEventListener('focusin', () => { estado.foco = i; });
    return caja;
  }

  function pintar() { cont.replaceChildren(...estado.puntos.map(tarjeta)); }

  const enviar = el('button', { type: 'submit', class: 'boton boton-primario' }, 'Enviar sugerencia');
  const form = el('form', { class: 'sug-form' },
    el('p', { class: 'sug-ayuda' }, 'Sepárala en puntos: uno por cosa. Puedes pegar pantallazos con Ctrl+V, arrastrarlos o adjuntarlos, y tocarlos para rayarlos.'),
    tipos, cont,
    el('button', { type: 'button', class: 'boton boton-secundario boton-chico sug-mas', onclick: () => { estado.puntos.push(nuevoPunto()); estado.foco = estado.puntos.length - 1; guardar(); pintar(); cont.lastElementChild?.querySelector('textarea')?.focus(); } }, icono('mas', { tam: 14 }), 'Agregar otro punto'),
    el('div', { class: 'sug-pie' }, enviar));

  // Ctrl+V: el pantallazo va al punto donde está escribiendo (o al último)
  form.addEventListener('paste', (ev) => {
    const imgs = [...(ev.clipboardData?.items ?? [])].filter((x) => x.kind === 'file' && x.type.startsWith('image/')).map((x) => x.getAsFile()).filter(Boolean);
    if (!imgs.length) return;
    ev.preventDefault();
    agregarFotos(Math.min(estado.foco, estado.puntos.length - 1), imgs);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (estado.enviando) return;
    const vacios = estado.puntos.findIndex((p) => !p.texto.trim());
    if (vacios >= 0) { avisar(`Escribe el texto del punto ${vacios + 1} (o quítalo).`, 'error'); cont.children[vacios]?.querySelector('textarea')?.focus(); return; }
    estado.enviando = true; enviar.disabled = true; enviar.textContent = 'Enviando…';
    const empresa = empresaId();
    try {
      const puntos = [];
      for (const p of estado.puntos) {
        const imagenes = [];
        for (const f of p.fotos) {
          const ruta = `${empresa}/soporte/${usuarioId}/${crypto.randomUUID()}.jpg`;
          const { error } = await almacen(db).upload(ruta, f.blob, { contentType: f.blob.type || 'image/jpeg', upsert: false });
          if (error) throw new Error(`No se pudo subir un pantallazo: ${error.message}`);
          imagenes.push({ ruta, nombre: f.nombre });
        }
        const d = datosPantalla(p.pantalla);
        puntos.push({ modulo: d?.modulo ?? null, pantalla: d ? p.pantalla : null, pantalla_nombre: d ? `${d.moduloNombre} › ${d.nombre}` : 'General', texto: p.texto.trim(), urgente: p.urgente, imagenes });
      }
      const { data, error } = await db.rpc('sug_enviar', { p_empresa: empresa, p_tipo: estado.tipo, p_puntos: puntos });
      if (error) throw new Error(error.message);
      estado.puntos.forEach((p) => p.fotos.forEach((f) => URL.revokeObjectURL(f.url)));
      borrarBorrador();
      estado.puntos = [nuevoPunto()]; estado.tipo = 'mejora'; pintarTipos(); pintar();
      alEnviar?.(data?.[0]?.numero);
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      estado.enviando = false; enviar.disabled = false; enviar.textContent = 'Enviar sugerencia';
    }
  });

  pintarTipos(); pintar();
  return form;
}

// Las sugerencias de la cuenta, con el estado y la respuesta de cada punto
export async function misSugerencias(db) {
  const { data, error } = await db.from('sug_sugerencias')
    .select('id, numero, tipo, created_at, sug_puntos(id, orden, pantalla_nombre, texto, urgente, estado, respuesta, respondida_at, sug_imagenes(ruta, nombre))')
    .order('created_at', { ascending: false }).limit(30);
  if (error) return el('p', { class: 'texto-error' }, error.message);
  if (!data.length) return el('div', { class: 'sug-vacio' }, icono('chat', { tam: 22 }), el('p', {}, 'Todavía no envías sugerencias.'));
  const rutas = data.flatMap((s) => s.sug_puntos.flatMap((p) => p.sug_imagenes.map((x) => x.ruta)));
  const urls = await urlsFirmadas(db, rutas).catch(() => new Map());
  const tipo = Object.fromEntries(TIPOS);
  return el('div', { class: 'sug-mias' }, ...data.map((s) => el('article', { class: 'sug-mia' },
    el('header', {}, el('strong', {}, `N° ${s.numero}`), el('span', { class: 'texto-suave' }, ` · ${tipo[s.tipo]} · ${new Date(s.created_at).toLocaleDateString('es-CL')}`)),
    ...[...s.sug_puntos].sort((a, b) => a.orden - b.orden).map((p) => el('div', { class: 'sug-mia-punto' },
      el('div', { class: 'sug-mia-fila' }, el('span', { class: `chip ${ESTADOS[p.estado][1]}` }, ESTADOS[p.estado][0]), el('span', { class: 'texto-suave texto-chico' }, p.pantalla_nombre || 'General'), p.urgente ? el('span', { class: 'chip chip-venc' }, 'Urgente') : null),
      el('p', {}, p.texto),
      p.sug_imagenes.length ? el('div', { class: 'sug-fotos' }, ...p.sug_imagenes.map((x) => urls.get(x.ruta) ? el('a', { class: 'sug-foto', href: urls.get(x.ruta), target: '_blank', rel: 'noopener' }, el('img', { src: urls.get(x.ruta), alt: x.nombre ?? 'Pantallazo' })) : null)) : null,
      p.respuesta ? el('div', { class: 'sug-respuesta' }, el('strong', {}, 'Respuesta: '), p.respuesta) : null)))));
}
