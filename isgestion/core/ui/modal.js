// Modal con formulario. campos: [{ id, etiqueta, tipo?, requerido?, opciones?, valor?, accept?, ayuda? }]
// tipo 'checks' + opciones → selección múltiple (devuelve un arreglo).
// mensaje: texto opcional sobre los campos (ej.: una confirmación sin campos).
// alGuardar(valores) puede lanzar un Error: su mensaje se muestra en el formulario.
// accion (en un campo): { texto, icono?, alClic({ valores, poner(id, valor), estado(texto, clase) }) } agrega un botón
// bajo el campo (ej.: "Leer vencimiento del documento"); valores trae lo que hay en el formulario, archivos incluidos.
import { el } from './dom.js';
import { icono } from './iconos.js';
import { boton } from './tabla.js';
import { prepararArchivos } from '../imagenes.js';

// Si acepta JPEG, también fotos de iPhone (HEIC): se convierten a JPEG al guardar
const aceptar = (a) => (a && /image\/(jpeg|\*)/.test(a) ? `${a},.heic,.heif,image/heic,image/heif` : a);
// Un campo de archivo que acepta PDF admite varias fotos (se juntan en un PDF); multiple: false lo evita
const varias = (c) => c.tipo === 'file' && c.multiple !== false && (c.multiple || !c.accept || /pdf/.test(c.accept));

export function abrirFormulario({ titulo, mensaje, campos, textoGuardar = 'Guardar', alGuardar }) {
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const entradas = campos.map((c) => {
    if (c.tipo === 'checks') {   // selección múltiple: lista de casillas
      return el('fieldset', { class: 'form-fila checks' }, el('legend', {}, c.etiqueta),
        el('div', { class: 'checks-lista' }, c.opciones.map(([v, t]) => el('label', { class: 'casilla' },
          el('input', { type: 'checkbox', name: c.id, value: v, checked: (c.valor ?? []).includes(v) }), t))));
    }
    if (c.tipo === 'textarea') {
      return el('div', { class: 'form-fila' }, el('label', { for: `f-${c.id}` }, c.etiqueta),
        Object.assign(el('textarea', { id: `f-${c.id}`, name: c.id, class: 'campo', rows: c.filas ?? 3, required: c.requerido }), { value: c.valor ?? '' }),
        c.ayuda ? el('span', { class: 'texto-suave texto-chico' }, c.ayuda) : null);
    }
    const control = c.opciones
      ? el('select', { id: `f-${c.id}`, name: c.id, class: 'campo', required: c.requerido },
          c.opciones.map(([v, t]) => el('option', { value: v, selected: v === (c.valor ?? null) }, t)))
      : el('input', { id: `f-${c.id}`, name: c.id, type: c.tipo ?? 'text', class: 'campo', required: c.requerido, value: c.valor, accept: aceptar(c.accept), multiple: varias(c) });
    const escaner = varias(c) ? el('span', { class: 'texto-suave texto-chico campo-escaner', 'aria-live': 'polite' }, 'Puedes elegir varias fotos (ej.: cédula por ambos lados): se juntan en un PDF.') : null;
    if (escaner) control.addEventListener('change', () => {
      const n = control.files.length;
      escaner.textContent = n > 1 ? `${n} archivos: se juntan en un PDF de ${n} páginas.` : 'Puedes elegir varias fotos (ej.: cédula por ambos lados): se juntan en un PDF.';
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `f-${c.id}` }, c.etiqueta), control,
      c.ayuda ? el('span', { class: 'texto-suave texto-chico' }, c.ayuda) : null, escaner,
      c.accion ? accionCampo(c.accion, () => form) : null);
  });

  const guardar = boton(textoGuardar, { tipo: 'primario', type: 'submit' });
  const form = el('form', { class: 'modal-cuerpo' }, mensaje ? el('p', {}, mensaje) : null, entradas, error,
    el('div', { class: 'modal-pie' }, boton('Cancelar', { onclick: () => cerrar() }), guardar));

  const dialogo = el('dialog', { class: 'modal', 'aria-label': titulo },
    el('header', { class: 'modal-cabecera' },
      el('h2', {}, titulo),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
    form);

  function cerrar() { dialogo.close(); dialogo.remove(); }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    guardar.disabled = true; guardar.classList.add('cargando');
    const fd = new FormData(form);
    const valores = Object.fromEntries(fd);
    for (const c of campos) if (c.tipo === 'checks') valores[c.id] = fd.getAll(c.id);
    try {
      // Archivos: foto de iPhone (HEIC) → JPEG; varias fotos → un PDF (escáner)
      for (const c of campos) {
        if (c.tipo !== 'file') continue;
        const lista = form.elements[c.id]?.files ?? [];
        if (lista.length) valores[c.id] = await prepararArchivos(lista);
      }
      await alGuardar(valores);
      cerrar();
    } catch (e) {
      error.textContent = e.message;
    } finally {
      guardar.disabled = false; guardar.classList.remove('cargando');
    }
  });

  document.body.append(dialogo);
  dialogo.showModal();
  // Foco en el primer campo (no en el botón de cerrar)
  form.querySelector('.campo:not([disabled]), input:not([type=hidden]):not([disabled])')?.focus();
  dialogo.querySelector('.campo')?.focus();
}

// Botón de acción bajo un campo, con su estado (leyendo…, resultado)
function accionCampo(a, formDe) {
  const estadoEl = el('span', { class: 'texto-chico campo-accion-estado' });
  const b = boton(a.texto, { icono: a.icono ?? 'ojo', tipo: 'secundario', class: 'boton boton-secundario boton-chico' });
  b.addEventListener('click', async () => {
    const form = formDe();
    const fd = new FormData(form);
    const valores = Object.fromEntries(fd);
    b.disabled = true; b.classList.add('cargando');
    const estado = (texto, clase = '') => { estadoEl.textContent = texto; estadoEl.className = `texto-chico campo-accion-estado ${clase ? `estado-${clase}` : ''}`; };
    const poner = (id, v) => { const c = form.elements[id]; if (c && v != null) { c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); } };
    try { await a.alClic({ valores, poner, estado }); } catch (e) { estado(e.message, 'mal'); }
    b.disabled = false; b.classList.remove('cargando');
  });
  return el('div', { class: 'campo-accion' }, b, estadoEl);
}
