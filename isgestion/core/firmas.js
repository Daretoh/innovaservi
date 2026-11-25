// Firma electrónica simple por WhatsApp (Núcleo 026): crear los enlaces personales, mandarlos por WhatsApp (wa.me) y
// ver quién firmó. La persona firma en /firmar/?t=… (Edge Function pública `firmar`).
//   enviarAFirmar(ctx, { origen, id, personas: [{ id, nombre, telefono }], titulo, alTerminar })
//   seccionFirmasEntrega(ctx, ent, participantes) → bloque para Prevención SST → registro de entrega
import { el } from './ui/dom.js?v=5f7c89a';
import { icono } from './ui/iconos.js?v=5f7c89a';
import { boton } from './ui/tabla.js?v=5f7c89a';
import { avisar } from './ui/aviso.js?v=5f7c89a';
import { telefono } from './ui/formato.js?v=5f7c89a';
import { urlApp } from './api.js?v=5f7c89a';
import { urlFirmada } from './adjuntos.js?v=5f7c89a';

const hora = (t) => new Date(t).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
export function enlaceWhatsapp(tel, texto) {
  let d = String(telefono(tel) ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9) d = `56${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}
const mensaje = (ctx, nombre, titulo, enlace) =>
  `Hola ${String(nombre ?? '').split(' ')[0]}, ${ctx.empresa.nombre_fantasia || ctx.empresa.razon_social} te envía "${titulo}" para firmar desde tu teléfono. `
  + `Ábrelo aquí, confirma tu RUT y firma (sin imprimir ni dibujar): ${enlace}`;

// Crea los enlaces (uno por persona; reenviar devuelve el mismo mientras siga vigente, Núcleo 029) y muestra una ventana con el botón de WhatsApp de cada uno
export async function enviarAFirmar(ctx, { origen, id, personas, titulo, casillas = null, alTerminar }) {
  return enviarVarios(ctx, [{ origen, id, personas, titulo, casillas }], alTerminar);
}

// Varios registros de una vez (p. ej. un registro individual por trabajador): una sola ventana con el WhatsApp de cada uno
export async function enviarVarios(ctx, lotes, alTerminar) {
  const filas = [];
  for (const lote of lotes) filas.push(...await filasDeLote(ctx, lote));
  mostrarEnvio(filas, alTerminar);
}

async function filasDeLote(ctx, { origen, id, personas, titulo, casillas = null }) {
  const { data, error } = await ctx.api.rpc('firma_crear', { p_empresa: ctx.empresa.id, p_origen: origen, p_id: id, p_personas: personas.map((p) => p.id), p_casillas: casillas?.length ? casillas : null });
  if (error) throw new Error(error.message);
  const de = new Map(personas.map((p) => [p.id, p]));
  return data.map((x) => {
    const p = de.get(x.persona_id) ?? {};
    const enlace = urlApp(`firmar/?t=${x.token}`);
    // Sin teléfono en la ficha, WhatsApp se abre con el mensaje listo y se elige el chat a mano
    const conTel = enlaceWhatsapp(p.telefono, mensaje(ctx, p.nombre, titulo, enlace));
    const wa = conTel ?? `https://wa.me/?text=${encodeURIComponent(mensaje(ctx, p.nombre, titulo, enlace))}`;
    const copiar = boton('Copiar enlace', { icono: 'copiar', onclick: async () => {
      try { await navigator.clipboard.writeText(mensaje(ctx, p.nombre, titulo, enlace)); avisar('Mensaje con el enlace copiado.'); } catch { avisar(enlace); }
    } });
    return el('div', { class: 'doc-fila' },
      el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre ?? 'Persona'), el('span', { class: 'texto-suave texto-chico' }, conTel ? telefono(p.telefono) : 'Sin teléfono en su ficha: en WhatsApp elige su chat')),
      el('div', { class: 'doc-acciones' }, copiar,
        el('a', { class: 'boton boton-primario', href: wa, target: '_blank', rel: 'noopener' }, icono('chat', { tam: 16 }), 'WhatsApp')));
  });
}

