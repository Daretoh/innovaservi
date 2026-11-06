// Calendario de contenido: publicaciones del mes por día, con su estado (idea → en diseño → por aprobar → aprobada →
// programada → publicada). Quien tiene el permiso aprobar ve arriba las piezas por aprobar y las aprueba con un clic.
// La programación en las redes se hace en Metricool o Meta Business Suite; aquí queda el plan y los resultados.
import { el } from '../../../core/ui/dom.js?v=7100fbc';
import { icono } from '../../../core/ui/iconos.js?v=7100fbc';
import { boton } from '../../../core/ui/tabla.js?v=7100fbc';
import { avisar } from '../../../core/ui/aviso.js?v=7100fbc';
import { hoyISO, rangoMes, moverMes, nombreMes, lunesDe, sumarDias, fechaCorta, hhmm } from '../../../core/ui/formato.js?v=7100fbc';
import { cargarBase, cargarCss, nombreRed, nombreFormato, nombreEstadoPub, ESTADOS_PUB } from '../datos.js?v=7100fbc';
import { formPublicacion } from '../formularios.js?v=7100fbc';

const estado = { mes: hoyISO().slice(0, 7), red: '' };
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export default async function vista(ctx) {
  cargarCss();
  const base = await cargarBase(ctx);
  const { desde, hasta } = rangoMes(estado.mes);
  const inicio = lunesDe(desde);
  const fin = sumarDias(lunesDe(hasta), 6);
  const [{ data, error }, rpa] = await Promise.all([
    ctx.api.from('mkt_publicaciones').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).gte('fecha', inicio).lte('fecha', fin).order('fecha').order('hora', { nullsFirst: true }),
    ctx.puede('mkt', 'aprobar') ? ctx.api.from('mkt_publicaciones').select('*').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('estado', 'por_aprobar').order('fecha') : Promise.resolve({ data: [] })]);
  if (error) throw error;
  const pubs = data.filter((p) => !estado.red || p.redes.includes(estado.red));
  const crear = ctx.puede('mkt', 'crear');
  const editar = ctx.puede('mkt', 'editar');
  const hoy = hoyISO();
  const abrir = (p) => (editar ? formPublicacion(ctx, base, p, { alGuardar: () => ctx.refrescar() }) : null);
  const nueva = (fecha) => formPublicacion(ctx, base, null, { fecha, alGuardar: () => ctx.refrescar() });

  const aprobar = async (p) => {
    const { error: e2 } = await ctx.api.from('mkt_publicaciones').update({ estado: 'aprobada' }).eq('id', p.id);
    if (e2) { avisar(e2.message, 'error'); return; }
    avisar(`"${p.titulo}" aprobada.`);
    ctx.refrescar();
  };

  const item = (p) => el('button', { type: 'button', class: `mkt-pub mkt-pub-${p.estado}`, title: `${nombreEstadoPub[p.estado]} · ${p.redes.map((r) => nombreRed[r]).join(', ')}`, onclick: (ev) => { ev.stopPropagation(); abrir(p); } },
    el('span', { class: 'mkt-pub-punto' }), el('span', { class: 'mkt-pub-texto' }, p.hora ? `${hhmm(p.hora)} ` : '', p.titulo));

  const dias = [];
  for (let d = inicio; d <= fin; d = sumarDias(d, 1)) dias.push(d);
  const rejilla = el('div', { class: 'mkt-mes' },
    DIAS.map((t) => el('div', { class: 'mkt-mes-dia-nombre texto-suave texto-chico' }, t)),
    dias.map((d) => {
      const del = pubs.filter((p) => p.fecha === d);
      return el('div', { class: `mkt-mes-dia${d.slice(0, 7) !== estado.mes ? ' fuera' : ''}${d === hoy ? ' hoy' : ''}`, onclick: crear ? () => nueva(d) : null, title: crear ? 'Agregar publicación' : null },
        el('span', { class: 'mkt-mes-num texto-chico' }, String(Number(d.slice(8)))), del.map(item));
    }));

  const delMes = pubs.filter((p) => p.fecha.slice(0, 7) === estado.mes);
  const conteo = ESTADOS_PUB.map(([k, t]) => [t, delMes.filter((p) => p.estado === k).length]).filter(([, n]) => n);
  const red = el('select', { class: 'campo mkt-red', 'aria-label': 'Red' }, el('option', { value: '' }, 'Todas las redes'),
    Object.entries(nombreRed).map(([k, t]) => el('option', { value: k, selected: k === estado.red }, t)));
  red.addEventListener('change', () => { estado.red = red.value; ctx.refrescar(); });

  const porAprobar = rpa.data ?? [];
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Calendario de contenido'),
      el('div', { class: 'listado-acciones' },
        boton('', { icono: 'volver', 'aria-label': 'Mes anterior', title: 'Mes anterior', onclick: () => { estado.mes = moverMes(estado.mes, -1); ctx.refrescar(); } }),
        el('strong', { class: 'mkt-mes-titulo' }, nombreMes(estado.mes)),
        boton('', { icono: 'derecha', 'aria-label': 'Mes siguiente', title: 'Mes siguiente', onclick: () => { estado.mes = moverMes(estado.mes, 1); ctx.refrescar(); } }),
        estado.mes !== hoy.slice(0, 7) ? boton('Hoy', { onclick: () => { estado.mes = hoy.slice(0, 7); ctx.refrescar(); } }) : null,
        red,
        crear ? boton('Nueva publicación', { icono: 'mas', tipo: 'primario', onclick: () => nueva(estado.mes === hoy.slice(0, 7) ? hoy : `${estado.mes}-01`) }) : null)),
    porAprobar.length ? el('div', { class: 'ficha mkt-aprobar' },
      el('h2', {}, `Por aprobar (${porAprobar.length})`),
      porAprobar.map((p) => el('div', { class: 'mkt-aprobar-fila' },
        el('span', {}, el('strong', {}, p.titulo), el('span', { class: 'texto-suave texto-chico' }, ` · ${fechaCorta(p.fecha)} · ${nombreFormato[p.formato]} · ${p.redes.map((r) => nombreRed[r]).join(', ')}`)),
        el('span', { class: 'listado-acciones' },
          p.pieza_url ? el('a', { class: 'boton boton-secundario', href: p.pieza_url, target: '_blank', rel: 'noopener' }, icono('ojo', { tam: 16 }), 'Ver pieza') : null,
          editar ? boton('Revisar', { onclick: () => abrir(p) }) : null,
          boton('Aprobar', { icono: 'check', tipo: 'primario', onclick: () => aprobar(p) }))))) : null,
    el('p', { class: 'texto-suave texto-chico' }, delMes.length ? `${delMes.length} publicaci${delMes.length === 1 ? 'ón' : 'ones'} en el mes: ${conteo.map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')}` : 'Sin publicaciones este mes.',
      crear ? ' · toca un día para agregar' : null),
    el('div', { class: 'mkt-leyenda texto-chico' }, ESTADOS_PUB.map(([k, t]) => el('span', { class: `mkt-pub-${k}` }, el('span', { class: 'mkt-pub-punto' }), t))),
    rejilla,
    el('p', { class: 'texto-suave texto-chico' }, icono('alerta', { tam: 13 }), ' La publicación en las redes se programa en Metricool o Meta Business Suite (gratis). Aquí queda el plan, la aprobación y los resultados.'));
}
