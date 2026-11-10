// Formulario web de contacto (Marketing): el cliente deja su nombre, teléfono, qué le interesa y su mensaje, sin cuenta.
// URL: /contacto/?t=<token de la empresa>[&c=<código de campaña>]. Envía todo a la Edge Function mkt-formulario, que
// lo deja como contacto nuevo en el Embudo y avisa a quien atiende Marketing. Mismo estilo que la ficha de ingreso.
import { el } from '../core/ui/dom.js?v=0ddac6e';
import { icono } from '../core/ui/iconos.js?v=0ddac6e';
import { revisarTelefono } from '../core/ui/formato.js?v=0ddac6e';

const raiz = document.getElementById('app');
const params = new URLSearchParams(location.search);
const token = params.get('t') ?? '';
const campana = params.get('c') ?? params.get('utm_campaign') ?? '';

async function urlFuncion() {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/mkt-formulario`;
}

const fila = (etiqueta, control, { req = false, ayuda = null } = {}) => el('div', { class: 'form-fila' },
  el('label', { for: control.id, class: req ? 'fp-obligatorio' : null }, etiqueta), control, ayuda);

async function iniciar() {
  let url; let f;
  try {
    url = await urlFuncion();
    const r = await fetch(`${url}?t=${encodeURIComponent(token)}${campana ? `&c=${encodeURIComponent(campana)}` : ''}`);
    f = await r.json();
    if (!r.ok) throw new Error(f.error ?? 'Enlace no válido.');
  } catch (e) {
    raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, el('h1', {}, 'Contacto'), el('p', { class: 'texto-error' }, e.message)));
    return;
  }
  if (f.color) document.documentElement.style.setProperty('--empresa', f.color);
  if (f.tema) document.documentElement.dataset.tema = f.tema;   // Performance (taller): grafito y naranja, sin el azul de Innova
  document.title = `Contacto · ${f.empresa}`;

  const nombre = el('input', { id: 'nombre', class: 'campo', required: true, maxlength: 80, autocomplete: 'name' });
  const telefono = el('input', { id: 'telefono', class: 'campo', type: 'tel', required: true, maxlength: 25, autocomplete: 'tel', placeholder: '+56 9 1234 5678', inputmode: 'tel' });
  const avisoTel = el('span', { class: 'texto-chico', 'aria-live': 'polite' });
  telefono.addEventListener('blur', () => {
    if (!telefono.value.trim()) { avisoTel.textContent = ''; return; }
    const r = revisarTelefono(telefono.value);
    if (r.valor) telefono.value = r.valor;
    avisoTel.textContent = r.aviso && r.grave ? r.aviso : '';
    avisoTel.className = `texto-chico ${r.aviso && r.grave ? 'texto-error' : ''}`;
  });
  const correo = el('input', { id: 'correo', class: 'campo', type: 'email', maxlength: 120, autocomplete: 'email' });
  const vehiculo = f.pide_vehiculo ? el('input', { id: 'vehiculo', class: 'campo', maxlength: 80, placeholder: 'Ej.: Toyota Hilux 2021' }) : null;
  const intereses = (f.intereses ?? []).map((t) => el('label', { class: 'fc-opcion' }, el('input', { type: 'checkbox', name: 'interes', value: t }), el('span', {}, t)));
  const mensaje = Object.assign(el('textarea', { id: 'mensaje', class: 'campo', rows: 4, maxlength: 1000, placeholder: 'Cuéntanos qué necesitas' }));
  const promociones = el('input', { type: 'checkbox', name: 'promociones' });
  const privacidad = el('input', { type: 'checkbox', name: 'privacidad', required: true });
  const condiciones = f.condiciones ? el('input', { type: 'checkbox', name: 'condiciones', required: true }) : null;
  const trampa = el('input', { name: 'sitio_web', tabindex: '-1', autocomplete: 'off' });
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const enviar = el('button', { type: 'submit', class: 'boton boton-primario fp-enviar' }, 'Enviar');

  const form = el('form', {},
    el('section', { class: 'fp-seccion' },
      el('div', { class: 'fp-rejilla' },
        fila('Nombre', nombre, { req: true }),
        fila('Teléfono (WhatsApp)', telefono, { req: true, ayuda: avisoTel }),
        fila('Correo', correo),
        vehiculo ? fila('Tu vehículo (marca, modelo y año)', vehiculo) : null),
      intereses.length ? el('fieldset', { class: 'fc-intereses' }, el('legend', {}, '¿Qué te interesa?'), el('div', { class: 'fc-opciones' }, intereses)) : null,
      fila('Mensaje', mensaje)),
    el('section', { class: 'fp-seccion' },
      condiciones ? el('label', { class: 'fp-consentimiento' }, condiciones, el('span', { class: 'fp-obligatorio' }, f.condiciones)) : null,
      el('label', { class: 'fp-consentimiento' }, promociones, el('span', {}, `Quiero recibir promociones y novedades de ${f.empresa} por WhatsApp (puedo darme de baja cuando quiera).`)),
      el('label', { class: 'fp-consentimiento' }, privacidad,
        el('span', {}, `Autorizo a ${f.razon_social} a usar mis datos solo para responder mi consulta, conforme a la Ley 19.628 y la Ley 21.719. Puedo pedir que los corrijan o eliminen.`))),
    el('div', { class: 'fp-trampa', 'aria-hidden': 'true' }, el('label', {}, 'No llenar', trampa)),
    error, enviar);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    telefono.dispatchEvent(new Event('blur'));
    const r = revisarTelefono(telefono.value);
    if (r.grave) { error.textContent = r.aviso === 'Sin teléfono' ? 'Escribe tu teléfono.' : `Revisa tu teléfono: ${r.aviso}.`; telefono.focus(); return; }
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        t: token, nombre: nombre.value, telefono: telefono.value, correo: correo.value, vehiculo: vehiculo?.value ?? '', mensaje: mensaje.value,
        intereses: intereses.map((x) => x.querySelector('input')).filter((x) => x.checked).map((x) => x.value),
        promociones: promociones.checked, condiciones: condiciones?.checked ?? false, privacidad: privacidad.checked, campana, sitio_web: trampa.value,
      }) });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cuerpo.error ?? 'No se pudo enviar. Intenta de nuevo.');
      raiz.replaceChildren(el('main', { class: 'fp-listo' }, icono('check', { tam: 48 }), el('h1', {}, '¡Mensaje enviado!'),
        el('p', {}, `Gracias, ${nombre.value.trim().split(/\s+/)[0]}. ${f.empresa} te contactará pronto por WhatsApp.`)));
    } catch (e) {
      error.textContent = e.message;
      enviar.disabled = false; enviar.textContent = 'Enviar';
    }
  });

  raiz.replaceChildren(el('div', { class: 'ficha-publica' },
    el('header', { class: 'fp-cabecera' },
      el('span', { class: 'fp-sobre' }, f.campana ?? 'Contacto'),
      el('h1', {}, f.empresa),
      el('p', {}, f.titulo || 'Déjanos tus datos y te contactamos por WhatsApp. Los campos con * son obligatorios.')),
    form));
}

iniciar();
