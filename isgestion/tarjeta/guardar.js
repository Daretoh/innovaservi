// Tutorial "Guarda tu tarjeta en el celular" con dibujos paso a paso para iPhone (Safari) y Android (Chrome).
// Los dibujos son SVG propios (no capturas): pantalla del teléfono simplificada con el botón a tocar resaltado en el
// color de la empresa. Abre la pestaña del teléfono que se detecta; en el computador muestra un QR para abrirla en el
// celular. Si la página ya se abrió desde el ícono de inicio, no se muestra.
import { el } from '../core/ui/dom.js?v=6d3f615';
import { icono } from '../core/ui/iconos.js?v=6d3f615';

const QR_JS = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

// Marco común del teléfono: 120 × 220, pantalla clara, barra de estado; "cuerpo" es el contenido de la pantalla
const telefono = (cuerpo) => `<svg viewBox="0 0 120 220" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="116" height="216" rx="16" fill="var(--tj-marco)"/>
  <rect x="7" y="7" width="106" height="206" rx="12" fill="var(--tj-pantalla)"/>
  <rect x="44" y="11" width="32" height="6" rx="3" fill="var(--tj-marco)"/>
  ${cuerpo}</svg>`;
const linea = (x, y, w, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="var(--tj-gris)" opacity="${o}"/>`;
const tarjetaMini = (y = 40) => `<rect x="16" y="${y}" width="88" height="50" rx="7" fill="var(--tj-cab)"/>
  <rect x="16" y="${y}" width="88" height="3" rx="1.5" fill="var(--empresa)"/>
  ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${28 + i * 16}" cy="${y + 30}" r="5.5" fill="${i < 3 ? 'var(--empresa)' : 'none'}" stroke="#fff" stroke-opacity=".5" stroke-dasharray="${i < 3 ? '0' : '2 2'}"/>`).join('')}`;
const toque = (x, y) => `<circle cx="${x}" cy="${y}" r="13" fill="var(--empresa)" opacity=".18"/><circle cx="${x}" cy="${y}" r="13" fill="none" stroke="var(--empresa)" stroke-width="2.5"/>`;
const resaltar = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="var(--empresa)" opacity=".16"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="none" stroke="var(--empresa)" stroke-width="2"/>`;
const texto = (x, y, t, { tam = 7, peso = 600, color = 'var(--tj-texto)', ancla = 'start' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${tam}" font-weight="${peso}" fill="${color}" text-anchor="${ancla}" font-family="Inter, system-ui, sans-serif">${t}</text>`;
// Pantalla de inicio con el ícono nuevo resaltado
const inicio = (redondo) => telefono(`
  <rect x="7" y="7" width="106" height="206" rx="12" fill="#3a3d42"/>
  ${[0, 1, 2, 3].map((f) => [0, 1, 2, 3].map((c) => (f === 1 && c === 2 ? '' : `<rect x="${18 + c * 23}" y="${32 + f * 30}" width="16" height="16" rx="${redondo ? 8 : 4.5}" fill="#fff" opacity=".35"/>`)).join('')).join('')}
  <rect x="64" y="62" width="16" height="16" rx="${redondo ? 8 : 4.5}" fill="var(--tj-cab)"/><circle cx="72" cy="70" r="4" fill="var(--empresa)"/>
  ${toque(72, 70)}
  ${texto(72, 89, 'Mi tarjeta', { tam: 5.5, color: '#fff', ancla: 'middle' })}`);

const PASOS = {
  ios: [
    { t: 'Abre el enlace en <strong>Safari</strong> y toca el botón <strong>Compartir</strong> (el cuadrado con la flecha), abajo al centro.', svg: telefono(`
      ${tarjetaMini()} ${linea(16, 100, 70)} ${linea(16, 110, 54, .6)}
      <rect x="7" y="186" width="106" height="27" fill="var(--tj-barra)"/>
      <path d="M22 199 l-4 0 M98 199 h4" stroke="var(--tj-gris)" stroke-width="2"/>
      <rect x="54" y="195" width="12" height="11" rx="2" fill="none" stroke="#0a84ff" stroke-width="1.6"/>
      <path d="M60 192 v8 M57 194.5 l3 -3 3 3" fill="none" stroke="#0a84ff" stroke-width="1.6" stroke-linecap="round"/>
      ${toque(60, 199)}`) },
    { t: 'Baja en el menú y elige <strong>Agregar a pantalla de inicio</strong>. Si no aparece, toca <strong>Editar acciones</strong> y agrégala.', svg: telefono(`
      <rect x="7" y="7" width="106" height="206" rx="12" fill="#000" opacity=".25"/>
      <rect x="7" y="78" width="106" height="135" rx="12" fill="var(--tj-pantalla)"/>
      ${linea(30, 88, 60, .5)}
      ${['Copiar', 'Agregar a favoritos', 'Agregar a pantalla de inicio', 'Marcar'].map((x, i) => `<rect x="14" y="${100 + i * 24}" width="92" height="19" rx="5" fill="var(--tj-gris)" opacity=".18"/>${texto(20, 112 + i * 24, x, { tam: 6.2, peso: i === 2 ? 700 : 500 })}`).join('')}
      ${resaltar(12, 146, 96, 23)}`) },
    { t: 'Deja el nombre <strong>Mi tarjeta</strong> (o el que quieras) y toca <strong>Agregar</strong>, arriba a la derecha.', svg: telefono(`
      ${texto(16, 32, 'Cancelar', { tam: 6, color: '#0a84ff', peso: 500 })} ${texto(104, 32, 'Agregar', { tam: 6.5, color: '#0a84ff', ancla: 'end' })}
      ${resaltar(78, 23, 30, 14)}
      <rect x="16" y="46" width="22" height="22" rx="5" fill="var(--tj-cab)"/><circle cx="27" cy="57" r="5" fill="var(--empresa)"/>
      <rect x="44" y="50" width="60" height="14" rx="3" fill="var(--tj-gris)" opacity=".18"/>${texto(48, 59.5, 'Mi tarjeta', { tam: 6.2, peso: 500 })}
      ${linea(16, 80, 88, .4)} ${linea(16, 90, 70, .4)}`) },
    { t: 'Listo: tu tarjeta queda como un <strong>ícono</strong> en la pantalla de inicio. Tócalo para ver tus sellos.', svg: inicio(false) },
  ],
  android: [
    { t: 'Abre el enlace en <strong>Chrome</strong> y toca el menú <strong>⋮</strong> (tres puntos), arriba a la derecha.', svg: telefono(`
      <rect x="7" y="19" width="106" height="20" fill="var(--tj-barra)"/>
      <rect x="14" y="24" width="78" height="10" rx="5" fill="var(--tj-gris)" opacity=".25"/>
      ${[0, 1, 2].map((i) => `<circle cx="103" cy="${25 + i * 4}" r="1.4" fill="var(--tj-texto)"/>`).join('')}
      ${toque(103, 29)}
      ${tarjetaMini(48)} ${linea(16, 108, 70)} ${linea(16, 118, 54, .6)}`) },
    { t: 'Elige <strong>Agregar a la pantalla principal</strong> (en algunos teléfonos dice <strong>Instalar app</strong>).', svg: telefono(`
      ${tarjetaMini(48)}
      <rect x="44" y="20" width="66" height="122" rx="6" fill="var(--tj-pantalla)" stroke="var(--tj-gris)" stroke-opacity=".35"/>
      ${['Nueva pestaña', 'Historial', 'Descargas', 'Compartir…', 'Agregar a la pantalla principal', 'Configuración'].map((x, i) => texto(50, 36 + i * 19, x.length > 18 ? 'Agregar a la' : x, { tam: 5.6, peso: i === 4 ? 700 : 500 }) + (i === 4 ? texto(50, 42.5 + i * 19, 'pantalla principal', { tam: 5.6, peso: 700 }) : '')).join('')}
      ${resaltar(46, 104, 62, 17)}`) },
    { t: 'Confirma tocando <strong>Agregar</strong>. Si pregunta, elige <strong>Agregar automáticamente</strong>.', svg: telefono(`
      <rect x="7" y="7" width="106" height="206" rx="12" fill="#000" opacity=".25"/>
      <rect x="16" y="70" width="88" height="72" rx="8" fill="var(--tj-pantalla)"/>
      ${texto(24, 86, 'Agregar a la pantalla', { tam: 6.2, peso: 700 })}
      <rect x="24" y="94" width="14" height="14" rx="7" fill="var(--tj-cab)"/><circle cx="31" cy="101" r="3.3" fill="var(--empresa)"/>
      ${texto(43, 104, 'Mi tarjeta', { tam: 6, peso: 500 })}
      ${texto(60, 132, 'Cancelar', { tam: 6, color: 'var(--tj-gris)', ancla: 'end', peso: 500 })} ${texto(95, 132, 'Agregar', { tam: 6.2, color: 'var(--empresa)', ancla: 'end' })}
      ${resaltar(68, 123, 32, 13)}`) },
    { t: 'Listo: tu tarjeta queda como un <strong>ícono</strong> en la pantalla principal. Tócalo para ver tus sellos.', svg: inicio(true) },
  ],
};

function pasos(cual) {
  return el('ol', { class: 'tj-pasos' }, PASOS[cual].map((p, i) => {
    const dibujo = el('div', { class: 'tj-dibujo' });
    dibujo.innerHTML = p.svg;   // texto fijo de este archivo, sin datos del cliente
    const txt = el('p', {});
    txt.innerHTML = p.t;
    return el('li', {}, dibujo, el('div', { class: 'tj-paso-texto' }, el('span', { class: 'tj-num' }, String(i + 1)), txt));
  }));
}

function cargarQr() {
  if (globalThis.QRCode) return Promise.resolve();
  return new Promise((ok, mal) => { const s = el('script', { src: QR_JS }); s.onload = ok; s.onerror = mal; document.head.append(s); });
}

export function comoGuardar() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  if (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone) return null;
  let actual = ios ? 'ios' : 'android';
  const cuerpo = el('div', {});
  const botones = [['ios', 'iPhone'], ['android', 'Android']].map(([k, n]) => el('button', { type: 'button', role: 'tab', class: 'tj-pestana', onclick: () => { actual = k; pintar(); } }, n));
  const pintar = () => {
    botones.forEach((b, i) => b.setAttribute('aria-selected', String(['ios', 'android'][i] === actual)));
    cuerpo.replaceChildren(pasos(actual), el('p', { class: 'texto-chico tj-nota' }, actual === 'ios'
      ? 'Si abriste el enlace desde WhatsApp o Instagram, primero ábrelo en Safari: menú de la esquina → "Abrir en Safari".'
      : 'Si abriste el enlace desde WhatsApp o Instagram, primero ábrelo en Chrome: menú ⋮ → "Abrir en Chrome".'));
  };
  pintar();

  // En el computador: QR para abrir la tarjeta en el celular
  const enPc = !ios && !android;
  const qr = enPc ? el('div', { class: 'tj-qr' }) : null;
  if (qr) cargarQr().then(() => new globalThis.QRCode(qr, { text: location.href, width: 132, height: 132, correctLevel: globalThis.QRCode.CorrectLevel.M })).catch(() => qr.remove());

  return el('details', { class: 'fp-seccion tj-guardar', open: !enPc },
    el('summary', {}, icono('descargar', { tam: 16 }), ' Guarda tu tarjeta en el celular'),
    el('p', { class: 'texto-chico texto-suave' }, 'Queda como un ícono más en tu teléfono, sin instalar nada ni crear cuenta.'),
    enPc ? el('div', { class: 'tj-qr-caja' }, qr, el('p', { class: 'texto-chico' }, 'Escanea este código con la cámara de tu celular para abrir tu tarjeta ahí, y sigue los pasos.')) : null,
    el('div', { class: 'tj-pestanas', role: 'tablist' }, botones),
    cuerpo);
}
