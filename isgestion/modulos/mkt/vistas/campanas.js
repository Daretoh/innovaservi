// Campañas: presupuesto y gasto, contactos y clientes que trajo cada una, costo por contacto y por cliente, publicaciones
// ligadas y el enlace con UTM por red (para medir cuántos llegan desde cada publicación o anuncio).
import { el } from '../../../core/ui/dom.js?v=24a7fd7';
import { icono } from '../../../core/ui/iconos.js?v=24a7fd7';
import { boton } from '../../../core/ui/tabla.js?v=24a7fd7';
import { avisar } from '../../../core/ui/aviso.js?v=24a7fd7';
import { abrirFormulario } from '../../../core/ui/modal.js?v=24a7fd7';
import { dinero, fechaCorta } from '../../../core/ui/formato.js?v=24a7fd7';
import { exportarExcel } from '../../../core/excel.js?v=24a7fd7';
import { cargarBase, cargarCss, nombreCanal, nombreEstadoCampana, CHIP_CAMPANA, enlaceUtm, REDES, CANALES } from '../datos.js?v=24a7fd7';
import { formCampana } from '../formularios.js?v=24a7fd7';
import { cargarFormulario, enlaceFormulario, descargarQr } from '../formulario-web.js?v=24a7fd7';

const estado = { ver: 'vigentes' };

