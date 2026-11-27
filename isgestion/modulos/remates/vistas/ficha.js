// Ficha de una oportunidad de remate: estado, números (costo total estimado, descuento, ganancia y puntaje con su
// detalle), datos del bien y del remate, revisión de riesgos (casillas por tipo), enlaces útiles, documentos y notas.
// Los datos se guardan al salir de cada campo.
// Ruta: #/remates.ficha?id=<id>
import { el } from '../../../core/ui/dom.js?v=503c912';
import { icono } from '../../../core/ui/iconos.js?v=503c912';
import { boton } from '../../../core/ui/tabla.js?v=503c912';
import { abrirFormulario } from '../../../core/ui/modal.js?v=503c912';
import { avisar } from '../../../core/ui/aviso.js?v=503c912';
import { dinero } from '../../../core/ui/formato.js?v=503c912';
import { subirArchivo, urlFirmada } from '../../../core/adjuntos.js?v=503c912';
import {
  TIPOS, ORIGENES, ESTADOS, OBJETIVOS, REGIONES, SUBTIPOS, REVISION, RIESGOS, nombreDe, calcular, puntaje, pct,
  chipPuntaje, chipEstado, diasHasta, fechaRemate, enlaces, cargarEstilos, contexto, distanciaKm, chipDistancia, km, mapa, geocodificar,
  TIPOS_JUICIO, OCUPACIONES, ESTUDIO_ESTADOS, ESTUDIO_CAMPOS, chipEstudio, minimoSobreAvaluo, botonEstrella,
} from '../datos.js?v=503c912';

