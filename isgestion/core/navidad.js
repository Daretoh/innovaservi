// Decoración de Navidad: nieve que cae sobre las pantallas y una guirnalda de luces bajo la barra superior.
// 2026-11-26: Enzo la descartó para todo ISgestión (no se enciende sola ni hay copo en la barra). Queda solo para grabar
// videos de marketing: ?navidad=1 en la dirección la enciende en ese navegador (isg.navidad) y ?navidad=0 la apaga.
// No toca datos ni estilos de la app: todo va en una capa encima que no recibe clics (pointer-events: none).
import { icono } from './ui/iconos.js?v=5ec3c84';

const CLAVE = 'isg.navidad';
// Sin temporada automática (Enzo, 2026-11-26): si algún día se quiere en diciembre, devolver getMonth() === 11
const esDiciembre = () => false;
const preferencia = () => { try { return localStorage.getItem(CLAVE); } catch { return null; } };

export function navidadActiva() {
  try {
    const q = new URLSearchParams(location.search).get('navidad');
    if (q === '0' || q === '1') localStorage.setItem(CLAVE, q);
  } catch { /* sin almacenamiento: vale lo del mes */ }
  const p = preferencia();
  return p === '1' || (p !== '0' && esDiciembre());
}

const CSS = `
.nav-capa { position: fixed; inset: 0; pointer-events: none; z-index: 9000; }
.nav-capa[hidden] { display: none; }
.nav-nieve { position: absolute; inset: 0; width: 100%; height: 100%; }
.nav-guirnalda { position: absolute; left: 0; right: 0; height: 34px; top: 0; overflow: visible; }
.nav-guirnalda svg { display: block; width: 100%; height: 34px; overflow: visible; }
.nav-foco { animation: nav-brillo 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes nav-brillo { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .nav-foco { animation: none; } .nav-nieve { display: none; } }
@media print { .nav-capa { display: none; } }
`;

const COLORES = ['#e23b3b', '#ffc83d', '#2fb36b', 'var(--empresa, #ff6b00)', '#5ab4ff'];
let capa = null, seguirNieve = null;

export function iniciarNavidad() {
  if (navidadActiva()) encender();
}

function encender() {
  if (capa) { capa.hidden = false; seguirNieve?.(); return; }
  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.append(estilo);
  capa = document.createElement('div');
  capa.className = 'nav-capa';
  capa.setAttribute('aria-hidden', 'true');
  const lienzo = document.createElement('canvas');
  lienzo.className = 'nav-nieve';
  const guirnalda = document.createElement('div');
  guirnalda.className = 'nav-guirnalda';
  capa.append(lienzo, guirnalda);
  document.body.append(capa);
  seguirNieve = nieve(lienzo);
  luces(guirnalda);
}

function apagar() { if (capa) capa.hidden = true; }

// Copo en la barra superior: solo en diciembre (o si alguien la encendió con ?navidad=1)
export function botonNavidad() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'boton-icono solo-escritorio';
  b.append(icono('copo'));
  const pintar = () => {
    const on = navidadActiva();
    b.title = on ? 'Decoración de Navidad: encendida (toca para apagar)' : 'Decoración de Navidad: apagada (toca para encender)';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(on));
    b.style.opacity = on ? '' : '.55';
  };
  b.hidden = !esDiciembre() && preferencia() !== '1';
  b.addEventListener('click', () => {
    const on = !navidadActiva();
    // Encender en diciembre vuelve a "según el mes" (así no sigue nevando en enero); fuera de diciembre queda forzada
    try { if (on && esDiciembre()) localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, on ? '1' : '0'); } catch { /* dura hasta recargar */ }
    if (on) encender(); else apagar();
    pintar();
  });
  pintar();
  return b;
}

