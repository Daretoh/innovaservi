// Tarjeta de un cliente vista desde el taller (Marketing 016): la abre el QR de la tarjeta (página /tarjeta/ o Google
// Wallet) cuando quien escanea tiene sesión en ISgestión. Ruta: #/taller.tarjeta?t=<token de la tarjeta>.
// Muestra sellos, premio y movimientos, vehículos y órdenes abiertas del cliente; Canjear premio (taller o Marketing
// editar) y Poner sello a mano (Marketing aprobar), con las mismas funciones de la base que la orden y Marketing.
import { el } from '../../../core/ui/dom.js?v=db2b2b7';
import { icono } from '../../../core/ui/iconos.js?v=db2b2b7';
import { boton } from '../../../core/ui/tabla.js?v=db2b2b7';
import { avisar } from '../../../core/ui/aviso.js?v=db2b2b7';
import { abrirFormulario } from '../../../core/ui/modal.js?v=db2b2b7';
import { fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=db2b2b7';

const ESTADO = { agendado: 'Agendado', espera: 'En espera', proceso: 'En proceso', terminado: 'Terminado' };
const MOTIVO = { orden: 'Visita', manual: 'A mano', canje: 'Premio canjeado' };
const verPatente = (p) => (p && p.length === 6 ? `${p.slice(0, 4)}-${p.slice(4)}` : p ?? '');

export default async function vista(ctx) {
  const t = ctx.params?.t ?? '';
  const { data: f, error } = await ctx.api.rpc('mkt_socio_ficha', { p_token: t });
  if (error) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Tarjeta de cliente'), el('p', { class: 'texto-error' }, error.message));
  }
  if (f.empresa_id !== ctx.empresa.id) {
    return el('section', { class: 'listado' }, el('h1', {}, 'Tarjeta de cliente'),
      el('p', {}, 'Este cliente es de otra empresa. Cambia de empresa con el selector de arriba y vuelve a escanear el QR.'));
  }
  const puedeCanjear = ctx.puede('taller', 'editar') || ctx.puede('mkt', 'editar');
  const puedeSello = ctx.puede('mkt', 'aprobar');
  const premio = f.meta && f.sellos >= f.meta;

  const canjear = () => abrirFormulario({ titulo: 'Canjear premio', textoGuardar: 'Canjear', campos: [{ id: 'nota', etiqueta: 'Nota (opcional)', valor: '' }],
    mensaje: `${f.premio}. Se descuentan ${f.meta} sellos de la tarjeta. Si el premio es un servicio o un descuento, aplícalo en el cobro de la orden.`,
    alGuardar: async (v) => {
      const { error: e } = await ctx.api.rpc('mkt_canjear', { p_socio: f.socio_id, p_orden: null, p_nota: v.nota.trim() || 'Canje en el mesón (QR)' });
      if (e) throw new Error(e.message);
      avisar('Premio canjeado.'); ctx.refrescar();
    } });
  const ponerSello = () => abrirFormulario({ titulo: 'Poner sello a mano', textoGuardar: 'Guardar',
    mensaje: 'Los sellos de las visitas se ponen solos al cobrar la orden. Usa esto solo para corregir o regalar sellos.',
    campos: [{ id: 'n', etiqueta: 'Sellos (negativo para quitar)', tipo: 'number', valor: 1, requerido: true }, { id: 'nota', etiqueta: 'Motivo', requerido: true, valor: '' }],
    alGuardar: async (v) => {
      const n = Math.round(Number(v.n));
      if (!n) throw new Error('Indica cuántos sellos.');
      const { error: e } = await ctx.api.rpc('mkt_sello_manual', { p_socio: f.socio_id, p_cantidad: n, p_nota: v.nota.trim() });
      if (e) throw new Error(e.message);
      avisar('Sellos guardados.'); ctx.refrescar();
    } });

  const sellos = el('div', { class: 'tal-tj-sellos', role: 'img', 'aria-label': `${Math.min(f.sellos, f.meta)} de ${f.meta} sellos` },
    Array.from({ length: f.meta || 0 }, (_, i) => el('span', { class: `tal-tj-sello${i < f.sellos ? ' puesto' : ''}${i === f.meta - 1 ? ' premio' : ''}` },
      i < f.sellos ? icono('check', { tam: 18 }) : i === f.meta - 1 ? icono('etiqueta', { tam: 16 }) : String(i + 1))));

  return el('section', { class: 'listado tal-tj' },
    el('a', { class: 'volver', href: ctx.ruta('taller.clientes') }, icono('volver'), 'Clientes'),
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Tarjeta de cliente')),
    el('div', { class: `tal-tj-tarjeta${premio ? ' completa' : ''}` },
      el('div', { class: 'tal-tj-cab' },
        el('div', {}, el('strong', { class: 'tal-tj-nombre' }, f.nombre), el('span', { class: 'texto-chico' }, `N° ${f.numero} · cliente desde ${fechaLarga(f.desde)}`)),
        el('div', { class: 'tal-tj-cuenta' }, el('strong', {}, `${f.sellos}/${f.meta ?? '—'}`), el('span', { class: 'texto-chico' }, 'sellos'))),
      sellos,
      el('p', { class: 'tal-tj-estado' }, !f.activa ? 'La tarjeta de clientes está apagada (Marketing → Tarjeta).'
        : f.baja ? 'Este cliente fue dado de baja.'
          : premio ? ['Tiene su premio: ', el('strong', {}, f.premio)] : `Le faltan ${f.meta - f.sellos} para: ${f.premio}.`),
      el('div', { class: 'listado-acciones' },
        premio && puedeCanjear && !f.baja ? boton('Canjear premio', { icono: 'check', tipo: 'primario', onclick: canjear }) : null,
        puedeSello && !f.baja ? boton('Poner sello', { icono: 'mas', onclick: ponerSello }) : null,
        f.telefono ? el('a', { class: 'boton boton-secundario', href: `tel:${f.telefono.replace(/\s/g, '')}` }, icono('chat', { tam: 16 }), f.telefono) : null)),
    el('div', { class: 'ind-paneles' },
      el('div', { class: 'ficha' }, el('h2', {}, 'Órdenes abiertas'),
        f.ordenes.length ? el('ul', { class: 'mkt-ajustes-lista' }, f.ordenes.map((o) => el('li', {},
          el('a', { href: ctx.ruta('taller.orden', { id: o.id }) }, el('strong', {}, `N° ${o.numero}`), ` · ${verPatente(o.patente)}`),
          el('span', { class: 'chip' }, ESTADO[o.estado] ?? o.estado))))
          : el('p', { class: 'texto-suave texto-chico' }, f.tercero_id ? 'Sin órdenes abiertas.' : 'La tarjeta no está ligada a un cliente del taller todavía.')),
      el('div', { class: 'ficha' }, el('h2', {}, 'Vehículos'),
        f.vehiculos.length ? el('ul', { class: 'mkt-ajustes-lista' }, f.vehiculos.map((v) => el('li', {},
          el('a', { href: ctx.ruta('taller.vehiculo', { id: v.id }) }, el('strong', {}, verPatente(v.patente)), ` · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`))))
          : el('p', { class: 'texto-suave texto-chico' }, 'Sin vehículos registrados.')),
      el('div', { class: 'ficha' }, el('h2', {}, 'Últimos sellos'),
        f.movimientos.length ? el('ul', { class: 'mkt-ajustes-lista' }, f.movimientos.map((m) => el('li', {},
          el('span', {}, el('strong', {}, `${m.cantidad > 0 ? '+' : ''}${m.cantidad}`), ` ${MOTIVO[m.motivo] ?? m.motivo}${m.nota ? ` · ${m.nota}` : ''}`),
          el('span', { class: 'texto-suave texto-chico' }, fechaLarga(diaLocal(m.fecha))))))
          : el('p', { class: 'texto-suave texto-chico' }, 'Todavía sin sellos.'))));
}
