// Marcaje en tablet: la persona escribe los 4 últimos dígitos de su RUT (sin dígito verificador),
// confirma su nombre y marca entrada o salida. La hora la pone el servidor.
// Modo tablet: oculta el menú; para salir, mantener presionado el reloj 2 segundos.
import { el } from '../../../core/ui/dom.js?v=a8e0f26';
import { icono } from '../../../core/ui/iconos.js?v=a8e0f26';

const MODO = 'modo-tablet';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  if (!ctx.puede('marcaje', 'crear')) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Marcar asistencia'),
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no puede marcar. La tablet usa una cuenta con el rol "Tablet de marcaje".'));
  }
  let clave = '';
  let ocupado = false;
  let timer = null;

  const reloj = el('div', { class: 'tab-reloj', title: 'Mantén presionado 2 segundos para salir del modo tablet' });
  const fecha = el('div', { class: 'tab-fecha' });
  const pintarHora = () => {
    const d = new Date();
    reloj.textContent = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    fecha.textContent = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  pintarHora();
  const intervalo = setInterval(() => { if (!document.body.contains(reloj)) { clearInterval(intervalo); return; } pintarHora(); }, 1000);

  const puntos = el('div', { class: 'tab-puntos', 'aria-live': 'polite' });
  const mensaje = el('p', { class: 'tab-mensaje', role: 'status' });
  const paso = el('div', { class: 'tab-paso' });

  const reiniciar = (texto = '') => {
    clearTimeout(timer); clave = ''; ocupado = false;
    mensaje.textContent = texto;
    pintarTeclado();
    if (texto) timer = setTimeout(() => { mensaje.textContent = ''; }, 3000);
  };
  const pintarPuntos = () => puntos.replaceChildren(...[0, 1, 2, 3].map((i) => el('span', { class: i < clave.length ? 'lleno' : '' })));

  const tecla = (k) => {
    if (ocupado) return;
    if (k === 'borrar') clave = clave.slice(0, -1);
    else if (k === 'limpiar') clave = '';
    else if (clave.length < 4) clave += k;
    pintarPuntos();
    if (clave.length === 4) buscar();
  };
  const pintarTeclado = () => {
    pintarPuntos();
    paso.replaceChildren(
      el('p', { class: 'tab-instruccion' }, 'Escribe los 4 últimos números de tu RUT (sin el dígito verificador)'),
      puntos,
      el('div', { class: 'tab-teclado' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'limpiar', '0', 'borrar'].map((k) => el('button', {
          type: 'button', class: `tab-tecla ${k.length > 1 ? 'tab-tecla-acc' : ''}`, 'aria-label': k === 'borrar' ? 'Borrar' : k === 'limpiar' ? 'Limpiar' : k, onclick: () => tecla(k),
        }, k === 'borrar' ? icono('volver', { tam: 22 }) : k === 'limpiar' ? 'C' : k))));
  };

  const buscar = async () => {
    ocupado = true;
    const { data, error } = await ctx.api.rpc('mar_buscar', { p_empresa: e, p_clave: clave });
    if (error) { reiniciar(error.message); return; }
    if (!data.length) { reiniciar('No encontramos ese RUT. Inténtalo de nuevo.'); return; }
    if (data.length === 1) { elegir(data[0]); return; }
    paso.replaceChildren(el('p', { class: 'tab-instruccion' }, '¿Quién eres?'),
      el('div', { class: 'tab-opciones' }, data.map((p) => el('button', { type: 'button', class: 'tab-persona', onclick: () => elegir(p) }, p.nombre))),
      el('button', { type: 'button', class: 'tab-cancelar', onclick: () => reiniciar() }, 'Cancelar'));
    timer = setTimeout(() => reiniciar(), 20000);
  };

  const elegir = (p) => {
    clearTimeout(timer);
    const ult = p.ultima ? new Date(p.ultima) : null;
    const hoy = new Date().toDateString() === ult?.toDateString();
    const hora = ult ? `${hoy ? '' : 'ayer a '}las ${ult.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : null;
    const boton = (tipo, texto) => el('button', { type: 'button', class: `tab-marcar ${(p.dentro ? 'salida' : 'entrada') === tipo ? 'sugerido' : ''}`, onclick: (ev) => marcar(p, tipo, ev.currentTarget) },
      icono(tipo === 'entrada' ? 'derecha' : 'salir', { tam: 28 }), texto);
    paso.replaceChildren(
      el('p', { class: 'tab-nombre' }, `Hola, ${p.nombre}`),
      el('p', { class: 'tab-instruccion' }, p.dentro ? `Estás dentro desde ${hora}` : 'Marca tu entrada o tu salida'),
      el('div', { class: 'tab-botones' }, boton('entrada', 'Entrada'), boton('salida', 'Salida')),
      el('button', { type: 'button', class: 'tab-cancelar', onclick: () => reiniciar() }, 'No soy yo'));
    timer = setTimeout(() => reiniciar(), 20000);
  };

  const marcar = async (p, tipo, b) => {
    clearTimeout(timer);
    paso.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const { data, error } = await ctx.api.rpc('mar_marcar', { p_empresa: e, p_persona: p.persona_id, p_tipo: tipo });
    if (error) { reiniciar(error.message); return; }
    const h = new Date(data.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const min = data.minutos_hoy;
    paso.replaceChildren(el('div', { class: `tab-listo ${tipo}` },
      icono('check', { tam: 56 }),
      el('p', { class: 'tab-nombre' }, data.nombre),
      el('p', { class: 'tab-hora' }, `${tipo === 'entrada' ? 'Entrada' : 'Salida'} ${h}`),
      tipo === 'salida' && min ? el('p', { class: 'tab-instruccion' }, `Hoy trabajaste ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`) : null));
    timer = setTimeout(() => reiniciar(), 3500);
  };

  // Teclado físico
  const teclado = (ev) => {
    if (!document.body.contains(paso)) { document.removeEventListener('keydown', teclado); return; }
    if (/^\d$/.test(ev.key)) tecla(ev.key);
    else if (ev.key === 'Backspace') tecla('borrar');
    else if (ev.key === 'Escape') reiniciar();
  };
  document.addEventListener('keydown', teclado);

  // Modo tablet: oculta el menú hasta salir de la vista; salida discreta manteniendo presionado el reloj
  document.body.classList.add(MODO);
  const salirModo = () => { document.body.classList.remove(MODO); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
  window.addEventListener('hashchange', salirModo, { once: true });
  let presion = null;
  const inicio = () => { reloj.classList.add('presionado'); presion = setTimeout(() => { reloj.classList.remove('presionado'); salirModo(); location.hash = '#/'; }, 2000); };
  const fin = () => { reloj.classList.remove('presionado'); clearTimeout(presion); };
  ['mousedown', 'touchstart'].forEach((t) => reloj.addEventListener(t, inicio, { passive: true }));
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach((t) => reloj.addEventListener(t, fin));

  pintarTeclado();
  return el('section', { class: 'tablet' },
    el('div', { class: 'tab-cabecera' }, el('div', {}, reloj, fecha),
      el('button', { type: 'button', class: 'tab-pantalla', title: 'Pantalla completa', 'aria-label': 'Pantalla completa', onclick: () => document.documentElement.requestFullscreen?.().catch(() => {}) }, icono('arriba', { tam: 18 }))),
    el('div', { class: 'tab-empresa' }, ctx.empresa.nombre_fantasia || ctx.empresa.razon_social),
    paso, mensaje);
}
