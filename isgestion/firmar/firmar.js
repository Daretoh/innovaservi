// Firma electrónica simple desde el teléfono (Núcleo 026). URL: /firmar/?t=<enlace personal>.
// 1. Confirmar identidad (RUT y fecha de nacimiento de la ficha) · 2. Leer el documento · 3. Firmar con el dedo.
// Todo pasa por la Edge Function pública `firmar`; la página no toca la base.
import { el } from '../core/ui/dom.js?v=790a885';
import { icono } from '../core/ui/iconos.js?v=790a885';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';
let URL_FN = null;
const estado = { rut: '', nacimiento: '', info: null, doc: null, nombre: '' };

async function llamar(accion, extra = {}) {
  if (!URL_FN) {
    const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
    URL_FN = `${Object.values(organizaciones)[0].supabaseUrl}/functions/v1/firmar`;
  }
  const r = await fetch(URL_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: token, accion, ...extra }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'No se pudo conectar. Revisa tu señal e intenta de nuevo.'); e.firmada = d.firmada; throw e; }
  return d;
}

const pasos = (n) => el('div', { class: 'fi-pasos', 'aria-label': `Paso ${n} de 3` }, [1, 2, 3].map((i) => el('span', { class: i <= n ? 'on' : '' })));
const cabecera = (titulo, sub) => el('header', { class: 'fp-cabecera' },
  el('span', { class: 'fp-sobre' }, estado.info?.empresa ?? 'ISgestión'), el('h1', {}, titulo), sub ? el('p', {}, sub) : null);
const pagina = (...hijos) => raiz.replaceChildren(el('main', { class: 'ficha-publica' }, ...hijos));
const mensaje = (titulo, texto, ok = false) => pagina(cabecera(titulo),
  el('div', { class: 'fp-seccion fp-listo' }, icono(ok ? 'check' : 'alerta', { tam: 40 }), el('p', {}, texto)));
const conEspera = async (b, fn) => { b.disabled = true; b.classList.add('cargando'); try { await fn(); } finally { b.disabled = false; b.classList.remove('cargando'); } };

// ---- Paso 1: identidad
function pasoIdentidad(error = '') {
  const i = estado.info;
  const rut = el('input', { class: 'campo', id: 'fi-rut', inputmode: 'text', autocomplete: 'off', placeholder: '12.345.678-5', value: estado.rut, required: true });
  const nac = i.pide_nacimiento ? el('input', { class: 'campo', id: 'fi-nac', type: 'date', value: estado.nacimiento, required: true }) : null;
  const aviso = el('p', { class: 'fi-error', role: 'alert' }, error);
  const b = el('button', { type: 'submit', class: 'boton boton-primario fp-enviar' }, 'Continuar');
  const form = el('form', { class: 'fp-seccion' }, pasos(1),
    el('h2', {}, `Hola${i.nombre ? `, ${i.nombre}` : ''}`),
    el('p', {}, 'Para firmar, confirma que eres tú con los datos de tu ficha.'),
    el('div', { class: 'form-fila' }, el('label', { for: 'fi-rut', class: 'fp-obligatorio' }, 'Tu RUT'), rut),
    nac ? el('div', { class: 'form-fila' }, el('label', { for: 'fi-nac', class: 'fp-obligatorio' }, 'Tu fecha de nacimiento'), nac) : null,
    aviso, b);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    estado.rut = rut.value.trim(); estado.nacimiento = nac?.value ?? '';
    conEspera(b, async () => {
      try {
        const d = await llamar('verificar', { rut: estado.rut, nacimiento: estado.nacimiento });
        estado.doc = d.documento; estado.nombre = d.nombre;
        pasoFirma();
      } catch (e) { aviso.textContent = e.message; }
    });
  });
  pagina(cabecera('Firmar documento', i.titulo), form);
  rut.focus();
}