function mostrarEnvio(filas, alTerminar) {
  const cerrar = () => { dialogo.remove(); alTerminar?.(); };
  const dialogo = el('dialog', { class: 'modal', 'aria-label': 'Enviar a firmar' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, 'Enviar a firmar por WhatsApp'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: cerrar }, icono('cerrar'))),
    el('div', { class: 'modal-cuerpo' },
      el('p', { class: 'texto-suave texto-chico' }, `Toca WhatsApp en cada persona y envía el mensaje. El enlace es personal, vale 30 días y pide su RUT y su fecha de nacimiento (si está en su ficha). Si lo vuelves a enviar, va el mismo enlace.`),
      filas,
      el('div', { class: 'modal-pie' }, boton('Listo', { tipo: 'primario', onclick: cerrar }))));
  document.body.append(dialogo);
  dialogo.showModal();
}

// Ver el PDF de un registro de entrega: firmado, con las firmas que haya (se arma de nuevo) o el original sin firmas
export async function verPdf(ctx, ent) {
  const ventana = window.open('', '_blank');   // abierta al tocar: después de esperar, el navegador la bloquearía
  try {
    let ruta = ent.archivo;
    if (ent.estado !== 'firmado') {
      const { count } = await ctx.api.from('firma_solicitudes').select('id', { count: 'exact', head: true }).eq('entrega_id', ent.id).eq('estado', 'firmada');
      if (count) {
        const { data: r, error: e } = await ctx.api.functions.invoke('firmar', { body: { accion: 'armar', entrega_id: ent.id, solo_ver: true } });
        if (!e && !r?.error && r?.archivo) ruta = r.archivo;   // si no se pudo armar, se ve el original
      }
    }
    const u = await urlFirmada(ctx.api, ruta, 300);
    if (ventana) ventana.location = u; else window.open(u, '_blank', 'noopener');
  } catch (e) { ventana?.close(); avisar(e.message, 'error'); }
}

