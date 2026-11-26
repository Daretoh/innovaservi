// Campo de hora siempre en 24 h (2026-11-25, sugerencia #142 de Enzo): el <input type="time"> del navegador muestra 12 h
// (a. m. / p. m.) según el idioma del navegador o de Windows. Este es un campo de texto que se escribe rápido:
// "8" → 08:00, "830" → 08:30, "1830" → 18:30, "18.30" o "18h30" → 18:30. Al salir del campo queda como HH:MM; si lo
// escrito no es una hora válida vuelve al valor anterior y se marca en rojo un momento.
// Su valor es "" o "HH:MM", igual que el de type="time", así que el resto del código no cambia.
import { el } from './dom.js?v=cd68dd0';

export function normalizarHora(texto) {
  const t = String(texto ?? '').trim().toLowerCase();
  if (!t) return '';
  let h; let m;
  const partes = t.match(/^(\d{1,2})\s*[:.h,]\s*(\d{0,2})$/);
  if (partes) { h = partes[1]; m = partes[2].length === 1 ? `${partes[2]}0` : partes[2] || '0'; }   // "18:3" → 18:30
  else if (/^\d{1,4}$/.test(t)) {
    if (t.length <= 2) { h = t; m = '0'; }
    else if (t.length === 3) { h = t.slice(0, 1); m = t.slice(1); }
    else { h = t.slice(0, 2); m = t.slice(2); }
  } else return null;
  let hh = Number(h); const mm = Number(m);
  if (hh === 24 && mm === 0) hh = 0;
  if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function campoHora({ value = '', class: clase = '', ...attrs } = {}) {
  const inicial = normalizarHora(value) ?? '';
  const c = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '5', placeholder: 'hh:mm', spellcheck: 'false', class: `${clase} campo-hora`.trim(), value: inicial, ...attrs });
  c.dataset.ultimo = inicial;
  // Se registra antes que los "blur" de quien usa el campo: cuando esos corren, el valor ya está normalizado
  c.addEventListener('blur', () => {
    const v = normalizarHora(c.value);
    if (v === null) {
      c.value = c.dataset.ultimo ?? '';
      c.classList.add('campo-error');
      setTimeout(() => c.classList.remove('campo-error'), 1600);
      return;
    }
    c.value = v; c.dataset.ultimo = v;
  });
  c.addEventListener('focus', () => c.select());
  return c;
}
