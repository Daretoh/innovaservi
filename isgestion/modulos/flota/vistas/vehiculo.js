// Ficha del vehículo: datos, documentos con vencimiento, mantenciones programadas, historial de pagos y gastos, y archivos.
// Ruta: #/flota.vehiculo?id=<id>
import { el } from '../../../core/ui/dom.js?v=384ede1';
import { icono } from '../../../core/ui/iconos.js?v=384ede1';
import { boton } from '../../../core/ui/tabla.js?v=384ede1';
import { abrirFormulario } from '../../../core/ui/modal.js?v=384ede1';
import { leerVence } from '../../../core/ui/leer-vence.js?v=384ede1';
import { avisar } from '../../../core/ui/aviso.js?v=384ede1';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=384ede1';
import { dinero, fechaLarga, hoyISO, diaLocal } from '../../../core/ui/formato.js?v=384ede1';
import { CATEGORIAS, CON_VENCE, nombreCat, TIPOS, ESTADOS, vencimientos, normalizarPatente, estadoMantencion } from '../datos.js?v=384ede1';

const ARCHIVOS = ['application/pdf', 'image/jpeg', 'image/png'];
let filtroCat = '';

const abrir = async (ctx, ruta) => { try { window.open(await urlFirmada(ctx.api, ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); } };

export default async function vista(ctx) {
  const [{ data: v, error }, reg, arch, choferes, mant] = await Promise.all([
    ctx.api.from('flo_vehiculos').select('*').eq('id', ctx.params.id).maybeSingle(),
    ctx.api.from('flo_registros').select('*').eq('vehiculo_id', ctx.params.id).is('deleted_at', null).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ctx.api.from('flo_archivos').select('*').eq('vehiculo_id', ctx.params.id).order('created_at', { ascending: false }),
    ctx.api.from('persona_empresa').select('persona_id, estado, personas(nombres, apellido_paterno)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
    ctx.api.from('flo_mantenciones').select('*').eq('vehiculo_id', ctx.params.id).order('nombre'),
  ]);
  if (error) throw error;
  const volver = el('a', { class: 'volver', href: ctx.ruta('flota.lista') }, icono('volver', { tam: 16 }), 'Flota');
  if (!v || v.deleted_at) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Vehículo no encontrado'));
  const registros = reg.data ?? [];
  const personas = new Map((choferes.data ?? []).map((p) => [p.persona_id, { ...p, nombre: `${p.personas?.nombres?.split(' ')[0] ?? ''} ${p.personas?.apellido_paterno ?? ''}`.trim() }]));
  const editable = ctx.puede('flota', 'editar');

  // ---- Datos (se guardan al salir de cada campo)
  const guardar = async (cambios) => {
    const { error: e } = await ctx.api.from('flo_vehiculos').update(cambios).eq('id', v.id);
    if (e) { avisar(e.code === '23505' ? 'Ya hay un vehículo con esa patente.' : e.message, 'error'); return false; }
    Object.assign(v, cambios); avisar('Guardado.'); return true;
  };
  const campo = (id, etiqueta, { tipo = 'text', opciones } = {}) => {
    const c = opciones
      ? el('select', { class: 'campo', id: `v-${id}`, disabled: !editable }, opciones.map(([k, t]) => el('option', { value: k, selected: v[id] === k }, t)))
      : tipo === 'textarea'
        ? Object.assign(el('textarea', { class: 'campo', id: `v-${id}`, rows: 3, disabled: !editable }), { value: v[id] ?? '' })
        : el('input', { class: 'campo', id: `v-${id}`, type: tipo, value: v[id] ?? '', disabled: !editable, min: tipo === 'number' ? 0 : null });
    c.addEventListener('change', async () => {
      let val = c.value.trim();
      if (id === 'patente') { val = normalizarPatente(val); c.value = val ?? ''; }
      else if (tipo === 'number') val = val === '' ? null : Number(val);
      else if (val === '' && id !== 'nombre') val = null;
      if (id === 'nombre' && !val) { c.value = v.nombre; avisar('El nombre no puede quedar vacío.', 'error'); return; }
      if (!(await guardar({ [id]: val }))) c.value = v[id] ?? '';
      if (id === 'estado' || id === 'nombre') ctx.refrescar();
    });
    return el('div', { class: 'form-fila' }, el('label', { for: `v-${id}` }, etiqueta), c);
  };

  // ---- Documentos con vencimiento
  const venc = vencimientos(registros);
  const filaVence = (x) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, nombreCat[x.cat]),
      el('span', { class: 'texto-suave texto-chico' }, x.vence ? `vence ${fechaLarga(x.vence)}` : 'sin registro')),
    el('span', { class: `chip ${{ venc: 'chip-venc', prox: 'chip-prox', ok: 'chip-ok', sin: 'chip-pend' }[x.k]}` },
      x.k === 'venc' ? `Vencido hace ${-x.n} d` : x.k === 'prox' ? `Vence en ${x.n} d` : x.k === 'ok' ? 'Vigente' : 'Sin registro'),
    el('div', { class: 'doc-acciones' },
      x.registro?.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver ${nombreCat[x.cat]}`, onclick: () => abrir(ctx, x.registro.archivo) }, icono('ojo', { tam: 16 })) : null,
      ctx.puede('flota', 'crear') ? boton('Renovar', { onclick: () => registrar(ctx, v, personas, x.cat) }) : null));

  // ---- Mantenciones programadas
  const mantenciones = mant.data ?? [];
  const planMant = (m = null) => abrirFormulario({
    titulo: m ? m.nombre : 'Nueva mantención programada',
    mensaje: 'Cada cuántos kilómetros y/o meses. La próxima se calcula desde la última realizada y el kilometraje actual del vehículo.',
    campos: [
      { id: 'nombre', etiqueta: 'Mantención', requerido: true, valor: m?.nombre ?? '', ayuda: 'Ej.: cambio de aceite y filtros' },
      { id: 'cada_km', etiqueta: 'Cada (km)', tipo: 'number', valor: m?.cada_km ?? '' },
      { id: 'cada_meses', etiqueta: 'Cada (meses)', tipo: 'number', valor: m?.cada_meses ?? '' },
      { id: 'ultima_fecha', etiqueta: 'Última realizada (fecha)', tipo: 'date', valor: m?.ultima_fecha ?? '' },
      { id: 'ultimo_km', etiqueta: 'Última realizada (km)', tipo: 'number', valor: m?.ultimo_km ?? '' },
      ...(m ? [{ id: 'activo', etiqueta: 'Estado', opciones: [['true', 'Activa'], ['false', 'Inactiva']], valor: String(m.activo) }] : []),
    ],
    alGuardar: async (x) => {
      const n = (t) => (t === '' ? null : Math.max(0, Math.round(Number(t))));
      if (!x.cada_km && !x.cada_meses) throw new Error('Indica cada cuántos km o cada cuántos meses.');
      const datos = { nombre: x.nombre.trim(), cada_km: n(x.cada_km) || null, cada_meses: n(x.cada_meses) || null, ultima_fecha: x.ultima_fecha || null, ultimo_km: n(x.ultimo_km), ...(m ? { activo: x.activo === 'true' } : {}) };
      const r = m ? await ctx.api.from('flo_mantenciones').update(datos).eq('id', m.id) : await ctx.api.from('flo_mantenciones').insert({ ...datos, empresa_id: ctx.empresa.id, vehiculo_id: v.id });
      if (r.error) throw new Error(r.error.message);
      avisar('Mantención guardada.'); ctx.refrescar();
    },
  });
  const filaMant = (m) => {
    const st = estadoMantencion(m, v.km);
    return el('div', { class: `doc-fila${m.activo ? '' : ' fila-inactiva'}` },
      el('div', { class: 'doc-nombre' },
        ctx.puede('flota', 'editar') ? el('a', { href: '#', onclick: (ev) => { ev.preventDefault(); planMant(m); } }, el('strong', {}, m.nombre)) : el('strong', {}, m.nombre),
        el('span', { class: 'texto-suave texto-chico' }, [m.cada_km ? `cada ${m.cada_km.toLocaleString('es-CL')} km` : null, m.cada_meses ? `cada ${m.cada_meses} ${m.cada_meses === 1 ? 'mes' : 'meses'}` : null,
          m.ultima_fecha ? `última ${fechaLarga(m.ultima_fecha)}${m.ultimo_km != null ? ` a los ${m.ultimo_km.toLocaleString('es-CL')} km` : ''}` : null].filter(Boolean).join(' · ')),
        el('span', { class: 'texto-chico' }, st.texto)),
      m.activo ? el('span', { class: `chip ${{ venc: 'chip-venc', prox: 'chip-prox', ok: 'chip-ok', sin: 'chip-pend' }[st.k]}` }, { venc: 'Vencida', prox: 'Próxima', ok: 'Al día', sin: 'Sin registro' }[st.k]) : el('span', { class: 'chip chip-na' }, 'Inactiva'),
      ctx.puede('flota', 'crear') && m.activo ? boton('Registrar realizada', { onclick: () => registrar(ctx, v, personas, 'mantencion', m) }) : null);
  };

  // ---- Historial
  const lista = registros.filter((r) => !filtroCat || r.categoria === filtroCat);
  const total = lista.reduce((s, r) => s + Number(r.monto), 0);
  const selCat = el('select', { class: 'campo campo-filtro', 'aria-label': 'Filtrar por categoría' },
    el('option', { value: '' }, 'Todas las categorías'), CATEGORIAS.map(([k, n]) => el('option', { value: k, selected: filtroCat === k }, n)));
  selCat.addEventListener('change', () => { filtroCat = selCat.value; ctx.refrescar(); });
  const filaRegistro = (r) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' },
      el('strong', {}, `${fechaLarga(r.fecha)} · ${nombreCat[r.categoria]}`),
      el('span', { class: 'texto-suave texto-chico' }, [r.descripcion, r.proveedor, r.km != null ? `${r.km.toLocaleString('es-CL')} km` : null,
        r.vence ? `vence ${fechaLarga(r.vence)}` : null, r.chofer_id ? `chofer ${personas.get(r.chofer_id)?.nombre ?? ''}` : null].filter(Boolean).join(' · '))),
    el('strong', {}, dinero(r.monto)),
    el('div', { class: 'doc-acciones' },
      r.archivo ? el('button', { type: 'button', class: 'boton-icono', title: 'Ver comprobante', 'aria-label': 'Ver comprobante', onclick: () => abrir(ctx, r.archivo) }, icono('ojo', { tam: 16 })) : null,
      editable ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': 'Eliminar registro', onclick: () => abrirFormulario({
        titulo: 'Eliminar registro', mensaje: `${nombreCat[r.categoria]} del ${fechaLarga(r.fecha)} por ${dinero(r.monto)}.`, campos: [], textoGuardar: 'Eliminar',
        alGuardar: async () => {
          const { error: e } = await ctx.api.from('flo_registros').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
          if (e) throw new Error(e.message);
          avisar('Registro eliminado.'); ctx.refrescar();
        },
      }) }, icono('basura', { tam: 16 })) : null));

  // ---- Archivos del vehículo
  const entrada = el('input', { type: 'file', accept: ARCHIVOS.join(','), hidden: true });
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    try {
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'flota', archivo, tabla: 'flo_archivos', registroId: v.id, tipos: ARCHIVOS });
      const { error: e } = await ctx.api.from('flo_archivos').insert({ empresa_id: ctx.empresa.id, vehiculo_id: v.id, nombre: archivo.name, archivo: ruta });
      if (e) { await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(e.message); }
      avisar('Archivo subido.'); ctx.refrescar();
    } catch (e) { avisar(e.message, 'error'); }
  });
  const archivos = (arch.data ?? []).map((a) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, a.nombre), el('span', { class: 'texto-suave texto-chico' }, fechaLarga(diaLocal(a.created_at)))),
    el('div', { class: 'doc-acciones' },
      el('button', { type: 'button', class: 'boton-icono', title: 'Ver', 'aria-label': `Ver ${a.nombre}`, onclick: () => abrir(ctx, a.archivo) }, icono('ojo', { tam: 16 })),
      ctx.puede('flota', 'eliminar') ? el('button', { type: 'button', class: 'boton-icono', title: 'Eliminar', 'aria-label': `Eliminar ${a.nombre}`, onclick: async () => {
        const { error: e } = await ctx.api.from('flo_archivos').delete().eq('id', a.id);
        if (e) { avisar(e.message, 'error'); return; }
        await eliminarArchivo(ctx.api, a.archivo).catch(() => {});
        avisar('Archivo eliminado.'); ctx.refrescar();
      } }, icono('basura', { tam: 16 })) : null)));

  const acciones = [];
  if (ctx.puede('flota', 'crear')) acciones.push(boton('Registrar pago o gasto', { icono: 'mas', tipo: 'primario', onclick: () => registrar(ctx, v, personas, null) }));
  if (ctx.puede('flota', 'eliminar')) acciones.push(boton('Eliminar vehículo', { icono: 'basura', onclick: () => abrirFormulario({
    titulo: 'Eliminar vehículo', mensaje: 'El vehículo deja de aparecer en la flota. Su historial se conserva. Si solo dejó de usarse, márcalo como Inactivo.', campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { if (!(await guardar({ deleted_at: new Date().toISOString() }))) throw new Error('No se pudo eliminar.'); location.hash = ctx.ruta('flota.lista'); },
  }) }));

  const estado = Object.fromEntries(ESTADOS)[v.estado];
  return el('section', { class: 'listado' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, v.nombre), el('p', { class: 'texto-suave' }, [v.patente, [v.marca, v.modelo, v.anio].filter(Boolean).join(' ')].filter(Boolean).join(' · '))),
      el('div', { class: 'listado-acciones' }, el('span', { class: `chip ${v.estado === 'activo' ? 'chip-ok' : v.estado === 'taller' ? 'chip-prox' : 'chip-na'}` }, estado), acciones)),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Documentos con vencimiento'),
        venc.map(filaVence),
        el('h2', {}, `Archivos del vehículo (${archivos.length})`),
        archivos.length ? archivos : el('p', { class: 'texto-suave' }, 'Padrón, factura de compra, manual…'),
        ctx.puede('flota', 'crear') ? el('div', {}, boton('Subir archivo', { icono: 'descargar', onclick: () => entrada.click() }), entrada) : null),
      el('div', { class: 'ficha doc-grupo' },
        el('h2', {}, 'Datos'),
        campo('nombre', 'Nombre'),
        el('div', { class: 'rejilla-campos' }, campo('tipo', 'Tipo', { opciones: TIPOS }), campo('estado', 'Estado', { opciones: ESTADOS })),
        el('div', { class: 'rejilla-campos' }, campo('marca', 'Marca'), campo('modelo', 'Modelo')),
        el('div', { class: 'rejilla-campos' }, campo('anio', 'Año', { tipo: 'number' }), campo('patente', 'Patente')),
        el('div', { class: 'rejilla-campos' }, campo('motor', 'N° de motor o serie'), campo('km', 'Kilometraje actual', { tipo: 'number' })),
        campo('notas', 'Notas', { tipo: 'textarea' }))),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `Mantenciones programadas (${mantenciones.length})`),
        ctx.puede('flota', 'crear') ? boton('Nueva', { icono: 'mas', onclick: () => planMant() }) : null),
      mantenciones.length ? mantenciones.map(filaMant) : el('p', { class: 'texto-suave' }, 'Sin mantenciones programadas (ej.: cambio de aceite cada 10.000 km o 6 meses).')),
    el('div', { class: 'ficha doc-grupo' },
      el('div', { class: 'listado-cabecera' }, el('h2', {}, `Pagos y gastos · ${dinero(total)}`), selCat),
      lista.length ? lista.map(filaRegistro) : el('p', { class: 'texto-suave' }, 'Sin registros.')),
  );
}

// Registrar un pago, documento o gasto. Las categorías con vencimiento lo piden; el km actualiza el del vehículo.
// Con una mantención programada (m), el registro queda ligado y actualiza su última realizada.
export function registrar(ctx, v, personas, categoria, m = null) {
  const choferes = [...personas.values()].filter((p) => p.estado === 'activo');
  abrirFormulario({
    titulo: m ? `${m.nombre} · ${v.nombre}` : `Registrar · ${v.nombre}`,
    mensaje: 'Permiso de circulación, revisión técnica, SOAP y seguro piden vencimiento: el último manda el aviso.',
    campos: [
      { id: 'categoria', etiqueta: 'Categoría', opciones: CATEGORIAS.map(([k, n]) => [k, n]), valor: categoria ?? 'mantencion' },
      { id: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: hoyISO() },
      { id: 'monto', etiqueta: 'Monto ($)', tipo: 'number', valor: '0' },
      { id: 'proveedor', etiqueta: 'Proveedor' },
      { id: 'descripcion', etiqueta: 'Detalle', valor: m?.nombre ?? '' },
      { id: 'km', etiqueta: 'Kilometraje', tipo: 'number', valor: m ? v.km ?? '' : '' },
      { id: 'vence', etiqueta: 'Vence (permiso, revisión técnica, SOAP, seguro)', tipo: 'date', accion: leerVence({ tipo: 'veh', fuentes: async (x) => [x.archivo] }) },
      { id: 'chofer_id', etiqueta: 'Chofer (peajes, multas, combustible)', opciones: [['', 'Ninguno'], ...choferes.map((p) => [p.persona_id, p.nombre])] },
      { id: 'archivo', etiqueta: 'Comprobante o documento (PDF o imagen)', tipo: 'file', accept: ARCHIVOS.join(',') },
    ],
    textoGuardar: 'Registrar',
    alGuardar: async (x) => {
      if (CON_VENCE.includes(x.categoria) && !x.vence) throw new Error(`${nombreCat[x.categoria]}: indica la fecha de vencimiento.`);
      if (x.vence && x.vence < x.fecha) throw new Error('El vencimiento no puede ser anterior a la fecha.');
      const monto = Math.max(0, Math.round(Number(x.monto) || 0));
      const km = x.km === '' ? null : Math.max(0, Number(x.km));
      const ruta = x.archivo?.size ? (await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'flota', archivo: x.archivo, tabla: 'flo_registros', registroId: v.id, tipos: ARCHIVOS })).ruta : null;
      const { error } = await ctx.api.from('flo_registros').insert({
        empresa_id: ctx.empresa.id, vehiculo_id: v.id, categoria: x.categoria, fecha: x.fecha, monto, proveedor: x.proveedor.trim() || null,
        descripcion: x.descripcion.trim() || null, km, vence: CON_VENCE.includes(x.categoria) ? x.vence : null, chofer_id: x.chofer_id || null, archivo: ruta,
        mantencion_id: m && x.categoria === 'mantencion' ? m.id : null,
      });
      if (error) { if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {}); throw new Error(error.message); }
      if (km != null && (v.km == null || km > v.km)) await ctx.api.from('flo_vehiculos').update({ km }).eq('id', v.id);
      avisar('Registrado.'); ctx.refrescar();
    },
  });
}
