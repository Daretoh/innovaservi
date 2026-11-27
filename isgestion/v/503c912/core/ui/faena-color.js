// Color para distinguir faenas en una pantalla (Remuneraciones: detalle de pago y detalle del día).
// Cada faena distinta de la pantalla recibe un color de la paleta --faena-1 … --faena-8 (definida en estilos.css,
// con su versión para modo oscuro), en el orden en que aparecen; si hay más de 8 se repiten.
// Uso: const color = coloresFaenas(['CERMAQ · …', 'SAL LOBOS · …']); el('div', { style: `--faena:${color('CERMAQ · …')}` })
const N = 8;
const clave = (t) => String(t ?? '').trim().toLowerCase();

export function coloresFaenas(textos) {
  const mapa = new Map();
  for (const t of textos) { const k = clave(t); if (k && !mapa.has(k)) mapa.set(k, `var(--faena-${(mapa.size % N) + 1})`); }
  return (t) => mapa.get(clave(t)) ?? 'var(--borde)';
}
