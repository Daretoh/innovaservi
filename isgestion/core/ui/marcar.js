// Marcar una foto (2026-11-13, pedido de Enzo): rayar, subrayar, flechas, círculos, rectángulos y texto encima de una
// foto, con el dedo o el mouse. Devuelve la foto marcada como JPEG (File) o null si se cancela.
//   const archivo = await marcarFoto(url, { titulo: 'Marcar foto', colorEmpresa: ctx.empresa.color });
// Cada trazo se guarda como figura y se vuelve a pintar entero (Deshacer y Borrar todo no pierden calidad). La capa usa
// los estilos oscuros de la cámara (.cam-capa) más .mar-*.
import { el } from './dom.js?v=60a60f0';
import { icono } from './iconos.js?v=60a60f0';

const LADO = 2000;   // lado mayor del lienzo
const HERRAMIENTAS = [['lapiz', 'Lápiz', 'lapiz'], ['flecha', 'Flecha', 'flecha'], ['circulo', 'Círculo', 'circulo'], ['rect', 'Rectángulo', 'rectangulo'], ['texto', 'Texto', 'texto']];
const GROSORES = [['Fino', 1], ['Medio', 2], ['Grueso', 3.5]];

async function cargarImagen(origen) {
  const blob = origen instanceof Blob ? origen : await (await fetch(origen)).blob();
  return createImageBitmap(blob);
}

