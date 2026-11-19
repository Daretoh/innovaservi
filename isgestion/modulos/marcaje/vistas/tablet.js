// Marcaje en tablet: la persona escribe los 4 últimos dígitos de su RUT (sin dígito verificador),
// confirma su nombre y marca entrada o salida. La hora la pone el servidor.
// Modo tablet: oculta el menú; para salir, mantener presionado el reloj 2 segundos.
import { el } from '../../../core/ui/dom.js?v=40804ef';
import { icono } from '../../../core/ui/iconos.js?v=40804ef';

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
    // Busca en todas las empresas donde la tablet puede marcar (Marcaje 006): la persona marca en la suya
    const { data, error } = await ctx.api.rpc('mar_buscar_grupo', { p_empresa: e, p_clave: clave });
    if (error) { reiniciar(error.message); return; }
    if (!data.length) { reiniciar('No encontramos ese RUT. Inténtalo de nuevo.'); return; }
    if (data.length === 1) { elegir(data[0]); return; }
    paso.replaceChildren(el('p', { class: 'tab-instruccion' }, '¿Quién eres?'),
      el('div', { class: 'tab-opciones' }, data.map((p) => el('button', { type: 'button', class: 'tab-persona', onclick: () => elegir(p) }, p.nombre,
        new Set(data.map((x) => x.empresa_id)).size > 1 ? el('span', { class: 'tab-empresa-marca' }, p.empresa) : null))),
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
      p.empresa_id && p.empresa_id !== e ? el('p', { class: 'tab-empresa-marca' }, icono('building', { tam: 16 }), ` Marca en ${p.empresa}`) : null,
      el('p', { class: 'tab-instruccion' }, p.dentro ? `Estás dentro desde ${hora}` : 'Marca tu entrada o tu salida'),
      el('div', { class: 'tab-botones' }, boton('entrada', 'Entrada'), boton('salida', 'Salida')),
      el('button', { type: 'button', class: 'tab-cancelar', onclick: () => reiniciar() }, 'No soy yo'));
    timer = setTimeout(() => reiniciar(), 20000);
  };

  const marcar = async (p, tipo, b) => {
    clearTimeout(timer);
    paso.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const emp = p.empresa_id ?? e;
    const { data, error } = await ctx.api.rpc('mar_marcar', { p_empresa: emp, p_persona: p.persona_id, p_tipo: tipo });
    if (error) { reiniciar(error.message); return; }
    data.empresa = emp;
    const h = new Date(data.ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const min = data.minutos_hoy;
    const hm = (t) => new Date(t).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const durTxt = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
    const desde = tipo === 'salida' && p.dentro && p.ultima ? hm(p.ultima) : null;   // la entrada que se cierra
    paso.replaceChildren(el('div', { class: `tab-listo ${tipo}` },
      icono('check', { tam: 56 }),
      el('p', { class: 'tab-nombre' }, data.nombre),
      el('p', { class: 'tab-hora' }, `${tipo === 'entrada' ? 'Entrada' : 'Salida'} ${h}`),
      emp !== e ? el('p', { class: 'tab-empresa-marca' }, icono('building', { tam: 16 }), ` Marcado en ${p.empresa}`) : null,
      // Salida: horas trabajadas bien visibles (2026-11-16, Enzo)
      tipo === 'salida' && min ? el('div', { class: 'tab-trabajado' },
        desde ? el('span', { class: 'texto-suave' }, `Entrada ${desde} → Salida ${h}`) : null,
        el('span', {}, 'Hoy trabajaste'), el('strong', {}, durTxt(min))) : null,
      // Atraso (Asistencia 009): aviso solo a quien marca, unos segundos más en pantalla
      data.atraso_min > 0 ? el('p', { class: 'tab-atraso' }, icono('reloj', { tam: 18 }),
        ` Llegaste ${data.atraso_min >= 60 ? `${Math.floor(data.atraso_min / 60)} h ${String(data.atraso_min % 60).padStart(2, '0')} min` : `${data.atraso_min} min`} después de tu horario (${data.turno_ini})`) : null));
    if (tipo === 'salida' && data.anticipada_min > 0 && data.id) { setTimeout(() => preguntarMotivo({ ...data, trabajado: min ? durTxt(min) : null }), 2500); return; }
    timer = setTimeout(() => reiniciar(), data.atraso_min > 0 ? 6000 : tipo === 'salida' ? 5000 : 3500);
  };

  // Salida antes del fin del turno (Marcaje 004): la salida ya quedó con su hora; se pregunta el motivo con botones.
  // Si no elige en 25 s, la salida queda sin motivo.
  const MOTIVOS = ['Permiso', 'Emergencia', 'Hora médica', 'Trámite personal', 'Trabajo fuera del taller', 'Autorizado por el jefe', 'Otro'];
  const preguntarMotivo = (data) => {
    if (!document.body.contains(paso)) return;
    clearTimeout(timer);
    const t = data.anticipada_min >= 60 ? `${Math.floor(data.anticipada_min / 60)} h ${String(data.anticipada_min % 60).padStart(2, '0')} min` : `${data.anticipada_min} min`;
    const elegirMotivo = async (motivo, b) => {
      clearTimeout(timer);
      paso.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      b.classList.add('sugerido');
      const { error } = await ctx.api.rpc('mar_motivo_salida', { p_empresa: data.empresa ?? e, p_marca: data.id, p_motivo: motivo });
      if (error) { reiniciar(error.message); return; }
      paso.replaceChildren(el('div', { class: 'tab-listo salida' }, icono('check', { tam: 56 }), el('p', { class: 'tab-nombre' }, data.nombre), el('p', { class: 'tab-instruccion' }, `Motivo registrado: ${motivo}`)));
      timer = setTimeout(() => reiniciar(), 3000);
    };
    paso.replaceChildren(
      el('p', { class: 'tab-nombre' }, data.nombre),
      el('p', { class: 'tab-atraso' }, icono('reloj', { tam: 18 }), ` Estás saliendo ${t} antes de tu horario (${data.turno_fin})`),
      el('p', { class: 'tab-instruccion' }, `${data.trabajado ? `Hoy trabajaste ${data.trabajado}. ` : ''}¿Por qué sales antes? Tu salida ya quedó marcada.`),
      el('div', { class: 'tab-motivos' }, MOTIVOS.map((m) => el('button', { type: 'button', class: 'tab-persona', onclick: (ev) => elegirMotivo(m, ev.currentTarget) }, m))),
      el('button', { type: 'button', class: 'tab-cancelar', onclick: () => reiniciar() }, 'Prefiero no decirlo'));
    timer = setTimeout(() => reiniciar(), 25000);
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
