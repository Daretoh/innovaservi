// Marketing → Tarjeta de cliente (Marketing 007): reglas de la tarjeta de fidelidad (por visita o por monto, sellos para
// el premio, premio, vencimiento, condiciones; cambiarlas pide aprobar), y los clientes inscritos con sus sellos.
// Por cliente: enviar la tarjeta por WhatsApp, copiar el enlace, canjear el premio, sello a mano (aprobar) y dar de baja.
// Los sellos los pone la base al cobrar una orden del Taller de un cliente inscrito.
import { el } from '../../../core/ui/dom.js?v=6d3f615';
import { icono } from '../../../core/ui/iconos.js?v=6d3f615';
import { boton, listado } from '../../../core/ui/tabla.js?v=6d3f615';
import { avisar } from '../../../core/ui/aviso.js?v=6d3f615';
import { abrirFormulario } from '../../../core/ui/modal.js?v=6d3f615';
import { dinero, fechaLarga, diaLocal } from '../../../core/ui/formato.js?v=6d3f615';
import { urlApp } from '../../../core/api.js?v=6d3f615';
import { cargarCss, enlaceWhatsapp } from '../datos.js?v=6d3f615';

const enlaceTarjeta = (token) => urlApp(`tarjeta/?t=${token}`);
const enlaceLocal = (token) => `${location.origin}${location.pathname.replace(/[^/]*$/, '')}tarjeta/?t=${token}`;
const esLocal = () => ['localhost', '127.0.0.1'].includes(location.hostname);

