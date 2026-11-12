// Datos y reglas comunes de Marketing y redes (etapa 1: seguimiento sin conexión a Meta).
import { el } from '../../core/ui/dom.js?v=5a36f48';
import { hoyISO, diaLocal } from '../../core/ui/formato.js?v=5a36f48';

export const ORIGENES = [['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['web', 'Sitio web'],
  ['anuncio', 'Anuncio pagado'], ['cliente', 'Cliente actual'], ['referido', 'Referido'], ['presencial', 'Presencial'], ['telefono', 'Llamada'], ['correo', 'Correo'], ['otro', 'Otro']];
export const nombreOrigen = Object.fromEntries(ORIGENES);

export const CANALES = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['google', 'Google'],
  ['web', 'Sitio web'], ['correo', 'Correo'], ['presencial', 'Presencial'], ['otro', 'Otro']];
export const nombreCanal = Object.fromEntries(CANALES);

export const ESTADOS_CAMPANA = [['planificada', 'Planificada'], ['activa', 'Activa'], ['terminada', 'Terminada']];
export const nombreEstadoCampana = Object.fromEntries(ESTADOS_CAMPANA);
export const CHIP_CAMPANA = { planificada: 'chip-pend', activa: 'chip-ok', terminada: 'chip-prox' };

export const REDES = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['whatsapp', 'Estado de WhatsApp'],
  ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['web', 'Sitio web']];
export const nombreRed = Object.fromEntries(REDES);
export const FORMATOS = [['post', 'Post'], ['carrusel', 'Carrusel'], ['reel', 'Reel'], ['historia', 'Historia'], ['video', 'Video'], ['articulo', 'Artículo']];
export const nombreFormato = Object.fromEntries(FORMATOS);
export const ESTADOS_PUB = [['idea', 'Idea'], ['diseno', 'En diseño'], ['por_aprobar', 'Por aprobar'], ['aprobada', 'Aprobada'], ['programada', 'Programada'], ['publicada', 'Publicada']];
export const nombreEstadoPub = Object.fromEntries(ESTADOS_PUB);
export const CHIP_PUB = { idea: 'chip-pend', diseno: 'chip-pend', por_aprobar: 'chip-prox', aprobada: 'chip-ok', programada: 'chip-ok', publicada: 'chip-ok' };

export const TIPOS_EVENTO = [['nota', 'Nota'], ['llamada', 'Llamada'], ['whatsapp', 'WhatsApp'], ['instagram', 'Mensaje de Instagram'], ['correo', 'Correo'], ['reunion', 'Reunión o visita']];
export const nombreEvento = { ...Object.fromEntries(TIPOS_EVENTO), etapa: 'Etapa', cliente: 'Cliente' };

export const MOTIVOS = ['Precio', 'No respondió', 'Eligió a otro', 'Fuera de zona', 'Solo preguntaba', 'Fecha no le acomoda'];

export const TIPOS_ETAPA = [['abierta', 'En curso'], ['ganada', 'Ganada (cliente)'], ['perdida', 'Perdida']];

// Contacto sin atender: en la primera etapa y sin actividad registrada en 2 días o más
export const DIAS_SIN_ATENDER = 2;
const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 864e5);
export const diasDesde = (ts) => (ts ? diasEntre(diaLocal(ts), hoyISO()) : null);
export const diasHasta = (fecha) => diasEntre(hoyISO(), fecha);

// Etapas (crea las iniciales si la empresa no tiene), campañas y usuarios para los formularios
export async function cargarBase(ctx) {
  const e = ctx.empresa.id;
  const etapas = () => ctx.api.from('mkt_etapas').select('*').eq('empresa_id', e).is('deleted_at', null).order('orden').order('created_at');
  let [et, ca, us] = await Promise.all([etapas(),
    ctx.api.from('mkt_campanas').select('*').eq('empresa_id', e).is('deleted_at', null).order('inicio', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    ctx.api.rpc('nombres_usuarios', { p_empresa: e })]);
  if (et.error) throw et.error;
  if (ca.error) throw ca.error;
  if (!et.data.length) {
    const r = await ctx.api.rpc('mkt_etapas_iniciales', { p_empresa: e });
    if (r.error) throw r.error;
    et = await etapas();
    if (et.error) throw et.error;
  }
  const usuarios = (us.data ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { etapas: et.data, campanas: ca.data, usuarios, nombreUsuario: new Map(usuarios.map((u) => [u.user_id, u.nombre])) };
}

// Enlace de WhatsApp (wa.me) con el teléfono en dígitos; los celulares chilenos de 9 dígitos llevan 56 adelante
export function enlaceWhatsapp(tel, texto = '') {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) d = `56${d}`;
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// Enlace con UTM para una campaña (utm_source = red, utm_medium = social o pagado, utm_campaign = código)
export function enlaceUtm(c, fuente = c.canal) {
  if (!c.url_destino || !c.codigo) return null;
  try {
    const u = new URL(c.url_destino);
    u.searchParams.set('utm_source', fuente);
    u.searchParams.set('utm_medium', ['google', 'correo'].includes(fuente) ? fuente === 'correo' ? 'email' : 'cpc' : 'social');
    u.searchParams.set('utm_campaign', c.codigo);
    return u.toString();
  } catch { return null; }
}

// Código de campaña a partir del nombre ("Promo Cerámico Noviembre" → "promo-ceramico-noviembre")
export const codigoDesde = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Opciones para los formularios
export const opcionesUsuarios = (usuarios, vacio = 'Sin asignar') => [['', vacio], ...usuarios.map((u) => [u.user_id, u.nombre])];
export const opcionesCampanas = (campanas, vacio = 'Sin campaña') => [['', vacio], ...campanas.map((c) => [c.id, c.nombre])];

// Estilos del módulo (una vez)
export function cargarCss() {
  if (document.getElementById('mkt-css')) return;
  document.head.append(el('link', { id: 'mkt-css', rel: 'stylesheet', href: new URL('./mkt.css?v=5a36f48', import.meta.url).href }));
}
