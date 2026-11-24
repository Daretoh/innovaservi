// Remates → Aprender: capacitación interactiva (pedido de Enzo, 2026-11-24) para entender los remates y la página.
// 1) Las palabras (glosario con de dónde sale cada dato y dónde se ve en la página), 2) calculadora que arma el costo
// total, el descuento y el puntaje paso a paso, 3) un remate real explicado en palabras, 4) cómo usar la página con
// enlaces a cada pantalla, 5) prueba corta con respuestas explicadas. Todo se calcula con las mismas funciones de la
// página (datos.js), así lo que se aprende es exactamente lo que hace la lista.
// Ruta: #/remates.aprender
import { el } from '../../../core/ui/dom.js?v=4514958';
import { icono } from '../../../core/ui/iconos.js?v=4514958';
import { dinero } from '../../../core/ui/formato.js?v=4514958';
import {
  cargarEstilos, contexto, cargarOportunidades, calcular, puntaje, pct, chipPuntaje, minimoSobreAvaluo, REVISION, RIESGOS,
  fechaRemate, distanciaKm, km, nombreDe, ESTUDIO_ESTADOS,
} from '../datos.js?v=4514958';

// ---- 1. Las palabras: qué es, de dónde sale y dónde se ve
const PALABRAS = [
  ['Mínimo (postura mínima)', 'Lo menos que se puede ofrecer en el remate. Lo fija el tribunal en las bases.',
    'Del aviso del remate o de las bases. Muchas veces es el avalúo fiscal o una parte de una tasación; si un remate queda sin postores, el tribunal suele bajarlo en el siguiente.',
    'Columna Mínimo de la lista y primer número de la ficha.'],
  ['Avalúo fiscal', 'El valor que el SII le asigna a la propiedad para cobrar contribuciones. Casi siempre es menor que el precio real de venta.',
    'Del SII (por rol o dirección, con captcha: se revisa a mano) o del extracto del remate cuando dice "el mínimo será el avalúo fiscal".',
    'Columna Avalúo fiscal; en la ficha, en Números y en Estudio del caso. El mapa puede mostrarlo en cada pastilla.'],
  ['Mínimo / avalúo', 'Cuánto es el mínimo comparado con el avalúo. 60 % quiere decir que parte en un 60 % del avalúo.',
    'Lo calcula la página: mínimo ÷ avalúo.',
    'Bajo el avalúo de la lista ("mínimo 60 %") y en el mapa (en verde bajo 80 %).'],
  ['Precio de mercado (estimado)', 'Lo que se podría vender la propiedad normalmente, sin remate. Es una estimación, no un dato oficial.',
    'Se estima con propiedades parecidas publicadas en la misma zona (Portal Inmobiliario, TocToc) o con UF por m² de la comuna. Lo pone el agente o tú; la ficha dice de dónde sale ("De dónde sale ese precio").',
    'Columna Mercado (est.). Si dice "Falta", no hay descuento ni puntaje de descuento.'],
  ['Gastos de compra', 'Lo que se paga además del precio: escritura, Conservador, abogado (inmuebles) o comisión del martillero e IVA (vehículos y maquinaria).',
    'Un porcentaje estimado del mínimo: 4 % en inmuebles y 12 % en vehículos y maquinaria (se puede cambiar en la configuración del módulo).',
    'Ficha → Números → Gastos de compra.'],
  ['Costo total estimado', 'Lo que de verdad saldría la compra.', 'Mínimo + gastos de compra + deudas que asumes + reparaciones o desalojo.', 'Ficha → Números (con borde de color).'],
  ['Descuento', 'Cuánto más barato que el mercado saldría, contando todos los costos.', '1 − costo total ÷ precio de mercado. 30 % = te ahorras el 30 % frente a comprar normal.', 'Columna Descuento (verde desde 20 %).'],
  ['Puntaje (0 a 100)', 'Una nota para ordenar, no una recomendación.',
    'Descuento (hasta 50 puntos, lleno con 40 % o más) + estar en Puerto Montt (15; otra comuna de Los Lagos 5) + dentro del presupuesto (15) + lo que llevas revisado de la lista de riesgos (hasta 20). Cada riesgo marcado (ocupada, otros juicios…) resta 15.',
    'Columna Puntaje; en la ficha se ve el detalle de cada parte.'],
  ['Garantía y vale vista', 'Para poder ofrecer hay que dejar una garantía, normalmente el 10 % del mínimo, con un vale vista del banco a nombre del tribunal.',
    'De las bases. Se entrega antes del remate (el día anterior o hasta una hora antes) y se devuelve si no ganas.', 'Ficha → Datos → Garantía.'],
  ['Tribunal, rol y carátula', 'El juzgado que remata, el número de la causa (ej. C-1234-2026) y el nombre de la causa ("BANCO X con …").',
    'Del aviso legal. Con el tribunal y el rol se busca la causa en la Oficina Judicial Virtual.', 'Ficha → Datos y Estudio del caso.'],
  ['Tipo de juicio', 'Por qué se remata: hipotecario (no pagó el crédito), ejecutivo (pagaré o deuda), partición (herencia), Tesorería (contribuciones), gastos comunes, liquidación de una empresa.',
    'De la carátula y la demanda.', 'Ficha → Estudio del caso.'],
  ['Remates sin postores', 'Si nadie ofrece, el remate se repite con un mínimo más bajo. Por eso algunos salen muy baratos.', 'De la causa (Oficina Judicial Virtual) o del aviso ("mínimo rebajado").', 'Ficha → Estudio del caso.'],
  ['Alzamiento de hipotecas', 'Borrar las hipotecas y embargos del inmueble después de comprar. Si un acreedor no fue citado al juicio, su hipoteca puede seguir.',
    'Del certificado de hipotecas y gravámenes del Conservador.', 'Ficha → Revisión → "Pedí dominio vigente e hipotecas…".'],
  ['Lanzamiento', 'Sacar a quien ocupa la propiedad después de comprar. Suele tomar de 3 a 6 meses o más.', 'Se pide en la misma causa o con un juicio aparte.', 'Ficha → Estudio del caso → Ocupación.'],
];

