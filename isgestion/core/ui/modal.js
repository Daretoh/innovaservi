// Modal con formulario. campos: [{ id, etiqueta, tipo?, requerido?, opciones?, valor?, accept?, ayuda? }]
// tipo 'checks' + opciones → selección múltiple (devuelve un arreglo).
// mensaje: texto opcional sobre los campos (ej.: una confirmación sin campos).
// alGuardar(valores) puede lanzar un Error: su mensaje se muestra en el formulario.
// accion (en un campo): { texto, icono?, alClic({ valores, poner(id, valor), estado(texto, clase) }) } agrega un botón
// bajo el campo (ej.: "Leer vencimiento del documento"); valores trae lo que hay en el formulario, archivos incluidos.
// sugerencias (en un campo de texto): lista que aparece al escribir (datalist).
// alCambiar({ valor, valores, poner(id, valor), opciones(id, [[v, t]]) }) en un campo: se llama al cambiarlo (ej.: elegir un
// cliente llena su teléfono y sus vehículos). poner en un campo 'checks' marca los valores dados.
import { el } from './dom.js?v=6f62ff2';
import { icono } from './iconos.js?v=6f62ff2';
import { boton } from './tabla.js?v=6f62ff2';
import { prepararArchivos } from '../imagenes.js?v=6f62ff2';

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
    if (c.tipo === 'lista') {   // lista editable de textos (ej.: tareas de un servicio): una fila por elemento
      const filas = el('div', { class: 'lista-campo' });
      const fila = (v = '') => {
        const entrada = el('input', { class: 'campo', name: c.id, value: v, placeholder: c.placeholder ?? '' });
        const mover = (d) => { const f = entrada.parentElement; const o = d < 0 ? f.previousElementSibling : f.nextElementSibling; if (o) { if (d < 0) filas.insertBefore(f, o); else filas.insertBefore(o, f); entrada.focus(); } };
        const r = el('div', { class: 'lista-fila' }, entrada,
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Subir', title: 'Subir', onclick: () => mover(-1) }, icono('arriba', { tam: 16 })),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Bajar', title: 'Bajar', onclick: () => mover(1) }, icono('abajo', { tam: 16 })),
          el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Quitar', title: 'Quitar', onclick: () => r.remove() }, icono('basura', { tam: 16 })));
        // Enter agrega una fila debajo (como una lista)
        entrada.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); const n = fila(); r.after(n); n.querySelector('input').focus(); } });
        return r;
      };
      filas.append(...(c.valor ?? []).map((v) => fila(v)));
      const agregar = boton(c.textoAgregar ?? 'Agregar', { icono: 'mas', onclick: () => { const n = fila(); filas.append(n); n.querySelector('input').focus(); } });
      return el('fieldset', { class: 'form-fila checks' }, el('legend', {}, c.etiqueta), filas, agregar,
        c.ayuda ? el('span', { class: 'texto-suave texto-chico' }, c.ayuda) : null);
    }
    if (c.tipo === 'textarea') {
      return el('div', { class: 'form-fila' }, el('label', { for: `f-${c.id}` }, c.etiqueta),
        Object.assign(el('textarea', { id: `f-${c.id}`, name: c.id, class: 'campo', rows: c.filas ?? 3, required: c.requerido }), { value: c.valor ?? '' }),
        c.ayuda ? el('span', { class: 'texto-suave texto-chico' }, c.ayuda) : null);
    }
    const control = c.opciones
      ? el('select', { id: `f-${c.id}`, name: c.id, class: 'campo', required: c.requerido },
          c.opciones.map(([v, t]) => el('option', { value: v, selected: v === (c.valor ?? null) }, t)))
      : el('input', { id: `f-${c.id}`, name: c.id, type: c.tipo ?? 'text', class: 'campo', required: c.requerido, value: c.valor, accept: aceptar(c.accept), multiple: varias(c), list: c.sugerencias ? `l-${c.id}` : null, autocomplete: c.sugerencias ? 'off' : null });
    // alCambiar: en un campo de archivo recibe también archivos y estado(texto) para mostrar un mensaje bajo el campo
    const estadoCampo = c.alCambiar ? el('span', { class: 'texto-chico campo-accion-estado', 'aria-live': 'polite' }) : null;
    if (c.alCambiar) control.addEventListener('change', () => c.alCambiar({ valor: control.value, archivos: control.files ? [...control.files] : null, estado: (t, clase = '') => { estadoCampo.textContent = t; estadoCampo.className = `texto-chico campo-accion-estado ${clase ? `estado-${clase}` : ''}`; }, ...ayudantes() }));
    const escaner = varias(c) ? el('span', { class: 'texto-suave texto-chico campo-escaner', 'aria-live': 'polite' }, 'Puedes elegir varias fotos (ej.: cédula por ambos lados): se juntan en un PDF.') : null;
    if (escaner) control.addEventListener('change', () => {
      const n = control.files.length;
      escaner.textContent = n > 1 ? `${n} archivos: se juntan en un PDF de ${n} páginas.` : 'Puedes elegir varias fotos (ej.: cédula por ambos lados): se juntan en un PDF.';
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `f-${c.id}` }, c.etiqueta), control,
      c.sugerencias ? el('datalist', { id: `l-${c.id}` }, c.sugerencias.map((t) => el('option', { value: t }))) : null,
      c.ayuda ? el('span', { class: 'texto-suave texto-chico' }, c.ayuda) : null, escaner, estadoCampo,
      c.accion ? accionCampo(c.accion, () => form) : null);
  });

  const guardar = boton(textoGuardar, { tipo: 'primario', type: 'submit' });
  const form = el('form', { class: 'modal-cuerpo' }, mensaje ? el('p', { class: 'modal-mensaje' }, mensaje) : null, entradas, error,
    el('div', { class: 'modal-pie' }, boton('Cancelar', { onclick: () => cerrar() }), guardar));

  const dialogo = el('dialog', { class: 'modal', 'aria-label': titulo },
    el('header', { class: 'modal-cabecera' },
      el('h2', {}, titulo),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))),
    form);

  function cerrar() { dialogo.close(); dialogo.remove(); }
  function ayudantes() {
    const fd = new FormData(form);
    const valores = Object.fromEntries(fd);
    for (const c of campos) if (c.tipo === 'checks') valores[c.id] = fd.getAll(c.id);
    for (const c of campos) if (c.tipo === 'lista') valores[c.id] = fd.getAll(c.id).map((x) => String(x).trim()).filter(Boolean);
    const poner = (id, v) => {
      if (v == null) return;
      const c = form.elements[id];
      if (c instanceof RadioNodeList || c?.type === 'checkbox') { const l = c instanceof RadioNodeList ? [...c] : [c]; l.forEach((x) => { if ([].concat(v).includes(x.value)) x.checked = true; }); return; }
      if (c) { c.value = v; c.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    const opciones = (id, lista) => { const c = form.elements[id]; if (c?.tagName === 'SELECT') c.replaceChildren(...lista.map(([v, t]) => el('option', { value: v }, t))); };
    return { valores, poner, opciones };
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    guardar.disabled = true; guardar.classList.add('cargando');
    const fd = new FormData(form);
    const valores = Object.fromEntries(fd);
    for (const c of campos) if (c.tipo === 'checks') valores[c.id] = fd.getAll(c.id);
    for (const c of campos) if (c.tipo === 'lista') valores[c.id] = fd.getAll(c.id).map((x) => String(x).trim()).filter(Boolean);
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
