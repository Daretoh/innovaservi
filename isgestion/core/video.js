// Videos del teléfono (2026-11-13). Hasta el máximo (200 MB en R2) se suben tal cual, con su resolución real.
// Si pasan el máximo se recodifican en el navegador a 1280 px y ~2,5 Mbps: el video se reproduce (sin sonido por el
// parlante) en un canvas que graba MediaRecorder, así que tarda lo que dura el video. Sin soporte avisa con el tamaño.
import { megas } from './adjuntos.js?v=92f4191';

const LADO = 1280;
const BITS = 2_500_000;

const tipoGrabacion = () => ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  .find((t) => globalThis.MediaRecorder?.isTypeSupported?.(t));

export const puedeComprimir = () => !!(tipoGrabacion() && HTMLCanvasElement.prototype.captureStream);

// Devuelve el archivo listo para subir (el mismo o uno comprimido). alProgreso(frac, texto) durante la compresión.
export async function prepararVideo(archivo, { maximo, alProgreso = () => {} } = {}) {
  if (archivo.size <= maximo) return archivo;
  if (!puedeComprimir()) throw new Error(`${archivo.name} pesa ${megas(archivo.size)} y el máximo es ${megas(maximo)}. Este navegador no puede achicarlo: grábalo más corto o en 1080p.`);
  const comprimido = await comprimirVideo(archivo, alProgreso);
  if (comprimido.size > maximo) throw new Error(`${archivo.name}: aun achicado pesa ${megas(comprimido.size)} (máximo ${megas(maximo)}). Grábalo más corto.`);
  return comprimido;
}

export async function comprimirVideo(archivo, alProgreso = () => {}) {
  const tipo = tipoGrabacion();
  const url = URL.createObjectURL(archivo);
  const video = document.createElement('video');
  video.playsInline = true; video.preload = 'auto'; video.src = url;
  // En la página (invisible): iOS y algunos Android no entregan cuadros de un video que no está en el documento
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.append(video);
  let audio = null; let reloj = null;
  try {
    await new Promise((ok, mal) => { video.onloadedmetadata = ok; video.onerror = () => mal(new Error('No se pudo leer el video para achicarlo.')); });
    const escala = Math.min(1, LADO / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * escala / 2) * 2;
    canvas.height = Math.round(video.videoHeight * escala / 2) * 2;
    const g = canvas.getContext('2d');
    const flujo = canvas.captureStream(30);
    // Sonido: del elemento a la grabación, sin pasar por el parlante
    try {
      audio = new AudioContext();
      const destino = audio.createMediaStreamDestination();
      audio.createMediaElementSource(video).connect(destino);
      destino.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
    } catch { audio = null; video.muted = true; }
    const grabador = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: BITS, audioBitsPerSecond: 96_000 });
    const trozos = [];
    grabador.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
    const termino = new Promise((ok) => { grabador.onstop = ok; });
    const duracion = Number.isFinite(video.duration) ? video.duration : null;
    let ultimo = 0;
    const pintar = () => {
      ultimo = performance.now();
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      alProgreso(duracion ? Math.min(1, video.currentTime / duracion) : null, `Achicando ${archivo.name} (${megas(archivo.size)})`);
    };
    const dibujar = () => { pintar(); if (!video.ended && !video.paused) siguiente(); };
    const siguiente = () => (video.requestVideoFrameCallback ? video.requestVideoFrameCallback(dibujar) : requestAnimationFrame(dibujar));
    // Respaldo si la página no pinta (pestaña en segundo plano o pantalla quieta): dibuja con un reloj
    reloj = setInterval(() => { if (performance.now() - ultimo > 100 && !video.paused) pintar(); }, 40);
    await audio?.resume().catch(() => {});
    try { await video.play(); } catch { video.muted = true; await video.play(); }
    grabador.start(1000);
    siguiente();
    await new Promise((ok) => { video.onended = ok; });
    clearInterval(reloj);
    grabador.stop();
    await termino;
    const ext = tipo.startsWith('video/mp4') ? 'mp4' : 'webm';
    return new File(trozos, `${archivo.name.replace(/\.[^.]+$/, '')}.${ext}`, { type: tipo.split(';')[0] });
  } finally {
    clearInterval(reloj); video.pause(); video.remove(); URL.revokeObjectURL(url); audio?.close().catch(() => {});
  }
}
