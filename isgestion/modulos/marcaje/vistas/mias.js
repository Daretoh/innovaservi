// Mis horas: las marcas de la persona vinculada a la cuenta, por mes, con lo trabajado cada día.
import { el } from '../../../core/ui/dom.js?v=a4abe71';
import { icono } from '../../../core/ui/iconos.js?v=a4abe71';
import { horas, hoyISO, rangoMes, moverMes, nombreMes, fechaLarga, nombreDia } from '../../../core/ui/formato.js?v=a4abe71';

const estado = { mes: hoyISO().slice(0, 7) };
const hora = (ts) => new Date(ts).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dia = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default async function vista(ctx) {
  const { desde, hasta } = rangoMes(estado.mes);
  const [{ data, error }, vin] = await Promise.all([
    ctx.api.rpc('mar_mias', { p_empresa: ctx.empresa.id, p_desde: desde, p_hasta: hasta }),
    ctx.api.from('usuario_empresa').select('persona_id').eq('user_id', ctx.usuario.id).eq('empresa_id', ctx.empresa.id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const mover = (n) => { estado.mes = moverMes(estado.mes, n); ctx.refrescar(); };
  const nav = el('div', { class: 'nav-periodo' },
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes anterior', onclick: () => mover(-1) }, icono('volver')),
    el('strong', {}, nombreMes(estado.mes)),
    el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mes siguiente', onclick: () => mover(1) }, icono('derecha')));
  if (!vin.data?.persona_id) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Mis horas'),
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu cuenta no está vinculada a una ficha de trabajador. Pídelo en Administración → Usuarios.'));
  }
  // Agrupa por día y suma las parejas entrada → salida
  const porDia = new Map();
  for (const m of data) {
    const d = dia(m.ts);
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(m);
  }
  let total = 0;
  const filas = [...porDia].map(([d, ms]) => {
    let min = 0; let ent = null;
    for (const m of ms) {
      if (m.tipo === 'entrada') ent = m;
      else if (ent) { min += Math.round((new Date(m.ts) - new Date(ent.ts)) / 60000); ent = null; }
    }
    total += min;
    return el('tr', {},
      el('td', {}, el('strong', {}, `${nombreDia(d)} ${fechaLarga(d)}`)),
      el('td', {}, ms.map((m) => el('span', { class: `chip ${m.tipo === 'entrada' ? 'chip-ok' : 'chip-prox'}`, title: m.corregida ? 'Corregida por administración' : m.origen === 'manual' ? 'Registrada por administración' : '' },
        `${m.tipo === 'entrada' ? 'Entrada' : 'Salida'} ${hora(m.ts)}${m.corregida || m.origen === 'manual' ? ' *' : ''}`))),
      el('td', { class: 'num' }, min ? horas(min) : ent ? el('span', { class: 'pct-medio' }, 'sin salida') : '—'));
  });
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Mis horas'), el('div', { class: 'listado-acciones' }, el('span', { class: 'total-grande' }, horas(total)))),
    nav,
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Día'), el('th', {}, 'Marcas'), el('th', { class: 'num' }, 'Trabajado'))),
      el('tbody', {}, filas.length ? filas : el('tr', {}, el('td', { colspan: 3, class: 'tabla-vacia' }, 'Sin marcas este mes.'))))),
    el('p', { class: 'texto-suave texto-chico' }, '* Marca registrada o corregida por administración. Si ves un error, avísale a tu jefatura.'));
}