export default async function vista(ctx) {
  cargarCss();
  const [base, formWeb] = await Promise.all([cargarBase(ctx), cargarFormulario(ctx).catch(() => null)]);
  const e = ctx.empresa.id;
  const [rc, rp] = await Promise.all([
    ctx.api.from('mkt_contactos').select('id, campana_id, etapa_id, tercero_id').eq('empresa_id', e).is('deleted_at', null).not('campana_id', 'is', null).limit(10000),
    ctx.api.from('mkt_publicaciones').select('id, campana_id, estado, alcance, interacciones, leads').eq('empresa_id', e).is('deleted_at', null).not('campana_id', 'is', null).limit(5000)]);
  if (rc.error) throw rc.error;
  if (rp.error) throw rp.error;
  const ganada = new Set(base.etapas.filter((x) => x.tipo === 'ganada').map((x) => x.id));
  const cifras = (c) => {
    const cs = rc.data.filter((x) => x.campana_id === c.id);
    const ps = rp.data.filter((x) => x.campana_id === c.id);
    const clientes = cs.filter((x) => ganada.has(x.etapa_id) || x.tercero_id).length;
    const gasto = Number(c.gasto || 0);
    return { contactos: cs.length, clientes, publicaciones: ps.length, alcance: ps.reduce((s, p) => s + (p.alcance || 0), 0),
      porContacto: gasto && cs.length ? Math.round(gasto / cs.length) : null, porCliente: gasto && clientes ? Math.round(gasto / clientes) : null, gasto };
  };
  const lista = base.campanas.filter((c) => estado.ver === 'todas' || c.estado !== 'terminada');
  const editar = ctx.puede('mkt', 'editar');

  // Enlaces con UTM: uno por red, para copiar en la biografía, la publicación o el anuncio
  const enlaces = (c) => abrirFormulario({
    titulo: `Enlaces de ${c.nombre}`, textoGuardar: 'Listo',
    mensaje: 'Copia el enlace de la red donde lo vas a poner. Las visitas que lleguen por él se ven en la analítica del sitio (Umami, Google Analytics) con el código de la campaña.',
    campos: [...new Set([c.canal, ...REDES.map(([k]) => k)])].filter((k) => k !== 'whatsapp' || c.canal === 'whatsapp')
      .map((k) => ({ id: k, etiqueta: Object.fromEntries([...REDES, ...CANALES])[k] ?? k, valor: enlaceUtm(c, k) ?? '' })),
    alGuardar: async () => {},
  });

  const tarjeta = (c) => {
    const n = cifras(c);
    const avance = c.presupuesto ? Math.min(100, Math.round((n.gasto / Number(c.presupuesto)) * 100)) : null;
    return el('article', { class: 'ficha mkt-campana' },
      el('header', { class: 'mkt-campana-cab' },
        el('div', {}, el('h2', {}, c.nombre),
          el('span', { class: 'texto-suave texto-chico' }, [nombreCanal[c.canal], c.inicio ? `${fechaCorta(c.inicio)}${c.fin ? ` al ${fechaCorta(c.fin)}` : ''}` : null, c.codigo ? `código ${c.codigo}` : null].filter(Boolean).join(' · '))),
        el('span', { class: `chip ${CHIP_CAMPANA[c.estado]}` }, nombreEstadoCampana[c.estado])),
      c.objetivo ? el('p', { class: 'texto-chico' }, icono('check', { tam: 13 }), ` ${c.objetivo}`) : null,
      el('div', { class: 'mkt-cifras' },
        [['Contactos', n.contactos], ['Clientes', n.clientes], ['Costo por contacto', n.porContacto != null ? dinero(n.porContacto) : '—'],
          ['Costo por cliente', n.porCliente != null ? dinero(n.porCliente) : '—'], ['Publicaciones', n.publicaciones], ['Alcance', n.alcance ? n.alcance.toLocaleString('es-CL') : '—']]
          .map(([t, v]) => el('div', {}, el('span', { class: 'texto-suave texto-chico' }, t), el('strong', {}, String(v))))),
      c.presupuesto || n.gasto ? el('div', { class: 'texto-chico' },
        `Gasto ${dinero(n.gasto)}${c.presupuesto ? ` de ${dinero(c.presupuesto)}` : ''}`,
        avance != null ? el('div', { class: 'mkt-barra', title: `${avance}%` }, el('span', { style: `width: ${avance}%` })) : null) : null,
      el('div', { class: 'listado-acciones' },
        c.url_destino && c.codigo ? boton('Enlaces con UTM', { icono: 'copiar', onclick: () => enlaces(c) }) : null,
        formWeb?.activo && c.codigo ? boton('Formulario de la campaña', { icono: 'copiar', title: 'Copia el enlace del formulario web que deja los contactos en esta campaña', onclick: async () => {
          const url = enlaceFormulario(formWeb.token, c.codigo);
          try { await navigator.clipboard.writeText(url); avisar('Enlace del formulario copiado (los contactos quedan en esta campaña).'); } catch { avisar(url); }
        } }) : null,
        formWeb?.activo && c.codigo ? boton('QR', { icono: 'descargar', onclick: () => descargarQr(enlaceFormulario(formWeb.token, c.codigo), `formulario-${c.codigo}`).catch((er) => avisar(er.message, 'error')) }) : null,
        n.contactos ? el('a', { class: 'boton boton-secundario', href: ctx.ruta('mkt.embudo', { campana: c.id }) }, 'Ver en el embudo') : null,
        editar ? boton('Editar', { icono: 'editar', onclick: () => formCampana(ctx, c, { alGuardar: () => ctx.refrescar() }) }) : null,
        ctx.puede('mkt', 'eliminar') ? boton('Eliminar', { icono: 'basura', onclick: () => abrirFormulario({
          titulo: 'Eliminar campaña', mensaje: `Se elimina ${c.nombre}. Los contactos y publicaciones quedan, sin campaña a la vista.`, campos: [], textoGuardar: 'Eliminar',
          alGuardar: async () => {
            const { error } = await ctx.api.from('mkt_campanas').update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
            if (error) throw new Error(error.message);
            avisar('Campaña eliminada.'); ctx.refrescar();
          } }) }) : null));
  };

  const excel = () => exportarExcel(ctx, {
    titulo: 'Campañas de marketing', nombre: 'campanas-marketing',
    columnas: ['Campaña', 'Canal', 'Estado', { t: 'Inicio', tipo: 'fecha' }, { t: 'Término', tipo: 'fecha' }, { t: 'Presupuesto', tipo: 'dinero' }, { t: 'Gasto', tipo: 'dinero' },
      { t: 'Contactos', tipo: 'numero' }, { t: 'Clientes', tipo: 'numero' }, { t: 'Costo por contacto', tipo: 'dinero' }, { t: 'Costo por cliente', tipo: 'dinero' }],
    filas: lista.map((c) => { const n = cifras(c); return [c.nombre, nombreCanal[c.canal], nombreEstadoCampana[c.estado], c.inicio ?? '', c.fin ?? '',
      Number(c.presupuesto) || null, n.gasto || null, n.contactos, n.clientes, n.porContacto, n.porCliente]; }),
  });

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Ver' },
    [['vigentes', 'Planificadas y activas'], ['todas', 'Todas']].map(([k, t]) =>
      el('button', { type: 'button', 'aria-pressed': String(estado.ver === k), onclick: () => { estado.ver = k; ctx.refrescar(); } }, t)));
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Campañas'),
      el('div', { class: 'listado-acciones' }, segmento,
        ctx.puede('mkt', 'exportar') && lista.length ? boton('Excel', { icono: 'descargar', onclick: excel }) : null,
        ctx.puede('mkt', 'crear') ? boton('Nueva campaña', { icono: 'mas', tipo: 'primario', onclick: () => formCampana(ctx, null, { alGuardar: () => ctx.refrescar() }) }) : null)),
    el('p', { class: 'texto-suave texto-chico' }, 'Para saber qué campaña trajo a cada cliente, elige la campaña al crear el contacto. El costo por contacto usa el gasto real que anotes en la campaña.'),
    lista.length ? el('div', { class: 'mkt-campanas' }, lista.map(tarjeta))
      : el('p', { class: 'texto-suave' }, estado.ver === 'todas' ? 'Todavía no hay campañas.' : 'No hay campañas planificadas ni activas.'));
}
