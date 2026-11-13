// Cámara en la página (2026-11-10): sacar varias fotos seguidas sin que la cámara se cierre entre una y otra.
// En Android e iOS, <input type="file" capture> toma una sola foto y vuelve a la página; aquí la cámara queda
// abierta (getUserMedia), cada toque del disparador suma una foto a la tira de abajo (tocarla la quita) y "Listo"
// devuelve todas. Si el navegador no deja usar la cámara, abre la del teléfono (una foto) como antes.
//   const fotos = await tomarFotos({ titulo: 'Fotos: Antes', textoListo: 'Subir' });   // File[] ([] si se cancela)
// Se usa en Reportes (parte y link de la cuadrilla) y en Costos (bandeja por cargar). Estilos .cam-* en estilos.css.
import { el } from './dom.js?v=a35d6c9';
import { icono } from './iconos.js?v=a35d6c9';

const LADO = 2000;   // lado mayor de cada foto (después cada módulo la achica a lo suyo)

// Elige archivos con el selector del sistema (galería, varias). Devuelve File[] ([] si se cancela).
export function elegirArchivos({ accept = 'image/*', multiple = true, capture = null } = {}) {
  return new Promise((ok) => {
    const entrada = el('input', { type: 'file', accept, multiple, capture, hidden: true });
    let listo = false;
    const fin = (lista) => { if (listo) return; listo = true; entrada.remove(); ok(lista); };
    entrada.addEventListener('change', () => fin([...entrada.files]));
    entrada.addEventListener('cancel', () => fin([]));
    document.body.append(entrada);
    entrada.click();
  });
}

export const camaraDisponible = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext !== false;