// Guirnalda: un cable ondulado con focos que titilan a destiempo, pegada al borde inferior de la barra superior.
function luces(caja) {
  const NS = 'http://www.w3.org/2000/svg';
  const dibujar = () => {
    const ancho = window.innerWidth;
    const paso = 46;
    const n = Math.ceil(ancho / paso) + 1;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${ancho} 34`);
    svg.setAttribute('preserveAspectRatio', 'none');
    let d = 'M0 4';
    for (let i = 0; i < n; i++) d += ` Q${i * paso + paso / 2} 18 ${(i + 1) * paso} 4`;
    const cable = document.createElementNS(NS, 'path');
    cable.setAttribute('d', d);
    cable.setAttribute('fill', 'none');
    cable.setAttribute('stroke', '#2c3e2f');
    cable.setAttribute('stroke-width', '1.6');
    svg.append(cable);
    for (let i = 0; i < n; i++) {
      const x = i * paso + paso / 2, y = 11;
      const color = COLORES[i % COLORES.length];
      const g = document.createElementNS(NS, 'g');
      const casquillo = document.createElementNS(NS, 'rect');
      Object.entries({ x: x - 2.5, y: y - 1, width: 5, height: 4, rx: 1, fill: '#4a4a4a' }).forEach(([k, v]) => casquillo.setAttribute(k, v));
      const halo = document.createElementNS(NS, 'ellipse');
      Object.entries({ cx: x, cy: y + 9, rx: 9, ry: 10, fill: color, opacity: .25, class: 'nav-foco' }).forEach(([k, v]) => halo.setAttribute(k, v));
      const foco = document.createElementNS(NS, 'ellipse');
      Object.entries({ cx: x, cy: y + 8, rx: 4, ry: 6, fill: color, class: 'nav-foco' }).forEach(([k, v]) => foco.setAttribute(k, v));
      const demora = `${-((i * 0.37) % 2.4).toFixed(2)}s`;
      halo.style.animationDelay = demora; foco.style.animationDelay = demora;
      g.append(halo, casquillo, foco);
      svg.append(g);
    }
    caja.replaceChildren(svg);
  };
  const ubicar = () => {
    const barra = document.querySelector('header.barra');
    const r = barra?.getBoundingClientRect();
    caja.style.top = `${r && r.height ? Math.max(0, r.bottom - 6) : 0}px`;
  };
  dibujar(); ubicar();
  window.addEventListener('resize', () => { dibujar(); ubicar(); });
  setInterval(ubicar, 800);   // la barra aparece después del login y cambia con el menú
}

// Nieve: copos de distintos tamaños que caen con un leve vaivén; los más grandes, más cerca y más rápidos.
function nieve(lienzo) {
  const ctx = lienzo.getContext('2d');
  let ancho = 0, alto = 0, copos = [];
  const ajustar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = window.innerWidth; alto = window.innerHeight;
    lienzo.width = ancho * dpr; lienzo.height = alto * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cantidad = Math.round(Math.min(180, ancho * alto / 9000));
    copos = Array.from({ length: cantidad }, () => nuevo(true));
  };
  const nuevo = (cualquierAltura) => {
    const z = Math.random();
    return {
      x: Math.random() * ancho, y: cualquierAltura ? Math.random() * alto : -10,
      r: 1 + z * 3.2, v: 0.35 + z * 1.1, fase: Math.random() * Math.PI * 2, a: 0.45 + z * 0.5,
    };
  };
  ajustar();
  window.addEventListener('resize', ajustar);
  let t = 0;
  const cuadro = () => {
    t += 0.016;
    ctx.clearRect(0, 0, ancho, alto);
    for (const c of copos) {
      c.y += c.v;
      c.x += Math.sin(t * 0.9 + c.fase) * 0.35 + 0.12;
      if (c.y > alto + 10 || c.x > ancho + 10) Object.assign(c, nuevo(false));
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${c.a})`;
      ctx.shadowColor = 'rgba(70,100,140,.75)';
      ctx.shadowBlur = 4;
      ctx.fill();
    }
    if (capa?.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) { andando = false; return; }   // apagada: no gasta
    requestAnimationFrame(cuadro);
  };
  let andando = false;
  const seguir = () => { if (!andando) { andando = true; requestAnimationFrame(cuadro); } };
  seguir();
  return seguir;
}
