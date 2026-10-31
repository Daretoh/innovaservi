// Ficha pública de ingreso: el postulante la llena sin cuenta desde el enlace que le da RRHH.
// URL: /ficha/?t=<token de la empresa>. Envía todo a la Edge Function ficha-ingreso.
import { el } from '../core/ui/dom.js?v=64a4e9f';
import { icono } from '../core/ui/iconos.js?v=64a4e9f';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';

const SECCIONES = [
  ['Tus datos', [
    ['rut', 'RUT', { req: true, ph: '12.345.678-5' }], ['nombres', 'Nombres', { req: true }],
    ['apellido_paterno', 'Apellido paterno', { req: true }], ['apellido_materno', 'Apellido materno'],
    ['fecha_nacimiento', 'Fecha de nacimiento', { tipo: 'date' }],
    ['sexo', 'Sexo', { op: [['', 'Selecciona'], ['F', 'Femenino'], ['M', 'Masculino'], ['X', 'Otro']] }],
    ['nacionalidad', 'Nacionalidad', { ph: 'Chilena' }],
    ['estado_civil', 'Estado civil', { op: [['', 'Selecciona'], ['Soltero/a', 'Soltero/a'], ['Casado/a', 'Casado/a'], ['Conviviente civil', 'Conviviente civil'], ['Divorciado/a', 'Divorciado/a'], ['Viudo/a', 'Viudo/a']] }],
    ['cargo_postula', 'Cargo al que postulas'],
  ]],
  ['Contacto', [
    ['telefono', 'Teléfono', { tipo: 'tel', req: true, ph: '+56 9 …' }], ['email', 'Correo', { tipo: 'email' }],
    ['direccion', 'Calle'], ['numero', 'Número'], ['poblacion', 'Población o villa'],
    ['comuna', 'Comuna'], ['region', 'Región'],
    ['emergencia', 'Contacto de emergencia (nombre y teléfono)'],
  ]],
  ['Previsión y salud', [
    ['afp', 'AFP', { op: [['', 'Selecciona'], ...['Capital', 'Cuprum', 'Habitat', 'Modelo', 'PlanVital', 'ProVida', 'Uno', 'No cotizo en AFP'].map((x) => [x, x])] }],
    ['salud', 'Salud', { op: [['', 'Selecciona'], ['Fonasa', 'Fonasa'], ['Isapre', 'Isapre']] }],
    ['cargas', 'Cargas familiares', { tipo: 'number' }],
    ['discapacidad', '¿Tienes alguna discapacidad registrada? (opcional)'],
  ]],
  ['Datos para el pago', [
    ['banco', 'Banco'], ['tipo_cuenta', 'Tipo de cuenta', { op: [['', 'Selecciona'], ['Cuenta RUT', 'Cuenta RUT'], ['Cuenta corriente', 'Cuenta corriente'], ['Cuenta vista', 'Cuenta vista'], ['Cuenta de ahorro', 'Cuenta de ahorro']] }],
    ['num_cuenta', 'Número de cuenta'],
  ]],
  ['Educación y tallas', [
    ['titulo_educacion', 'Título o nivel de estudios'], ['institucion_titulo', 'Institución'],
    ['talla_ropa', 'Talla de ropa', { op: [['', 'Selecciona'], ...['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'].map((x) => [x, x])] }],
    ['talla_botas', 'Número de calzado', { tipo: 'number' }],
  ]],
];

function campo(id, etiqueta, op = {}) {
  const control = op.op
    ? el('select', { id, name: id, class: 'campo', required: op.req }, op.op.map(([v, t]) => el('option', { value: v }, t)))
    : el('input', { id, name: id, class: 'campo', type: op.tipo ?? 'text', required: op.req, placeholder: op.ph, min: op.tipo === 'number' ? 0 : null });
  return el('div', { class: 'form-fila' }, el('label', { for: id, class: op.req ? 'fp-obligatorio' : null }, etiqueta), control);
}

