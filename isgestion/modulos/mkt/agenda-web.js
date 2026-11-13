// Agenda en línea (Marketing 006): tarjeta de Ajustes para activar la página pública /agenda/?t=<token del formulario
// web>, elegir días, horas y cupos, el texto, los beneficios de inscribirse y qué servicios se ofrecen; copiar el enlace
// y descargar el QR. Las horas pedidas se confirman en Taller → Agenda.
import { el } from '../../core/ui/dom.js?v=60a60f0';
import { icono } from '../../core/ui/iconos.js?v=60a60f0';
import { boton } from '../../core/ui/tabla.js?v=60a60f0';
import { avisar } from '../../core/ui/aviso.js?v=60a60f0';
import { abrirFormulario } from '../../core/ui/modal.js?v=60a60f0';
import { urlApp } from '../../core/api.js?v=60a60f0';
import { descargarQr } from './formulario-web.js?v=60a60f0';

const DIAS = [['1', 'Lunes'], ['2', 'Martes'], ['3', 'Miércoles'], ['4', 'Jueves'], ['5', 'Viernes'], ['6', 'Sábado'], ['7', 'Domingo']];
export const enlaceAgenda = (token) => urlApp(`agenda/?t=${token}`);
const enlaceLocal = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}agenda/?t=${token}`;
const esLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);
const copiar = async (texto) => { try { await navigator.clipboard.writeText(texto); avisar('Enlace copiado.'); } catch { avisar('No se pudo copiar.', 'error'); } };

export async function cargarAgenda(ctx) {
  const [c, s, p] = await Promise.all([
    ctx.api.from('mkt_agenda_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle(),
    ctx.api.from('tal_servicios').select('id, nombre').eq('empresa_id', ctx.empresa.id).eq('activo', true).order('orden').order('nombre'),
    ctx.api.from('mkt_reservas').select('estado', { count: 'exact', head: true }).eq('empresa_id', ctx.empresa.id).eq('estado', 'pendiente'),
  ]);
  if (c.error) throw c.error;
  return { config: c.data, servicios: s.data ?? [], pendientes: p.count ?? 0 };
}

export function tarjetaAgenda(ctx, formWeb, { config: c, servicios, pendientes }) {
  const editar = ctx.puede('mkt', 'editar');
  const guardar = async (datos, aviso) => {
    const q = c ? ctx.api.from('mkt_agenda_config').update(datos).eq('empresa_id', ctx.empresa.id)
      : ctx.api.from('mkt_agenda_config').insert({ ...datos, empresa_id: ctx.empresa.id });
    const { error } = await q;
    if (error) throw new Error(error.message);
    avisar(aviso); ctx.refrescar();
  };
  const horas = (lista) => lista.map((h) => h.trim().replace(/^(\d):/, '0$1:').replace(/^(\d{2})$/, '$1:00')).filter(Boolean);
  const configurar = () => abrirFormulario({
    titulo: 'Agenda en línea', textoGuardar: 'Guardar',
    campos: [
      { id: 'dias', etiqueta: 'Días de atención', tipo: 'checks', opciones: DIAS, valor: (c?.dias ?? [1, 2, 3, 4, 5, 6]).map(String) },
      { id: 'horas', etiqueta: 'Horas que se ofrecen (lunes a viernes)', tipo: 'lista', valor: c?.horas ?? ['09:00', '10:00', '11:00', '15:00', '16:00'], textoAgregar: 'Agregar hora', placeholder: '09:00' },
      { id: 'sabado', etiqueta: 'Horas del sábado', tipo: 'lista', valor: c?.horas_sabado ?? ['09:00', '10:00', '11:00'], textoAgregar: 'Agregar hora', placeholder: '09:00' },
      { id: 'cupos_hora', etiqueta: 'Vehículos por hora', tipo: 'number', valor: c?.cupos_hora ?? 1 },
      { id: 'cupos_dia', etiqueta: 'Vehículos por día (contando lo ya agendado en el taller)', tipo: 'number', valor: c?.cupos_dia ?? 4 },
      { id: 'anticipacion', etiqueta: 'Desde cuántos días (1 = desde mañana)', tipo: 'number', valor: c?.anticipacion ?? 1 },
      { id: 'horizonte', etiqueta: 'Hasta cuántos días hacia adelante', tipo: 'number', valor: c?.horizonte ?? 21 },
      { id: 'titulo', etiqueta: 'Texto bajo el nombre de la empresa', valor: c?.titulo ?? '', ayuda: 'Vacío = "Elige el servicio, el día y la hora. Te confirmamos por WhatsApp."' },
      { id: 'beneficios', etiqueta: 'Qué gana al inscribirse como cliente', tipo: 'textarea', filas: 3, valor: c?.beneficios ?? '',
        ayuda: 'Ej.: "Tarjeta de cliente: cada 5 lavados, el 6.º gratis. Recordatorio de mantención y promociones exclusivas."' },
      servicios.length ? { id: 'servicios', etiqueta: 'Servicios que se pueden pedir (ninguno marcado = todos)', tipo: 'checks', opciones: servicios.map((s) => [s.id, s.nombre]), valor: c?.servicios ?? [] } : null,
    ].filter(Boolean),
    alGuardar: (v) => {
      const n = (x, min, max) => { const k = Math.round(Number(x)); if (!(k >= min && k <= max)) throw new Error(`Revisa los números (entre ${min} y ${max}).`); return k; };
      return guardar({
        dias: v.dias.map(Number), horas: horas(v.horas), horas_sabado: horas(v.sabado),
        cupos_hora: n(v.cupos_hora, 1, 20), cupos_dia: n(v.cupos_dia, 1, 50), anticipacion: n(v.anticipacion, 0, 14), horizonte: n(v.horizonte, 3, 90),
        titulo: v.titulo.trim() || null, beneficios: v.beneficios.trim() || null,
        ...(servicios.length ? { servicios: v.servicios.length ? v.servicios : null } : {}),
      }, 'Agenda guardada.');
    },
  });
  const alternar = () => guardar({ activo: !c?.activo }, c?.activo ? 'Agenda en línea desactivada.' : 'Agenda en línea activada.').catch((e) => avisar(e.message, 'error'));

  const cab = el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Agenda en línea'),
    el('span', { class: `chip ${c?.activo ? 'chip-ok' : 'chip-pend'}` }, c?.activo ? 'Activa' : 'Desactivada'));
  const explica = el('p', { class: 'texto-suave texto-chico' },
    'El cliente elige servicio, día y hora con cupo, deja sus datos y su vehículo, y puede inscribirse como cliente. La hora queda pedida: el taller la confirma (o la cambia) en Taller → Agenda y se crea la orden.');
  if (!formWeb) return el('div', { class: 'ficha' }, cab, explica, el('p', { class: 'texto-chico' }, 'Primero crea el Formulario web: la agenda usa el mismo enlace.'));
  const url = enlaceAgenda(formWeb.token);
  const nombresDias = (c?.dias ?? [1, 2, 3, 4, 5, 6]).map((d) => DIAS[d - 1][1].slice(0, 3)).join(' ');
  return el('div', { class: 'ficha mkt-form-web' }, cab, explica,
    c?.activo ? el('div', { class: 'mkt-enlace' }, el('code', {}, url),
      boton('Copiar', { icono: 'copiar', class: 'boton boton-secundario boton-chico', onclick: () => copiar(url) }),
      boton('QR', { icono: 'descargar', class: 'boton boton-secundario boton-chico', onclick: () => descargarQr(url, 'agenda-en-linea').catch((e) => avisar(e.message, 'error')) })) : null,
    c?.activo && esLocal() ? el('p', { class: 'texto-chico' }, icono('alerta', { tam: 12 }), ' Funciona cuando se publique la app. Para probar ahora: ',
      el('a', { href: enlaceLocal(formWeb.token), target: '_blank', rel: 'noopener' }, 'abrir en local')) : null,
    c ? el('div', { class: 'texto-chico' }, el('strong', {}, 'Atención: '), `${nombresDias} · ${c.horas.join(', ')}`,
      c.dias.includes(6) ? ` · sábado ${c.horas_sabado.join(', ') || 'sin horas'}` : '', ` · ${c.cupos_hora} por hora, ${c.cupos_dia} por día`) : null,
    pendientes ? el('p', { class: 'texto-chico' }, el('span', { class: 'chip chip-prox' }, `${pendientes} por confirmar`), ' en Taller → Agenda') : null,
    editar ? el('div', { class: 'listado-acciones' },
      boton('Configurar', { icono: 'editar', onclick: configurar }),
      boton(c?.activo ? 'Desactivar' : 'Activar', { tipo: c?.activo ? 'secundario' : 'primario', onclick: alternar })) : null);
}