// ---- Pasos 2 y 3: leer y firmar
function pasoFirma() {
  const i = estado.info;
  const canvas = el('canvas', { 'aria-label': 'Espacio para firmar con el dedo' });
  const ph = el('div', { class: 'fi-ph' }, 'Firma aquí con el dedo');
  const lienzo = el('div', { class: 'fi-lienzo' }, canvas, el('div', { class: 'fi-guia' }), ph);
  const leido = el('input', { type: 'checkbox', id: 'fi-leido' });
  const aviso = el('p', { class: 'fi-error', role: 'alert' });
  let abrio = false; let trazos = 0;
  const enlaceDoc = el('a', { class: 'fi-doc', href: estado.doc, target: '_blank', rel: 'noopener', onclick: () => { abrio = true; marcarPaso(); } },
    icono('documento', { tam: 28 }), el('span', {}, `Abrir el documento`, el('br'), el('small', { class: 'texto-suave' }, i.titulo)));
  const indicador = pasos(2);
  const marcarPaso = () => indicador.children[2].classList.toggle('on', abrio);
  const b = el('button', { type: 'button', class: 'boton boton-primario fp-enviar' }, 'Firmar');
  const borrar = el('button', { type: 'button', class: 'boton boton-secundario' }, icono('deshacer', { tam: 16 }), 'Borrar');

  pagina(cabecera('Firmar documento', i.titulo),
    el('div', { class: 'fp-seccion' }, indicador,
      el('h2', {}, '1. Lee el documento'), enlaceDoc,
      el('h2', {}, '2. Firma'),
      lienzo,
      el('div', { class: 'fi-fila' }, el('span', { class: 'texto-suave texto-chico' }, estado.nombre), borrar),
      el('label', { class: 'fp-consentimiento', for: 'fi-leido' }, leido, el('span', {}, `Leí el documento "${i.titulo}" y estoy de acuerdo con firmarlo electrónicamente.`)),
      aviso, b,
      el('p', { class: 'fi-legal' }, 'Firma electrónica simple (Ley N° 19.799). Se guardan tu firma, la fecha y hora, y el equipo desde el que firmas, junto al documento.')));

  // Lienzo de firma (alta resolución, trazo continuo)
  const ctx = canvas.getContext('2d');
  const ajustar = () => {
    const r = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * k); canvas.height = Math.round(r.height * k);
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14205c';
    trazos = 0; ph.hidden = false;
  };
  requestAnimationFrame(ajustar);
  let ultimo = null;
  const punto = (ev) => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); canvas.setPointerCapture(ev.pointerId); ultimo = punto(ev); ph.hidden = true; ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = '#14205c'; ctx.fill(); });
  canvas.addEventListener('pointermove', (ev) => {
    if (!ultimo) return; const p = punto(ev);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    trazos += Math.hypot(p.x - ultimo.x, p.y - ultimo.y); ultimo = p;
  });
  const fin = () => { ultimo = null; };
  canvas.addEventListener('pointerup', fin); canvas.addEventListener('pointercancel', fin);
  borrar.addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); trazos = 0; ph.hidden = false; });

  // Firma recortada a lo dibujado (PNG transparente)
  const firmaPng = () => {
    const { width: W, height: H } = canvas; const d = ctx.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const m = 6; x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
    const c = document.createElement('canvas'); const k = Math.min(1, 600 / (x1 - x0 + 1));
    c.width = Math.round((x1 - x0 + 1) * k); c.height = Math.round((y1 - y0 + 1) * k);
    c.getContext('2d').drawImage(canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  };

  b.addEventListener('click', () => {
    aviso.textContent = '';
    if (!abrio) { aviso.textContent = 'Primero abre y lee el documento.'; return; }
    if (trazos < 40) { aviso.textContent = 'Dibuja tu firma en el recuadro.'; return; }
    if (!leido.checked) { aviso.textContent = 'Marca que leíste el documento.'; return; }
    conEspera(b, async () => {
      try {
        await llamar('firmar', { rut: estado.rut, nacimiento: estado.nacimiento, firma: firmaPng(), acepto: true });
        mensaje('Documento firmado', `Listo, ${estado.nombre.split(' ')[0] || ''}. Tu firma quedó registrada en "${i.titulo}". Ya puedes cerrar esta página.`, true);
      } catch (e) { aviso.textContent = e.message; }
    });
  });
}

(async () => {
  try {
    const d = await llamar('ver');
    estado.info = d;
    if (d.color) document.documentElement.style.setProperty('--empresa', d.color);
    if (d.tema) document.documentElement.dataset.tema = d.tema;
    pasoIdentidad();
  } catch (e) {
    mensaje(e.firmada ? 'Documento firmado' : 'No se puede firmar', e.message, !!e.firmada);
  }
})();
