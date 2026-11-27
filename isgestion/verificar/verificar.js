// Verificación pública de una firma electrónica (Núcleo 028). URL: /verificar/?c=<código del sello>.
// El QR de cada sello lleva aquí. Muestra quién firmó qué documento y cuándo, sin mostrar el documento.
// Todo pasa por la Edge Function pública `firmar` (acción `comprobar`); la página no toca la base.
import { el } from '../core/ui/dom.js?v=625a797';
import { icono } from '../core/ui/iconos.js?v=625a797';

const raiz = document.getElementById('app');
let URL_FN = null;
async function comprobar(c) {
  if (!URL_FN) {
    const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
    URL_FN = `${Object.values(organizaciones)[0].supabaseUrl}/functions/v1/firmar`;
  }
  const r = await fetch(URL_FN, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'comprobar', c }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se pudo conectar. Intenta de nuevo.');
  return d;
}
const cuando = (iso) => new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23' }).format(new Date(iso));
const pagina = (sobre, ...hijos) => raiz.replaceChildren(el('main', { class: 'ficha-publica' },
  el('header', { class: 'fp-cabecera' }, el('span', { class: 'fp-sobre' }, sobre), el('h1', {}, 'Verificar firma electrónica')), ...hijos));

function formulario(codigo = '', error = '') {
  const campo = el('input', { class: 'campo vf-codigo', id: 'vf-c', autocomplete: 'off', maxlength: 12, placeholder: 'ABCD2345EF', value: codigo, required: true });
  const b = el('button', { type: 'submit', class: 'boton boton-primario fp-enviar' }, 'Verificar');
  const f = el('form', { class: 'fp-seccion' },
    el('p', {}, 'Escribe el código que aparece en el sello de la firma, o escanea su QR.'),
    el('div', { class: 'form-fila' }, el('label', { for: 'vf-c' }, 'Código de verificación'), campo),
    el('p', { class: 'fi-error', role: 'alert' }, error), b);
  f.addEventListener('submit', (ev) => { ev.preventDefault(); const c = campo.value.trim().toUpperCase(); history.replaceState(null, '', `?c=${encodeURIComponent(c)}`); mostrar(c); });
  pagina('ISgestión', f);
}

async function mostrar(c) {
  pagina('ISgestión', el('div', { class: 'fp-seccion' }, el('p', { class: 'texto-suave' }, 'Buscando la firma…')));
  let d;
  try { d = await comprobar(c); } catch (e) { formulario(c, e.message); return; }
  if (d.color) document.documentElement.style.setProperty('--empresa', d.color);
  const fila = (t, v, clase) => [el('dt', {}, t), el('dd', clase ? { class: clase } : {}, v)];
  pagina(d.empresa || 'ISgestión', el('div', { class: 'fp-seccion' },
    d.vigente
      ? el('div', { class: 'vf-estado ok' }, icono('check', { tam: 22 }), 'Firma válida')
      : el('div', { class: 'vf-estado mal' }, icono('alerta', { tam: 22 }), 'Firma válida, pero el documento fue eliminado'),
    el('dl', { class: 'vf-datos' },
      fila('Firmó', d.firmante),
      fila('RUT', d.rut),
      fila('Documento', d.documento),
      fila('Empresa', [d.empresa, d.empresa_rut].filter(Boolean).join(' · ')),
      fila('Fecha y hora', cuando(d.firmado_at)),
      fila('Identidad', d.verificacion ? `Enlace personal por WhatsApp y ${d.verificacion}` : 'Enlace personal por WhatsApp'),
      fila('Código', d.codigo, 'vf-codigo'),
      d.huella ? fila('Huella del documento (SHA-256)', d.huella, 'vf-huella') : null),
    el('p', { class: 'fi-legal' }, 'Firma electrónica simple (Ley N° 19.799) registrada en ISgestión. La huella identifica el documento tal como estaba al firmarse: cualquier cambio posterior da una huella distinta.')));
}

const c = (new URLSearchParams(location.search).get('c') ?? '').trim().toUpperCase();
if (c) mostrar(c); else formulario();