// ---- 5. Prueba: [pregunta, opciones, índice correcto, explicación]
const PRUEBA = [
  ['Un remate tiene mínimo $20 millones y avalúo fiscal $25 millones. ¿Cuánto es el mínimo sobre el avalúo?', ['125 %', '80 %', '20 %'], 1,
    '20 ÷ 25 = 0,8 → 80 %. Parte en el 80 % del avalúo; en el mapa saldría en ámbar (verde es bajo 80 %).'],
  ['¿Qué significa un puntaje de 30 en una casa de Puerto Montt dentro del presupuesto?', ['Que es mala', 'Que falta el precio de mercado o la revisión', 'Que hay que comprarla'], 1,
    'Puerto Montt (15) + presupuesto (15) = 30. Le faltan los 50 del descuento (no hay precio de mercado) y los 20 de la revisión. No es bueno ni malo: falta estudiarla.'],
  ['¿Qué pagas además del mínimo en un inmueble?', ['Nada', 'Solo la garantía', 'Escritura, Conservador, abogado y las deudas que dejen las bases a tu cargo'], 2,
    'La garantía no es un gasto (es parte del pago o se devuelve). Además del precio van los gastos de compra y las deudas (contribuciones, gastos comunes) que las bases te dejen.'],
  ['¿Por qué una propiedad puede salir muy barata?', ['Siempre es una estafa', 'Remates sin postores, deudas antiguas, ocupantes o solo derechos de una herencia', 'Porque el SII la tasó mal'], 1,
    'Eso es lo que responde el Estudio del caso. A veces el motivo es inofensivo (remates fallidos) y a veces es un riesgo (ocupantes, otros juicios).'],
  ['La Oficina Judicial Virtual te pide un captcha. ¿Qué hace el agente?', ['Se lo salta', 'Deja el tribunal y el rol en "Falta revisar a mano" para que entres tú', 'Inventa los datos'], 1,
    'El agente no se salta captchas ni inicia sesión: te deja listo qué buscar y dónde.'],
  ['¿Cómo guardas un remate que te interesa?', ['Con la estrella', 'Exportando a Excel', 'Eliminándolo'], 0,
    'La estrella lo deja en "Interesa" y la tarjeta Guardadas te los muestra todos. El agente de estudios estudia primero lo pedido y luego lo guardado.'],
];

