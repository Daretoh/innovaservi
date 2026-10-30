// Checklist de carga para la cuadrilla (sin cuenta). URL: /checklist/?t=<token>
// Todo pasa por la Edge Function checklist-faena: ver, marcar, subir fotos de la carga y fotos del parte por etapa.
import { el } from '../core/ui/dom.js?v=245d3ab';
import { icono } from '../core/ui/iconos.js?v=245d3ab';
import { comprimirFoto } from '../core/imagenes.js?v=245d3ab';

const raiz = document.getElementById('app');
const token = new URLSearchParams(location.search).get('t') ?? '';
const SECCIONES = [['epp', 'EPP'], ['ropa', 'Ropa de trabajo'], ['herramienta', 'Herramientas'], ['maquinaria', 'Maquinaria'], ['material', 'Materiales']];
const ROL = { op: 'Operario', sup: 'Supervisor', prev: 'Prevencionista' };
const ETAPAS = [['antes', 'Antes'], ['proceso', 'Proceso'], ['despues', 'Después'], ['doc', 'Registro documental']];
let url = '';
let etapa = 'antes';

const fecha = (iso) => new Date(`${iso}T12:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
const hora = (t) => String(t ?? '').slice(0, 5);

async function urlFuncion() {
  const { organizaciones } = await (await fetch('../core/config/tenants.json')).json();
  const org = Object.values(organizaciones).find((o) => o.dominios.includes(location.hostname));
  if (!org) throw new Error('Este sitio no está configurado.');
  return `${org.supabaseUrl}/functions/v1/checklist-faena`;
}

async function pedir(opciones) {
  const r = await fetch(opciones ? url : `${url}?t=${encodeURIComponent(token)}`, opciones);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? 'No se pudo conectar. Revisa tu señal e intenta de nuevo.');
  return d;
}
const marcar = (ids, cargado) => pedir({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, accion: 'marcar', ids, cargado }) });

function pintar(d) {
  if (d.color) document.documentElement.style.setProperty('--empresa', d.color);
  document.title = `Checklist · ${d.faena}`;
  const total = d.items.length;
  const listos = d.items.filter((i) => i.cargado).length;
  const error = el('p', { class: 'texto-error', role: 'alert' });

  const fila = (ids, texto, cant, cargado, quien) => {
    const caja = el('input', { type: 'checkbox', checked: cargado });
    caja.addEventListener('change', async () => {
      caja.disabled = true;
      try { pintar(await marcar(ids, caja.checked)); } catch (e) { error.textContent = e.message; caja.checked = !caja.checked; caja.disabled = false; }
    });
    return el('label', { class: `cl-item ${cargado ? 'listo' : ''}` }, caja,
      el('span', { class: 'cl-texto' }, texto, quien ? el('span', { class: 'cl-quien' }, quien) : null),
      el('span', { class: 'cl-cant' }, cant));
  };

  const secciones = SECCIONES.map(([tipo, titulo]) => {
    const lista = d.items.filter((i) => i.tipo === tipo);
    if (!lista.length) return null;
    let filas;
    if (tipo === 'ropa') {
      const grupos = new Map();
      for (const i of lista) { const k = `${i.item}|${i.talla ?? ''}`; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(i); }
      filas = [...grupos.values()].map((g) => fila(g.map((i) => i.id), `${g[0].item}${g[0].talla ? ` talla ${g[0].talla}` : ' (sin talla)'}`, `× ${g.length}`,
        g.every((i) => i.cargado), g.map((i) => i.persona).filter(Boolean).join(', ')));
    } else {
      filas = lista.map((i) => fila([i.id], i.item, `× ${i.cantidad}`, i.cargado));
    }
    return el('section', { class: 'fp-seccion' }, el('h2', {}, `${titulo} (${lista.filter((i) => i.cargado).length}/${lista.length})`), filas);
  }).filter(Boolean);

  const fotoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const subir = el('button', { type: 'button', class: 'boton boton-primario cl-subir', onclick: () => fotoInput.click() }, icono('mas', { tam: 18 }), 'Subir foto de la carga');
  fotoInput.addEventListener('change', async () => {
    const archivo = fotoInput.files[0];
    if (!archivo) return;
    subir.disabled = true; subir.textContent = 'Subiendo…';
    const datos = new FormData(); datos.append('t', token); datos.append('accion', 'foto'); datos.append('foto', await comprimirFoto(archivo));
    try { pintar(await pedir({ method: 'POST', body: datos })); } catch (e) { error.textContent = e.message; subir.disabled = false; subir.textContent = 'Subir foto de la carga'; }
  });

  const informe = d.reporte ? seccionInforme(d.reporte) : null;

  raiz.replaceChildren(el('div', { class: 'ficha-publica' },
    el('header', { class: 'fp-cabecera' },
      el('span', { class: 'fp-sobre' }, `Checklist de carga · ${d.empresa}`),
      el('h1', {}, d.faena),
      el('p', {}, [d.cliente, d.sitio].filter(Boolean).join(' · ')),
      el('p', {}, `${fecha(d.fecha)}${d.hora_inicio ? ` · ${hora(d.hora_inicio)}${d.hora_fin ? `–${hora(d.hora_fin)}` : ''}` : ''}`)),
    el('section', { class: 'fp-seccion' },
      el('div', { class: 'fp-avance' }, el('h2', {}, `Carga: ${listos} de ${total} listos`), el('strong', {}, `${total ? Math.round((listos / total) * 100) : 0}%`)),
      el('div', { class: 'cl-progreso', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': listos },
        el('span', { style: `width:${total ? Math.round((listos / total) * 100) : 0}%` })),
      error),
    d.cuadrilla.length ? el('section', { class: 'fp-seccion' }, el('h2', {}, 'Cuadrilla'),
      d.cuadrilla.map((c) => el('p', { class: 'cl-dato' }, `${c.nombre} · ${ROL[c.rol] ?? ''}`))) : null,
    d.tareas.length ? el('section', { class: 'fp-seccion' }, el('h2', {}, 'Tareas'), el('ol', {}, d.tareas.map((t) => el('li', {}, t)))) : null,
    secciones.length ? secciones : el('section', { class: 'fp-seccion' }, el('p', { class: 'texto-suave' }, 'Todavía no hay nada en el checklist.')),
    el('section', { class: 'fp-seccion' },
      el('h2', {}, `Foto de la carga general (${d.fotos.length}/${d.max_fotos})`),
      d.fotos.length ? el('div', { class: 'cl-fotos' }, d.fotos.map((u) => el('a', { href: u, target: '_blank', rel: 'noopener' }, el('img', { src: u, alt: 'Foto de la carga', loading: 'lazy' })))) : null,
      d.fotos.length < d.max_fotos ? subir : null, fotoInput),
    informe,
    el('p', { class: 'texto-suave texto-chico' }, `Link válido hasta el ${new Date(`${d.vence}T12:00`).toLocaleDateString('es-CL')}. ${d.empresa}.`)));
}

async function iniciar() {
  try {
    url = await urlFuncion();
    pintar(await pedir());
  } catch (e) {
    raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, el('h1', {}, 'Checklist de carga'), el('p', { class: 'texto-error' }, e.message)));
  }
}

iniciar();

// Fotos para el parte de trabajo: se elige la etapa y se suben (varias a la vez, achicadas antes de enviar)
function seccionInforme(r) {
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const titulo = el('h2', {}, `Fotos para el informe (${r.fotos.length})`);
  if (r.confirmado) {
    return el('section', { class: 'fp-seccion' }, titulo, el('p', { class: 'texto-suave' }, 'El informe de esta faena ya fue confirmado. Si falta una foto, avisa a quien lo prepara.'));
  }
  const entrada = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const nombre = (k) => ETAPAS.find(([v]) => v === k)[1];
  const boton = el('button', { type: 'button', class: 'boton boton-primario cl-subir', onclick: () => entrada.click() }, icono('camara', { tam: 18 }), `Subir fotos: ${nombre(etapa)}`);
  const etapas = el('div', { class: 'segmento cl-etapas', role: 'group', 'aria-label': 'Etapa de las fotos' },
    ETAPAS.map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(etapa === v), onclick: (ev) => {
      etapa = v;
      etapas.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget)));
      boton.lastChild.textContent = `Subir fotos: ${t}`;
    } }, t)));
  entrada.addEventListener('change', async () => {
    const archivos = [...entrada.files];
    if (!archivos.length) return;
    boton.disabled = true;
    let ultimo = null;
    for (const [i, a] of archivos.entries()) {
      boton.lastChild.textContent = `Subiendo ${i + 1} de ${archivos.length}…`;
      const datos = new FormData(); datos.append('t', token); datos.append('accion', 'reporte'); datos.append('etapa', etapa); datos.append('foto', await comprimirFoto(a));
      try { ultimo = await pedir({ method: 'POST', body: datos }); } catch (e) { error.textContent = e.message; break; }
    }
    if (ultimo) pintar(ultimo); else { boton.disabled = false; boton.lastChild.textContent = `Subir fotos: ${nombre(etapa)}`; }
  });
  const grupos = ETAPAS.map(([v, t]) => {
    const fotos = r.fotos.filter((f) => f.etapa === v);
    return fotos.length ? el('div', {}, el('h3', { class: 'cl-etapa-titulo' }, `${t} (${fotos.length})`),
      el('div', { class: 'cl-fotos' }, fotos.map((f) => el('a', { href: f.url, target: '_blank', rel: 'noopener' }, el('img', { src: f.url, alt: `Foto ${t}`, loading: 'lazy' }))))) : null;
  });
  return el('section', { class: 'fp-seccion' }, titulo,
    el('p', { class: 'texto-suave texto-chico' }, 'Elige la etapa y saca o elige las fotos del trabajo. Van directo al parte de trabajo.'),
    etapas, grupos, r.fotos.length < r.max ? boton : el('p', { class: 'texto-suave' }, 'Se alcanzó el máximo de fotos por el link.'), entrada, error);
}
