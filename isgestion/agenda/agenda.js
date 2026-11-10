// Agenda en línea (Marketing): el cliente elige servicio, día y hora con cupo, deja sus datos y su vehículo, y puede
// inscribirse como cliente. URL: /agenda/?t=<token del formulario web>. La hora queda pedida: el taller la confirma.
// Envía todo a la Edge Function pública mkt-agenda. Mismo estilo que la ficha de ingreso y el formulario de contacto.
import { el } from '../core/ui/dom.js?v=0ddac6e';
import { icono } from '../core/ui/iconos.js?v=0ddac6e';
import { revisarTelefono, nombreDia, fechaCorta } from '../core/ui/formato.js?v=0ddac6e';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';
const MARCAS = ['Audi', 'BMW', 'BYD', 'Chery', 'Chevrolet', 'Citroën', 'Dodge', 'Ford', 'GWM', 'Haval', 'Honda', 'Hyundai', 'JAC', 'Jeep', 'Kia',
  'Land Rover', 'Mahindra', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG', 'Mitsubishi', 'Nissan', 'Peugeot', 'RAM', 'Renault', 'Subaru', 'Suzuki',
  'Toyota', 'Volkswagen', 'Volvo'];

async function urlFuncion() {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/mkt-agenda`;
}

const fila = (etiqueta, control, { req = false, ayuda = null } = {}) => el('div', { class: 'form-fila' },
  el('label', { for: control.id, class: req ? 'fp-obligatorio' : null }, etiqueta), control, ayuda);
const opcion = (nombre, valor, texto, extra = null) => el('label', { class: 'fc-opcion' },
  el('input', { type: 'radio', name: nombre, value: valor, required: true }), el('span', {}, texto, extra));
const elegido = (form, nombre) => form.querySelector(`input[name="${nombre}"]:checked`)?.value ?? '';

function errorPantalla(msj) {
  raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, el('h1', {}, 'Agenda tu hora'), el('p', { class: 'texto-error' }, msj)));
}

async function iniciar() {
  let url; let a;
  try {
    url = await urlFuncion();
    const r = await fetch(`${url}?t=${encodeURIComponent(token)}`);
    a = await r.json();
    if (!r.ok) throw new Error(a.error ?? 'Enlace no válido.');
  } catch (e) { errorPantalla(e.message); return; }
  if (a.color) document.documentElement.style.setProperty('--empresa', a.color);
  if (a.tema) document.documentElement.dataset.tema = a.tema;   // Performance (taller): grafito y naranja, sin el azul de Innova
  document.title = `Agenda tu hora · ${a.empresa}`;

  // Paso 1: servicio · Paso 2: día y hora · Paso 3: datos
  const servicios = a.servicios.length ? el('fieldset', { class: 'fc-intereses' }, el('legend', { class: 'fp-obligatorio' }, '¿Qué servicio necesitas?'),
    el('div', { class: 'fc-opciones' }, a.servicios.map((s) => opcion('servicio', s.id, s.nombre, s.duracion ? el('small', { class: 'ag-dur' }, ` · ${s.duracion}`) : null)))) : null;

  const horas = el('div', { class: 'fc-opciones ag-horas', 'aria-live': 'polite' });
  const pintarHoras = (fecha) => {
    const d = a.dias.find((x) => x.fecha === fecha);
    horas.replaceChildren(...(d ? d.horas.map((h) => opcion('hora', h, h)) : [el('p', { class: 'texto-suave texto-chico' }, 'Elige primero un día.')]));
  };
  const dias = el('div', { class: 'ag-dias', role: 'radiogroup', 'aria-label': 'Día' }, a.dias.map((d) => {
    const input = el('input', { type: 'radio', name: 'fecha', value: d.fecha, required: true });
    input.addEventListener('change', () => pintarHoras(d.fecha));
    return el('label', { class: 'ag-dia' }, input,
      el('span', {}, el('small', {}, nombreDia(d.fecha).slice(0, 3)), el('strong', {}, String(Number(d.fecha.slice(8)))), el('small', {}, fechaCorta(d.fecha).split(' ')[1])));
  }));
  pintarHoras(null);

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
  const marca = el('input', { id: 'marca', class: 'campo', maxlength: 40, list: 'ag-marcas', autocomplete: 'off', required: true, placeholder: 'Ej.: Toyota' });
  const modelo = el('input', { id: 'modelo', class: 'campo', maxlength: 60, required: true, placeholder: 'Ej.: Hilux' });
  const anio = el('input', { id: 'anio', class: 'campo', inputmode: 'numeric', maxlength: 4, pattern: '\\d{4}', placeholder: 'Ej.: 2021' });
  const patente = el('input', { id: 'patente', class: 'campo', maxlength: 10, placeholder: 'Ej.: ABCD12', autocapitalize: 'characters' });
  patente.addEventListener('input', () => { patente.value = patente.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  const nota = el('textarea', { id: 'nota', class: 'campo', rows: 3, maxlength: 600, placeholder: 'Algo que debamos saber (opcional)' });
  const inscribirse = el('input', { type: 'checkbox', name: 'inscribirse', checked: true });
  const promociones = el('input', { type: 'checkbox', name: 'promociones' });
  const privacidad = el('input', { type: 'checkbox', name: 'privacidad', required: true });
  const trampa = el('input', { name: 'sitio_web', tabindex: '-1', autocomplete: 'off' });
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const enviar = el('button', { type: 'submit', class: 'boton boton-primario fp-enviar' }, 'Pedir hora');

  const form = el('form', {},
    servicios ? el('section', { class: 'fp-seccion' }, servicios) : null,
    el('section', { class: 'fp-seccion' },
      el('h2', {}, 'Día y hora'),
      a.dias.length ? dias : el('p', { class: 'texto-suave' }, 'Por ahora no quedan horas disponibles. Escríbenos por WhatsApp y te buscamos un espacio.'),
      a.dias.length ? horas : null),
    el('section', { class: 'fp-seccion' },
      el('h2', {}, 'Tus datos'),
      el('div', { class: 'fp-rejilla' },
        fila('Nombre y apellido', nombre, { req: true }),
        fila('Teléfono (WhatsApp)', telefono, { req: true, ayuda: avisoTel }),
        fila('Correo', correo)),
      el('h2', {}, 'Tu vehículo'),
      el('div', { class: 'fp-rejilla' },
        fila('Marca', marca, { req: true }), fila('Modelo', modelo, { req: true }), fila('Año', anio), fila('Patente', patente)),
      el('datalist', { id: 'ag-marcas' }, MARCAS.map((m) => el('option', { value: m }))),
      fila('Comentario', nota)),
    el('section', { class: 'fp-seccion ag-socio' },
      el('label', { class: 'fp-consentimiento' }, inscribirse, el('span', {}, el('strong', {}, 'Inscribirme como cliente'),
        el('br'), a.beneficios || `Guardamos tu historial y tu vehículo para atenderte más rápido, y recibes los beneficios de clientes de ${a.empresa}.`)),
      el('label', { class: 'fp-consentimiento' }, promociones, el('span', {}, `Quiero recibir promociones y novedades de ${a.empresa} por WhatsApp o correo (puedo darme de baja cuando quiera).`)),
      el('label', { class: 'fp-consentimiento' }, privacidad,
        el('span', { class: 'fp-obligatorio' }, `Autorizo a ${a.razon_social} a usar mis datos para agendar y atenderme, conforme a la Ley 19.628 y la Ley 21.719. Puedo pedir que los corrijan o eliminen.`))),
    el('div', { class: 'fp-trampa', 'aria-hidden': 'true' }, el('label', {}, 'No llenar', trampa)),
    error, a.dias.length ? enviar : null);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    telefono.dispatchEvent(new Event('blur'));
    const r = revisarTelefono(telefono.value);
    if (r.grave) { error.textContent = r.aviso === 'Sin teléfono' ? 'Escribe tu teléfono.' : `Revisa tu teléfono: ${r.aviso}.`; telefono.focus(); return; }
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        t: token, servicio_id: elegido(form, 'servicio') || null, fecha: elegido(form, 'fecha'), hora: elegido(form, 'hora'),
        nombre: nombre.value, telefono: telefono.value, correo: correo.value, marca: marca.value, modelo: modelo.value, anio: anio.value, patente: patente.value,
        nota: nota.value, inscribirse: inscribirse.checked, promociones: promociones.checked, privacidad: privacidad.checked, sitio_web: trampa.value,
      }) });
      const c = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(c.error ?? 'No se pudo agendar. Intenta de nuevo.');
      const serv = a.servicios.find((s) => s.id === elegido(form, 'servicio'));
      raiz.replaceChildren(el('main', { class: 'fp-listo' }, icono('check', { tam: 48 }), el('h1', {}, '¡Hora pedida!'),
        el('p', {}, el('strong', {}, `${nombreDia(c.fecha)} ${fechaCorta(c.fecha)} a las ${c.hora}`), serv ? ` · ${serv.nombre}` : ''),
        el('p', {}, `Gracias, ${((n) => n.charAt(0).toUpperCase() + n.slice(1).toLowerCase())(nombre.value.trim().split(/\s+/)[0])}.${a.empresa} te confirmará la hora por WhatsApp.`),
        c.tarjeta ? el('a', { class: 'boton boton-primario fp-enviar', href: `../tarjeta/?t=${c.tarjeta}` }, 'Ver mi tarjeta de cliente') : null,
        c.tarjeta ? el('p', { class: 'texto-suave texto-chico' }, 'Guárdala en la pantalla de inicio de tu celular: ahí verás tus sellos.')
          : c.inscrito ? el('p', { class: 'texto-suave' }, 'Ya estás inscrito como cliente: tu tarjeta te la enviamos por WhatsApp.') : null));
    } catch (e) {
      error.textContent = e.message;
      enviar.disabled = false; enviar.textContent = 'Pedir hora';
    }
  });

  raiz.replaceChildren(el('div', { class: 'ficha-publica' },
    el('header', { class: 'fp-cabecera' },
      el('span', { class: 'fp-sobre' }, 'Agenda tu hora'),
      el('h1', {}, a.empresa),
      el('p', {}, a.titulo || 'Elige el servicio, el día y la hora. Te confirmamos por WhatsApp. Los campos con * son obligatorios.')),
    form));
}

iniciar();
