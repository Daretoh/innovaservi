// Registro de horas (PC): copiar el horario de una fila a otras, como el cuadrito de relleno de una planilla.
// Arrastrar el cuadrito hacia arriba o abajo marca las filas de la misma faena y al soltar les copia la entrada y la salida;
// un clic sin arrastrar abre la lista del día para elegir a quiénes (Enzo, 2026-11-09).
import { abrirFormulario } from '../../../core/ui/modal.js?v=8dee83b';

// opciones: filas() → filas de esta tabla en orden; delDia() → todas las filas del día; nombre(x); aplicar(entrada, salida, destinos)
// Cada fila es { r, nueva, tr, campos } (campos.entrada / campos.salida son los inputs).
export function arrastrarHorario(tbody, { filas, delDia, nombre, aplicar }) {
  tbody.addEventListener('pointerdown', (ev) => {
    const boton = ev.target.closest('.hz-arrastre');
    if (!boton || ev.button !== 0) return;
    ev.preventDefault();
    const lista = filas();
    const origen = lista.find((x) => x.tr.contains(boton));
    if (!origen) return;
    const i0 = lista.indexOf(origen);
    let i1 = i0;
    const pintar = () => lista.forEach((x, i) => {
      x.tr.classList.toggle('hz-rango', i !== i0 && i >= Math.min(i0, i1) && i <= Math.max(i0, i1));
      x.tr.classList.toggle('hz-rango-origen', i === i0 && i1 !== i0);
    });
    try { boton.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
    document.body.classList.add('hz-arrastrando');
    const mover = (e) => {
      const tr = document.elementFromPoint(e.clientX, e.clientY)?.closest('tr');
      const i = lista.findIndex((x) => x.tr === tr);
      if (i >= 0 && i !== i1) { i1 = i; pintar(); }
    };
    const soltar = (e) => {
      boton.removeEventListener('pointermove', mover); boton.removeEventListener('pointerup', soltar); boton.removeEventListener('pointercancel', soltar);
      document.body.classList.remove('hz-arrastrando');
      const destinos = lista.filter((x, i) => i !== i0 && i >= Math.min(i0, i1) && i <= Math.max(i0, i1));
      lista.forEach((x) => x.tr.classList.remove('hz-rango', 'hz-rango-origen'));
      if (e.type === 'pointercancel') return;
      const { entrada, salida } = origen.campos;
      if (destinos.length) aplicar(entrada.value, salida.value, destinos);
      else elegir(origen);
    };
    boton.addEventListener('pointermove', mover); boton.addEventListener('pointerup', soltar); boton.addEventListener('pointercancel', soltar);
  });
  // Teclado: Enter o espacio sobre el cuadrito abre la lista
  tbody.addEventListener('keydown', (ev) => {
    const boton = ev.target.closest?.('.hz-arrastre');
    if (!boton || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault(); ev.stopPropagation();
    const origen = filas().find((x) => x.tr.contains(boton));
    if (origen) elegir(origen);
  });

  function elegir(origen) {
    const { entrada, salida } = origen.campos;
    if (!entrada.value || !salida.value) { aplicar(entrada.value, salida.value, []); return; }
    const otras = delDia().filter((x) => x !== origen);
    if (!otras.length) return;
    const faena = (x) => (x.r ? x.r.faena : x.campos.faena.value) || 'Sin faena';
    const horario = (x) => (x.campos.entrada.value && x.campos.salida.value ? `${x.campos.entrada.value} – ${x.campos.salida.value}` : 'sin horario');
    abrirFormulario({
      titulo: `Copiar ${entrada.value} – ${salida.value}`,
      mensaje: `Desde ${nombre(origen)}. Marca a quiénes les copias la entrada y la salida.`,
      campos: [{ id: 'filas', etiqueta: 'Personas de este día', tipo: 'checks', opciones: otras.map((x, i) => [String(i), `${nombre(x)} · ${faena(x)} · ${horario(x)}`]) }],
      textoGuardar: 'Copiar',
      alGuardar: async (v) => {
        const destinos = (v.filas ?? []).map((i) => otras[Number(i)]).filter(Boolean);
        if (!destinos.length) throw new Error('Marca al menos una persona.');
        await aplicar(entrada.value, salida.value, destinos);
      },
    });
  }
}
