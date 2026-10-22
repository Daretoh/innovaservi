// Clientes del taller (CRM), como "Fichas de cliente" del OS de IS Performance: lista con búsqueda, filtro natural /
// empresa, orden (recientes, antiguos, mayor gasto) y días desde la última visita con colores; aviso de posibles
// duplicados con "Unir"; ficha con total gastado, visitas, última visita y ticket, historial de servicios, vehículos,
// servicios usados, cotizaciones, corregir cliente (mover vehículos o cotizaciones a otro), datos y facturación,
// y postventa: mensaje de reactivación por WhatsApp y bitácora de contacto.
import { el } from '../../../core/ui/dom.js';
import { icono } from '../../../core/ui/iconos.js';
import { boton } from '../../../core/ui/tabla.js';
import { avisar } from '../../../core/ui/aviso.js';
import { dinero, fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js';
import { nombreEmpresa } from '../../../core/empresas.js';
import { nombreEstado, verPatente, nombreVehiculo, totales, esEmpresa } from '../datos.js';

const estado = { q: '', clase: 'todos', orden: 'reciente', sel: null, ordenBitacora: 'desc' };
const RESULTADOS = ['Contactado', 'Contestó', 'No contestó', 'Agendó', 'No interesado', 'Volver a contactar'];
const CHIP_RESULTADO = { 'Contestó': 'chip-ok', 'Agendó': 'chip-ok', 'No contestó': 'chip-prox', 'Volver a contactar': 'chip-prox', 'No interesado': 'chip-venc' };

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const digitos = (s) => String(s ?? '').replace(/\D/g, '').slice(-8);
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(`${iso}T00:00:00`)) / 86400000) : null);
const textoDias = (d) => (d == null ? 'sin visitas' : d < 0 ? `en ${-d} ${d === -1 ? 'día' : 'días'}` : d === 0 ? 'hoy' : `hace ${d} ${d === 1 ? 'día' : 'días'}`);
// Reactivación por días sin venir: hasta 60 al día, 61–120 atención, más de 120 crítico
const chipDias = (d) => el('span', { class: `chip ${d == null ? 'chip-na' : d <= 60 ? 'chip-ok' : d <= 120 ? 'chip-prox' : 'chip-venc'}` }, textoDias(d));
const claseDe = (t) => t.clase ?? (esEmpresa(t) ? 'empresa' : 'natural');
const nombreDe = (t) => t.nombre_fantasia || t.razon_social || '(sin nombre)';
const telInternacional = (t) => { const d = String(t ?? '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('56')) return d; if (d.length === 9 && d[0] === '9') return `56${d}`; if (d.length === 8) return `569${d}`; return d; };
const servicioCorto = (n) => { const i = String(n ?? '').indexOf('—'); return (i > 0 ? n.slice(0, i) : n ?? '').trim(); };

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const conCot = ctx.puede('cotizaciones', 'ver');
  const [ter, ord, veh, cot, con] = await Promise.all([
    ctx.api.from('terceros').select('id, rut, razon_social, nombre_fantasia, giro, direccion, contacto, email, telefono, clase, representante, por_cotizar')
      .eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('tal_ordenes').select('id, numero, tercero_id, vehiculo_id, estado, cobrado, fecha_cita, ingreso_at, created_at, descuento, doc_tipo, tipo_venta, abono, tal_orden_servicios(nombre, precio)')
      .eq('empresa_id', e).neq('estado', 'anulada'),
    ctx.api.from('tal_vehiculos').select('id, tercero_id, marca, modelo, patente').eq('empresa_id', e).is('deleted_at', null),
    conCot ? ctx.api.from('cot_cotizaciones').select('id, numero, fecha, estado, tercero_id, cot_grupos(vehiculo_id, titulo, patente)').eq('empresa_id', e).is('deleted_at', null).order('numero', { ascending: false })
      : Promise.resolve({ data: [] }),
    ctx.api.from('tal_contactos').select('*').eq('empresa_id', e).is('deleted_at', null).order('fecha', { ascending: false }),
  ]);
  for (const r of [ter, ord, veh, cot, con]) if (r.error) throw r.error;
  const vehiculo = new Map(veh.data.map((v) => [v.id, v]));

  // Un registro por cliente con sus visitas (órdenes), total gastado (cobrado), última visita, vehículos y servicios
  const clientes = ter.data.map((t) => {
    const items = ord.data.filter((o) => o.tercero_id === t.id).map((o) => ({ ...o, fecha: o.fecha_cita || diaLocal(o.ingreso_at) || diaLocal(o.created_at), v: vehiculo.get(o.vehiculo_id) }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    const vehs = new Map();
    veh.data.filter((v) => v.tercero_id === t.id).forEach((v) => vehs.set(v.id, { v, n: 0 }));
    items.forEach((o) => { if (o.v) { const x = vehs.get(o.v.id) ?? { v: o.v, n: 0 }; x.n += 1; vehs.set(o.v.id, x); } });
    const servicios = new Map();
    items.forEach((o) => o.tal_orden_servicios.forEach((s) => servicios.set(s.nombre, (servicios.get(s.nombre) ?? 0) + 1)));
    const total = items.filter((o) => o.cobrado).reduce((s, o) => s + totales(o, o.tal_orden_servicios).ingreso, 0);
    return { t, items, vehs: [...vehs.values()], servicios, total, visitas: items.length, ultima: items[0]?.fecha ?? '', cots: cot.data.filter((c) => c.tercero_id === t.id) };
  });

  // Posibles duplicados: mismo nombre o mismo teléfono
  const duplicados = [];
  const vistos = new Set();
  const par = (a, b, motivo) => { const k = [a.t.id, b.t.id].sort().join('|'); if (a.t.id !== b.t.id && !vistos.has(k)) { vistos.add(k); duplicados.push({ a, b, motivo }); } };
  const porNombre = new Map(); const porTel = new Map();
  clientes.forEach((c) => {
    const n = norm(nombreDe(c.t)); if (n.length > 2) { if (porNombre.has(n)) par(porNombre.get(n), c, 'mismo nombre'); else porNombre.set(n, c); }
    const d = digitos(c.t.telefono); if (d.length >= 7) { if (porTel.has(d)) par(porTel.get(d), c, 'mismo teléfono'); else porTel.set(d, c); }
  });

  // ---------- Lista
  const buscador = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar por nombre, teléfono o RUT…', value: estado.q });
  const lista = el('div', { class: 'crm-lista' });
  const ficha = el('div', { class: 'crm-ficha' });
  const filtro = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Tipo de cliente' },
    [['todos', 'Todos'], ['natural', 'Naturales'], ['empresa', 'Empresas']].map(([k, n]) => el('button', { type: 'button', 'aria-pressed': String(estado.clase === k), onclick: () => { estado.clase = k; estado.sel = null; ctx.refrescar(); } }, n)));
  const orden = el('select', { class: 'campo campo-chico', 'aria-label': 'Ordenar' },
    [['reciente', 'Más recientes'], ['antiguo', 'Más antiguos'], ['gasto', 'Mayor gasto']].map(([k, n]) => el('option', { value: k, selected: estado.orden === k }, n)));
  orden.addEventListener('change', () => { estado.orden = orden.value; pintarLista(); });
  buscador.addEventListener('input', () => { estado.q = buscador.value; pintarLista(); });

  function visibles() {
    const q = norm(estado.q);
    return clientes.filter((c) => (estado.clase === 'todos' || claseDe(c.t) === estado.clase)
      && (!q || norm([nombreDe(c.t), c.t.razon_social, c.t.representante, c.t.telefono, c.t.rut].join(' ')).includes(q)))
      .sort((a, b) => (estado.orden === 'gasto' ? b.total - a.total : estado.orden === 'antiguo' ? (a.ultima || '9').localeCompare(b.ultima || '9') : (b.ultima || '').localeCompare(a.ultima || '')));
  }
  function pintarLista() {
    const l = visibles();
    lista.replaceChildren(...(l.length ? l.map((c) => el('button', { type: 'button', class: `crm-item${estado.sel === c.t.id ? ' sel' : ''}`, onclick: () => { estado.sel = c.t.id; pintarLista(); } },
      el('strong', {}, icono(claseDe(c.t) === 'empresa' ? 'building' : 'users', { tam: 13 }), ' ', nombreDe(c.t)),
      claseDe(c.t) === 'empresa' && c.t.representante ? el('span', { class: 'texto-suave texto-chico' }, c.t.representante) : null,
      el('span', { class: 'crm-item-pie' }, chipDias(diasDesde(c.ultima)), el('span', { class: 'texto-suave texto-chico' }, dinero(c.total)))))
      : [el('p', { class: 'texto-suave', style: 'padding:16px' }, estado.q ? 'Sin resultados.' : 'Aún no hay clientes.')]));
    if (!l.some((c) => c.t.id === estado.sel)) estado.sel = l[0]?.t.id ?? null;
    lista.querySelectorAll('.crm-item').forEach((b, i) => b.classList.toggle('sel', l[i]?.t.id === estado.sel));
    pintarFicha(clientes.find((c) => c.t.id === estado.sel));
  }

  // ---------- Ficha
  function pintarFicha(c) {
    if (!c) { ficha.replaceChildren(); return; }
    const t = c.t; const empresa = claseDe(t) === 'empresa'; const dias = diasDesde(c.ultima);
    const kpi = (titulo, valor) => el('div', { class: 'ficha fin-tarjeta' }, el('span', { class: 'texto-suave texto-chico' }, titulo), el('strong', {}, valor));
    const seccion = (titulo, cuerpo, abierta = false) => el('details', { class: 'ficha doc-grupo crm-sec', open: abierta }, el('summary', {}, el('strong', {}, titulo)), cuerpo);

    // Historial con buscador
    const histBuscar = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar en el historial (vehículo, servicio, fecha…)' });
    const filas = c.items.map((o) => el('tr', {},
      el('td', {}, fechaLarga(o.fecha)),
      el('td', {}, o.v ? el('a', { href: ctx.ruta('taller.vehiculo', { id: o.v.id }) }, el('strong', {}, nombreVehiculo(o.v)), o.v.patente ? ` · ${verPatente(o.v.patente)}` : '') : '—'),
      el('td', {}, o.tal_orden_servicios.map((s) => servicioCorto(s.nombre)).join(' + ') || '—', o.tipo_venta !== 'normal' ? el('span', { class: 'chip chip-pend', style: 'margin-left:6px' }, o.tipo_venta) : null),
      el('td', {}, el('span', { class: `chip ${o.cobrado ? 'chip-ok' : 'chip-pend'}` }, o.cobrado ? 'Cobrado' : nombreEstado[o.estado] ?? o.estado)),
      el('td', { class: 'num' }, dinero(totales(o, o.tal_orden_servicios).total)),
      el('td', {}, el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('taller.orden', { id: o.id }) }, `N° ${o.numero}`))));
    const tbody = el('tbody', {}, filas.length ? filas : el('tr', {}, el('td', { colspan: 6, class: 'tabla-vacia' }, 'Sin visitas al taller.')));
    histBuscar.addEventListener('input', () => { const q = histBuscar.value.toLowerCase().trim(); filas.forEach((f) => { f.style.display = !q || f.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });

    // Cotizaciones del cliente
    const cotizaciones = c.cots.length
      ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['N°', 'Fecha', 'Vehículos', 'Estado', ''].map((x) => el('th', {}, x)))),
        el('tbody', {}, c.cots.map((q) => el('tr', {},
          el('td', {}, el('strong', {}, `N° ${String(q.numero).padStart(6, '0')}`)), el('td', {}, fechaLarga(q.fecha)),
          el('td', {}, q.cot_grupos.map((g) => [g.titulo, verPatente(g.patente)].filter(Boolean).join(' ')).join(', ') || '—'),
          el('td', {}, el('span', { class: 'chip chip-na' }, q.estado)),
          el('td', {}, el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta('cotizaciones.editor', { id: q.id }) }, 'Abrir')))))))
      : el('p', { class: 'texto-suave' }, 'Sin cotizaciones aún.');

    // Corregir cliente: mover vehículos y cotizaciones a otro cliente
    const destino = el('select', { class: 'campo' }, el('option', { value: '' }, '— elegir cliente destino —'),
      clientes.filter((x) => x.t.id !== t.id).sort((a, b) => nombreDe(a.t).localeCompare(nombreDe(b.t))).map((x) => el('option', { value: x.t.id }, `${nombreDe(x.t)}${x.t.telefono ? ` · ${x.t.telefono}` : ''}`)));
    const marcaVeh = c.vehs.map((x) => ({ id: x.v.id, cb: el('input', { type: 'checkbox' }), x }));
    const marcaCot = c.cots.filter((q) => q.estado === 'borrador').map((q) => ({ id: q.id, cb: el('input', { type: 'checkbox' }), q }));
    const corregir = el('div', {},
      el('p', { class: 'texto-suave texto-chico' }, 'Si un vehículo o una cotización quedó bajo el cliente equivocado, elige el cliente destino, marca lo que es de ese otro cliente y presiona Mover. Las cotizaciones de los vehículos movidos se mueven con ellos (solo las en borrador).'),
      el('div', { class: 'form-fila' }, el('label', {}, 'Mover al cliente'), destino),
      el('strong', { class: 'texto-chico' }, 'Vehículos de este cliente'),
      marcaVeh.length ? marcaVeh.map((m) => el('label', { class: 'casilla' }, m.cb, `${nombreVehiculo(m.x.v)} · ${verPatente(m.x.v.patente) || 'sin patente'}${m.x.n > 1 ? ` (${m.x.n} visitas)` : ''}`)) : el('p', { class: 'texto-suave texto-chico' }, 'Sin vehículos.'),
      el('strong', { class: 'texto-chico' }, 'Cotizaciones en borrador'),
      marcaCot.length ? marcaCot.map((m) => el('label', { class: 'casilla' }, m.cb, `N° ${String(m.q.numero).padStart(6, '0')} · ${fechaLarga(m.q.fecha)}`)) : el('p', { class: 'texto-suave texto-chico' }, 'Sin cotizaciones en borrador.'),
      ctx.puede('taller', 'editar') ? boton('Mover lo marcado al cliente destino', { tipo: 'primario', onclick: async () => {
        const vs = marcaVeh.filter((m) => m.cb.checked).map((m) => m.id); const cs = marcaCot.filter((m) => m.cb.checked).map((m) => m.id);
        if (!destino.value) { avisar('Elige el cliente destino.', 'error'); return; }
        if (!vs.length && !cs.length) { avisar('Marca al menos un vehículo o una cotización.', 'error'); return; }
        if (!confirm(`¿Mover ${vs.length} vehículo(s) y ${cs.length} cotización(es) a «${destino.selectedOptions[0].textContent}»?`)) return;
        const { data, error } = await ctx.api.rpc('tal_mover_cliente', { p_hacia: destino.value, p_vehiculos: vs, p_cotizaciones: cs });
        if (error) { avisar(error.message, 'error'); return; }
        avisar(`Movido: ${data.vehiculos} vehículo(s) y ${data.cotizaciones} cotización(es).`); estado.sel = destino.value; ctx.refrescar();
      } }) : null);

    // Datos y facturación (maestro de clientes)
    const campo = (id, etiqueta, valor, extra = {}) => { const i = el('input', { class: 'campo', value: valor ?? '', ...extra }); return { i, nodo: el('div', { class: 'form-fila' }, el('label', {}, etiqueta), i) }; };
    const fNombre = campo('nombre', 'Nombre a mostrar (cómo se ve en todo el sistema)', t.nombre_fantasia, { placeholder: t.razon_social });
    const fClase = el('select', { class: 'campo' }, [['natural', 'Natural (persona)'], ['empresa', 'Empresa']].map(([k, n]) => el('option', { value: k, selected: claseDe(t) === k }, n)));
    const fRut = campo('rut', 'RUT', t.rut, { placeholder: '12.345.678-9' });
    const fRazon = campo('razon', empresa ? 'Razón social' : 'Nombre completo', t.razon_social);
    const fRep = campo('rep', 'Representante (nombre de contacto)', t.representante, { placeholder: 'Ej.: Guillermo Morales' });
    const fGiro = campo('giro', 'Giro', t.giro);
    const fTel = campo('tel', 'Teléfono', t.telefono, { type: 'tel', placeholder: '+569…' });
    const fEmail = campo('email', 'Correo (boleta o factura)', t.email, { type: 'email' });
    const fDir = campo('dir', 'Dirección', t.direccion);
    const fCotizar = el('input', { type: 'checkbox', checked: !!t.por_cotizar });
    const soloEmpresa = el('div', { style: empresa ? '' : 'display:none' }, el('div', { class: 'rejilla-campos' }, fRep.nodo, fGiro.nodo),
      el('label', { class: 'casilla' }, fCotizar, 'Siempre por cotizar (al agendar se marca el servicio a convenir y Factura, como las automotoras)'));
    fClase.addEventListener('change', () => { soloEmpresa.style.display = fClase.value === 'empresa' ? '' : 'none'; });
    const datos = el('div', {}, fNombre.nodo,
      el('div', { class: 'rejilla-campos' }, el('div', { class: 'form-fila' }, el('label', {}, 'Tipo de cliente'), fClase), fRut.nodo),
      fRazon.nodo, soloEmpresa, el('div', { class: 'rejilla-campos' }, fTel.nodo, fEmail.nodo), fDir.nodo,
      ctx.puede('terceros', 'editar') ? boton('Guardar datos', { tipo: 'primario', onclick: async (ev) => {
        const b = ev.currentTarget; b.disabled = true;
        const limpio = (x) => x.i.value.trim() || null;
        const rut = limpio(fRut); const r = rut ? rut.replace(/[^0-9kK]/g, '').toUpperCase() : null;
        const { error } = await ctx.api.from('terceros').update({
          nombre_fantasia: limpio(fNombre), clase: fClase.value, rut: r ? `${r.slice(0, -1)}-${r.slice(-1)}` : null, razon_social: limpio(fRazon) ?? nombreDe(t),
          representante: fClase.value === 'empresa' ? limpio(fRep) : null, por_cotizar: fClase.value === 'empresa' && fCotizar.checked, giro: limpio(fGiro), telefono: limpio(fTel), email: limpio(fEmail), direccion: limpio(fDir),
        }).eq('id', t.id);
        b.disabled = false;
        if (error) { avisar(error.code === '23505' ? 'Ya hay otro cliente con ese RUT: usa Unir si son el mismo.' : error.code === '23514' ? 'El RUT no es válido.' : error.message, 'error'); return; }
        avisar('Datos guardados.'); ctx.refrescar();
      } }) : null);

    // Postventa: WhatsApp y bitácora de contacto
    const wsp = Object.assign(el('textarea', { class: 'campo', rows: 4 }), { value: mensajeReactivacion(ctx, c) });
    const tel = telInternacional(t.telefono);
    const bitacora = el('div', { class: 'crm-bitacora' });
    const pintarBitacora = () => {
      const l = con.data.filter((x) => x.tercero_id === t.id).sort((a, b) => (estado.ordenBitacora === 'asc' ? 1 : -1) * `${a.fecha}${a.created_at}`.localeCompare(`${b.fecha}${b.created_at}`));
      bitacora.replaceChildren(...(l.length ? l.map((x) => el('div', { class: 'crm-contacto' },
        el('div', {}, el('strong', {}, fechaLarga(x.fecha)), ' ', el('span', { class: `chip ${CHIP_RESULTADO[x.resultado] ?? 'chip-pend'}` }, x.resultado), x.medio === 'whatsapp' ? el('span', { class: 'texto-suave texto-chico' }, ' · por WhatsApp') : null),
        x.nota ? el('div', { class: 'texto-chico' }, x.nota) : null)) : [el('p', { class: 'texto-suave texto-chico' }, 'Sin registros de contacto aún.')]));
    };
    const registrar = async (fecha, resultado, nota, medio = 'manual') => {
      const { data, error } = await ctx.api.from('tal_contactos').insert({ empresa_id: e, tercero_id: t.id, fecha, resultado, nota: nota || null, medio }).select('*').single();
      if (error) { avisar(error.message, 'error'); return false; }
      con.data.unshift(data); pintarBitacora(); return true;
    };
    const fFecha = el('input', { type: 'date', class: 'campo', value: hoyISO() });
    const fRes = el('select', { class: 'campo' }, RESULTADOS.map((r) => el('option', { value: r }, r)));
    const fNota = el('input', { class: 'campo', placeholder: 'Ej.: quedó de confirmar el viernes' });
    const ordenBtn = boton(estado.ordenBitacora === 'desc' ? 'Más reciente primero' : 'Más antiguo primero', { onclick: () => { estado.ordenBitacora = estado.ordenBitacora === 'desc' ? 'asc' : 'desc'; ordenBtn.lastChild.textContent = estado.ordenBitacora === 'desc' ? 'Más reciente primero' : 'Más antiguo primero'; pintarBitacora(); } });
    pintarBitacora();
    const puedeContactar = ctx.puede('taller', 'crear');
    const postventa = el('div', {},
      el('strong', {}, 'Reactivar por WhatsApp'), wsp,
      el('div', { class: 'listado-acciones' },
        boton('Abrir WhatsApp', { tipo: 'primario', disabled: !tel, onclick: () => { window.open(`https://wa.me/${tel}?text=${encodeURIComponent(wsp.value)}`, '_blank', 'noopener'); if (puedeContactar) registrar(hoyISO(), 'Contactado', 'Por WhatsApp', 'whatsapp'); } }),
        boton('Copiar mensaje', { icono: 'copiar', onclick: async () => { try { await navigator.clipboard.writeText(wsp.value); avisar('Mensaje copiado.'); } catch { avisar('No se pudo copiar.', 'error'); } } })),
      tel ? null : el('p', { class: 'texto-suave texto-chico' }, 'Sin teléfono: agrégalo en Datos y facturación para poder enviar.'),
      el('div', { class: 'listado-cabecera', style: 'margin-top:16px' }, el('strong', {}, 'Seguimiento de contacto'), ordenBtn),
      puedeContactar ? el('div', { class: 'rejilla-campos crm-registro' }, fFecha, fRes, fNota,
        boton('Registrar contacto', { icono: 'mas', tipo: 'primario', onclick: async () => { if (await registrar(fFecha.value || hoyISO(), fRes.value, fNota.value.trim())) { fNota.value = ''; avisar('Contacto registrado.'); } } })) : null,
      bitacora);

    ficha.replaceChildren(
      el('div', { class: 'ficha doc-grupo' },
        el('div', { class: 'listado-cabecera' },
          el('div', {},
            el('h2', {}, icono(empresa ? 'building' : 'users', { tam: 18 }), ' ', nombreDe(t)),
            empresa && t.representante ? el('div', { class: 'texto-suave' }, `Rep.: ${t.representante}`) : null,
            el('div', { class: 'texto-suave' }, [t.telefono, t.rut, t.email].filter(Boolean).join(' · ')),
            el('span', { class: `chip ${empresa ? 'chip-prox' : 'chip-ok'}` }, empresa ? 'Empresa' : 'Natural')),
          chipDias(dias)),
        el('div', { class: 'fin-tarjetas' },
          kpi('Total gastado', dinero(c.total)), kpi('Visitas', String(c.visitas)),
          kpi('Última visita', c.ultima ? fechaLarga(c.ultima) : '—'), kpi('Ticket promedio', dinero(c.visitas ? c.total / c.visitas : 0)))),
      seccion(`Historial de servicios (${c.items.length})`, el('div', {}, histBuscar, el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Fecha', 'Vehículo', 'Servicio', 'Estado', 'Monto', ''].map((x, i) => el('th', { class: i === 4 ? 'num' : '' }, x)))), tbody))), true),
      seccion(`Vehículos (${c.vehs.length})`, el('div', { class: 'crm-chips' }, c.vehs.length ? c.vehs.map((x) => el('a', { class: 'chip chip-na', href: ctx.ruta('taller.vehiculo', { id: x.v.id }) }, `${nombreVehiculo(x.v)} · ${verPatente(x.v.patente) || 'sin patente'}${x.n > 1 ? ` (${x.n}×)` : ''}`)) : el('span', { class: 'texto-suave' }, 'Sin vehículos.'))),
      seccion(`Servicios usados (${c.servicios.size})`, el('div', { class: 'crm-chips' }, c.servicios.size ? [...c.servicios].sort((a, b) => b[1] - a[1]).map(([n, k]) => el('span', { class: 'chip chip-na' }, `${servicioCorto(n)}${k > 1 ? ` (${k}×)` : ''}`)) : el('span', { class: 'texto-suave' }, '—'))),
      conCot ? seccion(`Cotizaciones (${c.cots.length})`, cotizaciones, c.cots.length > 0) : null,
      seccion('Corregir cliente: mover vehículos o cotizaciones', corregir),
      seccion('Datos y facturación', datos),
      seccion('Postventa', postventa));
  }

  // ---------- Duplicados
  const avisoDup = duplicados.length && ctx.puede('taller', 'editar') && ctx.puede('terceros', 'editar') ? el('div', { class: 'aviso-bandeja crm-dups' },
    el('strong', {}, icono('alerta', { tam: 16 }), ` Posibles clientes duplicados (${duplicados.length})`),
    duplicados.slice(0, 6).map((p) => el('div', { class: 'crm-dup' },
      el('span', {}, el('strong', {}, nombreDe(p.a.t)), ' ↔ ', el('strong', {}, nombreDe(p.b.t)), el('span', { class: 'texto-suave texto-chico' }, ` · ${p.motivo}`)),
      boton('Unir', { onclick: async () => {
        const [desde, hacia] = p.a.visitas <= p.b.visitas ? [p.a, p.b] : [p.b, p.a];   // el de menos visitas entra en el otro
        if (!confirm(`¿Unir «${nombreDe(desde.t)}» dentro de «${nombreDe(hacia.t)}»? Se mueven sus vehículos, órdenes, cotizaciones y contactos (no se borra el historial).`)) return;
        const { error } = await ctx.api.rpc('tal_unir_clientes', { p_desde: desde.t.id, p_hacia: hacia.t.id });
        if (error) { avisar(error.message, 'error'); return; }
        avisar('Clientes unidos.'); estado.sel = hacia.t.id; ctx.refrescar();
      } })))) : null;

  pintarLista();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Clientes'), el('div', { class: 'listado-acciones' }, filtro, orden)),
    avisoDup,
    el('div', { class: 'crm-grid' }, el('div', { class: 'crm-col' }, buscador, lista), ficha));
}