export async function tomarFotos({ titulo = 'Cámara', textoListo = 'Listo', max = 60 } = {}) {
  if (!camaraDisponible()) return elegirArchivos({ capture: 'environment', multiple: false });
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false });
  } catch {
    // Permiso negado o sin cámara: la cámara del teléfono (una foto)
    return elegirArchivos({ capture: 'environment', multiple: false });
  }

  return new Promise((resolver) => {
    const fotos = [];   // { archivo, url }
    const video = el('video', { class: 'cam-video', playsinline: true, muted: true, autoplay: true });
    video.srcObject = stream;
    video.play().catch(() => {});
    const track = stream.getVideoTracks()[0];
    const cap = track.getCapabilities?.() ?? {};
    try { if (cap.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* sin enfoque */ }

    const contador = el('span', { class: 'cam-contador', 'aria-live': 'polite' });
    const aviso = el('p', { class: 'cam-aviso', hidden: true });
    const tira = el('div', { class: 'cam-tira' });
    const destello = el('div', { class: 'cam-destello' });
    const listo = el('button', { type: 'button', class: 'boton boton-primario cam-listo', disabled: true, onclick: () => cerrar(true) }, icono('check', { tam: 18 }), el('span', {}, textoListo));
    const disparador = el('button', { type: 'button', class: 'cam-disparador', 'aria-label': 'Sacar foto', onclick: () => sacar() });
    let linternaOn = false;
    const linterna = cap.torch ? el('button', { type: 'button', class: 'cam-boton', 'aria-label': 'Linterna', 'aria-pressed': 'false', onclick: async () => {
      linternaOn = !linternaOn;
      try { await track.applyConstraints({ advanced: [{ torch: linternaOn }] }); linterna.setAttribute('aria-pressed', String(linternaOn)); } catch { linternaOn = !linternaOn; }
    } }, icono('sol', { tam: 20 })) : el('span', { class: 'cam-boton cam-hueco' });
    let porDescartar = 0;
    const cerrarBoton = el('button', { type: 'button', class: 'cam-boton', 'aria-label': 'Cerrar la cámara', onclick: () => {
      if (fotos.length && Date.now() - porDescartar > 3000) {
        porDescartar = Date.now();
        mostrarAviso(`Toca de nuevo la X para descartar ${fotos.length === 1 ? 'la foto' : `las ${fotos.length} fotos`}, o toca "${textoListo}".`);
        return;
      }
      cerrar(false);
    } }, icono('cerrar', { tam: 22 }));

    let tAviso = 0;
    const mostrarAviso = (txt) => { aviso.textContent = txt; aviso.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => { aviso.hidden = true; }, 3500); };
    const pintar = () => {
      contador.textContent = fotos.length ? `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}` : 'Toca el botón para sacar cada foto';
      listo.disabled = !fotos.length;
      listo.lastChild.textContent = fotos.length ? `${textoListo} (${fotos.length})` : textoListo;
      tira.replaceChildren(...fotos.map((f, i) => el('button', { type: 'button', class: 'cam-mini', 'aria-label': `Quitar la foto ${i + 1}`, onclick: () => {
        if (f.url) URL.revokeObjectURL(f.url); fotos.splice(fotos.indexOf(f), 1); pintar();
      } }, f.url ? el('img', { src: f.url, alt: '' }) : null, el('span', { class: 'cam-quitar' }, icono('cerrar', { tam: 12 })))));
      tira.scrollLeft = tira.scrollWidth;
    };

    // Cada toque copia el cuadro al instante (los toques rápidos no se pierden); el JPEG se arma después
    let numero = 0;
    const sacar = () => {
      if (!video.videoWidth) return;
      if (fotos.length >= max) { mostrarAviso(`Máximo ${max} fotos por vez. Toca "${textoListo}" y sigue después.`); return; }
      const k = Math.min(1, LADO / Math.max(video.videoWidth, video.videoHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      destello.classList.remove('activo'); void destello.offsetWidth; destello.classList.add('activo');
      navigator.vibrate?.(30);
      const n = ++numero;
      const f = { archivo: null, url: null };
      f.listo = new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88)).then((blob) => {
        if (!blob) { fotos.splice(fotos.indexOf(f), 1); mostrarAviso('No se pudo guardar una foto. Sácala de nuevo.'); pintar(); return; }
        f.archivo = new File([blob], `foto-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}-${n}.jpg`, { type: 'image/jpeg' });
        if (cerrada) return;
        f.url = URL.createObjectURL(blob); pintar();
      });
      fotos.push(f);
      pintar();
    };

    const capa = el('div', { class: 'cam-capa', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      el('div', { class: 'cam-arriba' }, cerrarBoton, el('div', { class: 'cam-titulo' }, el('strong', {}, titulo), contador), linterna),
      el('div', { class: 'cam-visor' }, video, destello, aviso),
      el('div', { class: 'cam-abajo' }, tira,
        el('div', { class: 'cam-controles' }, el('span', { class: 'cam-lado' }), disparador, el('span', { class: 'cam-lado' }, listo))));

    const teclas = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrarBoton.click(); }
      else if ((ev.key === ' ' || ev.key === 'Enter') && ev.target === document.body) { ev.preventDefault(); sacar(); }
    };
    // Si se cambia de pantalla con la cámara abierta, se apaga (sin devolver fotos)
    const alSalir = () => cerrar(false);
    let cerrada = false;
    async function cerrar(conFotos) {
      if (cerrada) return; cerrada = true;
      stream.getTracks().forEach((t) => t.stop());
      document.removeEventListener('keydown', teclas);
      window.removeEventListener('hashchange', alSalir);
      document.documentElement.classList.remove('cam-abierta');
      capa.remove();
      await Promise.all(fotos.map((f) => f.listo));   // las últimas pueden estar armándose
      const lista = fotos.map((f) => f.archivo).filter(Boolean);
      fotos.forEach((f) => { if (f.url) URL.revokeObjectURL(f.url); });
      resolver(conFotos ? lista : []);
    }
    document.addEventListener('keydown', teclas);
    window.addEventListener('hashchange', alSalir);
    document.documentElement.classList.add('cam-abierta');
    document.body.append(capa);
    pintar();
    disparador.focus();
  });
}

// Dos botones listos para una pantalla: "Cámara" (varias seguidas) y "Galería (varias)". alElegir(File[]).
// max: tope de fotos por vez (número o función).
export function botonesFotos({ alElegir, titulo = 'Cámara', textoListo = 'Subir', accept = 'image/*', claseBoton = 'boton', textoCamara = 'Cámara', textoGaleria = 'Galería (varias)', max = 60 }) {
  const valor = (x) => (typeof x === 'function' ? x() : x);
  const camara = el('button', { type: 'button', class: `${claseBoton} boton-primario`, onclick: async () => {
    const lista = await tomarFotos({ titulo: valor(titulo), textoListo, max: valor(max) });
    if (lista.length) alElegir(lista);
  } }, icono('camara', { tam: 18 }), el('span', {}, textoCamara));
  const galeria = el('button', { type: 'button', class: `${claseBoton} boton-secundario`, onclick: async () => {
    const lista = await elegirArchivos({ accept, multiple: true });
    if (lista.length) alElegir(lista);
  } }, icono('carpeta', { tam: 18 }), el('span', {}, textoGaleria));
  return { camara, galeria };
}
