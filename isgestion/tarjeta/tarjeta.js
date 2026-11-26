// Tarjeta de cliente (Marketing 007): sellos, premio, hora pedida y visitas del cliente, sin app ni cuenta.
// URL: /tarjeta/?t=<token de la tarjeta>. Lee la Edge Function pública mkt-tarjeta. El cliente la guarda en la pantalla
// de inicio del celular (se explica cómo según el teléfono).
import { el } from '../core/ui/dom.js?v=6f116b3';
import { icono } from '../core/ui/iconos.js?v=6f116b3';
import { nombreDia, fechaCorta, fechaLarga, dinero } from '../core/ui/formato.js?v=6f116b3';
import { comoGuardar } from './guardar.js?v=6f116b3';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';

async function urlFuncion(nombre) {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/${nombre}`;
}
// Sesión de ISgestión en este navegador (mismo sitio: Supabase la guarda como sb-<proyecto>-auth-token)
function haySesion() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^sb-.+-auth-token$/.test(k) && JSON.parse(localStorage.getItem(k) || 'null')?.access_token) return true;
    }
  } catch { /* sin almacenamiento */ }
  return false;
}
const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');

// Ícono de la pantalla de inicio: se dibuja con los colores de la empresa (iPhone usa apple-touch-icon; Android el ícono)
function iconoInicio(empresa) {
  try {
    const css = getComputedStyle(document.documentElement);
    const c = document.createElement('canvas'); c.width = c.height = 180;
    const g = c.getContext('2d');
    g.fillStyle = css.getPropertyValue('--fp-cab').trim() || '#1f2124'; g.fillRect(0, 0, 180, 180);
    g.fillStyle = css.getPropertyValue('--empresa').trim() || '#ff6b00'; g.fillRect(0, 0, 180, 10);
    g.beginPath(); g.arc(90, 96, 52, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '800 44px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(empresa.split(/s+/).filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || 'MI', 90, 98);
    const url = c.toDataURL('image/png');
    for (const rel of ['apple-touch-icon', 'icon']) document.head.append(Object.assign(document.createElement('link'), { rel, href: url, sizes: '180x180' }));
  } catch { /* sin ícono propio */ }
}

// Google Wallet (Marketing 015): en Android y PC; en iPhone se guarda en la pantalla de inicio (Apple Wallet es aparte)
function botonWallet() {
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return null;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('aria-hidden', 'true');
  for (const [d, c] of [['M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1H3z', '#4285f4'], ['M3 9h16v2H3z', '#34a853'], ['M3 12h16v2H3z', '#fbbc04'], ['M3 15h18v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', '#ea4335']]) {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); p.setAttribute('fill', c); svg.append(p);
  }
  const estado = el('p', { class: 'texto-chico tj-wallet-estado', 'aria-live': 'polite' });
  const b = el('button', { type: 'button', class: 'tj-wallet' }, svg, el('span', {}, 'Agregar a Google Wallet'));
  b.addEventListener('click', async () => {
    b.disabled = true; estado.textContent = 'Preparando tu tarjeta…';
    try {
      const r = await fetch(await urlFuncion('mkt-wallet'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error ?? 'No se pudo preparar la tarjeta.');
      estado.textContent = '';
      location.href = d.url;
    } catch (e) { estado.textContent = e.message; } finally { b.disabled = false; }
  });
  return el('div', { class: 'tj-wallet-caja' }, b, estado);
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
  // QR escaneado en el taller (&q=1): si en este navegador hay sesión de ISgestión, se abre la ficha del cliente en la
  // app (Taller → Tarjeta de cliente) en su empresa. El cliente, sin sesión, sigue viendo su tarjeta.
  if (new URLSearchParams(location.search).get('q') === '1' && haySesion()) {
    try { localStorage.setItem('isg.empresa', t.empresa_id); } catch { /* sin almacenamiento */ }
    location.replace(`../#/taller.tarjeta?t=${encodeURIComponent(token)}`);
    return;
  }
  if (t.color) document.documentElement.style.setProperty('--empresa', t.color);
  if (t.tema) document.documentElement.dataset.tema = t.tema;
  // Diseño oscuro tipo tarjeta de socio (pedido de Enzo 2026-11-20: más negro que naranja, más trabajado)
  document.documentElement.classList.add('tj-oscuro');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0a0b');
  document.title = `Mi tarjeta · ${t.empresa}`;
  iconoInicio(t.empresa);

  const llena = t.sellos >= t.meta;
  const enTarjeta = Math.min(t.sellos, t.meta);
  const faltan = Math.max(0, t.meta - t.sellos);
  const regla = t.modo === 'monto' ? `1 sello por cada ${dinero(t.monto_por_sello)} en servicios` : '1 sello por cada visita';
  const numero = String(t.numero ?? '').replace(/(.{4})(?=.)/g, '$1 ');
  const mesAnio = new Date(`${t.desde}T12:00:00`).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }).replace('.', '');

  // 1 · Tarjeta de socio (proporción de tarjeta física)
  const logo = el('img', { class: 'tj-logo', alt: '', src: `${await urlFuncion('mkt-wallet')}?logo=${t.empresa_id}` });
  logo.addEventListener('error', () => logo.replaceWith(el('span', { class: 'tj-logo tj-logo-letras' }, t.empresa.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase())));
  const club = el('section', { class: `tj-club${llena ? ' completa' : ''}`, 'aria-label': 'Tarjeta de cliente' },
    el('div', { class: 'tj-club-cab' }, logo,
      el('div', { class: 'tj-club-marca' }, el('strong', {}, t.empresa), el('span', {}, 'Tarjeta de cliente')),
      el('span', { class: 'tj-club-cuenta' }, el('strong', {}, String(enTarjeta)), el('small', {}, `/${t.meta}`))),
    el('div', { class: 'tj-club-pie' },
      el('div', {}, el('small', {}, 'Socio'), el('strong', { class: 'tj-club-nombre' }, t.nombre)),
      el('div', { class: 'tj-club-der' }, el('small', {}, `Desde ${mesAnio}`), el('span', { class: 'tj-club-num' }, numero))));

  // 2 · Sellos
  const sellos = Array.from({ length: t.meta }, (_, i) => {
    const ultimo = i === t.meta - 1;
    const puesto = i < enTarjeta;
    return el('span', { class: `tj-sello${puesto ? ' puesto' : ''}${ultimo ? ' premio' : ''}${!llena && i === enTarjeta ? ' siguiente' : ''}`, style: `--i:${i}`, 'aria-hidden': 'true' },
      puesto ? icono('check', { tam: 22 }) : ultimo ? estrella() : el('small', {}, String(i + 1)));
  });
  const cols = t.meta <= 5 ? t.meta : t.meta <= 8 ? 4 : 5;
  const panelSellos = el('section', { class: 'tj-panel tj-progreso' },
    el('div', { class: 'tj-panel-cab' },
      el('h2', {}, 'Tus sellos'),
      el('span', { class: 'tj-cifra' }, el('strong', {}, String(enTarjeta)), ` de ${t.meta}`)),
    el('div', { class: 'tj-sellos', style: `grid-template-columns:repeat(${cols}, 1fr)`, role: 'img', 'aria-label': `${enTarjeta} de ${t.meta} sellos` }, sellos),
    el('div', { class: 'tj-barra', 'aria-hidden': 'true' }, el('span', { style: `width:${Math.min(100, (t.sellos / t.meta) * 100)}%` })),
    el('p', { class: 'tj-estado' }, llena ? [el('strong', {}, '¡Completaste tu tarjeta!'), ' Muéstrala en el mesón y canjea tu premio.']
      : faltan === 1 ? [el('strong', {}, '¡Te falta solo 1 sello!'), ' Tu próxima visita trae el premio.']
        : [el('strong', {}, `Te faltan ${faltan} sellos`), ' para tu premio.']));

  // 3 · Premio
  const premio = el('section', { class: `tj-panel tj-premio${llena ? ' listo' : ''}` },
    el('span', { class: 'tj-premio-icono', 'aria-hidden': 'true' }, estrella()),
    el('div', {}, el('small', {}, llena ? 'Premio disponible' : 'Tu premio'), el('strong', {}, t.premio),
      el('span', { class: 'tj-premio-regla' }, regla, t.vence_meses ? ` · los sellos duran ${t.vence_meses} meses` : '', t.canjes ? ` · canjeados: ${t.canjes}` : '')));

  // 4 · Hora pedida y acciones
  const pedida = t.pedida ? el('section', { class: 'tj-panel tj-hora' },
    el('span', { class: 'tj-hora-icono', 'aria-hidden': 'true' }, icono('calendario', { tam: 20 })),
    el('div', {}, el('small', {}, t.pedida.estado === 'confirmada' ? 'Tu próxima hora' : 'Hora pedida, por confirmar'),
      el('strong', {}, `${nombreDia(t.pedida.fecha)} ${fechaCorta(t.pedida.fecha)} · ${t.pedida.hora}`))) : null;
  const acciones = el('div', { class: 'tj-acciones' },
    t.agenda ? el('a', { class: 'tj-boton tj-boton-principal', href: `../agenda/?t=${t.agenda}` }, icono('calendario', { tam: 18 }), 'Agendar una hora') : null,
    botonWallet());

  // 5 · Visitas
  const visitas = el('section', { class: 'tj-panel' },
    el('h2', {}, 'Tus visitas'),
    t.visitas.length ? el('ol', { class: 'tj-visitas' }, t.visitas.map((v) => el('li', {},
      el('span', { class: 'tj-visita-punto', 'aria-hidden': 'true' }),
      el('div', { class: 'tj-visita-txt' }, el('strong', {}, fechaLarga(v.fecha)),
        el('span', {}, [v.servicios, [v.vehiculo, verPatente(v.patente)].filter(Boolean).join(' · ')].filter(Boolean).join(' — '))),
      v.sellos ? el('span', { class: 'tj-mas' }, `+${v.sellos}`) : null)))
      : el('p', { class: 'tj-vacio' }, 'Aún no hay visitas. Cada vez que te atendamos, tu sello aparece aquí.'));

  // Quien escanea en el taller sin sesión en este navegador (por ejemplo, la cámara del iPhone abre Safari)
  const taller = new URLSearchParams(location.search).get('q') === '1'
    ? el('a', { class: 'tj-taller', href: `../#/taller.tarjeta?t=${encodeURIComponent(token)}`, onclick: () => { try { localStorage.setItem('isg.empresa', t.empresa_id); } catch { /* nada */ } } },
      '¿Eres del taller? Abrir en ISgestión') : null;

  raiz.replaceChildren(el('div', { class: 'ficha-publica tj' },
    club, panelSellos, premio, pedida, acciones, visitas, comoGuardar(),
    t.condiciones ? el('details', { class: 'tj-panel' }, el('summary', {}, 'Condiciones'), el('p', { class: 'texto-chico' }, t.condiciones)) : null,
    taller,
    el('p', { class: 'tj-pie' }, 'Esta tarjeta es personal: no compartas el enlace.')));
}

// Estrella del premio (SVG propio)
function estrella() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '22'); svg.setAttribute('height', '22'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', 'M12 2.8l2.75 5.57 6.15.9-4.45 4.33 1.05 6.12L12 16.83l-5.5 2.9 1.05-6.13L3.1 9.27l6.15-.9z');
  p.setAttribute('fill', 'currentColor');
  svg.append(p);
  return svg;
}

iniciar();
