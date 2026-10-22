// Iconos SVG de línea (24x24). Sin emojis en la interfaz.
const SVG = 'http://www.w3.org/2000/svg';

const TRAZOS = {
  inicio:    ['M3 10.5 12 3l9 7.5', 'M5 9v12h14V9', 'M10 21v-6h4v6'],
  users:     ['M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 1 1 7 0', 'M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6', 'M16 4.6a3.5 3.5 0 0 1 0 6.8', 'M18 14.3c2 .7 3.5 2.8 3.5 5.7'],
  building:  ['M4 21V4h11v17', 'M15 9h5v12', 'M2 21h20', 'M8 8h3', 'M8 12h3', 'M8 16h3'],
  briefcase: ['M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M8 7V5h8v2', 'M3 13h18'],
  salir:     ['M14 4h5v16h-5', 'M10 8l-4 4 4 4', 'M6 12h10'],
  abajo:     ['M6 9l6 6 6-6'],
  buscar:    ['M17 11a6 6 0 1 1-12 0 6 6 0 1 1 12 0', 'M20 20l-4.5-4.5'],
  mas:       ['M12 5v14', 'M5 12h14'],
  menu:      ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  candado:   ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  grafico:   ['M4 20h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  columnas:  ['M4 5h4v14H4z', 'M10 5h4v9h-4z', 'M16 5h4v11h-4z'],
  ajustes:   ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'],
  lista:     ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.5', 'M4.5 12h.5', 'M4.5 18h.5'],
  etiqueta:  ['M3 12V4h8l9 9-8 8z', 'M8.5 7.5a1 1 0 1 1-2 0 1 1 0 1 1 2 0'],
  arrastrar: ['M5 9h14', 'M5 15h14'],
  cerrar:    ['M6 6l12 12', 'M18 6 6 18'],
  check:     ['M5 12.5l4.5 4.5L19 7.5'],
  alerta:    ['M12 3 2 20h20z', 'M12 10v4', 'M12 17v.5'],
  escudo:    ['M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z', 'M9 12l2 2 4-4'],
  editar:    ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  basura:    ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  copiar:    ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  correo:    ['M3 6h18v12H3z', 'M3 7l9 6 9-6'],
  descargar: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  carpeta:   ['M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  reloj:     ['M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0', 'M12 8v4l3 2'],
  circulo:   ['M19 12a7 7 0 1 1-14 0 7 7 0 1 1 14 0'],
  menos:     ['M6 12h12'],
  volver:    ['M15 6l-6 6 6 6'],
  ojo:       ['M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z', 'M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0'],
  derecha:   ['M9 6l6 6-6 6'],
  camara:    ['M4 8h3l2-3h6l2 3h3v11H4z', 'M15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 1 1 7 0'],
  video:     ['M3 7h12v10H3z', 'M15 10l6-3v10l-6-3'],
  arriba:    ['M6 15l6-6 6 6'],
  calendario: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  luna:      ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  sol:       ['M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  pantalla:  ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  expandir:  ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  camion:    ['M2 6h12v10H2z', 'M14 9h4l3 3v4h-7', 'M8 18a2 2 0 1 1-4 0 2 2 0 1 1 4 0', 'M19 18a2 2 0 1 1-4 0 2 2 0 1 1 4 0'],
  llave:     ['M14.7 6.3a4 4 0 0 0 5 5L22 13.6 18.4 17l-2.3-2.3a4 4 0 0 0-5-5', 'M10.5 13.5 4 20a1.4 1.4 0 0 1-2-2l6.5-6.5'],
  documento: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h7'],
  caja:      ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4', 'M12 11v10'],
  dinero:    ['M3 7h18v10H3z', 'M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0', 'M6 10v4', 'M18 10v4'],
};

export function icono(nombre, { tam = 18, clase = 'icono' } = {}) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', tam);
  svg.setAttribute('height', tam);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', clase);
  for (const d of TRAZOS[nombre] ?? TRAZOS.alerta) {
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
