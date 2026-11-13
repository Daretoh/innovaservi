// Formulario web de contacto (Marketing 003): tarjeta de Ajustes para crear el enlace público, activarlo o renovarlo,
// elegir el texto, las opciones de "¿Qué te interesa?" y si pide el vehículo; copiar el enlace y descargar el QR.
// El enlace con &c=<código> atribuye el contacto a esa campaña (Campañas → "Enlace del formulario").
import { el } from '../../core/ui/dom.js?v=7f910f1';
import { icono } from '../../core/ui/iconos.js?v=7f910f1';
import { boton } from '../../core/ui/tabla.js?v=7f910f1';
import { avisar } from '../../core/ui/aviso.js?v=7f910f1';
import { abrirFormulario } from '../../core/ui/modal.js?v=7f910f1';
import { urlApp } from '../../core/api.js?v=7f910f1';

const QR_JS = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
export const enlaceFormulario = (token, campana = null) => urlApp(`contacto/?t=${token}${campana ? `&c=${encodeURIComponent(campana)}` : ''}`);
const enlaceLocal = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}contacto/?t=${token}`;
const esLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);

export async function cargarFormulario(ctx) {
  const { data, error } = await ctx.api.rpc('mkt_enlace_formulario', { p_empresa: ctx.empresa.id });
  if (error) throw error;
  return data?.[0] ?? null;
}

function cargarQr() {
  if (globalThis.QRCode) return Promise.resolve();
  return new Promise((ok, mal) => { const s = el('script', { src: QR_JS }); s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el generador de QR.')); document.head.append(s); });
}
export async function descargarQr(url, nombre) {
  await cargarQr();
  const caja = el('div', { hidden: true });
  document.body.append(caja);
  new globalThis.QRCode(caja, { text: url, width: 720, height: 720, correctLevel: globalThis.QRCode.CorrectLevel.M });
  await new Promise((r) => setTimeout(r, 100));
  const lienzo = caja.querySelector('canvas');
  const a = el('a', { href: lienzo.toDataURL('image/png'), download: `${nombre}.png` });
  document.body.append(a); a.click(); a.remove(); caja.remove();
}
const copiar = async (texto) => { try { await navigator.clipboard.writeText(texto); avisar('Enlace copiado.'); } catch { avisar('No se pudo copiar.', 'error'); } };

export function tarjetaFormulario(ctx, f) {
  const editar = ctx.puede('mkt', 'editar');
  const llamar = async (args, aviso) => {
    const { error } = await ctx.api.rpc('mkt_enlace_formulario', { p_empresa: ctx.empresa.id, ...args });
    if (error) throw new Error(error.message);
    avisar(aviso); ctx.refrescar();
  };
  const configurar = () => abrirFormulario({
    titulo: 'Formulario web', textoGuardar: 'Guardar',
    campos: [
      { id: 'titulo', etiqueta: 'Texto bajo el nombre de la empresa', valor: f?.titulo ?? '', ayuda: 'Vacío = "Déjanos tus datos y te contactamos por WhatsApp."' },
      { id: 'intereses', etiqueta: '¿Qué te interesa? (opciones que el cliente marca)', tipo: 'lista', valor: f?.intereses ?? [], textoAgregar: 'Agregar opción', placeholder: 'Ej.: Tratamiento cerámico' },
      { id: 'vehiculo', etiqueta: 'Pedir el vehículo (marca, modelo y año)', opciones: [['si', 'Sí'], ['no', 'No']], valor: f?.pide_vehiculo ? 'si' : 'no' },
    ],
    alGuardar: (v) => llamar({ p_titulo: v.titulo.trim(), p_intereses: v.intereses, p_pide_vehiculo: v.vehiculo === 'si' }, 'Formulario guardado.'),
  });
  const renovar = () => abrirFormulario({
    titulo: 'Renovar el enlace', campos: [], textoGuardar: 'Renovar',
    mensaje: 'El enlace actual deja de funcionar (y los QR impresos con él). Úsalo si el enlace se difundió donde no querías.',
    alGuardar: () => llamar({ p_regenerar: true }, 'Enlace renovado.'),
  });

  if (!f) {
    return el('div', { class: 'ficha' },
      el('h2', {}, 'Formulario web'),
      el('p', { class: 'texto-suave texto-chico' }, 'Un enlace para la biografía de Instagram, la web o un QR en el local: el cliente deja su nombre, teléfono y lo que le interesa, y aparece solo en el Embudo con aviso al teléfono.'),
      editar ? boton('Crear el formulario', { icono: 'mas', tipo: 'primario', onclick: () => llamar({ p_regenerar: true }, 'Formulario creado: configura las opciones.').catch((e) => avisar(e.message, 'error')) })
        : el('p', { class: 'texto-suave' }, 'Todavía no está creado.'));
  }
  const url = enlaceFormulario(f.token);
  return el('div', { class: 'ficha mkt-form-web' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Formulario web'),
      el('span', { class: `chip ${f.activo ? 'chip-ok' : 'chip-pend'}` }, f.activo ? 'Activo' : 'Desactivado')),
    el('p', { class: 'texto-suave texto-chico' }, 'Los envíos quedan en el Embudo, en la primera etapa, con origen "Sitio web", y avisan por notificación a quien puede editar Marketing. Si el teléfono ya existe, se anota en ese contacto.'),
    el('div', { class: 'mkt-enlace' }, el('code', {}, url),
      boton('Copiar', { icono: 'copiar', class: 'boton boton-secundario boton-chico', onclick: () => copiar(url) }),
      boton('QR', { icono: 'descargar', class: 'boton boton-secundario boton-chico', onclick: () => descargarQr(url, 'formulario-contacto').catch((e) => avisar(e.message, 'error')) })),
    esLocal() ? el('p', { class: 'texto-chico' }, icono('alerta', { tam: 12 }), ' Este es el enlace publicado (funciona cuando se publique la app). Para probar ahora: ',
      el('a', { href: enlaceLocal(f.token), target: '_blank', rel: 'noopener' }, 'abrir en local')) : null,
    el('div', { class: 'texto-chico' },
      el('strong', {}, 'Opciones: '), f.intereses?.length ? f.intereses.join(' · ') : el('span', { class: 'texto-suave' }, 'sin opciones (solo mensaje)'),
      f.pide_vehiculo ? ' · pide el vehículo' : null),
    editar ? el('div', { class: 'listado-acciones' },
      boton('Configurar', { icono: 'editar', onclick: configurar }),
      boton(f.activo ? 'Desactivar' : 'Activar', { onclick: () => llamar({ p_activo: !f.activo }, f.activo ? 'Formulario desactivado.' : 'Formulario activado.').catch((e) => avisar(e.message, 'error')) }),
      boton('Renovar enlace', { onclick: renovar })) : null);
}