export default async function vista(ctx) {
  cargarCss();
  const e = ctx.empresa.id;
  const [rc, rs, rsal, rt] = await Promise.all([
    ctx.api.from('mkt_tarjeta_config').select('*').eq('empresa_id', e).maybeSingle(),
    ctx.api.from('mkt_socios').select('id, tercero_id, nombre, telefono, correo, promociones, origen, created_at').eq('empresa_id', e).is('deleted_at', null).order('created_at', { ascending: false }).limit(5000),
    ctx.api.rpc('mkt_saldos', { p_empresa: e }),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, telefono').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social').limit(10000),
  ]);
  for (const r of [rc, rs, rsal]) if (r.error) throw r.error;
  const c = rc.data;
  const saldo = new Map((rsal.data ?? []).map((x) => [x.socio_id, x]));
  const editar = ctx.puede('mkt', 'editar');
  const aprobar = ctx.puede('mkt', 'aprobar');
  const eliminar = ctx.puede('mkt', 'eliminar');
  const meta = c?.meta ?? 6;
  const rpc = async (fn, args, ok) => { const { data, error } = await ctx.api.rpc(fn, args); if (error) throw new Error(error.message); if (ok) { avisar(ok); ctx.refrescar(); } return data; };

  // ---- Reglas
  const formReglas = () => abrirFormulario({
    titulo: 'Reglas de la tarjeta', textoGuardar: 'Guardar',
    mensaje: 'Los sellos los pone el sistema al cobrar una orden del taller de un cliente inscrito (venta normal). Cambiar la meta no borra sellos.',
    campos: [
      { id: 'modo', etiqueta: 'Cómo se gana un sello', opciones: [['visita', 'Un sello por visita cobrada'], ['monto', 'Un sello por cada monto gastado']], valor: c?.modo ?? 'visita' },
      { id: 'monto', etiqueta: 'Monto por sello (si es por monto)', tipo: 'number', valor: c?.monto_por_sello ?? 50000 },
      { id: 'meta', etiqueta: 'Sellos para el premio', tipo: 'number', valor: meta },
      { id: 'premio', etiqueta: 'Premio', requerido: true, valor: c?.premio ?? '', ayuda: 'Ej.: "Un lavado CORE gratis" o "20% de descuento en tu próxima mantención".' },
      { id: 'vence', etiqueta: 'Los sellos vencen a los (meses; vacío = no vencen)', tipo: 'number', valor: c?.vence_meses ?? '' },
      { id: 'condiciones', etiqueta: 'Condiciones (se ven en la tarjeta)', tipo: 'textarea', filas: 3, valor: c?.condiciones ?? '', ayuda: 'Ej.: "Premio personal, no canjeable por dinero. Válido para el mismo vehículo."' },
    ],
    alGuardar: async (v) => {
      const n = (x, min, max, nombre) => { const k = Math.round(Number(x)); if (!(k >= min && k <= max)) throw new Error(`${nombre}: entre ${min} y ${max}.`); return k; };
      const datos = { modo: v.modo, monto_por_sello: n(v.monto, 1000, 10000000, 'Monto por sello'), meta: n(v.meta, 2, 20, 'Sellos para el premio'),
        premio: v.premio.trim(), vence_meses: String(v.vence).trim() ? n(v.vence, 1, 36, 'Vencimiento') : null, condiciones: v.condiciones.trim() || null };
      const { error } = c ? await ctx.api.from('mkt_tarjeta_config').update(datos).eq('empresa_id', e) : await ctx.api.from('mkt_tarjeta_config').insert({ ...datos, empresa_id: e });
      if (error) throw new Error(error.message);
      avisar('Reglas guardadas.'); ctx.refrescar();
    },
  });
  const alternar = async () => {
    const { error } = await ctx.api.from('mkt_tarjeta_config').update({ activo: !c.activo }).eq('empresa_id', e);
    if (error) avisar(error.message, 'error'); else { avisar(c.activo ? 'Tarjeta desactivada: no se ponen sellos.' : 'Tarjeta activa: los cobros del taller ponen sellos.'); ctx.refrescar(); }
  };
  const reglas = el('div', { class: 'ficha mkt-tj-reglas' },
    el('div', { class: 'listado-cabecera' }, el('h2', {}, 'Reglas'),
      c ? el('span', { class: `chip ${c.activo ? 'chip-ok' : 'chip-pend'}` }, c.activo ? 'Activa' : 'Desactivada') : null),
    c ? el('p', {}, el('strong', {}, `${c.meta} sellos → ${c.premio}`), el('br'),
      el('span', { class: 'texto-suave texto-chico' }, c.modo === 'monto' ? `1 sello por cada ${dinero(c.monto_por_sello)} cobrados` : '1 sello por visita cobrada',
        c.vence_meses ? ` · vencen a los ${c.vence_meses} meses` : ' · no vencen'))
      : el('p', { class: 'texto-suave' }, 'Define las reglas para empezar: cómo se gana un sello, cuántos para el premio y cuál es el premio.'),
    aprobar ? el('div', { class: 'listado-acciones' },
      boton(c ? 'Cambiar reglas' : 'Definir reglas', { icono: 'editar', tipo: c ? 'secundario' : 'primario', onclick: formReglas }),
      c ? boton(c.activo ? 'Desactivar' : 'Activar', { tipo: c.activo ? 'secundario' : 'primario', onclick: alternar }) : null)
      : el('p', { class: 'texto-chico texto-suave' }, 'Cambiar las reglas pide el permiso aprobar de Marketing.'),
    el('p', { class: 'texto-chico texto-suave' }, 'Los clientes se inscriben al pedir hora en la Agenda en línea, o aquí con "Inscribir cliente". Guardan la tarjeta en la pantalla de inicio del celular.'));

  // ---- Acciones por cliente
  const token = (s) => rpc('mkt_enlace_tarjeta', { p_socio: s.id });
  const enviar = async (s) => {
    try {
      const url = enlaceTarjeta(await token(s));
      const texto = `Hola ${s.nombre.split(/\s+/)[0]}, esta es tu tarjeta de cliente de ${ctx.empresa.nombre_fantasia || ctx.empresa.razon_social}: ${url}\nGuárdala en la pantalla de inicio de tu celular para ver tus sellos.`;
      const wa = enlaceWhatsapp(s.telefono, texto);
      if (wa) window.open(wa, '_blank', 'noopener'); else avisar('El cliente no tiene teléfono.', 'error');
    } catch (err) { avisar(err.message, 'error'); }
  };
  const copiar = async (s) => {
    try { const t = await token(s); await navigator.clipboard.writeText(enlaceTarjeta(t)); avisar('Enlace copiado.'); if (esLocal()) window.open(enlaceLocal(t), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); }
  };
  const canjear = (s) => abrirFormulario({ titulo: 'Canjear premio', textoGuardar: 'Canjear',
    mensaje: `${s.nombre}: ${c.premio}. Se descuentan ${c.meta} sellos de la tarjeta.`,
    campos: [{ id: 'nota', etiqueta: 'Nota (opcional)', valor: '' }],
    alGuardar: (v) => rpc('mkt_canjear', { p_socio: s.id, p_nota: v.nota }, 'Premio canjeado.') });
  const manual = (s) => abrirFormulario({ titulo: 'Sellos a mano', textoGuardar: 'Guardar',
    mensaje: 'Para corregir o regalar sellos (ej.: una promoción). Queda registrado con el motivo.',
    campos: [{ id: 'cantidad', etiqueta: 'Sellos (negativo para quitar)', tipo: 'number', valor: 1, requerido: true }, { id: 'nota', etiqueta: 'Motivo', requerido: true }],
    alGuardar: (v) => rpc('mkt_sello_manual', { p_socio: s.id, p_cantidad: Math.round(Number(v.cantidad)), p_nota: v.nota }, 'Sellos actualizados.') });
  const baja = (s) => abrirFormulario({ titulo: 'Dar de baja la tarjeta', textoGuardar: 'Dar de baja', campos: [],
    mensaje: `La tarjeta de ${s.nombre} deja de funcionar (el enlace muestra que fue dada de baja). Sus sellos quedan en el registro.`,
    alGuardar: () => rpc('mkt_baja_socio', { p_socio: s.id }, 'Tarjeta dada de baja.') });
  const inscritos = new Set(rs.data.map((s) => s.tercero_id).filter(Boolean));
  const inscribir = () => abrirFormulario({ titulo: 'Inscribir cliente', textoGuardar: 'Inscribir',
    mensaje: 'Crea su tarjeta con el nombre y el teléfono del cliente. Después envíasela por WhatsApp.',
    campos: [{ id: 'tercero', etiqueta: 'Cliente', requerido: true, opciones: [['', 'Elegir…'], ...(rt.data ?? []).filter((t) => !inscritos.has(t.id)).map((t) => [t.id, `${t.nombre_fantasia || t.razon_social}${t.telefono ? ` · ${t.telefono}` : ' · sin teléfono'}`])] }],
    alGuardar: (v) => rpc('mkt_inscribir', { p_empresa: e, p_tercero: v.tercero }, 'Cliente inscrito.') });

  const sellosDe = (s) => saldo.get(s.id)?.sellos ?? 0;
  const tabla = listado({
    titulo: 'Clientes inscritos',
    filas: rs.data,
    vacio: 'Todavía no hay clientes inscritos.',
    claseFila: (s) => (c && sellosDe(s) >= c.meta ? 'mkt-tj-premio' : null),
    columnas: [
      { titulo: 'Cliente', valor: (s) => el('span', { class: 'mkt-respuesta' }, el('strong', {}, s.nombre), el('span', { class: 'texto-suave texto-chico' }, s.telefono)) },
      { titulo: 'Sellos', valor: (s) => {
        const n = sellosDe(s);
        return el('span', { class: 'mkt-tj-sellos' }, el('span', { class: 'mkt-barra' }, el('span', { style: `width:${Math.min(100, (n / meta) * 100)}%` })),
          el('span', { class: 'mkt-num' }, `${n}/${meta}`), c && n >= c.meta ? el('span', { class: 'chip chip-ok' }, 'Premio') : null);
      } },
      { titulo: 'Premios', valor: (s) => String(saldo.get(s.id)?.canjes ?? 0) },
      { titulo: 'Último sello', valor: (s) => (saldo.get(s.id)?.ultimo ? fechaLarga(diaLocal(saldo.get(s.id).ultimo)) : '—') },
      { titulo: 'Inscrito', valor: (s) => `${fechaLarga(diaLocal(s.created_at))} · ${{ agenda: 'Agenda', bot: 'Bot', manual: 'A mano' }[s.origen] ?? s.origen}` },
      { titulo: '', valor: (s) => el('span', { class: 'listado-acciones', onclick: (ev) => ev.stopPropagation() },
        el('button', { type: 'button', class: 'boton-icono', title: 'Enviar por WhatsApp', 'aria-label': 'Enviar por WhatsApp', onclick: () => enviar(s) }, icono('chat', { tam: 16 })),
        el('button', { type: 'button', class: 'boton-icono', title: esLocal() ? 'Copiar enlace y abrir en local' : 'Copiar enlace', 'aria-label': 'Copiar enlace', onclick: () => copiar(s) }, icono('copiar', { tam: 16 })),
        editar && c?.activo && sellosDe(s) >= c.meta ? boton('Canjear', { tipo: 'primario', class: 'boton boton-primario boton-chico', onclick: () => canjear(s) }) : null,
        aprobar ? el('button', { type: 'button', class: 'boton-icono', title: 'Sellos a mano', 'aria-label': 'Sellos a mano', onclick: () => manual(s) }, icono('editar', { tam: 16 })) : null,
        eliminar ? el('button', { type: 'button', class: 'boton-icono', title: 'Dar de baja', 'aria-label': 'Dar de baja', onclick: () => baja(s) }, icono('basura', { tam: 16 })) : null) },
    ],
    acciones: editar ? [boton('Inscribir cliente', { icono: 'mas', tipo: 'primario', onclick: inscribir })] : [],
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Tarjeta de cliente')),
    reglas, tabla);
}
