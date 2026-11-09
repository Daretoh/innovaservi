// Generador de documentos (como en InnovaGestión): documentos del trabajador (contrato, perfil de cargo, ficha de
// datos, entrega de EPP, IRL y registros de entrega de PTS), formatos para firmar (registro de capacitación,
// evaluación de aprendizaje, entrega de EPP e IRL en blanco) y documentos de la empresa (PTS, matriz e instructivo
// IPER, programa preventivo, Ley Karin, emergencias y accidentes, matriz de EPP y capacitaciones).
import { el } from '../../../core/ui/dom.js?v=1f30021k';
import { icono } from '../../../core/ui/iconos.js?v=1f30021k';
import { boton } from '../../../core/ui/tabla.js?v=1f30021k';
import { avisar } from '../../../core/ui/aviso.js?v=1f30021k';
import { hoyISO } from '../../../core/ui/formato.js?v=1f30021k';
import { cargarPlantillas, trabajador, abrirDocumento, sueldosBase } from '../editor.js?v=1f30021k';
import { guardarEnRrhh, guardarEnSst, guardarRegistro, puedeGuardarRrhh, puedeGuardarSst } from '../acciones.js?v=1f30021k';

const estado = { persona: '' };
const DEL_TRABAJADOR = ['contrato', 'perfil', 'datos', 'epp', 'odi'];

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const [{ P, faltan, config }, vinc, sueldos, guardados] = await Promise.all([
    cargarPlantillas(ctx),
    ctx.api.from('persona_empresa').select('id, persona_id, cargo, fecha_ingreso, estado, personas(nombres, apellido_paterno, apellido_materno, rut, direccion, numero, poblacion, comuna, nacionalidad, estado_civil, fecha_nacimiento, email, telefono, afp, salud)')
      .eq('empresa_id', e).is('deleted_at', null),
    sueldosBase(ctx),
    // Versión guardada de cada documento de la empresa (Prevención SST), para avisar "Por actualizar"
    ctx.puede('sst', 'ver') ? ctx.api.from('sst_documentos').select('codigo, sst_documento_versiones(version, fecha)').eq('empresa_id', e) : Promise.resolve({ data: [] }),
  ]);
  const guardadaDe = new Map((guardados.data ?? []).map((d) => [d.codigo, [...(d.sst_documento_versiones ?? [])].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]]));
  if (vinc.error) throw vinc.error;
  const todos = vinc.data.map((v) => ({ v, t: trabajador(v, { sueldo_base: sueldos.get(v.id) ?? null }) })).sort((a, b) => a.t.nombre.localeCompare(b.t.nombre));
  const activos = todos.filter((x) => x.v.estado === 'activo');
  const elegibles = activos.map((x) => x.t);
  const actual = todos.find((x) => x.v.persona_id === estado.persona) ?? null;

  // ---- Documentos del trabajador
  const selector = el('select', { class: 'campo', 'aria-label': 'Trabajador', onchange: (ev) => { estado.persona = ev.currentTarget.value; ctx.refrescar(); } },
    el('option', { value: '' }, 'Elige el trabajador…'),
    todos.map((x) => el('option', { value: x.v.persona_id, selected: x.v.persona_id === estado.persona }, `${x.t.nombre}${x.v.estado === 'activo' ? '' : ' (inactivo)'}`)));
  const docTrabajador = (slug) => {
    const g = P.DOC_GEN[slug];
    abrirDocumento({
      titulo: `${g.nombre} · ${actual.t.nombre}`, nombreArchivo: `${slug}-${actual.t.nombre}`, autor: ctx.empresa.razon_social,
      variantes: g.variantes ? P.DG_VARS : null, variante: g.variantes ? P.varDefault(actual.t) : null,
      construir: (v) => g.build(actual.t, v),
      guardar: puedeGuardarRrhh(ctx) ? { texto: 'Guardar en la ficha', alGuardar: async (blob, x) => {
        await guardarEnRrhh(ctx, slug, actual.v.persona_id, blob, x.nombre, g.nombre);
        avisar('Documento generado y guardado en la ficha del trabajador.');
      } } : null,
    });
  };
  const tarjetaDoc = (titulo, sub, alAbrir, extra = null) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' }, el('strong', {}, titulo), sub ? el('span', { class: 'texto-suave texto-chico' }, sub) : null),
    el('div', { class: 'doc-acciones' }, extra, boton('Abrir', { icono: 'documento', onclick: alAbrir })));

  const seccionTrabajador = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Del trabajador'),
    el('p', { class: 'texto-suave texto-chico' }, `Se completan con su ficha. ${puedeGuardarRrhh(ctx) ? 'Al guardar quedan en su documentación de RRHH.' : 'Tu rol no guarda en RRHH: se descargan.'}`),
    el('label', { class: 'form-fila' }, 'Trabajador', selector),
    actual ? [
      ...DEL_TRABAJADOR.map((slug) => tarjetaDoc(P.DOC_GEN[slug].nombre, P.DOC_GEN[slug].variantes ? 'Formato según el cargo (operario, prevención o prevención y administración)' : null, () => docTrabajador(slug))),
      el('h3', { class: 'doc-sub' }, 'Registros de entrega de PTS'),
      ...Object.keys(P.DOC_GEN).filter((s) => s.startsWith('pts_')).map((slug) => tarjetaDoc(P.DOC_GEN[slug].nombre, null, () => docTrabajador(slug))),
    ] : el('p', { class: 'texto-suave' }, 'Elige un trabajador para ver sus documentos.'));

  // ---- Formatos para firmar (en blanco o con los trabajadores elegidos)
  const formato = (titulo, op) => abrirDocumento({ titulo, autor: ctx.empresa.razon_social, elegibles, ...op });
  const evaluaciones = Object.keys(P.CAP_DOC).filter((k) => P.CAP_DOC[k].vf).flatMap((k) => [{ v: k, n: P.CAP_DOC[k].n }, { v: `${k}|pauta`, n: `${P.CAP_DOC[k].n} · pauta de corrección (relator)` }]);

  // ---- Registros en terreno (charla diaria y checklist): con datos ya cargados, se guardan en Prevención SST
  let listas = null;
  const listasRegistro = async () => {
    if (listas) return listas;
    // Clientes y sitios de Faenas, si la empresa los tiene y el rol los puede ver
    const [ter, sit] = await Promise.all([
      ctx.puede('terceros', 'ver') ? ctx.api.from('terceros').select('id, razon_social, nombre_fantasia').eq('empresa_id', e).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social') : Promise.resolve({ data: [] }),
      ctx.puede('ope', 'ver') ? ctx.api.from('ope_sitios').select('tercero_id, nombre, activo').eq('empresa_id', e).order('nombre') : Promise.resolve({ data: [] }),
    ]);
    const clientes = (ter.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre_fantasia || t.razon_social })).filter((t) => t.nombre);
    const sitios = sit.data ?? [];
    const esSup = (t) => (/superv|capataz/i.test(t.cargo || '') ? 0 : 1);
    const orden = [...elegibles].sort((a, b) => esSup(a) - esSup(b) || a.nombre.localeCompare(b.nombre));
    const prev = config.prevencionista || '';
    listas = {
      L: { clientes: clientes.map((c) => c.nombre), supervisores: orden.map((t) => t.nombre), relatores: [prev, ...orden.map((t) => t.nombre).filter((n) => n !== prev)].filter(Boolean) },
      campos: {
        prevNombre: prev, gases: P.CHK_GAS,
        sitiosDe: (nom) => { const c = clientes.find((x) => x.nombre === nom); return c ? sitios.filter((s) => s.tercero_id === c.id && s.activo !== false).map((s) => s.nombre) : []; },
        cargoDe: (nom) => (nom === prev ? config.prev_cargo || 'Técnico en Prevención de Riesgos' : elegibles.find((t) => t.nombre === nom)?.cargo || ''),
      },
    };
    return listas;
  };
  const valorDe = (hoja, k) => hoja.querySelector(`[data-k="${k}"]`)?.textContent.trim() ?? '';
  // "06-11-2026" → fecha ISO; si no se entiende, hoy
  const fechaDe = (t) => { const m = /(\d{2})-(\d{2})-(\d{4})/.exec(t); return m ? `${m[3]}-${m[2]}-${m[1]}` : hoyISO(); };
  const datosFaena = (h) => [['Cliente', valorDe(h, 'cli')], ['Lugar', valorDe(h, 'lug')]].filter((x) => x[1]).map((x) => `${x[0]}: ${x[1]}`);
  const abrirCharla = async () => {
    const { L, campos } = await listasRegistro();
    // Propone la charla que sigue a la última registrada (después de la 30 vuelve a la 1)
    let ultima = 0;
    if (ctx.puede('sst', 'ver')) {
      const { data } = await ctx.api.from('sst_entregas').select('tema').eq('empresa_id', e).eq('tipo', 'charla').is('deleted_at', null).like('tema', 'Charla %').order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(1);
      ultima = Number(/^Charla (\d+)/.exec(data?.[0]?.tema ?? '')?.[1]) || 0;
    }
    formato('Charla diaria de autocuidado', { nombreArchivo: 'charla-diaria', variantes: P.opcionesCharla(), variante: `c${(ultima % P.CHARLAS.length) + 1}`, personas: 'lista', campos,
      construir: (v, PER) => P.docCharla(v, PER, L),
      guardar: puedeGuardarSst(ctx) ? { texto: 'Guardar en Prevención SST', alGuardar: async (blob, x) => {
        const n = Number(x.variante.slice(1)), c = P.CHARLAS[n - 1], h = x.hoja, hi = valorDe(h, 'hi'), hf = valorDe(h, 'hf'), obs = valorDe(h, 'obs');
        await guardarRegistro(ctx, { tipo: 'charla', tema: `Charla ${n}: ${c.t}`, fecha: fechaDe(valorDe(h, 'fecha')), relator: valorDe(h, 'rel'), personas: x.personas,
          contenido: [...datosFaena(h), hi || hf ? `Horario: ${hi} a ${hf}` : '', obs ? `Observaciones: ${obs}` : ''].filter(Boolean).join('\n') }, blob, x.nombre);
        avisar('Charla guardada en Prevención SST → Registros de entrega, por firmar.');
      } } : null });
  };
  const abrirChecklist = async () => {
    const { L, campos } = await listasRegistro();
    formato('Checklist de diluidores de sal', { nombreArchivo: 'checklist-diluidores', personas: 'lista', campos,
      construir: (v, PER) => P.docChecklistDil(PER, L),
      guardar: puedeGuardarSst(ctx) ? { texto: 'Guardar en Prevención SST',
        // Los "si aplica" pueden quedar sin marcar
        validar: (h) => { const n = h.querySelectorAll('.dg-ck:not(.on):not([data-opc])').length; return !n || confirm(`Hay ${n} ítem${n === 1 ? '' : 's'} del checklist sin marcar. ¿Guardar igual?`); },
        alGuardar: async (blob, x) => {
          const h = x.hoja, obs = valorDe(h, 'obs'), rojos = h.querySelectorAll('td.gas-ro').length;
          await guardarRegistro(ctx, { tipo: 'otro', tema: ['Checklist diluidores de sal', valorDe(h, 'cli'), valorDe(h, 'lug')].filter(Boolean).join(' · '), fecha: fechaDe(valorDe(h, 'fecha')), relator: valorDe(h, 'sup'), personas: x.personas,
            contenido: [...datosFaena(h), `Ítems marcados: ${h.querySelectorAll('.dg-ck.on').length} de ${h.querySelectorAll('.dg-ck').length}`,
              rojos ? `Gases: ${rojos} lectura${rojos === 1 ? '' : 's'} fuera del valor de aceptación del PTS-PREV-08` : '', obs ? `Observaciones: ${obs}` : ''].filter(Boolean).join('\n') }, blob, x.nombre);
          avisar('Checklist guardado en Prevención SST → Registros de entrega, por firmar.');
        } } : null });
  };
  const seccionFormatos = el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, 'Formatos para firmar'),
    el('p', { class: 'texto-suave texto-chico' }, 'Con membrete, en blanco o con los trabajadores que elijas (nombre, RUT y cargo).'),
    tarjetaDoc('Registro de capacitación (lista de asistencia)', 'Capacitaciones, entrega de PTS o charla libre: el tema y el temario se completan solos', () => formato('Registro de capacitación', {
      variantes: P.opcionesRegistro(), personas: 'lista', construir: (v, PER) => P.docAsistencia(v, PER) })),
    evaluaciones.length ? tarjetaDoc('Evaluación de aprendizaje (individual)', 'Una por trabajador, o la pauta de corrección del relator', () => formato('Evaluación de aprendizaje', {
      variantes: evaluaciones, personas: 'lista', construir: (v, PER) => (/\|pauta$/.test(v || '') ? P.docEvaluacion(v) : P.porPersona(PER, (t) => P.docEvaluacion(v, t))) })) : null,
    tarjetaDoc('Entrega de elementos de protección personal', null, () => formato('Entrega de EPP', { personas: 'lista', construir: (v, PER) => P.porPersona(PER, (t) => P.docEPP(t)) })),
    tarjetaDoc('Información de riesgos laborales (IRL)', null, () => formato('IRL', { personas: 'lista', construir: (v, PER) => P.porPersona(PER, (t) => P.docODI(t)) })),
    tarjetaDoc('Charla diaria de autocuidado (con lista de asistencia)', 'Elige una de las 30 charlas; propone la que sigue a la última registrada', abrirCharla),
    tarjetaDoc('Charlas diarias: las 30 charlas juntas', 'Guía completa para quien las dicta', () => formato('Charlas diarias', { nombreArchivo: 'charlas-diarias', construir: () => P.docCharlasTodas() })),
    tarjetaDoc('Checklist de seguridad y ejecución · diluidores de sal', 'Ítems marcables, medición de gases y firmas', abrirChecklist),
    tarjetaDoc('Carta (formato editable)', 'En blanco o carta de compromiso (sin examen de altura / espacios confinados), con la lista de trabajadores y la firma del representante legal',
      () => formato('Carta', { variantes: P.opcionesCarta(), personas: 'lista', construir: (v, PER) => P.docCarta(v, PER) })));

  // ---- Documentos de la empresa
  const docEmpresa = (slug, nombre) => {
    const pts = P.PTS_DOC[slug] ? P.ptsDatos(slug) : null;
    const cam = pts ? P.ptsCambios(pts) : null;
    const codigo = pts?.cod ?? P.CAP_DOC[slug]?.cod ?? null;
    abrirDocumento({
      titulo: nombre, nombreArchivo: nombre, autor: ctx.empresa.razon_social,
      variantes: slug === 'pts_funciones' ? P.DG_VARS : null,
      construir: (v) => (P.EMP_GEN[slug] ? P.EMP_GEN[slug].build(v) : slug === 'pts_funciones' ? P.docPTSFunciones(v) : P.docPTSDoc(slug)),
      guardar: puedeGuardarSst(ctx) ? { texto: 'Guardar en Prevención SST', alGuardar: async (blob, x) => {
        const ver = await guardarEnSst(ctx, { slug: slug === 'pts_funciones' && x.variante ? `${slug}_${x.variante}` : slug, codigo: slug === 'pts_funciones' && x.variante ? `${codigo ?? 'PTS-FUNCIONES'}-${x.variante.toUpperCase()}` : codigo,
          titulo: nombre, version: cam ? cam[cam.length - 1][0] : null, cambios: cam ? cam[cam.length - 1][2] : null }, blob, x.nombre);
        avisar(`Guardado en Prevención SST como versión ${ver}.`);
      } } : null,
    });
  };
  const verDeHtml = (html) => {
    const m = /Versión <b>(\d+)<\/b>/.exec(html || ''); if (!m) return null;
    const o = { ver: m[1], fecha: '', desc: '' };
    const i = String(html).search(/Control de cambios/i);
    if (i >= 0) { const filas = [...String(html).slice(i).matchAll(/<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)]; const u = filas.at(-1); if (u) { o.fecha = u[2]; o.desc = u[3].replace(/<[^>]+>/g, '').trim(); } }
    return o;
  };
  const vigente = (slug) => {
    try {
      if (P.PTS_DOC[slug]) { const c = P.ptsCambios(P.ptsDatos(slug)).at(-1); return { ver: c[0], fecha: c[1], desc: String(c[2]).replace(/<[^>]+>/g, '') }; }
      if (P.EMP_GEN[slug]) return verDeHtml(P.EMP_GEN[slug].build());
      if (slug === 'pts_funciones') return verDeHtml(P.docPTSFunciones('oper'));
    } catch { /* sin versión */ }
    return null;
  };
  const codigoDe = (slug) => (P.PTS_DOC[slug] ? P.ptsDatos(slug).cod : null) ?? P.CAP_DOC[slug]?.cod ?? slug.toUpperCase().replace(/_/g, '-');
  const lineaVersion = (slug) => {
    const V = vigente(slug); if (!V) return null;
    const g = guardadaDe.get(codigoDe(slug));
    const atras = g && (Number(g.version) || 0) < (Number(V.ver) || 0);
    return el('span', { class: 'texto-chico doc-ver', title: V.desc },
      el('strong', {}, `Versión ${V.ver}${V.fecha ? ` · ${V.fecha}` : ''}`), V.desc ? ` — ${V.desc.slice(0, 140)}${V.desc.length > 140 ? '…' : ''}` : '',
      g ? el('span', { class: 'texto-suave' }, ` · guardada v${g.version}`) : null,
      atras ? el('span', { class: 'chip chip-prox', title: `Lo guardado en Prevención SST es anterior a la versión ${V.ver}. Ábrelo y guárdalo.`, style: 'margin-left:6px' }, 'Por actualizar') : null);
  };

  const carpetas = P.EMP_CARPETAS.filter((c) => c.k !== 'legal').map((c) => el('div', { class: 'ficha doc-grupo' },
    el('h2', {}, c.n),
    c.tipos.filter(([slug]) => P.EMP_GEN[slug] || P.PTS_DOC[slug] || slug === 'pts_funciones').map(([slug, nombre]) => {
      const editable = P.PTS_DOC[slug] && ctx.puede('documentos', 'editar');
      return tarjetaDoc(nombre, lineaVersion(slug), () => docEmpresa(slug, nombre),
        editable ? boton('Editar', { icono: 'editar', onclick: () => { location.hash = ctx.ruta('documentos.pts', { s: slug }); } }) : null);
    })));

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Generar documentos'), el('p', { class: 'texto-suave' }, 'Con el membrete y los datos de la empresa; se revisan y completan antes de descargar o guardar.')),
      ctx.puede('documentos', 'editar') ? el('div', { class: 'listado-acciones' }, boton('Datos de la empresa y firmas', { icono: 'ajustes', onclick: () => { location.hash = ctx.ruta('documentos.config'); } })) : null),
    faltan.length ? el('a', { class: 'aviso-bandeja', href: ctx.ruta('documentos.config') }, icono('alerta', { tam: 16 }), `Faltan datos para los documentos: ${faltan.join(', ')}.`, icono('derecha', { tam: 16 })) : null,
    seccionTrabajador, seccionFormatos,
    el('h2', { class: 'doc-sub' }, 'De la empresa'),
    el('p', { class: 'texto-suave texto-chico' }, puedeGuardarSst(ctx) ? 'Al guardar quedan como nueva versión en Prevención SST → Documentos preventivos.' : 'Se descargan (guardar en Prevención SST requiere ese módulo).'),
    carpetas);
}