async function urlFuncion() {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/ficha-ingreso`;
}

function pantalla(...hijos) {
  raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, ...hijos));
}

async function iniciar() {
  let url; let empresa;
  try {
    url = await urlFuncion();
    const r = await fetch(`${url}?t=${encodeURIComponent(token)}`);
    empresa = await r.json();
    if (!r.ok) throw new Error(empresa.error ?? 'Enlace no válido.');
  } catch (e) {
    pantalla(el('h1', {}, 'Ficha de ingreso'), el('p', { class: 'texto-error' }, e.message),
      el('p', { class: 'texto-suave' }, 'Pide un enlace nuevo a la persona de RRHH que te lo envió.'));
    return;
  }
  if (empresa.color) document.documentElement.style.setProperty('--empresa', empresa.color);
  document.title = `Ficha de ingreso · ${empresa.empresa}`;

  const error = el('p', { class: 'texto-error', role: 'alert' });
  const enviar = el('button', { type: 'submit', class: 'boton boton-primario fp-enviar' }, 'Enviar ficha');
  const form = el('form', { novalidate: false },
    SECCIONES.map(([titulo, campos]) => el('section', { class: 'fp-seccion' },
      el('h2', {}, titulo),
      el('div', { class: 'fp-rejilla' }, campos.map(([id, etiqueta, op]) => campo(id, etiqueta, op))))),
    el('section', { class: 'fp-seccion' },
      el('h2', {}, 'Cédula de identidad'),
      el('p', { class: 'texto-suave texto-chico' }, 'Foto o PDF de cada lado, hasta 8 MB. Desde el celular puedes sacar la foto en el momento.'),
      el('div', { class: 'fp-rejilla' },
        el('div', { class: 'form-fila' }, el('label', { for: 'cedula_frente' }, 'Frente'),
          el('input', { id: 'cedula_frente', name: 'cedula_frente', type: 'file', class: 'campo', accept: 'image/*,application/pdf' })),
        el('div', { class: 'form-fila' }, el('label', { for: 'cedula_reverso' }, 'Reverso'),
          el('input', { id: 'cedula_reverso', name: 'cedula_reverso', type: 'file', class: 'campo', accept: 'image/*,application/pdf' })))),
    el('section', { class: 'fp-seccion' },
      el('label', { class: 'fp-consentimiento' },
        el('input', { type: 'checkbox', name: 'consentimiento', value: 'si', required: true }),
        el('span', {},
          `Autorizo a ${empresa.razon_social} a tratar mis datos personales y la imagen de mi cédula con el único fin de gestionar mi incorporación laboral, conforme a la Ley 19.628 y la Ley 21.719. `,
          'Puedo pedir en cualquier momento el acceso, la corrección o la eliminación de mis datos a la empresa.'))),
    el('div', { class: 'fp-trampa', 'aria-hidden': 'true' },
      el('label', {}, 'No llenar', el('input', { name: 'sitio_web', tabindex: '-1', autocomplete: 'off' }))),
    error,
    enviar,
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    enviar.disabled = true;
    enviar.textContent = 'Enviando…';
    const datos = new FormData(form);
    datos.append('t', token);
    try {
      const r = await fetch(url, { method: 'POST', body: datos });
      const cuerpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(cuerpo.error ?? 'No se pudo enviar. Intenta de nuevo.');
      raiz.replaceChildren(el('main', { class: 'fp-listo' },
        icono('check', { tam: 48 }),
        el('h1', {}, 'Ficha enviada'),
        el('p', {}, `Gracias. ${empresa.empresa} revisará tus datos y se pondrá en contacto contigo.`)));
    } catch (e) {
      error.textContent = e.message;
      enviar.disabled = false;
      enviar.textContent = 'Enviar ficha';
    }
  });

  raiz.replaceChildren(el('div', { class: 'ficha-publica' },
    el('header', { class: 'fp-cabecera' },
      el('span', { class: 'fp-sobre' }, 'Ficha de ingreso'),
      el('h1', {}, empresa.empresa),
      el('p', {}, 'Completa tus datos para tu contratación. Los campos con * son obligatorios.')),
    form));
}

iniciar();
