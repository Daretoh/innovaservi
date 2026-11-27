// Datos compartidos de Remates: listas de valores, carga de oportunidades, costo total, descuento y puntaje,
// casillas de revisión por tipo y enlaces útiles (SII, Poder Judicial, CBR, mapa, portales).
import { el } from '../../core/ui/dom.js?v=0b94763';
import { icono } from '../../core/ui/iconos.js?v=0b94763';
import { configModulo } from '../../core/modulos.js?v=0b94763';
import { empresasCon, ctxDe } from '../grupo/empresas.js?v=0b94763';
import manifiesto from './manifest.js?v=0b94763';

export const TIPOS = [['inmueble', 'Inmueble'], ['vehiculo', 'Vehículo'], ['maquinaria', 'Maquinaria y activos'], ['otro', 'Otro']];
export const ORIGENES = [
  ['judicial', 'Remate judicial'], ['tesoreria', 'Tesorería (contribuciones)'], ['banco', 'Banco o recuperadora'],
  ['bienes_nacionales', 'Bienes Nacionales'], ['concursal', 'Liquidación concursal'], ['martillero', 'Martillero (venta privada)'],
  ['dicrep', 'DICREP'], ['otro', 'Otro'],
];
export const ESTADOS = [
  ['nueva', 'Nueva'], ['estudiando', 'En estudio'], ['interesa', 'Interesa'], ['postulada', 'Postulada'],
  ['ganada', 'Ganada'], ['perdida', 'Perdida'], ['descartada', 'Descartada'],
];
export const OBJETIVOS = [['ambos', 'Invertir o uso del grupo'], ['invertir', 'Invertir (comprar y vender)'], ['uso', 'Uso del grupo']];
export const REGIONES = ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Metropolitana',
  "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes'];
export const SUBTIPOS = {
  inmueble: ['Sitio', 'Casa', 'Departamento', 'Parcela', 'Terreno industrial', 'Galpón o bodega', 'Oficina o local', 'Derechos'],
  vehiculo: ['Camioneta', 'Automóvil', 'Camión', 'Bus', 'Moto', 'Remolque'],
  maquinaria: ['Embarcación', 'Balsas-jaula y pontones', 'Maquinaria pesada', 'Equipos de planta', 'Generadores', 'Herramientas'],
  otro: ['Derechos de agua', 'Concesión', 'Acciones o derechos sociales', 'Lote de bienes'],
};
// ---- Estudio del caso (Remates 003)
export const TIPOS_JUICIO = [
  ['hipotecario', 'Hipotecario (banco o mutuaria)'], ['ejecutivo', 'Ejecutivo (pagaré, crédito)'], ['particion', 'Partición de bienes (herencia, sociedad)'],
  ['tesoreria', 'Tesorería (contribuciones)'], ['concursal', 'Liquidación concursal'], ['gasto_comun', 'Cobro de gastos comunes'], ['otro', 'Otro'],
];
export const OCUPACIONES = [['desconocida', 'No se sabe'], ['desocupada', 'Desocupada'], ['deudor', 'La ocupa el deudor'], ['arrendatario', 'Arrendada'], ['terceros', 'Ocupada por terceros']];
export const ESTUDIO_ESTADOS = [['sin_estudio', 'Sin estudiar'], ['pedido', 'Pedido al agente'], ['en_curso', 'En curso'], ['listo', 'Listo']];
export const ESTUDIO_CAMPOS = ['tipo_juicio', 'demandante', 'deuda_monto', 'deuda_desde', 'causa_inicio', 'contribuciones_deuda', 'ocupacion',
  'remates_previos', 'motivo_precio', 'estudio_resumen', 'estudio_pendiente'];
