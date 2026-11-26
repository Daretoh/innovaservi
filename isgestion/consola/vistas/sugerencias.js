// Sugerencias de todas las empresas (Núcleo 024): solo el equipo (es_equipo(), hoy Enzo). Filtros por estado, empresa,
// tipo y urgentes; cada sugerencia con sus puntos (área y pestaña, texto, pantallazos) y, por punto, el estado y la
// respuesta que ve quien la envió (le llega un aviso al guardar).
import { el } from '../../core/ui/dom.js?v=9540066';
import { icono } from '../../core/ui/iconos.js?v=9540066';
import { avisar } from '../../core/ui/aviso.js?v=9540066';
import { urlsFirmadas } from '../../core/adjuntos.js?v=9540066';
import { TIPOS, ESTADOS } from '../../core/sugerencias.js?v=9540066';

const ABIERTOS = ['recibida', 'revision', 'planificada'];

export default async function vista(ctx) {
  const { data, error } = await ctx.api.from('sug_sugerencias')
    .select('id, numero, tipo, empresa_id, empresa_nombre, autor_nombre, created_at, sug_puntos(id, orden, modulo, pantalla, pantalla_nombre, texto, urgente, estado, respuesta, respondida_at, sug_imagenes(ruta, nombre))')
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  const urls = await urlsFirmadas(ctx.api, data.flatMap((s) => s.sug_puntos.flatMap((p) => p.sug_imagenes.map((x) => x.ruta)))).catch(() => new Map());
  const tipo = Object.fromEntries(TIPOS);
  const f = { estado: ctx.params.estado ?? 'abiertas', empresa: '', tipo: '', urgentes: false, texto: '' };

  const empresas = [...new Map(data.map((s) => [s.empresa_id, s.empresa_nombre])).entries()];
  const sel = (opciones, valor, al) => { const s = el('select', {}, ...opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t))); s.addEventListener('change', () => al(s.value)); return s; };
  const lista = el('div', { class: 'sug-bandeja' });
  const resumen = el('p', { class: 'texto-suave' });

  function puntoNodo(p) {
    const est = sel(Object.entries(ESTADOS).map(([k, [t]]) => [k, t]), p.estado, () => {});
    const resp = el('textarea', { rows: 2, maxlength: 3000, placeholder: 'Respuesta para quien la envió (opcional)' });
    resp.value = p.respuesta ?? '';
    const guardar = el('button', { type: 'button', class: 'boton boton-primario boton-chico' }, 'Guardar');
    guardar.addEventListener('click', async () => {
      guardar.disabled = true;
      const { error: e } = await ctx.api.from('sug_puntos').update({ estado: est.value, respuesta: resp.value.trim() || null }).eq('id', p.id);
      guardar.disabled = false;
      if (e) { avisar(e.message, 'error'); return; }
      p.estado = est.value; p.respuesta = resp.value.trim() || null;
      avisar('Guardado. Se le avisó a quien la envió.');
      pintar();
    });
    return el('div', { class: `sug-b-punto${p.urgente ? ' urgente' : ''}` },
      el('div', { class: 'sug-mia-fila' },
        el('span', { class: `chip ${ESTADOS[p.estado][1]}` }, ESTADOS[p.estado][0]),
        p.urgente ? el('span', { class: 'chip chip-venc' }, 'Urgente') : null,
        el('strong', {}, p.pantalla_nombre || 'General')),
      el('p', { class: 'sug-b-texto' }, p.texto),
      p.sug_imagenes.length ? el('div', { class: 'sug-fotos' }, ...p.sug_imagenes.map((x) => urls.get(x.ruta)
        ? el('a', { class: 'sug-foto sug-foto-grande', href: urls.get(x.ruta), target: '_blank', rel: 'noopener', title: 'Ver en grande' }, el('img', { src: urls.get(x.ruta), alt: x.nombre ?? 'Pantallazo' }))
        : null)) : null,
      el('div', { class: 'sug-b-acciones' }, est, resp, el('div', { class: 'sug-b-botones' }, guardar,
        el('a', { class: 'boton boton-secundario boton-chico', href: `#/novedades?punto=${p.id}`, title: 'Anunciar en Novedades lo que se hizo con este punto' }, 'Crear novedad'))));
  }

  function pintar() {
    const t = f.texto.trim().toLowerCase();
    const filas = data.map((s) => ({ ...s, puntos: [...s.sug_puntos].sort((a, b) => a.orden - b.orden).filter((p) =>
      (f.estado === 'abiertas' ? ABIERTOS.includes(p.estado) : f.estado === 'todas' ? true : p.estado === f.estado)
      && (!f.urgentes || p.urgente) && (!t || `${p.texto} ${p.pantalla_nombre ?? ''}`.toLowerCase().includes(t))) }))
      .filter((s) => s.puntos.length && (!f.empresa || s.empresa_id === f.empresa) && (!f.tipo || s.tipo === f.tipo));
    const n = filas.reduce((a, s) => a + s.puntos.length, 0);
    resumen.textContent = `${filas.length} sugerencia${filas.length === 1 ? '' : 's'} · ${n} punto${n === 1 ? '' : 's'}`;
    lista.replaceChildren(...(filas.length ? filas.map((s) => el('article', { class: 'tarjeta sug-b' },
      el('header', { class: 'sug-b-cabeza' },
        el('strong', {}, `N° ${s.numero}`), el('span', { class: 'chip chip-na' }, tipo[s.tipo]),
        el('span', {}, s.autor_nombre ?? 'Alguien'), el('span', { class: 'texto-suave' }, `${s.empresa_nombre ?? ''} · ${new Date(s.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`)),
      ...s.puntos.map(puntoNodo)))
      : [el('div', { class: 'estado-vacio' }, icono('check', { tam: 24 }), el('p', {}, 'No hay sugerencias con estos filtros.'))]));
  }

  const buscar = el('input', { type: 'search', placeholder: 'Buscar en el texto o la pantalla', 'aria-label': 'Buscar' });
  buscar.addEventListener('input', () => { f.texto = buscar.value; pintar(); });
  const urg = el('input', { type: 'checkbox' });
  urg.addEventListener('change', () => { f.urgentes = urg.checked; pintar(); });
  pintar();
  return el('section', { class: 'vista' },
    el('h1', {}, icono('chat'), 'Sugerencias'),
    el('p', { class: 'texto-suave' }, 'Las envían los usuarios desde el chat de Ayuda. Cada persona ve solo las suyas; aquí se ven todas.'),
    el('div', { class: 'filtros sug-filtros' },
      sel([['abiertas', 'Abiertas'], ['todas', 'Todas'], ...Object.entries(ESTADOS).map(([k, [t]]) => [k, t])], f.estado, (v) => { f.estado = v; pintar(); }),
      sel([['', 'Todas las empresas'], ...empresas], '', (v) => { f.empresa = v; pintar(); }),
      sel([['', 'Todos los tipos'], ...TIPOS], '', (v) => { f.tipo = v; pintar(); }),
      el('label', { class: 'sug-urgente' }, urg, 'Solo urgentes'),
      buscar),
    resumen, lista);
}
