// Tarjeta de cliente (Marketing 007): sellos, premio, hora pedida y visitas del cliente, sin app ni cuenta.
// URL: /tarjeta/?t=<token de la tarjeta>. Lee la Edge Function pública mkt-tarjeta. El cliente la guarda en la pantalla
// de inicio del celular (se explica cómo según el teléfono).
import { el } from '../core/ui/dom.js?v=37c9450';
import { icono } from '../core/ui/iconos.js?v=37c9450';
import { nombreDia, fechaCorta, fechaLarga, dinero } from '../core/ui/formato.js?v=37c9450';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';

async function urlFuncion(nombre) {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/${nombre}`;
}
const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');

function comoGuardar() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const android = /Android/i.test(ua);
  const enApp = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  if (enApp) return null;
  const pasos = ios
    ? ['Abre esta página en Safari.', 'Toca el botón Compartir (el cuadrado con la flecha).', 'Elige "Agregar a pantalla de inicio" y luego "Agregar".']
    : android
      ? ['Toca el menú de Chrome (los tres puntos arriba).', 'Elige "Agregar a la pantalla principal" (o "Instalar").', 'Confirma con "Agregar".']
      : ['Abre este enlace en tu celular.', 'Guárdalo en la pantalla de inicio desde el menú del navegador.'];
  return el('details', { class: 'fp-seccion tj-guardar' },
    el('summary', {}, icono('descargar', { tam: 16 }), ' Guarda tu tarjeta en el celular'),
    el('ol', {}, pasos.map((p) => el('li', {}, p))),
    el('p', { class: 'texto-chico texto-suave' }, 'Queda como un ícono más, sin instalar nada. También puedes guardar el enlace que te enviamos.'));
}

async function iniciar() {
  let t;
  try {
    const r = await fetch(`${await urlFuncion('mkt-tarjeta')}?t=${encodeURIComponent(token)}`);
    t = await r.json();
    if (!r.ok) throw new Error(t.error ?? 'Tarjeta no válida.');
  } catch (e) {
    raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, el('h1', {}, 'Tarjeta de cliente'), el('p', { class: 'texto-error' }, e.message)));
    return;
  }
  if (t.color) document.documentElement.style.setProperty('--empresa', t.color);
  if (t.tema) document.documentElement.dataset.tema = t.tema;   // Performance (taller): grafito y naranja, sin el azul de Innova
  document.title = `Mi tarjeta · ${t.empresa}`;

  const llena = t.sellos >= t.meta;
  const enTarjeta = llena ? t.meta : t.sellos;
  const circulos = Array.from({ length: t.meta }, (_, i) => {
    const ultimo = i === t.meta - 1;
    const puesto = i < enTarjeta;
    return el('span', { class: `tj-sello${puesto ? ' puesto' : ''}${ultimo ? ' premio' : ''}${!llena && i === enTarjeta ? ' siguiente' : ''}`, 'aria-hidden': 'true' },
      puesto ? icono('check', { tam: 22 }) : ultimo ? el('small', {}, 'Premio') : el('small', {}, String(i + 1)));
  });
  const regla = t.modo === 'monto' ? `1 sello por cada ${dinero(t.monto_por_sello)} en servicios` : '1 sello por cada visita';
  const faltan = t.meta - t.sellos;

  const tarjeta = el('section', { class: `tj-tarjeta${llena ? ' completa' : ''}` },
    el('div', { class: 'tj-cab' },
      el('div', {}, el('span', { class: 'fp-sobre' }, 'Tarjeta de cliente'), el('h1', {}, t.empresa)),
      el('div', { class: 'tj-quien' }, el('strong', {}, t.nombre), el('small', {}, `Cliente desde ${fechaLarga(t.desde)}`))),
    el('div', { class: 'tj-sellos', style: `grid-template-columns:repeat(${t.meta <= 6 ? t.meta : t.meta <= 10 ? Math.ceil(t.meta / 2) : 5}, 1fr)`, role: 'img', 'aria-label': `${Math.min(t.sellos, t.meta)} de ${t.meta} sellos` }, circulos),
    el('div', { class: 'tj-barra', 'aria-hidden': 'true' }, el('span', { style: `width:${Math.min(100, (t.sellos / t.meta) * 100)}%` })),
    el('p', { class: 'tj-estado' }, llena
      ? [el('strong', {}, '¡Tienes tu premio!'), ` ${t.premio}. Muestra esta tarjeta en el mesón.`]
      : [el('strong', {}, `${t.sellos} de ${t.meta} sellos.`), ` Te ${faltan === 1 ? 'falta 1 sello' : `faltan ${faltan} sellos`} para: ${t.premio}.`]),
    el('p', { class: 'tj-regla' }, regla, t.vence_meses ? ` · los sellos duran ${t.vence_meses} meses` : '', t.canjes ? ` · premios canjeados: ${t.canjes}` : ''));

  const pedida = t.pedida ? el('section', { class: 'fp-seccion' },
    el('h2', {}, t.pedida.estado === 'confirmada' ? 'Tu próxima hora' : 'Hora pedida, por confirmar'),
    el('p', {}, el('strong', {}, `${nombreDia(t.pedida.fecha)} ${fechaCorta(t.pedida.fecha)} a las ${t.pedida.hora}`))) : null;
  const agendar = t.agenda ? el('a', { class: 'boton boton-primario fp-enviar', href: `../agenda/?t=${t.agenda}` }, icono('calendario', { tam: 18 }), 'Agendar una hora') : null;

  const visitas = el('section', { class: 'fp-seccion' },
    el('h2', {}, 'Tus visitas'),
    t.visitas.length ? el('ul', { class: 'tj-visitas' }, t.visitas.map((v) => el('li', {},
      el('div', {}, el('strong', {}, fechaLarga(v.fecha)), el('span', { class: 'texto-suave texto-chico' }, [v.vehiculo, verPatente(v.patente)].filter(Boolean).join(' · '))),
      el('div', { class: 'tj-visita-der' }, el('span', { class: 'texto-chico' }, v.servicios || ''),
        v.sellos ? el('span', { class: 'tj-mas' }, `+${v.sellos} ${v.sellos === 1 ? 'sello' : 'sellos'}`) : null))))
      : el('p', { class: 'texto-suave' }, 'Aún no hay visitas. Tus sellos aparecen aquí cada vez que te atendemos.'));

  raiz.replaceChildren(el('div', { class: 'ficha-publica tj' },
    tarjeta, pedida, agendar, visitas, comoGuardar(),
    t.condiciones ? el('details', { class: 'fp-seccion' }, el('summary', {}, 'Condiciones'), el('p', { class: 'texto-chico' }, t.condiciones)) : null,
    el('p', { class: 'texto-chico texto-suave tj-pie' }, 'Esta tarjeta es personal: no compartas el enlace.')));
}

iniciar();