export function chipEstudio(o) {
  const clase = { sin_estudio: 'chip-na', pedido: 'chip-pend', en_curso: 'chip-prox', listo: 'chip-ok' }[o.estudio_estado] ?? 'chip-na';
  const quien = o.estudio_por === 'agente' ? ' · agente' : o.estudio_por === 'persona' ? '' : '';
  return el('span', { class: `chip ${clase}`, title: o.estudio_at ? `Actualizado el ${new Date(o.estudio_at).toLocaleString('es-CL')}` : 'Estudio de la causa' },
    `Estudio: ${nombreDe(ESTUDIO_ESTADOS, o.estudio_estado).toLowerCase()}${quien}`);
}
// Mínimo como fracción del avalúo fiscal (muchos remates parten del avalúo; bajo 1 = bajo el avalúo)
export const minimoSobreAvaluo = (o) => (o.minimo && o.avaluo_fiscal ? o.minimo / o.avaluo_fiscal : null);
export const millones = (n) => (n == null ? '—' : `$${(n / 1e6).toLocaleString('es-CL', { maximumFractionDigits: n < 1e7 ? 1 : 0 })} M`);

// Estrella para guardar una oportunidad de interés: marca el estado "Interesa" (o lo devuelve a "En estudio").
// guardar(cambios) → true/false; alCambiar() se llama después de guardar.
export const INTERESAN = ['interesa', 'postulada', 'ganada'];
export function botonEstrella(o, guardar, alCambiar = null) {
  const b = el('button', { type: 'button', class: 'boton-icono rem-estrella' }, icono('estrella', { tam: 18 }));
  const pintar = () => {
    const on = INTERESAN.includes(o.estado);
    b.classList.toggle('activa', on);
    b.title = on ? 'Te interesa (tocar para quitar)' : 'Guardar como de interés';
    b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', b.title);
  };
  b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (['postulada', 'ganada'].includes(o.estado)) return;
    b.disabled = true;
    const nuevo = o.estado === 'interesa' ? 'estudiando' : 'interesa';
    if (await guardar({ estado: nuevo })) { o.estado = nuevo; pintar(); alCambiar?.(); }
    b.disabled = false;
  });
  pintar();
  return b;
}

export const nombreDe = (lista, v) => lista.find(([k]) => k === v)?.[1] ?? v ?? '';

// Casillas de revisión: lo que hay que mirar antes de postular. 'riesgo' marca algo malo (resta puntaje).
export const REVISION = {
  inmueble: [
    ['bases', 'Leí las bases del remate (garantía, plazo del saldo, gastos)'],
    ['causa', 'Revisé la causa en la Oficina Judicial Virtual (incidentes, terceros)'],
    ['cbr', 'Pedí dominio vigente e hipotecas y gravámenes al Conservador'],
    ['sii', 'Vi el avalúo y la deuda de contribuciones (SII y Tesorería)'],
    ['gastos_comunes', 'Sé la deuda de gastos comunes y servicios'],
    ['visita', 'La vi en terreno (por fuera o por dentro)'],
    ['ocupacion', 'Sé si está ocupada y por quién'],
    ['abogado', 'La revisó un abogado'],
  ],
  vehiculo: [
    ['bases', 'Leí las condiciones (comisión, garantía, plazo de retiro)'],
    ['inspeccion', 'Lo vi o lo inspeccioné en la exhibición'],
    ['rvm', 'Certificado de anotaciones del Registro de Vehículos (prendas, embargos)'],
    ['multas', 'Revisé multas y permiso de circulación'],
    ['tecnica', 'Revisión técnica y papeles al día'],
  ],
  maquinaria: [
    ['bases', 'Leí las bases (comisión, garantía, retiro y traslado)'],
    ['inspeccion', 'Lo vi o lo inspeccioné en la exhibición'],
    ['papeles', 'Facturas, permisos o matrícula (embarcaciones: Directemar)'],
    ['traslado', 'Coticé el retiro y el traslado'],
    ['uso', 'Sé para qué lo usaríamos o a quién se lo vendemos'],
  ],
};
REVISION.otro = REVISION.maquinaria;
export const RIESGOS = {
  inmueble: [['ocupada', 'Está ocupada'], ['litigios', 'Tiene otros juicios, hipotecas de terceros o prohibiciones'], ['irregular', 'Construcción sin regularizar o problemas de deslindes']],
  vehiculo: [['prendas', 'Tiene prendas, embargos o multas grandes'], ['dano', 'Daño mayor o sin funcionar']],
  maquinaria: [['dano', 'Daño mayor o sin funcionar'], ['traslado_caro', 'Retiro o traslado caro']],
};
RIESGOS.otro = RIESGOS.maquinaria;

