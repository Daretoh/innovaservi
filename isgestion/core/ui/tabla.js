// Listado estándar: barra con búsqueda y acciones + tabla.
// columnas: [{ titulo, valor: (fila) => texto }]
import { el } from './dom.js?v=81adf5e';
import { icono } from './iconos.js?v=81adf5e';

// alFila(fila): opcional, la fila se puede tocar (abre su ficha).
export function listado({ titulo, columnas, filas, acciones = [], vacio = 'No hay registros.', alFila = null }) {
  const cuerpo = el('tbody');
  const contador = el('span', { class: 'texto-suave' });
  const buscador = el('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', class: 'campo' });

  const texto = (v) => (v instanceof Node ? v.textContent : String(v ?? ''));
  const textoFila = filas.map((f) => columnas.map((c) => texto(c.valor(f))).join(' ').toLowerCase());

  function pintar() {
    const q = buscador.value.trim().toLowerCase();
    const visibles = filas.filter((_, i) => !q || textoFila[i].includes(q));
    contador.textContent = `${visibles.length} de ${filas.length}`;
    cuerpo.replaceChildren(
      ...(visibles.length
        ? visibles.map((f) => el('tr', alFila ? { class: 'fila-enlace', title: 'Abrir', onclick: () => alFila(f) } : {}, columnas.map((c) => el('td', {}, c.valor(f) ?? ''))))
        : [el('tr', {}, el('td', { colspan: columnas.length, class: 'tabla-vacia' }, icono(q ? 'buscar' : 'carpeta', { tam: 28 }), q ? 'Nada coincide con la búsqueda.' : vacio))]),
    );
  }
  buscador.addEventListener('input', pintar);
  pintar();

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('h1', {}, titulo),
      el('div', { class: 'listado-acciones' },
        el('label', { class: 'buscador' }, icono('buscar', { tam: 16 }), buscador),
        contador,
        acciones,
      ),
    ),
    el('div', { class: 'tabla-contenedor' },
      el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, columnas.map((c) => el('th', {}, c.titulo)))),
        cuerpo,
      ),
    ),
  );
}

export function boton(texto, { icono: ic, tipo = 'secundario', ...attrs } = {}) {
  return el('button', { type: 'button', class: `boton boton-${tipo}`, ...attrs },
    ic ? icono(ic, { tam: 16 }) : null, texto);
}