export default async function vista(ctx) {
  cargarEstilos();
  const volver = el('a', { class: 'volver', href: ctx.ruta('remates.lista') }, icono('volver', { tam: 16 }), 'Remates');
  const { data: o, error } = await ctx.api.from('rem_oportunidades').select('*').eq('id', ctx.params.id).is('deleted_at', null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) return el('section', { class: 'listado' }, volver, el('h1', {}, 'Oportunidad no encontrada'));
  const base = contexto(ctx); const { cfg } = base; const g = base.de(o.empresa_id);
  const puede = (a) => !!g?.puede('remates', a);
  const editable = puede('editar');

  const guardar = async (cambios) => {
    const { error: e } = await ctx.api.from('rem_oportunidades').update(cambios).eq('id', o.id);
    if (e) { avisar(e.message, 'error'); return false; }
    Object.assign(o, cambios); pintarNumeros(); return true;
  };

  // ---- Números
  const numeros = el('div', { class: 'rem-numeros' });
  function pintarNumeros() {
    const c = calcular(o, cfg); const p = puntaje(o, cfg);
    const AYUDA = {
      'Mínimo': 'Lo menos que se puede ofrecer; sale del aviso o de las bases del remate.',
      'Avalúo fiscal': 'Valor del SII para las contribuciones; sale del extracto del remate o del SII (a mano).',
      'Mínimo / avalúo': 'Mínimo ÷ avalúo: bajo 80 % parte bastante bajo el avalúo.',
      'Deudas y reparaciones': 'Lo que escribes en Datos: deudas que asumes y reparaciones, traslado o desalojo.',
      'Costo total estimado': 'Mínimo + gastos de compra + deudas + reparaciones.',
      'Mercado estimado': 'Lo que valdría vendida normalmente, con comparables de la zona; es una estimación.',
      'Descuento': '1 − costo total ÷ precio de mercado. Desde 20 % se ve en verde.',
      'Diferencia estimada': 'Precio de mercado − costo total.',
    };
    const fila = (t, v, clase = '') => el('div', { class: `rem-num ${clase}`, title: AYUDA[t] ?? (t.startsWith('Gastos') ? 'Escritura, Conservador y abogado (inmuebles) o comisión e IVA (vehículos y maquinaria), como % del mínimo.' : t.startsWith('Presupuesto') ? 'Tope de la configuración: normal o grande (terreno de 5.000 m² o más, galpón, maquinaria).' : '') }, el('span', { class: 'texto-chico texto-suave' }, t), el('strong', {}, v));
    numeros.replaceChildren(
      fila('Mínimo', c.minimo ? dinero(c.minimo) : 'Falta'),
      fila('Avalúo fiscal', o.avaluo_fiscal ? dinero(o.avaluo_fiscal) : 'Falta'),
      fila('Mínimo / avalúo', minimoSobreAvaluo(o) != null ? pct(minimoSobreAvaluo(o)) : '—', minimoSobreAvaluo(o) != null && minimoSobreAvaluo(o) < 0.8 ? 'rem-bueno' : ''),
      fila(`Gastos de compra (${c.pct} %)`, c.minimo ? dinero(c.gastos) : '—'),
      fila('Deudas y reparaciones', dinero((Number(o.deudas_estimadas) || 0) + (Number(o.reparaciones) || 0))),
      fila('Costo total estimado', c.costo ? dinero(c.costo) : '—', 'rem-num-total'),
      fila('Mercado estimado', c.mercado ? dinero(c.mercado) : 'Falta'),
      fila('Descuento', c.descuento != null ? pct(c.descuento) : '—', c.descuento >= 0.2 ? 'rem-bueno' : c.descuento < 0 ? 'rem-sobre' : ''),
      fila('Diferencia estimada', c.ganancia != null ? dinero(c.ganancia) : '—'),
      fila(c.grande ? 'Presupuesto (grande)' : 'Presupuesto (normal)', c.tope ? `${dinero(c.tope)}${c.enPresupuesto === false ? ' · se pasa' : ''}` : '—', c.enPresupuesto === false ? 'rem-sobre' : ''),
      el('div', { class: 'rem-num rem-num-puntaje' }, el('span', { class: 'texto-chico texto-suave' }, 'Puntaje'), chipPuntaje(p.valor),
        el('ul', { class: 'texto-chico texto-suave rem-partes' }, p.partes.map((t) => el('li', {}, t)))));
  }

  // ---- Campos que se guardan al salir
  const campo = (k, etiqueta, { tipo = 'text', opciones = null, ayuda = '', ancho = false } = {}) => {
    const valor = o[k] ?? '';
    let control;
    if (opciones) {
      control = el('select', { class: 'campo', disabled: !editable }, opciones.map(([v, t]) => el('option', { value: v, selected: String(valor) === v }, t)));
    } else if (tipo === 'textarea') {
      control = Object.assign(el('textarea', { class: 'campo', rows: 4, disabled: !editable }), { value: valor });
    } else {
      const v = tipo === 'datetime-local' && valor ? aLocal(valor) : valor;
      control = el('input', { class: 'campo', type: tipo, value: v, disabled: !editable, ...(tipo === 'number' ? { min: 0, step: 'any' } : {}) });
    }
    control.addEventListener('change', async () => {
      let v = control.value.trim();
      if (v === '') v = null;
      else if (tipo === 'number') v = Number(v);
      else if (tipo === 'datetime-local') v = new Date(v).toISOString();
      if (k === 'titulo' && !v) { control.value = o.titulo; return; }
      if (await guardar({ [k]: v })) {
        if (['tipo', 'estado', 'lat', 'lng'].includes(k)) ctx.refrescar();
        else if (ESTUDIO_CAMPOS.includes(k)) refrescarEstudio();
      } else control.value = o[k] ?? '';
    });
    return el('label', { class: `form-fila ${ancho ? 'rem-ancho' : ''}` }, el('span', {}, etiqueta), control, ayuda ? el('span', { class: 'texto-chico texto-suave' }, ayuda) : null);
  };
  const opc = (lista) => [['', '—'], ...lista.map((x) => (Array.isArray(x) ? x : [x, x]))];

  const esInmueble = o.tipo === 'inmueble';
  const datos = el('div', { class: 'rem-grilla' },
    campo('titulo', 'Título', { ancho: true }),
    campo('tipo', 'Tipo', { opciones: TIPOS }),
    campo('subtipo', 'Qué es', { opciones: opc([...(SUBTIPOS[o.tipo] ?? []), ...(o.subtipo && !(SUBTIPOS[o.tipo] ?? []).includes(o.subtipo) ? [o.subtipo] : [])]) }),
    campo('objetivo', 'Para qué', { opciones: OBJETIVOS }),
    campo('para_empresa', 'Para qué empresa', { ayuda: 'Innova, Performance, Grupo…' }),
    campo('origen', 'De dónde sale', { opciones: ORIGENES }),
    campo('fuente', 'Fuente', { ayuda: 'Sitio o martillero (ej.: remates.tgr.cl, Macal)' }),
    campo('url', 'Enlace del aviso', { tipo: 'url', ancho: true }),
    campo('fecha_remate', 'Fecha y hora del remate', { tipo: 'datetime-local' }),
    campo('tribunal', 'Tribunal o martillero'),
    campo('rol_causa', 'Rol de la causa', { ayuda: 'Ej.: C-1234-2026' }),
    campo('minimo', 'Mínimo ($)', { tipo: 'number' }),
    campo('garantia', 'Garantía ($)', { tipo: 'number', ayuda: 'Suele ser el 10 % del mínimo, con vale vista' }),
    campo('precio_mercado', 'Precio de mercado estimado ($)', { tipo: 'number' }),
    campo('mercado_base', 'De dónde sale ese precio', { ayuda: 'Comparables, UF/m² de la comuna, tasación' }),
    campo('deudas_estimadas', esInmueble ? 'Deudas que asumo ($): contribuciones, gastos comunes' : 'Deudas que asumo ($): multas, permisos', { tipo: 'number' }),
    campo('reparaciones', 'Reparaciones, traslado o desalojo ($)', { tipo: 'number' }),
    campo('region', 'Región', { opciones: opc(REGIONES) }),
    campo('comuna', 'Comuna'),
    campo('direccion', esInmueble ? 'Dirección' : 'Dónde se exhibe', { ancho: true }),
    esInmueble ? campo('rol_avaluo', 'Rol de avalúo (SII)') : null,
    esInmueble ? campo('sup_terreno', 'Terreno (m²)', { tipo: 'number' }) : null,
    esInmueble ? campo('sup_construida', 'Construido (m²)', { tipo: 'number' }) : null,
    !esInmueble ? campo('anio', 'Año', { tipo: 'number' }) : null,
    o.tipo === 'vehiculo' ? campo('patente', 'Patente') : null,
    campo('lat', 'Latitud', { tipo: 'number' }),
    campo('lng', 'Longitud', { tipo: 'number' }),
    campo('descripcion', 'Descripción', { tipo: 'textarea', ancho: true }),
  );

  // ---- Revisión de riesgos
  const casilla = (k, t, riesgo = false) => {
    const c = Object.assign(el('input', { type: 'checkbox', disabled: !editable }), { checked: !!o.revision?.[k] });
    c.addEventListener('change', async () => { if (!(await guardar({ revision: { ...o.revision, [k]: c.checked } }))) c.checked = !c.checked; });
    return el('label', { class: `casilla ${riesgo ? 'rem-riesgo' : ''}` }, c, t);
  };
  const revision = el('div', { class: 'rem-revision' },
    el('div', {}, el('h3', {}, 'Antes de postular'), ...(REVISION[o.tipo] ?? REVISION.otro).map(([k, t]) => casilla(k, t))),
    el('div', {}, el('h3', {}, 'Riesgos encontrados'), ...(RIESGOS[o.tipo] ?? []).map(([k, t]) => casilla(k, t, true))));

  // ---- Documentos (adjuntos del módulo)
  const docs = el('div', { class: 'rem-docs' });
  async function pintarDocs() {
    const { data } = await ctx.api.from('adjuntos').select('id, nombre, ruta, created_at').eq('empresa_id', o.empresa_id)
      .eq('modulo_id', 'remates').eq('tabla', 'rem_oportunidades').eq('registro_id', o.id).is('deleted_at', null).order('created_at');
    docs.replaceChildren(...((data ?? []).length ? data.map((d) => el('button', { type: 'button', class: 'rem-doc', onclick: async () => {
      try { window.open(await urlFirmada(ctx.api, d.ruta, 300), '_blank', 'noopener'); } catch (e) { avisar(e.message, 'error'); }
    } }, icono('documento', { tam: 16 }), d.nombre)) : [el('p', { class: 'texto-suave texto-chico' }, 'Sin documentos. Sube las bases, el aviso, los certificados del CBR o fotos.')]));
  }
  const subir = puede('crear') ? boton('Subir documento', { icono: 'mas', onclick: () => abrirFormulario({
    titulo: 'Subir documento',
    campos: [{ id: 'archivo', etiqueta: 'Archivo (PDF, foto, Word)', tipo: 'file', requerido: true }],
    textoGuardar: 'Subir',
    alGuardar: async (v) => {
      const archivo = Array.isArray(v.archivo) ? v.archivo[0] : v.archivo;
      await subirArchivo(ctx.api, { empresaId: o.empresa_id, modulo: 'remates', archivo, tabla: 'rem_oportunidades', registroId: o.id });
      avisar('Documento subido.'); pintarDocs();
    },
  }) }) : null;

  // ---- Estado y eliminar
  const estado = el('select', { class: 'campo campo-filtro', disabled: !editable, 'aria-label': 'Estado' }, ESTADOS.map(([v, t]) => el('option', { value: v, selected: o.estado === v }, t)));
  estado.addEventListener('change', async () => {
    const nuevo = estado.value;
    if (['descartada', 'perdida'].includes(nuevo)) {
      abrirFormulario({
        titulo: nuevo === 'descartada' ? 'Descartar' : 'Perdida',
        campos: [{ id: 'motivo', etiqueta: 'Motivo (para aprender de cada caso)', tipo: 'textarea', valor: o.motivo ?? '' }],
        alGuardar: async (v) => { if (await guardar({ estado: nuevo, motivo: v.motivo?.trim() || null })) ctx.refrescar(); },
      });
      estado.value = o.estado;
      return;
    }
    if (await guardar({ estado: nuevo })) ctx.refrescar(); else estado.value = o.estado;
  });
  const eliminar = puede('eliminar') ? boton('Eliminar', { icono: 'basura', class: 'boton boton-secundario rem-eliminar', onclick: () => abrirFormulario({
    titulo: 'Eliminar oportunidad', mensaje: `Se elimina "${o.titulo}" de la lista.`, campos: [], textoGuardar: 'Eliminar',
    alGuardar: async () => { if (await guardar({ deleted_at: new Date().toISOString() })) { avisar('Eliminada.'); location.hash = ctx.ruta('remates.lista'); } },
  }) }) : null;

  // ---- Ubicación: mapa con el punto y el centro de referencia, distancia y qué tan céntrico es.
  // Quien edita puede buscar el punto con la dirección o el sector, o tocar el mapa para dejarlo donde corresponde.
  const ubicacion = el('section', { class: 'rem-bloque rem-ubicacion' });
  let mapaFicha = null;
  async function pintarUbicacion() {
    const dist = distanciaKm(o, cfg);
    const lienzo = el('div', { class: 'rem-mapa-lienzo rem-mapa-ficha' });
    const estadoUb = el('span', { class: 'texto-chico texto-suave' });
    const buscar = editable && (o.direccion || o.comuna) ? boton('Buscar con la dirección', { icono: 'buscar', onclick: async (ev) => {
      const b = ev.currentTarget; b.disabled = true; estadoUb.textContent = 'Buscando…';
      try {
        const r = await geocodificar([o.direccion, o.comuna, o.region ? `Región de ${o.region}` : ''].filter(Boolean).join(', '));
        if (!r) { estadoUb.textContent = 'No se encontró: escribe la calle o el sector en Dirección, o toca el mapa.'; return; }
        if (await guardar({ lat: r.lat, lng: r.lng })) { avisar('Ubicación guardada.'); pintarUbicacion(); }
      } catch (e) { estadoUb.textContent = e.message; } finally { b.disabled = false; }
    } }) : null;
    ubicacion.replaceChildren(
      el('div', { class: 'rem-ubicacion-cabecera' }, el('h2', {}, 'Ubicación'),
        dist != null ? el('span', {}, chipDistancia(dist, cfg.centro_nombre), el('span', { class: 'texto-chico texto-suave' }, ` a ${cfg.centro_nombre} en línea recta`)) : el('span', { class: 'texto-suave texto-chico' }, 'Sin ubicar'),
        el('div', { class: 'listado-acciones' }, buscar, estadoUb)),
      lienzo,
      editable ? el('p', { class: 'texto-chico texto-suave' }, 'Toca el mapa para dejar el punto donde está la propiedad. Si solo se conoce el sector, la ubicación es aproximada.') : null);
    mapaFicha?.mapa.remove(); mapaFicha = null;
    try {
      mapaFicha = await mapa(lienzo, o.lat != null && o.lng != null ? [{ lat: Number(o.lat), lng: Number(o.lng), titulo: o.titulo }] : [], cfg);
      if (editable) mapaFicha.mapa.on('click', async (ev) => {
        const lat = Number(ev.latlng.lat.toFixed(6)); const lng = Number(ev.latlng.lng.toFixed(6));
        if (await guardar({ lat, lng })) { avisar(`Ubicación guardada (${km(distanciaKm({ lat, lng }, cfg))} del centro).`); pintarUbicacion(); }
      });
    } catch (e) { lienzo.replaceChildren(el('p', { class: 'texto-error' }, e.message)); }
  }

  // ---- Estudio del caso: por qué está barato, quién demanda, cuánto y desde cuándo se debe, ocupación, conclusión
  // y lo que falta revisar a mano. Lo puede hacer una persona o el agente de estudios ("Pedir estudio").
  const chipEst = el('span');
  const pintarChipEstudio = () => chipEst.replaceChildren(chipEstudio(o));
  async function refrescarEstudio() {
    const { data } = await ctx.api.from('rem_oportunidades').select('estudio_estado, estudio_por, estudio_at').eq('id', o.id).maybeSingle();
    if (data) Object.assign(o, data);
    pintarChipEstudio(); selEstudio.value = o.estudio_estado;
  }
  const selEstudio = el('select', { class: 'campo campo-filtro', 'aria-label': 'Estado del estudio', disabled: !editable },
    ESTUDIO_ESTADOS.map(([v, t]) => el('option', { value: v, selected: o.estudio_estado === v }, t)));
  selEstudio.addEventListener('change', async () => { if (await guardar({ estudio_estado: selEstudio.value })) refrescarEstudio(); else selEstudio.value = o.estudio_estado; });
  const pedir = editable && o.estudio_estado !== 'pedido' ? boton(o.estudio_estado === 'listo' ? 'Pedir que lo revise de nuevo' : 'Pedir estudio al agente', {
    icono: 'buscar', title: 'El agente de estudios busca el aviso, las bases, el tribunal y el rol, el avalúo, quién demanda y por qué está barato; lo que no pueda ver lo deja en "Falta revisar a mano"',
    onclick: async (ev) => { ev.currentTarget.disabled = true; if (await guardar({ estudio_estado: 'pedido' })) { avisar('Pedido. El agente de estudios lo toma en su próxima vuelta.'); refrescarEstudio(); ev.currentTarget.remove(); } else ev.currentTarget.disabled = false; },
  }) : null;
  const guiaOjv = el('details', { class: 'rem-guia-ojv' },
    el('summary', {}, 'Cómo estudiar la causa en la Oficina Judicial Virtual'),
    el('ol', { class: 'rem-pasos texto-chico' },
      el('li', {}, 'Entra a ', el('a', { href: 'https://oficinajudicialvirtual.pjud.cl/', target: '_blank', rel: 'noopener' }, 'oficinajudicialvirtual.pjud.cl'), ' → Consulta causas → Civil, con el tribunal y el rol', o.rol_causa ? ` (${o.rol_causa}${o.tribunal ? `, ${o.tribunal}` : ''})` : '', '.'),
      el('li', {}, 'Demanda: quién demanda, por cuánto, de qué fecha es la deuda y qué tipo de juicio es (hipotecario, ejecutivo, partición, gastos comunes).'),
      el('li', {}, 'Tasación o avalúo: el mínimo suele salir del avalúo fiscal o de una tasación; compáralos.'),
      el('li', {}, 'Bases del remate: garantía, plazo para pagar el saldo, quién paga las deudas, si hubo remates anteriores sin postores (el mínimo baja cada vez).'),
      el('li', {}, 'Escritos del deudor o de terceros: incidentes, nulidades, tercerías, acuerdos de pago (si paga, el remate se cae).'),
      el('li', {}, 'Otros acreedores e hipotecas: certificado de hipotecas y gravámenes del Conservador; si no fueron citados, sus hipotecas siguen.'),
      el('li', {}, 'Ocupación: notificaciones del receptor (quién vive ahí) y si se pidió el lanzamiento.'),
      el('li', {}, 'Deuda de contribuciones en el SII o Tesorería y de gastos comunes con la administración.')));
  const estudio = el('section', { class: 'rem-bloque rem-estudio' },
    el('div', { class: 'rem-ubicacion-cabecera' }, el('h2', {}, 'Estudio del caso'), chipEst,
      el('div', { class: 'listado-acciones' }, selEstudio, pedir)),
    el('p', { class: 'texto-chico texto-suave' }, 'Lo que decide si vale la pena: por qué está barato. Lo que escribas aquí queda como tuyo y el agente solo completa lo vacío.'),
    el('div', { class: 'rem-grilla' },
      campo('motivo_precio', 'Por qué está barato', { tipo: 'textarea', ancho: true, ayuda: 'Ej.: deuda hipotecaria de 2020 por $X; segundo remate sin postores; derechos de una herencia' }),
      campo('tipo_juicio', 'Tipo de juicio', { opciones: opc(TIPOS_JUICIO) }),
      campo('demandante', 'Quién demanda', { ayuda: 'Banco, comunidad, Fisco… (no nombres de personas)' }),
      campo('deuda_monto', 'Monto demandado ($)', { tipo: 'number' }),
      campo('deuda_desde', 'Se debe desde', { tipo: 'date' }),
      campo('causa_inicio', 'Demanda presentada', { tipo: 'date' }),
      campo('remates_previos', 'Remates anteriores sin postores', { tipo: 'number' }),
      esInmueble ? campo('avaluo_fiscal', 'Avalúo fiscal ($)', { tipo: 'number' }) : null,
      esInmueble ? campo('contribuciones_deuda', 'Contribuciones adeudadas ($)', { tipo: 'number' }) : null,
      campo('ocupacion', 'Ocupación', { opciones: opc(OCUPACIONES) }),
      campo('estudio_resumen', 'Conclusión', { tipo: 'textarea', ancho: true }),
      campo('estudio_pendiente', 'Falta revisar a mano', { tipo: 'textarea', ancho: true, ayuda: 'Lo que el agente no pudo ver (la Oficina Judicial Virtual o el SII con captcha, visita…)' })),
    guiaOjv);
  pintarChipEstudio();

  pintarNumeros();
  pintarDocs();
  setTimeout(pintarUbicacion, 0);
  const d = diasHasta(o.fecha_remate);
  return el('section', { class: 'listado rem-ficha' },
    volver,
    el('header', { class: 'listado-cabecera' },
      el('div', {},
        el('h1', {}, o.titulo),
        el('div', { class: 'rem-chips' }, chipEstado(o.estado), el('span', { class: 'chip chip-na' }, o.subtipo || nombreDe(TIPOS, o.tipo)),
          el('span', { class: 'chip chip-na' }, nombreDe(ORIGENES, o.origen)),
          el('span', { class: `chip ${d != null && d >= 0 && d <= 7 ? 'chip-venc' : 'chip-na'}` }, icono('calendario', { tam: 14 }), ` ${fechaRemate(o.fecha_remate)}${d != null ? (d >= 0 ? ` · en ${d} d` : ' · ya pasó') : ''}`),
          o.cargado_por === 'agente' ? el('span', { class: 'chip chip-pend' }, 'La trajo un agente') : null),
        o.motivo ? el('p', { class: 'texto-suave texto-chico' }, `Motivo: ${o.motivo}`) : null),
      el('div', { class: 'listado-acciones' }, editable ? botonEstrella(o, guardar, () => { estado.value = o.estado; }) : null, estado, eliminar)),
    numeros,
    el('p', { class: 'texto-chico rem-aprende' }, icono('birrete', { tam: 14 }), ' ¿Qué significa cada número? Pasa el mouse sobre él o ', el('a', { href: ctx.ruta('remates.aprender') }, 'abre Aprender'), '.'),
    estudio,
    ubicacion,
    el('div', { class: 'rem-columnas' },
      el('section', { class: 'rem-bloque' }, el('h2', {}, 'Datos'), datos),
      el('div', { class: 'rem-lateral' },
        el('section', { class: 'rem-bloque' }, el('h2', {}, 'Revisión'), revision),
        el('section', { class: 'rem-bloque' }, el('h2', {}, 'Enlaces'),
          el('ul', { class: 'rem-enlaces' }, enlaces(o).map(([t, u]) => el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener' }, icono('enlace', { tam: 14 }), ' ', t))))),
        el('section', { class: 'rem-bloque' }, el('h2', {}, 'Documentos'), docs, subir),
        el('section', { class: 'rem-bloque' }, el('h2', {}, 'Notas'), campo('notas', '', { tipo: 'textarea' })))));
}

// timestamptz → valor de <input type="datetime-local"> en la hora local
function aLocal(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