// Estado de firma de cada participante de un registro de entrega, con enviar, reenviar y terminar
export async function seccionFirmasEntrega(ctx, ent, participantes) {
  const { data, error } = await ctx.api.from('firma_solicitudes').select('id, persona_id, estado, firmado_at, created_at, intentos, vence, archivo_firmado')
    .eq('entrega_id', ent.id).neq('estado', 'anulada').order('created_at', { ascending: false });
  if (error) return el('p', { class: 'texto-suave' }, 'No se pudo leer el estado de las firmas.');
  const ultima = new Map();
  for (const s of data ?? []) if (!ultima.has(s.persona_id)) ultima.set(s.persona_id, s);
  const firmado = ent.estado === 'firmado';
  const puede = ctx.puede('sst', 'editar') && !firmado;
  const firmaron = participantes.filter((p) => ultima.get(p.id)?.estado === 'firmada');
  const faltan = participantes.filter((p) => ultima.get(p.id)?.estado !== 'firmada');
  const enviar = (lista) => async () => {
    try { await enviarAFirmar(ctx, { origen: 'sst_entrega', id: ent.id, personas: lista, titulo: ent.tema, alTerminar: () => ctx.refrescar() }); }
    catch (e) { avisar(e.message, 'error'); }
  };
  const chip = (s) => {
    if (s?.estado === 'firmada') return el('span', { class: 'chip chip-ok' }, `Firmó ${hora(s.firmado_at)}`);
    if (s?.estado === 'pendiente' && s.intentos >= 5) return el('span', { class: 'chip chip-venc' }, 'Bloqueado: reenviar');
    if (s?.estado === 'pendiente' && new Date(s.vence) < new Date()) return el('span', { class: 'chip chip-venc' }, 'Enlace vencido');
    if (s?.estado === 'pendiente') return el('span', { class: 'chip chip-prox' }, `Enviado ${hora(s.created_at)}`);
    return el('span', { class: 'chip' }, 'Sin enviar');
  };
  const terminar = boton(`Terminar con ${firmaron.length} firma${firmaron.length === 1 ? '' : 's'}`, { icono: 'check', onclick: async (ev) => {
    if (!confirm(`El registro queda firmado solo con quienes ya firmaron (${firmaron.length} de ${participantes.length}). Los demás enlaces dejan de servir. ¿Seguir?`)) return;
    const b = ev.currentTarget; b.disabled = true;
    try {
      const { data: r, error: e } = await ctx.api.functions.invoke('firmar', { body: { accion: 'cerrar', entrega_id: ent.id } });
      if (e || r?.error) throw new Error(r?.error || e.message);
      avisar('Registro firmado con las firmas electrónicas.'); ctx.refrescar();
    } catch (e) { avisar(e.message, 'error'); b.disabled = false; }
  } });
  const armar = async (soloVer = false) => {
    const { data: r, error: e } = await ctx.api.functions.invoke('firmar', { body: { accion: 'armar', entrega_id: ent.id, solo_ver: soloVer } });
    if (e || r?.error) throw new Error(r?.error || e.message);
    return r;
  };
  // Si se quitó de la lista a quien faltaba, ya firmaron todos: se cierra aquí
  const cerrarYa = boton('Cerrar como firmado', { icono: 'check', tipo: 'primario', onclick: async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    try { const r = await armar(); avisar(r.listo ? 'Registro firmado con las firmas electrónicas.' : 'Aún falta alguien por firmar.'); ctx.refrescar(); }
    catch (e) { avisar(e.message, 'error'); b.disabled = false; }
  } });
  const bloque = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Firma por WhatsApp'),
    el('p', { class: 'texto-suave texto-chico' }, firmado ? 'Registro cerrado.'
      : `Cada participante firma desde su teléfono. Cuando firman todos, el registro queda firmado solo y marca RRHH. Esta pantalla se pone al día sola cuando alguien firma. ${firmaron.length} de ${participantes.length} firmaron.`),
    participantes.length ? participantes.map((p) => {
      const s = ultima.get(p.id);
      return el('div', { class: 'doc-fila' },
        el('div', { class: 'doc-nombre' }, el('strong', {}, p.nombre ?? 'Persona'), chip(s)),
        puede && s?.estado !== 'firmada' ? el('div', { class: 'doc-acciones' }, boton(s ? 'Reenviar' : 'Enviar', { icono: 'chat', onclick: enviar([p]) })) : null);
    }) : el('p', { class: 'texto-suave' }, 'Agrega participantes para enviar a firmar.'),
    puede && faltan.length > 1 ? boton(`Enviar a los ${faltan.length} que faltan`, { icono: 'chat', tipo: 'primario', onclick: enviar(faltan) }) : null,
    el('div', { class: 'doc-acciones' },
      puede && firmaron.length && !faltan.length ? cerrarYa : null,
      puede && firmaron.length && faltan.length ? terminar : null));
  // Mientras falte alguien, se revisa cada 15 s (con la pestaña a la vista) y al volver a la pestaña: si alguien firmó,
  // la pantalla se pone al día sola
  if (!firmado && faltan.length && data?.some((s) => s.estado === 'pendiente')) {
    const antes = firmaron.length;
    const revisar = async () => {
      if (!bloque.isConnected) { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); return; }
      if (document.hidden) return;
      const { count } = await ctx.api.from('firma_solicitudes').select('id', { count: 'exact', head: true }).eq('entrega_id', ent.id).eq('estado', 'firmada')
        .in('persona_id', participantes.map((p) => p.id));
      const { data: e2 } = await ctx.api.from('sst_entregas').select('estado').eq('id', ent.id).maybeSingle();
      if ((count ?? antes) !== antes || e2?.estado === 'firmado') { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); ctx.refrescar(); }
    };
    const alVolver = () => { if (!document.hidden) revisar(); };
    const t = setInterval(revisar, 15000);
    document.addEventListener('visibilitychange', alVolver);
  }
  return bloque;
}
