// Grupo → Personal del grupo: cada persona una vez (por RUT), con su vínculo en cada empresa: fijo o spot, cargo,
// sueldo base (si se ven Remuneraciones), socio o inactivo. El estado en cada empresa abre su ficha allí.
import { el } from '../../../core/ui/dom.js?v=b159e43';
import { icono } from '../../../core/ui/iconos.js?v=b159e43';
import { dinero } from '../../../core/ui/formato.js?v=b159e43';
import { nombreEmpresa } from '../../../core/empresas.js?v=b159e43';
import { nombreCompleto } from '../../remu/datos.js?v=b159e43';
import { empresasCon, marcaEmpresa, enlaceEmpresa } from '../empresas.js?v=b159e43';

const filtro = { ver: 'activos', texto: '' };

export default async function vista(ctx) {
  const empresas = empresasCon(ctx, 'rrhh');
  const datos = await Promise.all(empresas.map(async (g) => {
    const e = g.empresa.id;
    const conRemu = g.modulos.has('remu') && g.puede('remu', 'ver');
    const [vin, cond, cargos] = await Promise.all([
      ctx.api.from('persona_empresa').select('id, persona_id, estado, tipo_vinculo, cargo, personas(id, rut, nombres, apellido_paterno, apellido_materno)').eq('empresa_id', e).is('deleted_at', null),
      conRemu ? ctx.api.from('remu_condiciones').select('vinculo_id, modo, sueldo_base, socio, cargo_id').eq('empresa_id', e) : { data: [] },
      conRemu ? ctx.api.from('remu_cargos').select('id, nombre').eq('empresa_id', e) : { data: [] },
    ]);
    if (vin.error) return { g, error: vin.error.message, vin: [] };
    const c = new Map((cond.data ?? []).map((x) => [x.vinculo_id, x]));
    const nc = new Map((cargos.data ?? []).map((x) => [x.id, x.nombre]));
    return { g, vin: vin.data.map((v) => { const k = c.get(v.id); return { ...v, cond: k, cargoRemu: k?.cargo_id ? nc.get(k.cargo_id) : null }; }) };
  }));

  // Una fila por persona
  const personas = new Map();
  for (const d of datos) for (const v of d.vin) {
    if (!v.personas) continue;
    const p = personas.get(v.persona_id) ?? { p: v.personas, por: new Map() };
    const previo = p.por.get(d.g.empresa.id);
    if (!previo || (v.estado === 'activo' && previo.estado !== 'activo')) p.por.set(d.g.empresa.id, v);
    personas.set(v.persona_id, p);
  }
  const lista = [...personas.values()].sort((a, b) => nombreCompleto(a.p).localeCompare(nombreCompleto(b.p)));
  const vigentes = (x) => [...x.por.values()].filter((v) => v.estado === 'activo');
  const activa = (x) => vigentes(x).length > 0;
  const varias = (x) => vigentes(x).length > 1;
  const modo = (v) => (v.cond?.socio ? 'socio' : (v.cond?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora')) === 'fijo' ? 'fijo' : 'spot');
  const activos = lista.filter(activa);
  const vinActivos = activos.flatMap(vigentes);

  const cuerpo = el('tbody');
  const pintar = () => {
    const q = filtro.texto.trim().toLowerCase();
    const filas = lista.filter((x) => (filtro.ver === 'todos' || (filtro.ver === 'varias' ? varias(x) : activa(x)))
      && (!q || `${nombreCompleto(x.p)} ${x.p.rut}`.toLowerCase().includes(q)));
    cuerpo.replaceChildren(...(filas.length ? filas.map((x) => el('tr', {},
      el('td', {}, el('strong', {}, nombreCompleto(x.p)), el('div', { class: 'texto-suave texto-chico' }, x.p.rut)),
      datos.map((d) => {
        const v = x.por.get(d.g.empresa.id);
        if (!v) return el('td', { class: 'texto-suave' }, '—');
        const m = modo(v); const vig = v.estado === 'activo';
        const chip = el('span', { class: `chip ${!vig ? '' : m === 'fijo' ? 'chip-ok' : m === 'socio' ? 'chip-prox' : 'chip-pend'}` },
          !vig ? 'Inactivo' : m === 'fijo' ? 'Fijo' : m === 'socio' ? 'Socio' : 'Spot');
        return el('td', { class: vig ? '' : 'texto-suave' },
          enlaceEmpresa(ctx, d.g.empresa, ctx.ruta('rrhh.ficha', { p: v.persona_id }), chip),
          el('div', { class: 'texto-chico' }, [v.cargoRemu ?? v.cargo, m === 'fijo' && v.cond?.sueldo_base ? `sueldo ${dinero(v.cond.sueldo_base)}` : null].filter(Boolean).join(' · ')));
      })))
      : [el('tr', {}, el('td', { colspan: datos.length + 1, class: 'tabla-vacia' }, 'Nadie con ese filtro.'))]));
  };
  pintar();

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['activos', 'Activos'], ['varias', 'En varias empresas'], ['todos', 'Todos']].map(([k, t]) => el('button', { type: 'button', 'aria-pressed': String(filtro.ver === k),
      onclick: (ev) => { filtro.ver = k; for (const b of ev.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); pintar(); } }, t)));
  const buscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar por nombre o RUT', 'aria-label': 'Buscar', value: filtro.texto, oninput: (ev) => { filtro.texto = ev.target.value; pintar(); } });
  const tarjeta = (t, v, nota) => el('div', { class: 'ficha fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v)), nota ? el('span', { class: 'texto-suave texto-chico' }, nota) : null);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Personal del grupo'), el('div', { class: 'listado-acciones' }, buscar, segmento)),
    el('div', { class: 'fin-tarjetas' },
      tarjeta('Personas activas', activos.length, datos.map((d) => `${d.vin.filter((v) => v.estado === 'activo').length} en ${nombreEmpresa(d.g.empresa)}`).join(' · ')),
      tarjeta('En varias empresas', activos.filter(varias).length),
      tarjeta('Vínculos fijos', vinActivos.filter((v) => modo(v) === 'fijo').length),
      tarjeta('Vínculos spot', vinActivos.filter((v) => modo(v) === 'spot').length)),
    datos.filter((d) => d.error).map((d) => el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${nombreEmpresa(d.g.empresa)}: ${d.error}`)),
    el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Persona'), datos.map((d) => el('th', {}, marcaEmpresa(d.g.empresa))))), cuerpo)),
    el('p', { class: 'texto-suave texto-chico' }, 'Fijo o spot según sus Condiciones de pago en cada empresa (sin ellas, según el tipo de vínculo). Toca el estado para abrir su ficha en esa empresa.'));
}
