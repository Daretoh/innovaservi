// Planificación semanal como hoja de cálculo (pedido de los usuarios, Enzo 2026-11-27), con la forma de la planilla
// que ya usan en Excel: cada faena del día es una COLUMNA (día arriba, faena y horario debajo), las personas van hacia
// abajo y al pie el total contra la dotación. Los días sin faenas no ocupan columnas.
// - Siglas: el cliente se muestra corto (CERMAQ → CQ, INNOVA SERVI → IS) con el sitio, como en su planilla.
// - Días plegables: un clic en el día lo pliega o despliega (los pasados parten plegados; se recuerda en el equipo).
// - Celda: buscador con los trabajadores activos de la empresa (core/ui/combo.js; libres del día primero). Nunca se
//   guarda un nombre que no sea de un trabajador: si no calza, queda escrito en rojo, sin guardar. Se muestra el
//   nombre y apellido (con la inicial del segundo apellido si se repite); el texto entre paréntesis de Excel, ej. "Melvin (Maquinas)", no cuenta.
// - Cargo: cada persona lleva uno de los roles operativos (Op, Sup, Prev) en su celda; parte con su rol de Roles
//   operativos y se cambia a mano en esa misma celda. Supervisores en rojo y prevencionistas en azul, como en Excel.
// - Teclado y mouse de planilla: flechas, Enter (elige y baja) y Tab (elige y pasa a la columna siguiente), Shift +
//   flechas o arrastrar para marcar, Ctrl + C / V (un bloque pegado desde Excel cae columna por columna en las faenas
//   y fila por fila hacia abajo), Supr quita a las marcadas y el cuadrito de la celda activa copia a la persona hacia
//   el lado (otros días) o hacia abajo. Quien ya está en una faena no se repite (se salta).
// - Se guarda solo al elegir o salir de la celda (la faena-día se crea una sola vez); las enviadas quedan de solo lectura.
import { el } from '../../core/ui/dom.js?v=2d079ab';
import { icono } from '../../core/ui/iconos.js?v=2d079ab';
import { avisar } from '../../core/ui/aviso.js?v=2d079ab';
import { normalizar } from '../../core/ui/combo.js?v=2d079ab';
import { nombreDia, hhmm, sumarDias, hoyISO, esFinde } from '../../core/ui/formato.js?v=2d079ab';
import { ROLES, nombreRol, nombreCompleto, faenasDelDia, etiquetaFaena, horarioDe, dotacionDe, dotTotal, turno } from './datos.js?v=2d079ab';

if (!document.getElementById('ope-hoja-css')) {
  document.head.append(el('link', { id: 'ope-hoja-css', rel: 'stylesheet', href: new URL('./hoja.css?v=2d079ab', import.meta.url).href }));
}

const CORTO = { op: 'Op', sup: 'Sup', prev: 'Prev' };
const PLEGADOS = 'isg.plan.hoja.plegados';   // { fecha: true/false } elegido a mano; sin elegir, los días pasados van plegados
const leerPlegados = () => { try { return JSON.parse(localStorage.getItem(PLEGADOS) ?? '{}') ?? {}; } catch { return {}; } };
const guardarPlegados = (m) => { try { const k = Object.keys(m).sort().slice(-60); localStorage.setItem(PLEGADOS, JSON.stringify(Object.fromEntries(k.map((x) => [x, m[x]])))); } catch { /* sin almacenamiento */ } };
// Sigla del cliente, como la usan en su planilla: una palabra → primera y última letra (CERMAQ → CQ); varias → iniciales
const SOBRA = new Set(['SPA', 'SA', 'S', 'A', 'LTDA', 'LIMITADA', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'CIA', 'EIRL', 'CHILE']);
export function sigla(nombre) {
  const palabras = String(nombre ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w && !SOBRA.has(w));
  if (!palabras.length) return String(nombre ?? '');
  if (palabras.length === 1) return palabras[0].length <= 4 ? palabras[0] : `${palabras[0][0]}${palabras[0][palabras[0].length - 1]}`;
  return palabras.slice(0, 3).map((w) => w[0]).join('');
}
let secuencia = 0;

