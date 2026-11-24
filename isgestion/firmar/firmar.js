// Firma electrónica simple desde el teléfono (Núcleo 026). URL: /firmar/?t=<enlace personal>.
// 1. Confirmar identidad (RUT y fecha de nacimiento de la ficha) · 2. Leer el documento · 3. Firmar (sin dibujar: en el
// PDF queda un sello con nombre, RUT, fecha y hora y un QR para verificarla, Núcleo 028).
// Todo pasa por la Edge Function pública `firmar`; la página no toca la base.
import { el } from '../core/ui/dom.js?v=10113d4';
import { icono } from '../core/ui/iconos.js?v=10113d4';

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
        estado.doc = d.documento; estado.nombre = d.nombre; estado.docs = Array.isArray(d.documentos) && d.documentos.length ? d.documentos : null;
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
  const leido = el('input', { type: 'checkbox', id: 'fi-leido' });
  const aviso = el('p', { class: 'fi-error', role: 'alert' });
  let abrio = false;
  const indicador = pasos(2);
  const marcarPaso = () => indicador.children[2].classList.toggle('on', abrio);
  // Varios documentos (entrega individual): hay que abrir cada uno; una sola firma vale para todos
  const docs = estado.docs;
  const abiertos = new Set();
  const enlaceDoc = docs
    ? el('div', { class: 'fi-docs' },
      el('p', { class: 'texto-suave texto-chico' }, `Son ${docs.length} documentos. Ábrelos uno por uno; cada uno queda marcado como leído. Después firmas una sola vez y tu firma queda en todos.`),
      docs.map((d, k) => {
        const a = el('a', { class: 'fi-doc', href: d.url, target: '_blank', rel: 'noopener', onclick: () => {
          abiertos.add(k); a.classList.add('fi-leido'); a.querySelector('.fi-estado').textContent = 'Leído';
          abrio = abiertos.size === docs.length; marcarPaso();
        } }, icono('documento', { tam: 26 }), el('span', { class: 'fi-doc-t' }, `${k + 1}. ${d.titulo}`), el('small', { class: 'fi-estado' }, 'Abrir'));
        return a;
      }))
    : el('a', { class: 'fi-doc', href: estado.doc, target: '_blank', rel: 'noopener', onclick: () => { abrio = true; marcarPaso(); } },
      icono('documento', { tam: 28 }), el('span', {}, 'Abrir el documento', el('br'), el('small', { class: 'texto-suave' }, i.titulo)));
  const ahora = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(',', '');
  // Así queda en el documento: el QR lleva a la página de verificación de esta firma
  const muestra = el('div', { class: 'fi-sello', 'aria-label': 'Así quedará tu firma en el documento' },
    el('div', { class: 'fi-sello-qr', 'aria-hidden': 'true' }, icono('qr', { tam: 40 })),
    el('div', {}, el('strong', { class: 'fi-sello-tit' }, 'Firmado electrónicamente'), el('strong', {}, estado.nombre),
      el('span', {}, `RUT ${estado.rut}`), el('span', {}, ahora), el('span', {}, 'Código de verificación')));
  const b = el('button', { type: 'button', class: 'boton boton-primario fp-enviar' }, icono('check', { tam: 18 }), 'Firmar');

  pagina(cabecera('Firmar documento', i.titulo),
    el('div', { class: 'fp-seccion' }, indicador,
      el('h2', {}, docs ? '1. Lee los documentos' : '1. Lee el documento'), enlaceDoc,
      el('h2', {}, '2. Firma'),
      el('p', { class: 'texto-suave texto-chico' }, 'No tienes que dibujar nada: en tu casilla del documento queda este sello, con un código QR para verificar la firma.'),
      muestra,
      el('label', { class: 'fp-consentimiento', for: 'fi-leido' }, leido, el('span', {}, docs
        ? `Leí los ${docs.length} documentos y estoy de acuerdo con firmarlos electrónicamente.`
        : `Leí el documento "${i.titulo}" y estoy de acuerdo con firmarlo electrónicamente.`)),
      aviso, b,
      el('p', { class: 'fi-legal' }, 'Firma electrónica simple (Ley N° 19.799). Se guardan la fecha y hora, cómo confirmaste tu identidad y el equipo desde el que firmas, junto a la huella del documento.')));

  b.addEventListener('click', () => {
    aviso.textContent = '';
    if (!abrio) { aviso.textContent = docs ? `Falta abrir ${docs.length - abiertos.size} de los ${docs.length} documentos.` : 'Primero abre y lee el documento.'; return; }
    if (!leido.checked) { aviso.textContent = 'Marca que leíste el documento.'; return; }
    conEspera(b, async () => {
      try {
        const r = await llamar('firmar', { rut: estado.rut, nacimiento: estado.nacimiento, acepto: true });
        mensaje('Documento firmado', `Listo, ${estado.nombre.split(' ')[0] || ''}. Tu firma quedó registrada en "${i.titulo}"${r.codigo ? ` con el código ${r.codigo}` : ''}. Ya puedes cerrar esta página.`, true);
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