// Mensaje de reactivación según el último servicio (cerámico, pulido, lavado…), como el OS
function mensajeReactivacion(ctx, c) {
  const t = c.t;
  const base = claseDe(t) === 'empresa' ? (t.representante || nombreDe(t)) : (t.nombre_fantasia || t.razon_social || '');
  const nombre = String(base).trim().split(/\s+/)[0] ?? '';
  const ult = c.items.find((o) => o.tal_orden_servicios.length);
  const saludo = `Hola ${nombre ? `${nombre} ` : ''}👋, te saludamos de ${nombreEmpresa(ctx.empresa)}.`;
  let cuerpo;
  if (ult) {
    const s = ult.tal_orden_servicios[ult.tal_orden_servicios.length - 1].nombre; const sv = s.toLowerCase();
    const veh = ult.v ? ` tu ${nombreVehiculo(ult.v)}` : ' tu vehículo';
    if (/cer[aá]mic/.test(sv)) cuerpo = ` ¿Cómo va el tratamiento cerámico de${veh}? Ya pasó un tiempo desde que lo aplicamos y sería ideal revisarlo y hacerle una mantención para que siga protegido y brillante.`;
    else if (sv.includes('pulido')) cuerpo = ` ¿Cómo se ha mantenido el pulido de${veh}? Si quieres le damos una revisión o una protección para que dure más y se vea impecable.`;
    else if (/lavado|limpieza|detallado|sanitiz/.test(sv)) cuerpo = ` ¿Cómo ha estado${veh}? Ya lleva un tiempo desde el último ${servicioCorto(s).toLowerCase()}, ¿te gustaría agendar uno nuevo para dejarlo como nuevo?`;
    else cuerpo = ` ¿Cómo ha quedado${veh} después del ${servicioCorto(s).toLowerCase()}? Nos encantaría atenderte de nuevo y ayudarte con lo que necesites.`;
  } else {
    const d = diasDesde(c.ultima);
    cuerpo = `${d != null && d > 30 ? ` Notamos que hace ${d} días no pasas con tu vehículo.` : ''} ¿Te gustaría agendar un lavado o detailing? Tenemos horas disponibles esta semana.`;
  }
  return `${saludo}${cuerpo} ¡Te esperamos! ✨`;
}