export function hojaSemana(ctx, { lunes, base, semana, editable }) {
  const e = ctx.empresa.id;
  const puedeQuitar = ctx.puede('ope', 'eliminar');
  const uid = `hs${++secuencia}`;

  // Nombres: completo en la lista (único, con RUT si se repite) y corto en la celda (nombre y apellido si no se repite)
  const etiqueta = new Map(); const corto = new Map(); const porNombre = new Map();
  const cuenta = (f) => { const m = new Map(); for (const v of base.activos) { const n = f(v); m.set(n, (m.get(n) ?? 0) + 1); } return m; };
  const nCompletos = cuenta((v) => nombreCompleto(v.personas));
  // Nombre y apellido; si se repite, con la inicial del segundo apellido (Enzo, 2026-11-27); si aun así se repite, completo
  const cortoDe = (p) => `${p.nombres.split(' ')[0]} ${p.apellido_paterno}`;
  const conInicial = (p) => `${cortoDe(p)}${p.apellido_materno ? ` ${p.apellido_materno[0].toUpperCase()}.` : ''}`;
  const nCortos = cuenta((v) => cortoDe(v.personas));
  const nIniciales = cuenta((v) => conInicial(v.personas));
  for (const v of base.activos) {
    let n = nombreCompleto(v.personas);
    if (nCompletos.get(n) > 1) n += ` (${v.personas.rut ?? '?'})`;
    etiqueta.set(v.persona_id, n); porNombre.set(normalizar(n), v.persona_id);
    const p = v.personas;
    corto.set(v.persona_id, nCortos.get(cortoDe(p)) === 1 ? cortoDe(p) : nIniciales.get(conInicial(p)) === 1 ? conInicial(p) : n);
  }
  const activoDe = new Map(base.activos.map((v) => [v.persona_id, v]));
  const mostrar = (id) => corto.get(id) ?? (base.personas.get(id) ? cortoDe(base.personas.get(id).personas) : 'Otra empresa');
  const completo = (id) => etiqueta.get(id) ?? (base.personas.get(id) ? nombreCompleto(base.personas.get(id).personas) : 'Persona de otra empresa');
  const soloRut = (t) => String(t ?? '').toLowerCase().replace(/[^0-9k]/g, '');
  // Texto → persona_id (null = vacío, false = no es un trabajador activo o calzan varios)
  const resolver = (texto) => {
    const q = normalizar(String(texto ?? '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' '));
    if (!q) return null;
    if (porNombre.has(q)) return porNombre.get(q);
    const rq = soloRut(q);
    if (rq.length >= 7 && /^[\d.\-\sk]+$/.test(q)) { const r = base.activos.filter((v) => soloRut(v.personas.rut).startsWith(rq)); return r.length === 1 ? r[0].persona_id : false; }
    const palabras = q.split(' ');
    const calzan = base.activos.filter((v) => { const k = normalizar(`${etiqueta.get(v.persona_id)} ${corto.get(v.persona_id)}`); return palabras.every((p) => k.includes(p)); });
    if (calzan.length === 1) return calzan[0].persona_id;
    // "Luis" o "Luis Pérez": si una sola persona tiene ese nombre de pila (y apellido), es ella
    const exactos = calzan.filter((v) => normalizar(v.personas.nombres.split(' ')[0]) === palabras[0] && (palabras.length === 1 || normalizar(v.personas.apellido_paterno).startsWith(palabras[1])));
    return exactos.length === 1 ? exactos[0].persona_id : false;
  };

  // Columnas: una por faena-día (días sin faenas no ocupan columnas)
  const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(lunes, i));
  const cols = [];
  const delDia = new Map();
  for (const fecha of dias) {
    const fs = faenasDelDia(semana.faenas, fecha)
      .sort((a, b) => String(horarioDe(a, semana.planDe(a, fecha)).ini ?? '99').localeCompare(String(horarioDe(b, semana.planDe(b, fecha)).ini ?? '99')));
    delDia.set(fecha, []);
    for (const f of fs) {
      const p = semana.planDe(f, fecha);
      const b = { f, fecha, plan: p ? { id: p.id } : null, bloqueada: p?.estado === 'enviada', h: horarioDe(f, p), nec: dotTotal(dotacionDe(f, p)),
        iniciales: (p?.ope_plan_personas ?? []).map((x) => [x.persona_id, x.rol]), filas: [], planPromesa: null };
      b.j = cols.length; cols.push(b); delDia.get(fecha).push(b);
    }
  }
  const sinFaenas = dias.filter((d) => !delDia.get(d).length);
  let filasN = Math.max(3, ...cols.map((b) => Math.max(b.iniciales.length, b.nec) + 1));
  // Días plegados
  const elegidos = leerPlegados();
  const hoy = hoyISO();
  const plegado = (fecha) => elegidos[fecha] ?? fecha < hoy;
  const visible = (j) => !!cols[j] && !plegado(cols[j].fecha);

  function nuevaCelda(b, i, persona_id = null, rol = null) {
    const x = { b, i, persona_id, rol, cola: Promise.resolve(), error: null };
    const solo = !editable || b.bloqueada;
    x.inPer = el('input', { class: 'pl-in hs-persona', list: `${uid}-dl-${b.fecha}`, 'data-planilla': '', 'data-flechas': '',
      'data-sin-sugerencias': 'Ningún trabajador activo con ese nombre', spellcheck: 'false', autocomplete: 'off', readonly: solo, 'aria-label': `Persona ${i + 1} de ${b.f.titulo}` });
    // Cargo: botón chico (Op / Sup / Prev) que abre un menú con los nombres completos (la lista nativa salía angosta y cortada)
    x.inRol = el('button', { type: 'button', class: 'hs-rol', tabindex: '-1', disabled: solo, 'aria-haspopup': 'menu', 'aria-label': 'Cargo' });
    x.inPer.hsCelda = x;
    if (!solo) {
      x.inPer.addEventListener('change', () => confirmarPersona(x));
      x.inRol.addEventListener('click', (ev) => { ev.stopPropagation(); abrirMenuRol(x); });
    }
    x.td = el('td', { class: 'hs-c' }, el('div', { class: 'hs-c-in' }, x.inPer, x.inRol));
    pintarCelda(x);
    return x;
  }
  function pintarCelda(x) {
    if (!x.error) x.inPer.value = x.persona_id ? mostrar(x.persona_id) : '';
    x.inRol.textContent = CORTO[x.rol ?? 'op'];
    x.inRol.title = `Cargo: ${nombreRol[x.rol ?? 'op']}${x.b.bloqueada || !editable ? '' : ' (clic para cambiarlo)'}`;
    x.inRol.hidden = !x.persona_id;
    x.td.className = ['hs-c', x.persona_id ? `rol-${x.rol}` : '', x.error ? 'hs-error' : '', x.b.bloqueada || !editable ? 'hs-solo' : '', x.otraFaena ? 'hs-doble' : '', x.b.ini ? 'hs-ini' : '', plegado(x.b.fecha) ? 'hs-oculta' : ''].filter(Boolean).join(' ');
    x.inPer.title = x.error ?? (x.persona_id ? `${completo(x.persona_id)} · ${nombreRol[x.rol]}${x.otraFaena ? ` · también en ${x.otraFaena}` : ''}${activoDe.has(x.persona_id) ? '' : ' · no es trabajador activo'}` : '');
  }

  // Encabezados
  const trDias = el('tr', { class: 'hs-cab-dia' });
  const trFaenas = el('tr', { class: 'hs-cab-faena' });
  const trHoras = el('tr', { class: 'hs-cab-hora' });
  const trPie = el('tr', { class: 'hs-pie' });
  const diaTh = new Map();   // fecha → th del día
  const plegadoPie = new Map();   // fecha → total del día plegado
  for (const fecha of dias) {
    const bs = delDia.get(fecha); if (!bs.length) continue;
    const nombre = `${nombreDia(fecha)} ${Number(fecha.slice(8))}`;
    const th = el('th', { class: ['hs-dia', 'hs-ini', fecha === hoy ? 'hoy' : '', esFinde(fecha) ? 'finde' : ''].filter(Boolean).join(' '), 'data-dia': fecha },
      el('button', { type: 'button', class: 'hs-plegar', onclick: () => plegar(fecha), 'aria-expanded': 'true', title: `Plegar o desplegar el ${nombre.toLowerCase()}` },
        icono('volver', { tam: 12 }), el('span', { class: 'hs-dia-nom' }, nombre), el('span', { class: 'hs-dia-n' }, `${bs.length}`)));
    diaTh.set(fecha, th); trDias.append(th);
    // Columna angosta que queda cuando el día está plegado
    trFaenas.append(el('th', { class: 'hs-plegada hs-ini', 'data-dia': fecha, rowspan: '2', title: `${nombre}: ${bs.length} faena${bs.length === 1 ? '' : 's'} (clic en el día para desplegar)` },
      el('span', {}, `${bs.length} faena${bs.length === 1 ? '' : 's'}`)));
    const pp = el('span', { class: 'texto-chico' });
    plegadoPie.set(fecha, pp);
    trPie.append(el('td', { class: 'hs-plegada hs-ini', 'data-dia': fecha }, pp));
    bs.forEach((b, k) => {
      b.ini = k === 0;
      const et = etiquetaFaena(b.f, base);
      const ini = b.ini ? ' hs-ini' : '';
      const cab = `${sigla(et.cliente)}${et.sitio ? ` - ${et.sitio}` : ''}`;
      trFaenas.append(el('th', { class: `hs-faena${ini}`, style: `--c:${et.color}`, 'data-dia': fecha },
        el('button', { type: 'button', class: 'hs-faena-abrir', onclick: () => { location.href = ctx.ruta('ope.plan', { f: b.f.id, d: b.fecha }); }, title: `${et.texto} · ${b.f.titulo}\nAbrir la faena (vehículos, preparación, enviar)` },
          el('span', { class: 'hs-faena-cli' }, cab), el('span', { class: 'hs-faena-tit' }, b.f.titulo)),
        b.bloqueada ? el('span', { class: 'chip chip-ok hs-env' }, 'Enviada') : null));
      trHoras.append(el('th', { class: `hs-hora${ini}`, style: `--c:${et.color}`, 'data-dia': fecha }, turno(b.h.ini, b.h.fin) === 'noche' ? icono('luna', { tam: 12 }) : null,
        b.h.ini ? ` ${hhmm(b.h.ini)}${b.h.fin ? ` a ${hhmm(b.h.fin)}` : ''}` : 'Sin hora'));
      b.pie = el('span', { class: 'chip' });
      trPie.append(el('td', { class: `hs-total${ini}`, 'data-dia': fecha }, b.pie));
    });
  }
  const cuerpo = el('tbody', {});
  const agregarFilaTabla = () => {
    const i = cuerpo.children.length;
    const tr = el('tr', {});
    for (const b of cols) {
      if (b.ini) tr.append(el('td', { class: `hs-plegada hs-ini${plegado(b.fecha) ? '' : ' hs-oculta'}`, 'data-dia': b.fecha }));
      const [pid, rol] = b.iniciales[i] ?? [null, null]; const x = nuevaCelda(b, i, pid, rol); b.filas.push(x); tr.append(x.td);
    }
    cuerpo.append(tr);
  };
  for (let i = 0; i < filasN; i++) agregarFilaTabla();
  // Siempre una fila libre abajo de todo
  // Plegar o desplegar un día: se ocultan sus columnas y queda una angosta con el total
  function aplicarPlegado(fecha) {
    const p = plegado(fecha); const bs = delDia.get(fecha);
    const th = diaTh.get(fecha); if (!th) return;
    th.colSpan = p ? 1 : bs.length;
    th.classList.toggle('plegado', p);
    th.querySelector('.hs-plegar').setAttribute('aria-expanded', String(!p));
    for (const n of tabla.querySelectorAll(`[data-dia="${fecha}"]`)) {
      if (n === th) continue;
      n.classList.toggle('hs-oculta', n.classList.contains('hs-plegada') ? !p : p);
    }
    for (const b of bs) for (const x of b.filas) x.td.classList.toggle('hs-oculta', p);
  }
  function plegar(fecha) {
    elegidos[fecha] = !plegado(fecha); guardarPlegados(elegidos); aplicarPlegado(fecha);
    if (sel.b && !visible(sel.b.j)) { sel.a = sel.b = null; pintarSel(); }
    actualizarTodo();
  }
  const actualizarTodo = () => { if (todo) todo.hidden = !dias.some((d) => delDia.get(d).length && plegado(d)); };
  const asegurarFilaLibre = () => { while (cols.some((b) => { const u = b.filas[b.filas.length - 1]; return u.persona_id || u.error; })) { agregarFilaTabla(); filasN += 1; } };

  // Avisos, totales y sugerencias del día
  const datalists = new Map(dias.map((d) => [d, el('datalist', { id: `${uid}-dl-${d}` })]));
  const ocupadoEn = (bs) => {
    if (!bs?.length) return 'libre';
    if (bs.length > 1) return `en ${bs.length} faenas`;
    const t = bs[0].f.titulo.trim();
    return `en ${t.length > 26 ? `${t.slice(0, 25)}…` : t}`;
  };
  function refrescarDia(fecha) {
    const bs = delDia.get(fecha); if (!bs.length) return;
    const en = new Map();
    for (const b of bs) for (const x of b.filas) if (x.persona_id) en.set(x.persona_id, [...(en.get(x.persona_id) ?? []), b]);
    for (const b of bs) {
      const asg = b.filas.filter((x) => x.persona_id).length;
      b.pie.textContent = `${asg}${b.nec ? ` de ${b.nec}` : ''} persona${(b.nec || asg) === 1 ? '' : 's'}`;
      b.pie.className = `chip ${b.nec && asg >= b.nec ? 'chip-ok' : asg ? 'chip-venc' : 'chip-pend'}`;
      b.pie.title = b.nec ? 'Asignadas de la dotación necesaria' : 'La faena no tiene dotación: se define en la faena';
      for (const x of b.filas) {
        const otras = x.persona_id ? (en.get(x.persona_id) ?? []).filter((o) => o !== b) : [];
        x.otraFaena = otras.length ? otras.map((o) => o.f.titulo).join(', ') : null;
        pintarCelda(x);
      }
    }
    const tot = bs.reduce((n, b) => n + b.filas.filter((x) => x.persona_id).length, 0);
    plegadoPie.get(fecha).textContent = `${tot} pers.`;
    const libres = []; const ocupados = [];
    for (const v of base.activos) (en.has(v.persona_id) ? ocupados : libres).push(v);
    datalists.get(fecha).replaceChildren(...[...libres, ...ocupados].map((v) => el('option', { value: etiqueta.get(v.persona_id), label: `${nombreRol[v.rol]} · ${ocupadoEn(en.get(v.persona_id))}` })));
  }

  // Guardado
  let cambios = 0;
  const encolar = (x, fn) => { x.cola = x.cola.then(fn); return x.cola; };
  function asegurarPlan(b) {
    if (b.plan?.id) return Promise.resolve(b.plan.id);
    if (!b.planPromesa) {
      b.planPromesa = (async () => {
        const { data, error } = await ctx.api.from('ope_plan').insert({ empresa_id: e, faena_id: b.f.id, fecha: b.fecha, hora_inicio: b.f.hora_inicio, hora_fin: b.f.hora_fin }).select('id').single();
        if (!error) { b.plan = { id: data.id }; return data.id; }
        const r = await ctx.api.from('ope_plan').select('id').eq('faena_id', b.f.id).eq('fecha', b.fecha).maybeSingle();   // otra pestaña la creó
        if (r.data) { b.plan = { id: r.data.id }; return r.data.id; }
        b.planPromesa = null; throw error;
      })();
    }
    return b.planPromesa;
  }
  const marcarError = (x, msg) => { x.error = msg; avisar(msg, 'error'); refrescarDia(x.b.fecha); };

  function confirmarPersona(x, rolPedido = null) {
    if (!editable || x.b.bloqueada) return;
    const texto = x.inPer.value.trim();
    if (!x.error && texto === (x.persona_id ? mostrar(x.persona_id) : '')) return;   // sin cambios
    const id = resolver(texto);
    if (id === false) { marcarError(x, `"${texto}" no es un trabajador activo de la empresa (o hay varios con ese nombre): elige uno de la lista.${x.persona_id ? ` Sigue ${mostrar(x.persona_id)}.` : ''}`); return; }
    if ((id ?? null) === x.persona_id) { x.error = null; refrescarDia(x.b.fecha); return; }
    if (id && x.b.filas.some((o) => o !== x && o.persona_id === id)) { marcarError(x, `${mostrar(id)} ya está en esta faena.`); return; }
    if (x.persona_id && !puedeQuitar) { x.error = null; avisar('Tu rol no permite quitar personas de una faena (permiso eliminar de Faenas).', 'error'); refrescarDia(x.b.fecha); return; }
    const anterior = x.persona_id; const rolAnterior = x.rol;
    const rol = rolPedido || activoDe.get(id)?.rol || 'op';
    x.persona_id = id ?? null; x.rol = id ? rol : null; x.error = null;
    x.td.classList.add('hs-guardando');
    if (id) asegurarFilaLibre();
    refrescarDia(x.b.fecha);
    encolar(x, async () => {
      let puesto = false;
      try {
        if (id) {
          const plan_id = await asegurarPlan(x.b);
          const { error } = await ctx.api.from('ope_plan_personas').insert({ plan_id, empresa_id: e, persona_id: id, rol });
          if (error) throw error;
          puesto = true;
        }
        if (anterior) {
          const { data, error } = await ctx.api.from('ope_plan_personas').delete().eq('plan_id', x.b.plan.id).eq('persona_id', anterior).select('persona_id');
          if (error) throw error;
          if (!data?.length) throw new Error('la base no dejó quitarla');
        }
        cambios += 1;
      } catch (err) {
        if (puesto) {   // la nueva quedó y la anterior no salió: la anterior pasa a la primera celda libre de la columna
          const libre = x.b.filas.find((o) => !o.persona_id && !o.error);
          if (libre) { libre.persona_id = anterior; libre.rol = rolAnterior; }
          asegurarFilaLibre();
          avisar(`No se pudo quitar a ${mostrar(anterior)}: ${err.message}`, 'error');
        } else {
          x.persona_id = anterior; x.rol = rolAnterior;
          x.error = `No se guardó: ${err.message}`;
          x.inPer.value = texto;   // lo escrito no se pierde
          avisar(x.error, 'error');
        }
      } finally {
        x.td.classList.remove('hs-guardando');
        refrescarDia(x.b.fecha);
      }
    });
  }

  // Menú de cargo junto a la celda: Operario, Supervisor, Prevencionista (roles operativos existentes)
  let menuRol = null;
  const cerrarMenuRol = () => { menuRol?.remove(); menuRol = null; document.removeEventListener('mousedown', fueraMenu, true); document.removeEventListener('keydown', teclaMenu, true); document.removeEventListener('scroll', alDesplazar, true); };
  const alDesplazar = (ev) => { if (menuRol && !menuRol.contains(ev.target)) cerrarMenuRol(); };
  const fueraMenu = (ev) => { if (menuRol && !menuRol.contains(ev.target)) cerrarMenuRol(); };
  const teclaMenu = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); const x = menuRol?.hsCelda; cerrarMenuRol(); x?.inPer.focus(); } };
  function abrirMenuRol(x) {
    if (menuRol?.hsCelda === x) { cerrarMenuRol(); return; }
    cerrarMenuRol();
    const r = x.td.getBoundingClientRect();
    menuRol = el('div', { class: 'hs-menu-rol', role: 'menu', style: `top:${Math.round(r.bottom + 2)}px;left:${Math.round(Math.max(8, Math.min(r.right - 170, innerWidth - 178)))}px` },
      ROLES.map(([k, nombre]) => el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(x.rol === k), class: `rol-${k}`,
        onclick: () => { cerrarMenuRol(); confirmarRol(x, k); x.inPer.focus(); } }, el('span', { class: 'hs-menu-marca' }, x.rol === k ? icono('check', { tam: 14 }) : null), nombre)));
    menuRol.hsCelda = x;
    document.body.append(menuRol);
    menuRol.querySelector('[aria-checked="true"]')?.focus();
    setTimeout(() => { document.addEventListener('mousedown', fueraMenu, true); document.addEventListener('keydown', teclaMenu, true); document.addEventListener('scroll', alDesplazar, true); }, 0);
  }

  function confirmarRol(x, rol) {
    if (!editable || x.b.bloqueada || !x.persona_id) return;
    if (!rol || rol === x.rol) return;
    const anterior = x.rol; x.rol = rol; pintarCelda(x);
    encolar(x, async () => {
      x.td.classList.add('hs-guardando');
      const { data, error } = await ctx.api.from('ope_plan_personas').update({ rol }).eq('plan_id', x.b.plan?.id).eq('persona_id', x.persona_id).select('rol');
      x.td.classList.remove('hs-guardando');
      if (error || !data?.length) { x.rol = anterior; pintarCelda(x); avisar(`No se guardó el cargo: ${error?.message ?? 'sin permiso'}`, 'error'); return; }
      cambios += 1;
    });
  }

  // Pone a una persona como si se escribiera (pegar, rellenar, Supr). repetidos: quien ya está en esa faena se salta.
  function poner(x, texto, repetidos = null, rol = null) {
    if (!editable || x.b.bloqueada) return;
    if (repetidos && texto) { const id = resolver(texto); if (id && x.persona_id !== id && x.b.filas.some((o) => o !== x && o.persona_id === id)) { repetidos.n += 1; return; } }
    x.error = null; x.inPer.value = texto; confirmarPersona(x, rol);
  }
  const textoDe = (x) => (x.persona_id ? mostrar(x.persona_id) : '');

  // Selección y teclado (i = fila, j = columna)
  const celda = (i, j) => cols[j]?.filas[i];
  const sel = { a: null, b: null, arrastrando: false, nav: false };
  const posDe = (n) => { const x = n?.hsCelda; return x ? { i: x.i, j: x.b.j } : null; };
  const rango = () => (sel.a && sel.b ? { i0: Math.min(sel.a.i, sel.b.i), i1: Math.max(sel.a.i, sel.b.i), j0: Math.min(sel.a.j, sel.b.j), j1: Math.max(sel.a.j, sel.b.j) } : null);
  const varias = () => { const r = rango(); return !!r && (r.i0 !== r.i1 || r.j0 !== r.j1); };
  const asa = el('span', { class: 'hs-asa', title: 'Arrastra hacia el lado (otros días) o hacia abajo para copiar a la persona', 'aria-hidden': 'true' });
  const pintarSel = () => {
    cuerpo.querySelectorAll('.pl-sel').forEach((n) => n.classList.remove('pl-sel'));
    const r = rango();
    if (varias()) for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) if (visible(j)) celda(i, j)?.td.classList.add('pl-sel');
    const act = sel.b && celda(sel.b.i, sel.b.j);
    if (act && editable && !act.b.bloqueada && act.persona_id && !varias()) act.td.append(asa); else asa.remove();
  };
  const enfocar = (i, j, mantener = false, paso = 1) => {
    i = Math.max(0, Math.min(filasN - 1, i));
    const dir = paso < 0 ? -1 : 1;
    j = Math.max(0, Math.min(cols.length - 1, j));
    while (cols[j] && !visible(j)) j += dir;   // los días plegados se saltan
    if (!cols[j]) { j -= dir; while (cols[j] && !visible(j)) j -= dir; }
    if (!cols[j]) return;
    const x = celda(i, j); if (!x) return;
    sel.nav = true; x.inPer.focus(); sel.nav = false;
    try { x.inPer.select(); } catch { /* */ }
    if (!mantener) sel.a = { i, j };
    sel.b = { i, j }; pintarSel(); x.td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const tabla = el('table', { class: 'hs-tabla' },
    el('thead', {}, trDias, trFaenas, trHoras), cuerpo, el('tfoot', {}, trPie));
  let ultimaTecla = null;
  tabla.addEventListener('keydown', (ev) => { ultimaTecla = ev.key; }, true);
  // Enter con la lista abierta: combo.js elige y detiene la tecla; aquí se baja de fila al confirmar
  tabla.addEventListener('change', (ev) => {
    const x = ev.target.hsCelda;
    if (x && ultimaTecla === 'Enter') { ultimaTecla = null; setTimeout(() => enfocar(x.i + 1, x.b.j), 0); }
  });
  tabla.addEventListener('focusin', (ev) => { if (sel.nav) return; const p = posDe(ev.target); if (p) { sel.a = sel.b = p; pintarSel(); } });
  tabla.addEventListener('mousedown', (ev) => {
    if (ev.target === asa || ev.target.classList?.contains('hs-rol')) return;
    const p = posDe(ev.target); if (!p) return;
    if (ev.shiftKey && sel.a) { ev.preventDefault(); sel.b = p; pintarSel(); return; }
    sel.arrastrando = true; sel.a = sel.b = p; pintarSel();
  });
  tabla.addEventListener('mouseover', (ev) => {
    if (!sel.arrastrando || !(ev.buttons & 1)) return;
    const p = posDe(ev.target) ?? posDe(ev.target.closest?.('td')?.querySelector('.hs-persona'));
    if (!p || (p.i === sel.b?.i && p.j === sel.b?.j)) return;
    sel.b = p; pintarSel(); if (varias()) window.getSelection()?.removeAllRanges();
  });
  const soltar = () => { sel.arrastrando = false; };
  document.addEventListener('mouseup', soltar);

  tabla.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented) return;   // la lista de sugerencias ya usó la tecla
    const n = ev.target; const p = posDe(n); if (!p) return;
    const r0 = rango();   // la tecla parte de la celda activa (si está fuera de lo marcado, se marca solo ella)
    if (!r0 || p.i < r0.i0 || p.i > r0.i1 || p.j < r0.j0 || p.j > r0.j1) { sel.a = sel.b = p; pintarSel(); }
    const k = ev.key; const mod = ev.ctrlKey || ev.metaKey;
    const x = celda(p.i, p.j);
    if (k === 'Escape') { x.error = null; pintarCelda(x); x.inPer.select(); sel.a = sel.b = p; pintarSel(); return; }
    const todoMarcado = n.readOnly || (n.selectionStart === 0 && n.selectionEnd === n.value.length);
    if (k === 'Delete' && (varias() || todoMarcado)) {
      ev.preventDefault();
      const r = rango() ?? { i0: p.i, i1: p.i, j0: p.j, j1: p.j };
      for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) {
        const c = visible(j) && celda(i, j); if (!c) continue;
        if (c.persona_id) poner(c, ''); else if (c.error) { c.error = null; pintarCelda(c); }
      }
      return;
    }
    const borde = (lado) => { if (n.readOnly) return true; const s = n.selectionStart; const f = n.selectionEnd; const l = n.value.length; if (s === 0 && f === l) return true; return lado < 0 ? s === 0 && f === 0 : s === l && f === l; };
    let di = 0; let dj = 0;
    if (k === 'ArrowDown') di = 1; else if (k === 'ArrowUp') di = -1;
    else if (k === 'ArrowLeft' && (ev.shiftKey || borde(-1))) dj = -1;
    else if (k === 'ArrowRight' && (ev.shiftKey || borde(1))) dj = 1;
    else if (k === 'Enter' && !mod) { ev.preventDefault(); confirmarPersona(x); enfocar(p.i + (ev.shiftKey ? -1 : 1), p.j); return; }
    else if (k === 'Tab') { ev.preventDefault(); confirmarPersona(x); enfocar(p.i, p.j + (ev.shiftKey ? -1 : 1), false, ev.shiftKey ? -1 : 1); return; }
    if (!di && !dj) return;
    ev.preventDefault();
    confirmarPersona(x);
    if (ev.shiftKey) { const b = sel.b ?? p; enfocar(b.i + di, b.j + dj, true, dj || 1); return; }
    enfocar(p.i + di, p.j + dj, false, dj || 1);
  });

  tabla.addEventListener('copy', (ev) => {
    const n = document.activeElement; const p = posDe(n); if (!p) return;
    let t;
    if (varias()) {
      const r = rango(); const lineas = [];
      for (let i = r.i0; i <= r.i1; i++) { const f = []; for (let j = r.j0; j <= r.j1; j++) if (visible(j)) f.push(textoDe(celda(i, j))); lineas.push(f.join('\t')); }
      t = lineas.join('\n');
    } else if (n.selectionStart === n.selectionEnd || (n.selectionStart === 0 && n.selectionEnd === n.value.length)) t = textoDe(celda(p.i, p.j));
    else return;
    ev.preventDefault(); ev.clipboardData.setData('text/plain', t); avisar(varias() ? 'Copiado.' : 'Celda copiada.');
  });
  tabla.addEventListener('paste', (ev) => {
    const p = posDe(ev.target); if (!p) return;
    const t = ev.clipboardData?.getData('text/plain') ?? ''; if (!t.trim()) return;
    ev.preventDefault();
    if (!editable) { avisar('No tienes permiso para cambiar la planificación.', 'error'); return; }
    const bloque = t.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
    const rep = { n: 0 }; let malos = 0; let enviadas = 0;
    const r = varias() ? rango() : null;
    const uno = bloque.length === 1 && bloque[0].length === 1;
    const aplicar = (x, v) => {
      if (!x) return;
      const s = String(v ?? '').trim();
      if (!s && !x.persona_id) return;
      if (x.b.bloqueada) { enviadas += 1; return; }
      if (s && resolver(s) === false) malos += 1;
      poner(x, s, rep);
    };
    if (uno && r) {   // un valor sobre varias celdas marcadas: se repite en todas (como Excel)
      for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) if (visible(j)) aplicar(celda(i, j), bloque[0][0]);
    } else {          // un bloque: desde la celda de arriba a la izquierda (agrega filas si faltan)
      const i0 = r ? r.i0 : p.i; const j0 = r ? r.j0 : p.j;
      while (i0 + bloque.length > filasN) { agregarFilaTabla(); filasN += 1; }
      const destino = []; for (let j = j0; j < cols.length; j++) if (visible(j)) destino.push(j);   // los días plegados se saltan
      bloque.forEach((fila, a) => fila.forEach((v, b) => { if (b < destino.length) aplicar(celda(i0 + a, destino[b]), v); }));
      sel.a = { i: i0, j: j0 }; sel.b = { i: i0 + bloque.length - 1, j: destino[Math.min(destino.length, Math.max(...bloque.map((f) => f.length))) - 1] ?? j0 }; pintarSel();
    }
    asegurarFilaLibre();
    const notas = [malos ? `${malos} nombre${malos === 1 ? '' : 's'} no calza${malos === 1 ? '' : 'n'} con un trabajador (quedan en rojo, sin guardar)` : '',
      rep.n ? `${rep.n} ya estaba${rep.n === 1 ? '' : 'n'} en esa faena` : '', enviadas ? `${enviadas} celda${enviadas === 1 ? '' : 's'} de faenas enviadas no se tocaron` : ''].filter(Boolean);
    avisar(notas.length ? `Pegado. ${notas.join('; ')}.` : 'Pegado.', malos ? 'error' : 'ok');
  });

  // Cuadrito de relleno: copia a la persona de la celda activa hacia el lado (otros días) o hacia abajo
  asa.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !sel.b) return;
    ev.preventDefault(); ev.stopPropagation();
    const o = { ...sel.b }; const origen = celda(o.i, o.j); const valor = textoDe(origen);
    let fin = { ...o };
    const destinos = () => {
      const lista = [];
      if (Math.abs(fin.j - o.j) >= Math.abs(fin.i - o.i)) { for (let j = Math.min(o.j, fin.j); j <= Math.max(o.j, fin.j); j++) if (j !== o.j) lista.push(celda(o.i, j)); }
      else for (let i = Math.min(o.i, fin.i); i <= Math.max(o.i, fin.i); i++) if (i !== o.i) lista.push(celda(i, o.j));
      return lista.filter((x) => x && visible(x.b.j));
    };
    const marcar = () => { cuerpo.querySelectorAll('.hs-relleno').forEach((n) => n.classList.remove('hs-relleno')); for (const x of destinos()) x.td.classList.add('hs-relleno'); };
    try { asa.setPointerCapture(ev.pointerId); } catch { /* */ }
    const mover = (e2) => { const td = document.elementFromPoint(e2.clientX, e2.clientY)?.closest('td.hs-c'); const p = posDe(td?.querySelector('.hs-persona')); if (p) { fin = p; marcar(); } };
    const terminar = () => {
      asa.removeEventListener('pointermove', mover); asa.removeEventListener('pointerup', terminar); asa.removeEventListener('pointercancel', terminar);
      const lista = destinos();
      cuerpo.querySelectorAll('.hs-relleno').forEach((n) => n.classList.remove('hs-relleno'));
      if (!lista.length || !valor) return;
      const rep = { n: 0 };
      for (const x of lista) if (!x.b.bloqueada) poner(x, valor, rep, origen.rol);
      if (rep.n) avisar(`${valor} ya estaba en ${rep.n === 1 ? 'una de esas faenas' : `${rep.n} de esas faenas`}: se saltó${rep.n === 1 ? '' : 'aron'}.`);
      sel.a = o; sel.b = fin; pintarSel();
    };
    asa.addEventListener('pointermove', mover); asa.addEventListener('pointerup', terminar); asa.addEventListener('pointercancel', terminar);
  });

  for (const fecha of dias) refrescarDia(fecha);
  const todo = el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: () => { for (const d of dias) if (delDia.get(d).length && plegado(d)) { elegidos[d] = false; aplicarPlegado(d); } guardarPlegados(elegidos); actualizarTodo(); } }, 'Desplegar todos los días');
  for (const fecha of dias) aplicarPlegado(fecha);
  actualizarTodo();

  return {
    nodo: el('div', { class: 'hs' },
      [...datalists.values()],
      cols.length
        ? el('div', { class: 'hs-contenedor' }, tabla)
        : el('p', { class: 'texto-suave' }, 'No hay faenas esta semana. Créalas en el Calendario.'),
      el('div', { class: 'hs-pie-info texto-suave texto-chico' },
        sinFaenas.length && cols.length ? el('span', {}, `Sin faenas: ${sinFaenas.map((d) => `${nombreDia(d)} ${Number(d.slice(8))}`).join(', ')}.`) : null,
        todo,
        el('details', { class: 'hs-atajos' }, el('summary', {}, 'Atajos'), el('p', { class: 'pl-ayuda' },
        el('kbd', {}, '↑↓←→'), ' moverse · ', el('kbd', {}, 'Enter'), ' elige y baja · ', el('kbd', {}, 'Tab'), ' elige y pasa a la faena siguiente · ', el('kbd', {}, 'Shift'), ' + flechas o arrastrar: marcar · ',
        el('kbd', {}, 'Ctrl'), ' + ', el('kbd', {}, 'C'), ' / ', el('kbd', {}, 'V'), ' copiar y pegar (también un bloque desde Excel) · ', el('kbd', {}, 'Supr'), ' quita a las marcadas · el cuadrito copia a la persona hacia el lado o hacia abajo · el cargo (Op, Sup, Prev) se cambia con un clic en él · clic en el día lo pliega · se guarda solo')))),
    huboCambios: () => cambios > 0,
    terminar: async () => { cerrarMenuRol(); document.activeElement?.blur?.(); document.removeEventListener('mouseup', soltar); await new Promise((r) => setTimeout(r, 200)); await Promise.all(cols.flatMap((b) => b.filas.map((x) => x.cola))); },
  };
}