// Remates vive en el espacio Grupo: los datos son de las empresas donde el módulo está activo y el usuario puede verlo.
// Devuelve esas empresas (g), la principal (la primera donde puede crear, o la primera) con su ctx y su configuración.
export function contexto(ctx) {
  const gs = empresasCon(ctx, 'remates');
  const g = gs.find((x) => x.puede('remates', 'crear')) ?? gs[0] ?? null;
  const cfg = configModulo(manifiesto, g?.modulos.get('remates') ?? {});
  return { gs, g, ctxE: g ? ctxDe(ctx, g) : null, cfg, de: (empresaId) => gs.find((x) => x.empresa.id === empresaId) ?? null };
}

export async function cargarOportunidades(ctx, gs) {
  if (!gs.length) return [];
  const { data, error } = await ctx.api.from('rem_oportunidades').select('*')
    .in('empresa_id', gs.map((g) => g.empresa.id)).is('deleted_at', null).order('fecha_remate', { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return data;
}

// Costo total estimado: mínimo + gastos de compra (% de la configuración) + deudas + reparaciones
export function calcular(o, cfg = {}) {
  const minimo = Number(o.minimo) || 0;
  const pct = Number(o.tipo === 'inmueble' ? cfg.gastos_inmueble ?? 4 : cfg.gastos_otros ?? 12) || 0;
  const gastos = Math.round(minimo * pct / 100);
  const costo = minimo ? minimo + gastos + (Number(o.deudas_estimadas) || 0) + (Number(o.reparaciones) || 0) : null;
  const mercado = Number(o.precio_mercado) || null;
  const descuento = costo && mercado ? 1 - costo / mercado : null;   // 0,3 = 30 % bajo el mercado
  const ganancia = costo && mercado ? mercado - costo : null;
  const grande = o.tipo === 'maquinaria' || (Number(o.sup_terreno) || 0) >= 5000 || /galp|industrial|bodega/i.test(o.subtipo ?? '');
  const tope = Number(grande ? cfg.tope_grande : cfg.tope_normal) || null;
  return { minimo, pct, gastos, costo, mercado, descuento, ganancia, grande, tope, enPresupuesto: tope ? minimo <= tope : null };
}

// Puntaje 0–100 (orientativo, no es una recomendación): descuento sobre el mercado (hasta 50), zona de interés (15),
// dentro del presupuesto (15) y avance de la revisión (hasta 20); cada riesgo marcado resta 15.
export function puntaje(o, cfg = {}) {
  const c = calcular(o, cfg);
  const partes = [];
  let p = 0;
  if (c.descuento != null) {
    const d = Math.round(Math.max(0, Math.min(1, c.descuento / 0.4)) * 50);
    p += d; partes.push(`Descuento ${pct(c.descuento)}: ${d} de 50`);
  } else partes.push('Sin precio de mercado: 0 de 50');
  const lista_ = (s) => String(s ?? '').split(',').map((r) => normal(r)).filter(Boolean);
  const calza = (valor, l) => !!valor && l.some((r) => normal(valor).includes(r) || r.includes(normal(valor)));
  if (calza(o.comuna, lista_(cfg.comunas))) { p += 15; partes.push(`Comuna de interés (${o.comuna}): 15`); }
  else if (calza(o.region, lista_(cfg.regiones))) { p += 5; partes.push(`Región de interés, fuera de las comunas: 5 de 15`); }
  if (c.enPresupuesto) { p += 15; partes.push('Dentro del presupuesto: 15'); }
  const lista = REVISION[o.tipo] ?? REVISION.otro;
  const hechas = lista.filter(([k]) => o.revision?.[k]).length;
  const r = Math.round(hechas / lista.length * 20);
  p += r; partes.push(`Revisión ${hechas} de ${lista.length}: ${r} de 20`);
  for (const [k, t] of RIESGOS[o.tipo] ?? []) if (o.revision?.[k]) { p -= 15; partes.push(`${t}: −15`); }
  return { valor: Math.max(0, Math.min(100, p)), partes };
}

const normal = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const pct = (x) => `${Math.round(x * 100)} %`;

export function chipPuntaje(v) {
  const clase = v >= 60 ? 'chip-ok' : v >= 35 ? 'chip-prox' : 'chip-na';
  return el('span', { class: `chip ${clase} rem-puntaje`, title: 'Puntaje orientativo (0 a 100)' }, String(v));
}

export function chipEstado(e) {
  const clase = { nueva: 'chip-pend', estudiando: 'chip-prox', interesa: 'chip-ok', postulada: 'chip-ok', ganada: 'chip-ok', perdida: 'chip-na', descartada: 'chip-na' }[e] ?? 'chip-na';
  return el('span', { class: `chip ${clase}` }, nombreDe(ESTADOS, e));
}

// Días hasta el remate (negativo = ya pasó)
export function diasHasta(ts) {
  if (!ts) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(ts); d.setHours(0, 0, 0, 0);
  return Math.round((d - hoy) / 86400000);
}
export function fechaRemate(ts) {
  if (!ts) return 'Sin fecha';
  const d = new Date(ts);
  const hora = d.getHours() || d.getMinutes() ? ` ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : '';
  return `${d.toLocaleDateString('es-CL')}${hora}`;
}

// Enlaces útiles de una oportunidad (abren en otra pestaña)
export function enlaces(o) {
  const lugar = [o.direccion, o.comuna, o.region ? `Región de ${o.region}` : '', 'Chile'].filter(Boolean).join(', ');
  const l = [];
  if (o.url) l.push(['Aviso o ficha del remate', o.url]);
  if (o.lat && o.lng) l.push(['Mapa', `https://www.google.com/maps?q=${o.lat},${o.lng}`]);
  else if (o.direccion || o.comuna) l.push(['Mapa', `https://www.google.com/maps/search/${encodeURIComponent(lugar)}`]);
  if (o.tipo === 'inmueble') {
    l.push(['Avalúo en el SII (Mapas)', 'https://www4.sii.cl/mapasui/internet/']);
    l.push(['Certificados del Conservador (Conservadores Digitales)', 'https://conservadoresdigitales.cl/']);
    if (o.comuna) l.push(['Precios en Portal Inmobiliario', `https://www.portalinmobiliario.com/venta/${encodeURIComponent(o.comuna.toLowerCase().replace(/\s+/g, '-'))}`]);
  }
  if (o.tipo === 'vehiculo') l.push(['Precios de usados (Chileautos)', 'https://www.chileautos.cl/']);
  if (o.rol_causa) l.push(['Causa en la Oficina Judicial Virtual', 'https://oficinajudicialvirtual.pjud.cl/']);
  if (o.origen === 'tesoreria') l.push(['Remates de Tesorería', 'https://remates.tgr.cl/']);
  if (o.origen === 'concursal') l.push(['Boletín Concursal', 'https://www.boletinconcursal.cl/']);
  return l;
}

// ---- Ubicación: distancia en línea recta al centro de referencia (config `centro`, por defecto la Plaza de Armas de
// Puerto Montt) y qué tan céntrico es.
export function centro(cfg = {}) {
  const [lat, lng] = String(cfg.centro ?? '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : [-41.4718, -72.9396];
}
export function distanciaKm(o, cfg = {}) {
  if (o.lat == null || o.lng == null) return null;
  const [la, lo] = centro(cfg);
  const r = (g) => g * Math.PI / 180;
  const a = Math.sin(r(o.lat - la) / 2) ** 2 + Math.cos(r(la)) * Math.cos(r(o.lat)) * Math.sin(r(o.lng - lo) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
export function cercania(km) {
  if (km == null) return null;
  if (km <= 2) return ['Céntrico', 'chip-ok'];
  if (km <= 5) return ['Cerca del centro', 'chip-ok'];
  if (km <= 10) return ['Periferia', 'chip-prox'];
  return ['Alejado', 'chip-na'];
}
export const km = (x) => `${x.toLocaleString('es-CL', { maximumFractionDigits: x < 10 ? 1 : 0 })} km`;
export function chipDistancia(d, nombreCentro = 'centro') {
  const c = cercania(d);
  if (!c) return el('span', { class: 'texto-suave texto-chico' }, 'Sin ubicar');
  return el('span', { class: 'rem-distancia', title: `${km(d)} en línea recta al ${nombreCentro}` },
    el('span', { class: `chip ${c[1]}` }, c[0]), el('span', { class: 'texto-chico texto-suave' }, km(d)));
}

// Leaflet 1.9.4 (cdnjs, versión fija) con mapas de OpenStreetMap; se carga solo al abrir un mapa
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
let cargaMapa = null;
export function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  cargaMapa ??= new Promise((ok, mal) => {
    document.head.append(el('link', { rel: 'stylesheet', href: `${LEAFLET}leaflet.min.css` }));
    const s = el('script', { src: `${LEAFLET}leaflet.min.js` });
    s.onload = () => ok(window.L); s.onerror = () => { cargaMapa = null; mal(new Error('No se pudo cargar el mapa.')); };
    document.head.append(s);
  });
  return cargaMapa;
}

// Mapa en `nodo` con el centro marcado y los puntos [{ lat, lng, color, titulo, html, alClic }]; devuelve { mapa, L }
export async function mapa(nodo, puntos, cfg = {}, { zoom = 12 } = {}) {
  const L = await cargarLeaflet();
  const m = L.map(nodo, { scrollWheelZoom: false }).setView(centro(cfg), zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  const css = getComputedStyle(document.documentElement);
  const color = (v) => css.getPropertyValue(v).trim() || '#1f4e8c';
  L.circleMarker(centro(cfg), { radius: 6, color: color('--texto'), weight: 2, fillOpacity: 0.2 }).addTo(m).bindTooltip(cfg.centro_nombre || 'Centro');
  const capas = [];
  for (const p of puntos) {
    // Con etiqueta: una "pastilla" con el valor (ej. "$11,9 M") del color del dato; sin etiqueta, un círculo
    const c = p.etiqueta != null
      ? L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'rem-pin-caja', iconSize: null,
          html: `<span class="rem-pin" style="--pin: ${color(p.color ?? '--empresa')}">${String(p.etiqueta).replace(/[<>&"]/g, '')}</span>` }) }).addTo(m)
      : L.circleMarker([p.lat, p.lng], { radius: 9, color: color(p.color ?? '--empresa'), weight: 2, fillColor: color(p.color ?? '--empresa'), fillOpacity: 0.55 }).addTo(m);
    if (p.html) c.bindPopup(p.html);
    if (p.titulo) c.bindTooltip(p.titulo);
    if (p.alClic) c.on('click', p.alClic);
    capas.push(c);
  }
  if (capas.length > 1) m.fitBounds(L.featureGroup(capas).getBounds().pad(0.2), { maxZoom: 14 });
  else if (capas.length === 1) m.setView(capas[0].getLatLng(), 14);
  setTimeout(() => m.invalidateSize(), 50);
  return { mapa: m, L };
}

// Busca coordenadas de una dirección o sector con Nominatim (OpenStreetMap); null si no la encuentra
export async function geocodificar(texto) {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(texto)}`;
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('No se pudo buscar la dirección.');
  const j = await r.json();
  return j[0] ? { lat: Number(Number(j[0].lat).toFixed(6)), lng: Number(Number(j[0].lon).toFixed(6)), nombre: j[0].display_name } : null;
}

export function cargarEstilos() {
  if (document.getElementById('remates-css')) return;
  document.head.append(el('link', { id: 'remates-css', rel: 'stylesheet', href: new URL('./remates.css?v=0b94763', import.meta.url).href }));
}