export default async function vista(ctx) {
  cargarEstilos();
  const base = contexto(ctx);
  const { cfg } = base;
  const ops = await cargarOportunidades(ctx, base.gs).catch(() => []);
  const ir = (id, p) => ctx.ruta(id, p);

  // ---- Índice
  const secciones = [['palabras', 'Las palabras'], ['calculadora', 'Calculadora del puntaje'], ['ejemplo', 'Un remate real, explicado'], ['pagina', 'Cómo usar la página'], ['prueba', 'Ponte a prueba']];
  const indice = el('nav', { class: 'rem-indice' }, secciones.map(([id, t], i) => el('a', { href: `#apr-${id}`, onclick: (ev) => { ev.preventDefault(); document.getElementById(`apr-${id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, `${i + 1}. ${t}`)));

  // ---- 1. Palabras (tarjetas que se abren)
  const palabras = el('div', { class: 'rem-palabras' }, PALABRAS.map(([t, que, sale, donde]) => el('details', { class: 'rem-palabra' },
    el('summary', {}, el('strong', {}, t), el('span', { class: 'texto-chico texto-suave' }, que)),
    el('dl', {}, el('dt', {}, 'De dónde sale'), el('dd', {}, sale), el('dt', {}, 'Dónde lo ves'), el('dd', {}, donde)))));

  // ---- 2. Calculadora: mismas funciones que la lista
  const entrada = (etq, valor, ayuda = '') => {
    const i = el('input', { type: 'number', class: 'campo', min: 0, step: 100000, value: valor });
    return [i, el('label', { class: 'form-fila' }, el('span', {}, etq), i, ayuda ? el('span', { class: 'texto-chico texto-suave' }, ayuda) : null)];
  };
  const [iMin, fMin] = entrada('Mínimo ($)', 30000000);
  const [iAva, fAva] = entrada('Avalúo fiscal ($)', 40000000);
  const [iMer, fMer] = entrada('Precio de mercado estimado ($)', 60000000, 'Déjalo vacío para ver qué pasa cuando falta');
  const [iDeu, fDeu] = entrada('Deudas que asumes ($)', 1500000, 'Contribuciones, gastos comunes…');
  const [iRep, fRep] = entrada('Reparaciones o desalojo ($)', 2000000);
  const selTipo = el('select', { class: 'campo' }, [['inmueble', 'Inmueble'], ['vehiculo', 'Vehículo'], ['maquinaria', 'Maquinaria y activos']].map(([v, t]) => el('option', { value: v }, t)));
  const selComuna = el('select', { class: 'campo' }, [['Puerto Montt', 'Puerto Montt'], ['Osorno', 'Otra comuna de Los Lagos'], ['Santiago', 'Fuera de Los Lagos']].map(([v, t]) => el('option', { value: v }, t)));
  const revCaja = el('div', { class: 'rem-calc-checks' });
  let revision = {};
  const pintarChecks = () => {
    const tipo = selTipo.value;
    revCaja.replaceChildren(
      el('span', { class: 'texto-chico texto-suave' }, 'Lo que ya revisaste (suma hasta 20) y los riesgos que encontraste (cada uno resta 15):'),
      ...(REVISION[tipo] ?? REVISION.otro).map(([k, t]) => el('label', { class: 'casilla' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!revision[k], onchange: (ev) => { revision[k] = ev.target.checked; calc(); } }), t)),
      ...(RIESGOS[tipo] ?? []).map(([k, t]) => el('label', { class: 'casilla rem-riesgo' }, Object.assign(el('input', { type: 'checkbox' }), { checked: !!revision[k], onchange: (ev) => { revision[k] = ev.target.checked; calc(); } }), t)));
  };
  const salida = el('div', { class: 'rem-calc-salida' });
  function calc() {
    const o = { tipo: selTipo.value, minimo: Number(iMin.value) || null, avaluo_fiscal: Number(iAva.value) || null, precio_mercado: Number(iMer.value) || null,
      deudas_estimadas: Number(iDeu.value) || 0, reparaciones: Number(iRep.value) || 0, comuna: selComuna.value,
      region: selComuna.value === 'Santiago' ? 'Metropolitana' : 'Los Lagos', revision };
    const c = calcular(o, cfg); const p = puntaje(o, cfg); const r = minimoSobreAvaluo(o);
    const paso = (t, v, nota = '') => el('div', { class: 'rem-paso' }, el('span', {}, t), el('strong', {}, v), nota ? el('span', { class: 'texto-chico texto-suave' }, nota) : null);
    salida.replaceChildren(
      paso('Mínimo sobre el avalúo', r != null ? pct(r) : '—', r != null ? (r < 0.8 ? 'Parte bastante bajo el avalúo' : r <= 1 ? 'Cerca del avalúo' : 'Sobre el avalúo') : 'Falta el mínimo o el avalúo'),
      paso(`Gastos de compra (${c.pct} % del mínimo)`, c.minimo ? dinero(c.gastos) : '—'),
      paso('Costo total = mínimo + gastos + deudas + reparaciones', c.costo ? dinero(c.costo) : '—'),
      paso('Descuento = 1 − costo total ÷ mercado', c.descuento != null ? pct(c.descuento) : '—', c.descuento == null ? 'Sin precio de mercado no hay descuento' : c.descuento >= 0.2 ? 'Bueno (20 % o más)' : c.descuento < 0 ? 'Saldría más caro que comprar normal' : 'Poco margen'),
      paso('Diferencia frente al mercado', c.ganancia != null ? dinero(c.ganancia) : '—'),
      paso(c.grande ? 'Presupuesto para algo grande' : 'Presupuesto normal', c.tope ? `${dinero(c.tope)} ${c.enPresupuesto ? '(dentro)' : '(se pasa)'}` : '—'),
      el('div', { class: 'rem-paso rem-paso-puntaje' }, el('span', {}, 'Puntaje'), chipPuntaje(p.valor), el('ul', { class: 'texto-chico' }, p.partes.map((t) => el('li', {}, t)))));
  }
  for (const x of [iMin, iAva, iMer, iDeu, iRep]) x.addEventListener('input', calc);
  selTipo.addEventListener('change', () => { revision = {}; pintarChecks(); calc(); });
  selComuna.addEventListener('change', calc);
  pintarChecks(); calc();
  const calculadora = el('div', { class: 'rem-calc' },
    el('div', { class: 'rem-calc-entradas' },
      el('label', { class: 'form-fila' }, el('span', {}, 'Tipo'), selTipo), el('label', { class: 'form-fila' }, el('span', {}, 'Dónde'), selComuna),
      fMin, fAva, fMer, fDeu, fRep, revCaja),
    salida);

  // ---- 3. Un remate real explicado
  const ejemploCaja = el('div', { class: 'rem-ejemplo' });
  const conMinimo = ops.filter((o) => o.minimo).sort((a, b) => String(a.fecha_remate).localeCompare(String(b.fecha_remate)));
  const selEjemplo = el('select', { class: 'campo', 'aria-label': 'Remate de ejemplo' }, conMinimo.map((o) => el('option', { value: o.id }, `${o.titulo} · ${fechaRemate(o.fecha_remate)}`)));
  function explicar() {
    const o = conMinimo.find((x) => x.id === selEjemplo.value);
    if (!o) { ejemploCaja.replaceChildren(el('p', { class: 'texto-suave' }, 'Todavía no hay remates cargados para usar de ejemplo.')); return; }
    const c = calcular(o, cfg); const p = puntaje(o, cfg); const r = minimoSobreAvaluo(o); const d = distanciaKm(o, cfg);
    const linea = (...t) => el('li', {}, ...t);
    ejemploCaja.replaceChildren(el('ul', { class: 'rem-ejemplo-lista' },
      linea(el('strong', {}, 'Mínimo: '), `${dinero(o.minimo)}. Sale de ${o.fuente ? `${o.fuente}` : 'el aviso'}${o.url ? ' (enlace en la ficha)' : ''}.`),
      linea(el('strong', {}, 'Avalúo fiscal: '), o.avaluo_fiscal ? `${dinero(o.avaluo_fiscal)}; el mínimo es el ${pct(r)} del avalúo.` : 'todavía no está. Se saca del extracto del remate o del SII (a mano, por el captcha). El agente de estudios lo busca.'),
      linea(el('strong', {}, 'Precio de mercado: '), o.precio_mercado ? `${dinero(o.precio_mercado)}${o.mercado_base ? ` (${o.mercado_base})` : ''}.` : 'falta, por eso no hay descuento y el puntaje pierde hasta 50 puntos.'),
      linea(el('strong', {}, 'Costo total estimado: '), `${dinero(c.costo)} = mínimo + ${c.pct} % de gastos${(Number(o.deudas_estimadas) || 0) + (Number(o.reparaciones) || 0) ? ' + deudas y reparaciones' : ''}.`),
      linea(el('strong', {}, 'Ubicación: '), d != null ? `a ${km(d)} de ${cfg.centro_nombre} en línea recta${o.direccion ? ` (${o.direccion})` : ''}.` : 'sin ubicar todavía.'),
      linea(el('strong', {}, `Puntaje ${p.valor}: `), p.partes.join(' · '), '.'),
      linea(el('strong', {}, 'Estudio del caso: '), `${nombreDe(ESTUDIO_ESTADOS, o.estudio_estado ?? 'sin_estudio').toLowerCase()}${o.motivo_precio ? `. Por qué está barato: ${o.motivo_precio}` : '. Falta saber por qué está barato: es lo primero que hay que averiguar.'}`)),
      el('a', { class: 'boton boton-secundario', href: ir('remates.ficha', { id: o.id }) }, icono('derecha', { tam: 16 }), 'Abrir su ficha'));
  }
  selEjemplo.addEventListener('change', explicar);
  explicar();

  // ---- 4. Cómo usar la página
  const PASOS = [
    ['Mira la lista', 'Parte filtrada en Puerto Montt. Toca el título de una columna para ordenar (por fecha, avalúo, puntaje…).', ir('remates.lista')],
    ['Guarda con la estrella', 'Lo que te interesa queda en "Guardadas" y el agente de estudios lo estudia después de lo pedido.', ir('remates.lista')],
    ['Mira el mapa', 'Botón Mapa arriba a la derecha y elige qué mostrar: mínimo, avalúo, mínimo sobre avalúo o puntaje.', ir('remates.lista')],
    ['Abre la ficha', 'Números, ubicación, datos, revisión de riesgos, enlaces, documentos y notas.', null],
    ['Estudia el caso', 'Por qué está barato, quién demanda, deuda, ocupación. Si no tienes tiempo, toca "Pedir estudio al agente". Lo que no pudo ver el agente queda en "Falta revisar a mano".', null],
    ['Revisa en la Oficina Judicial Virtual', 'Con el tribunal y el rol de la ficha; la guía paso a paso está al final del Estudio del caso.', null],
    ['Marca la revisión y sube documentos', 'Cada casilla revisada sube el puntaje; sube las bases, el certificado del Conservador y fotos.', null],
    ['Decide', 'Cambia el estado: Postulada (dejaste la garantía), Ganada, Perdida o Descartada (con el motivo, para aprender de cada caso).', null],
  ];
  const pagina = el('ol', { class: 'rem-pasos-pagina' }, PASOS.map(([t, d, href]) => el('li', {}, el('strong', {}, t), el('span', {}, d),
    href ? el('a', { href, class: 'texto-chico' }, 'Ir') : null)));

  // ---- 5. Prueba
  const resultado = el('p', { class: 'rem-prueba-resultado', 'aria-live': 'polite' });
  const respondidas = new Map();
  const prueba = el('div', { class: 'rem-prueba' }, PRUEBA.map(([q, opciones, ok, porque], n) => {
    const fb = el('p', { class: 'texto-chico rem-prueba-fb', hidden: true });
    const botones = opciones.map((t, i) => el('button', { type: 'button', class: 'rem-opcion', onclick: () => {
      for (const b of botones) b.disabled = true;
      botones[i].classList.add(i === ok ? 'bien' : 'mal'); botones[ok].classList.add('bien');
      fb.hidden = false; fb.textContent = `${i === ok ? 'Correcto. ' : 'No exactamente. '}${porque}`;
      respondidas.set(n, i === ok);
      const bien = [...respondidas.values()].filter(Boolean).length;
      resultado.textContent = `${bien} de ${respondidas.size} correctas${respondidas.size === PRUEBA.length ? (bien === PRUEBA.length ? ': lo tienes claro.' : ': revisa las palabras de las que fallaste.') : ''}`;
    } }, t));
    return el('div', { class: 'rem-pregunta' }, el('strong', {}, `${n + 1}. ${q}`), el('div', { class: 'rem-opciones' }, botones), fb);
  }), resultado);

  const seccion = (id, n, titulo, intro, ...hijos) => el('section', { class: 'rem-bloque rem-apr', id: `apr-${id}` },
    el('h2', {}, el('span', { class: 'rem-apr-n' }, String(n)), titulo), intro ? el('p', { class: 'texto-suave' }, intro) : null, ...hijos);

  return el('section', { class: 'listado rem-aprender' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, icono('birrete', { tam: 22 }), ' Aprender: remates y esta página')),
    el('p', { class: 'texto-suave' }, 'Cinco partes cortas. La calculadora y el ejemplo usan las mismas cuentas que la lista, así que lo que ves aquí es exactamente cómo se arman los números de la página.'),
    indice,
    seccion('palabras', 1, 'Las palabras', 'Toca cada una para ver de dónde sale y dónde aparece en la página.', palabras),
    seccion('calculadora', 2, 'Calculadora del puntaje', 'Cambia los números y marca casillas: se recalcula al tiro.', calculadora),
    seccion('ejemplo', 3, 'Un remate real, explicado', 'Elige uno de los remates cargados y te explico sus números en palabras.', conMinimo.length ? selEjemplo : null, ejemploCaja),
    seccion('pagina', 4, 'Cómo usar la página', null, pagina),
    seccion('prueba', 5, 'Ponte a prueba', 'Seis preguntas; cada respuesta trae su explicación.', prueba));
}