export async function marcarFoto(origen, { titulo = 'Marcar foto', colorEmpresa = null, textoGuardar = 'Guardar' } = {}) {
  let bmp;
  try { bmp = await cargarImagen(origen); } catch { throw new Error('No se pudo abrir la foto para marcarla.'); }
  const k = Math.min(1, LADO / Math.max(bmp.width, bmp.height));
  const lienzo = el('canvas', { class: 'mar-lienzo', 'aria-label': 'Foto para marcar' });
  lienzo.width = Math.round(bmp.width * k); lienzo.height = Math.round(bmp.height * k);
  const g = lienzo.getContext('2d');
  const base = Math.max(lienzo.width, lienzo.height) / 320;   // grosor "fino" proporcional a la foto

  const colores = [['Rojo', '#e53935'], ['Amarillo', '#fdd835'], ['Blanco', '#ffffff'], ['Negro', '#111111']];
  if (/^#[0-9a-f]{6}$/i.test(colorEmpresa ?? '') && !colores.some(([, c]) => c.toLowerCase() === colorEmpresa.toLowerCase())) colores.push(['Color de la empresa', colorEmpresa]);
  let herramienta = 'lapiz'; let color = colores[0][1]; let grosor = 2;
  const figuras = []; let actual = null;

  // ---- Pintar
  const trazo = (f) => { g.strokeStyle = f.color; g.fillStyle = f.color; g.lineWidth = base * f.grosor; g.lineCap = 'round'; g.lineJoin = 'round'; };
  const pintarFigura = (f) => {
    trazo(f);
    if (f.tipo === 'lapiz') {
      g.beginPath(); f.puntos.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (f.puntos.length === 1) g.lineTo(f.puntos[0][0] + 0.1, f.puntos[0][1]);
      g.stroke();
    } else if (f.tipo === 'rect') {
      g.strokeRect(Math.min(f.x1, f.x2), Math.min(f.y1, f.y2), Math.abs(f.x2 - f.x1), Math.abs(f.y2 - f.y1));
    } else if (f.tipo === 'circulo') {
      g.beginPath();
      g.ellipse((f.x1 + f.x2) / 2, (f.y1 + f.y2) / 2, Math.abs(f.x2 - f.x1) / 2 || 1, Math.abs(f.y2 - f.y1) / 2 || 1, 0, 0, Math.PI * 2);
      g.stroke();
    } else if (f.tipo === 'flecha') {
      const ang = Math.atan2(f.y2 - f.y1, f.x2 - f.x1); const punta = base * f.grosor * 4 + base * 6;
      g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke();
      g.beginPath(); g.moveTo(f.x2, f.y2);
      g.lineTo(f.x2 - punta * Math.cos(ang - 0.45), f.y2 - punta * Math.sin(ang - 0.45));
      g.lineTo(f.x2 - punta * Math.cos(ang + 0.45), f.y2 - punta * Math.sin(ang + 0.45));
      g.closePath(); g.fill();
    } else if (f.tipo === 'texto') {
      const tam = base * (9 + f.grosor * 5);
      g.font = `bold ${tam}px system-ui, sans-serif`; g.textBaseline = 'top';
      const claro = parseInt(f.color.slice(1, 3), 16) * 0.3 + parseInt(f.color.slice(3, 5), 16) * 0.59 + parseInt(f.color.slice(5, 7), 16) * 0.11 > 150;
      g.lineWidth = tam / 6; g.strokeStyle = claro ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.85)';
      f.texto.split('\n').forEach((l, i) => { g.strokeText(l, f.x, f.y + i * tam * 1.15); g.fillText(l, f.x, f.y + i * tam * 1.15); });
    }
  };
  const pintar = () => {
    g.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    figuras.forEach(pintarFigura);
    if (actual) pintarFigura(actual);
    deshacer.disabled = !figuras.length; borrar.disabled = !figuras.length;
  };

  // ---- Dibujar con el dedo o el mouse
  const punto = (ev) => {
    const r = lienzo.getBoundingClientRect();
    return [(ev.clientX - r.left) * (lienzo.width / r.width), (ev.clientY - r.top) * (lienzo.height / r.height)];
  };
  lienzo.addEventListener('pointerdown', (ev) => {
    if (escribiendo) { escribiendo.blur(); return; }
    ev.preventDefault();
    const [x, y] = punto(ev);
    if (herramienta === 'texto') { pedirTexto(ev, x, y); return; }
    try { lienzo.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
    actual = herramienta === 'lapiz' ? { tipo: 'lapiz', color, grosor, puntos: [[x, y]] } : { tipo: herramienta, color, grosor, x1: x, y1: y, x2: x, y2: y };
    pintar();
  });
  lienzo.addEventListener('pointermove', (ev) => {
    if (!actual) return;
    const [x, y] = punto(ev);
    if (actual.tipo === 'lapiz') actual.puntos.push([x, y]); else { actual.x2 = x; actual.y2 = y; }
    pintar();
  });
  const soltar = () => {
    if (!actual) return;
    const chica = actual.tipo !== 'lapiz' && Math.hypot(actual.x2 - actual.x1, actual.y2 - actual.y1) < base * 3;
    if (!chica) figuras.push(actual);
    actual = null; pintar();
  };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  // Texto: un cuadro donde se tocó; Enter o tocar fuera lo deja en la foto, Esc lo descarta
  let escribiendo = null;
  const visor = el('div', { class: 'mar-visor' }, lienzo);
  const pedirTexto = (ev, x, y) => {
    const rv = visor.getBoundingClientRect();
    const campo = el('input', { class: 'mar-texto', type: 'text', maxlength: 80, placeholder: 'Escribe y Enter', 'aria-label': 'Texto para la foto' });
    campo.style.left = `${Math.min(ev.clientX - rv.left, rv.width - 200)}px`; campo.style.top = `${ev.clientY - rv.top}px`;
    let hecho = false;
    const fin = (guardar) => {
      if (hecho) return; hecho = true;
      if (guardar && campo.value.trim()) { figuras.push({ tipo: 'texto', color, grosor, x, y, texto: campo.value.trim() }); pintar(); }
      campo.remove(); escribiendo = null;
    };
    campo.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); });
    campo.addEventListener('blur', () => fin(true));
    visor.append(campo); escribiendo = campo;
    setTimeout(() => campo.focus(), 0);
  };

  // ---- Barra de herramientas
  const grupo = (lista, alElegir, actualFn) => {
    const botones = lista.map(([valor, etiqueta, contenido]) => el('button', {
      type: 'button', class: 'mar-opcion', title: etiqueta, 'aria-label': etiqueta, 'aria-pressed': String(actualFn() === valor),
      onclick: () => { alElegir(valor); botones.forEach((b, i) => b.setAttribute('aria-pressed', String(lista[i][0] === actualFn()))); },
    }, contenido));
    return botones;
  };
  const botonesHerr = grupo(HERRAMIENTAS.map(([v, t, ic]) => [v, t, icono(ic, { tam: 20 })]), (v) => { herramienta = v; }, () => herramienta);
  const botonesColor = grupo(colores.map(([t, c]) => [c, t, el('span', { class: 'mar-muestra', style: `background:${c}` })]), (v) => { color = v; }, () => color);
  const botonesGrosor = grupo(GROSORES.map(([t, v]) => [v, `Grosor ${t.toLowerCase()}`, el('span', { class: 'mar-punto', style: `width:${4 + v * 3}px;height:${4 + v * 3}px` })]), (v) => { grosor = v; }, () => grosor);
  const deshacer = el('button', { type: 'button', class: 'mar-opcion', title: 'Deshacer', 'aria-label': 'Deshacer', onclick: () => { figuras.pop(); pintar(); } }, icono('deshacer', { tam: 20 }));
  const borrar = el('button', { type: 'button', class: 'mar-opcion', title: 'Borrar todo', 'aria-label': 'Borrar todas las marcas', onclick: () => { figuras.length = 0; pintar(); } }, icono('basura', { tam: 20 }));

  return new Promise((resolver) => {
    const cerrarBoton = el('button', { type: 'button', class: 'cam-boton', 'aria-label': 'Cancelar', onclick: () => cerrar(false) }, icono('cerrar', { tam: 22 }));
    const guardar = el('button', { type: 'button', class: 'boton boton-primario', onclick: () => cerrar(true) }, icono('check', { tam: 18 }), el('span', {}, textoGuardar));
    const capa = el('div', { class: 'cam-capa mar-capa', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
      el('div', { class: 'cam-arriba' }, cerrarBoton, el('div', { class: 'cam-titulo' }, el('strong', {}, titulo), el('span', { class: 'cam-contador' }, 'Dibuja con el dedo o el mouse')), guardar),
      visor,
      el('div', { class: 'mar-barra' },
        el('div', { class: 'mar-grupo', role: 'group', 'aria-label': 'Herramienta' }, botonesHerr),
        el('div', { class: 'mar-grupo', role: 'group', 'aria-label': 'Color' }, botonesColor),
        el('div', { class: 'mar-grupo', role: 'group', 'aria-label': 'Grosor' }, botonesGrosor),
        el('div', { class: 'mar-grupo' }, deshacer, borrar)));
    const teclas = (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); cerrar(false); }
      else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); figuras.pop(); pintar(); }
    };
    const alSalir = () => cerrar(false);
    // La foto entera a la vista: el lienzo se ajusta al espacio libre (ancho y alto) sin deformarse
    const ajustar = () => {
      const w = visor.clientWidth - 16; const h = visor.clientHeight - 16;
      if (w <= 0 || h <= 0) return;
      const e = Math.min(w / lienzo.width, h / lienzo.height);
      lienzo.style.width = `${Math.floor(lienzo.width * e)}px`; lienzo.style.height = `${Math.floor(lienzo.height * e)}px`;
    };
    const obs = new ResizeObserver(ajustar);
    let cerrada = false;
    async function cerrar(conFoto) {
      if (cerrada) return;
      if (conFoto && escribiendo) escribiendo.blur();
      cerrada = true;
      obs.disconnect();
      document.removeEventListener('keydown', teclas);
      window.removeEventListener('hashchange', alSalir);
      document.documentElement.classList.remove('cam-abierta');
      capa.remove();
      if (!conFoto || !figuras.length) { bmp.close?.(); resolver(null); return; }
      const blob = await new Promise((ok) => lienzo.toBlob(ok, 'image/jpeg', 0.88));
      bmp.close?.();
      resolver(blob ? new File([blob], `marcada-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.jpg`, { type: 'image/jpeg' }) : null);
    }
    document.addEventListener('keydown', teclas);
    window.addEventListener('hashchange', alSalir);
    document.documentElement.classList.add('cam-abierta');
    document.body.append(capa);
    obs.observe(visor);
    ajustar();
    pintar();
  });
}
