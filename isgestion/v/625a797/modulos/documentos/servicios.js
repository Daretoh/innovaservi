// Servicios del generador, para usarlos donde corresponde cada documento (Prevención SST, RRHH) y en Generar documentos:
// plantillas con los datos de la empresa, registros en terreno (charla diaria, checklist) que se guardan en Prevención SST
// y se envían a firmar por WhatsApp, y documentos de la empresa (PTS, IPER, programa…) que se guardan como versión.
// generador(ctx) → { P, faltan, config, todos, elegibles, guardadaDe, formato, evaluaciones, abrirCharla, abrirChecklist, abrirCapacitacion,
//   abrirEPP, abrirIRL, abrirEvaluacion, hayEvaluaciones, abrirCarta, firmarPdf, docEmpresa, lineaVersion, carpetasEmpresa }
import { el } from '../../core/ui/dom.js';
import { avisar } from '../../core/ui/aviso.js';
import { hoyISO } from '../../core/ui/formato.js';
import { cargarPlantillas, trabajador, abrirDocumento, sueldosBase } from './editor.js';
import { leerPaginas, paginaFirmas, htmlFirmado } from './firmarpdf.js';
import { enviarAFirmar } from '../../core/firmas.js';
import { guardarEnSst, guardarRegistro, puedeGuardarSst } from './acciones.js';

// alGuardado(id): al guardar un registro en terreno (p. ej. para abrirlo después)
export async function generador(ctx, { alGuardado = null } = {}) {
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
  // Al guardar un registro con trabajadores, se ofrece enviarlo a firmar por WhatsApp ahí mismo (si no, queda por firmar en SST)
  const firmarAhora = async (id, titulo, personas) => {
    if (!personas?.length || !ctx.puede('sst', 'editar')) return;
    try { await enviarAFirmar(ctx, { origen: 'sst_entrega', id, titulo, personas }); }
    catch (e) { avisar(`Quedó guardado, pero no se pudo preparar el envío: ${e.message}. Envíalo desde Prevención SST → Registros de entrega.`, 'error'); }
  };
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
        const tema = `Charla ${n}: ${c.t}`;
        const id = await guardarRegistro(ctx, { tipo: 'charla', tema, fecha: fechaDe(valorDe(h, 'fecha')), relator: valorDe(h, 'rel'), personas: x.personas, casillas: x.casillas,
          contenido: [...datosFaena(h), hi || hf ? `Horario: ${hi} a ${hf}` : '', obs ? `Observaciones: ${obs}` : ''].filter(Boolean).join('\n') }, blob, x.nombre);
        avisar('Charla guardada en Prevención SST → Registros de entrega.');
        await firmarAhora(id, tema, x.personas);
        alGuardado?.(id);
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
          const tema = ['Checklist diluidores de sal', valorDe(h, 'cli'), valorDe(h, 'lug')].filter(Boolean).join(' · ');
          const id = await guardarRegistro(ctx, { tipo: 'otro', tema, fecha: fechaDe(valorDe(h, 'fecha')), relator: valorDe(h, 'sup'), personas: x.personas, casillas: x.casillas,
            contenido: [...datosFaena(h), `Ítems marcados: ${h.querySelectorAll('.dg-ck.on').length} de ${h.querySelectorAll('.dg-ck').length}`,
              rojos ? `Gases: ${rojos} lectura${rojos === 1 ? '' : 's'} fuera del valor de aceptación del PTS-PREV-08` : '', obs ? `Observaciones: ${obs}` : ''].filter(Boolean).join('\n') }, blob, x.nombre);
          avisar('Checklist guardado en Prevención SST → Registros de entrega.');
          await firmarAhora(id, tema, x.personas);
          alGuardado?.(id);
        } } : null });
  };
  // ---- Formatos firmables (registro de capacitación o entrega de PTS, EPP, IRL, evaluación, carta de compromiso):
  // se completan, se eligen los trabajadores y se guardan como registro de Prevención SST; al guardar se envían a firmar.
  // Si el registro corresponde a un documento de RRHH sin vencimiento (EPP, IRL, entrega de un PTS…), cada firma lo marca
  // en la ficha de quien firma.
  let tiposDoc = null;
  const tipoDocDe = async (slug) => {
    if (!slug || !ctx.puede('rrhh', 'ver')) return null;
    tiposDoc ??= ctx.api.from('rrhh_tipos_doc').select('slug, vence').eq('empresa_id', e).then(({ data }) => new Map((data ?? []).map((t) => [t.slug, t])));
    const t = (await tiposDoc).get(slug);
    return t && !t.vence ? slug : null;
  };
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  // "21 de noviembre de 2026" o "21-11-2026" → ISO; si no se entiende, hoy
  const fechaLibre = (t) => {
    const m = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(t || '');
    const k = m ? MESES.indexOf(m[2].toLowerCase()) : -1;
    return k >= 0 ? `${m[3]}-${String(k + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : fechaDe(t || '');
  };
  const textoCelda = (td) => (td?.textContent ?? '').replace(/^\s*(Tema|Fecha|Horario|Lugar \/ faena|Duración|Relator)\s*/, '').replace(/\s+/g, ' ').trim();
  const firmable = (titulo, { nombreArchivo, variantes, variante, construir, registro, aviso }) => formato(titulo, {
    nombreArchivo, variantes, variante, personas: 'lista', construir,
    guardar: puedeGuardarSst(ctx) ? { texto: 'Guardar y enviar a firmar', alGuardar: async (blob, x) => {
      if (!x.personas?.length) throw new Error('Elige a los trabajadores que firman.');
      const r = registro(x);
      const id = await guardarRegistro(ctx, { ...r, tipo_doc: await tipoDocDe(r.tipo_doc), personas: x.personas, casillas: x.casillas }, blob, x.nombre);
      avisar(aviso ?? `${titulo} guardado en Prevención SST → Registros de entrega.`);
      await firmarAhora(id, r.tema, x.personas);
      alGuardado?.(id);
    } } : null,
  });
  const relatorPrev = () => config.prevencionista || null;
  const abrirCapacitacion = () => firmable('Registro de capacitación', {
    nombreArchivo: 'registro-capacitacion', variantes: P.opcionesRegistro(),
    construir: (v, PER) => P.docAsistencia(v, PER),
    registro: (x) => {
      const h = x.hoja, [tipo, id] = String(x.variante || 'libre').split(':');
      const f1 = h.querySelectorAll('.asis-info tr:nth-child(1) td'), f2 = h.querySelectorAll('.asis-info tr:nth-child(2) td');
      const temario = [...h.querySelectorAll('.asis-tem li')].map((li) => li.textContent.trim()).filter(Boolean);
      const libre = h.querySelector('.dg-box[contenteditable]')?.innerText.trim();
      const horario = textoCelda(f2[1]).replace(/^a hrs\.$/, '');
      return {
        tipo: tipo === 'pts' ? 'pts' : tipo === 'libre' ? 'charla' : 'capacitacion',
        tema: textoCelda(f1[0]) || 'Capacitación', fecha: fechaLibre(textoCelda(f2[0])),
        relator: h.querySelector('[data-ls="dg_rel_nom"]')?.textContent.trim() || relatorPrev(),
        contenido: [horario && /\d/.test(horario) ? `Horario: ${horario}` : '', ...temario, libre].filter(Boolean).join('\n'),
        tipo_doc: tipo === 'pts' || tipo === 'cap' ? id : null,
      };
    },
  });
  const unoPorTrabajador = (titulo, { tipo, tema, tipo_doc, construir, nombreArchivo }) => firmable(titulo, {
    nombreArchivo, construir: (v, PER) => P.porPersona(PER, (t) => construir(t)),
    registro: () => ({ tipo, tema, fecha: hoyISO(), relator: relatorPrev(), tipo_doc }),
  });
  const abrirEPP = () => unoPorTrabajador('Entrega de EPP', { nombreArchivo: 'entrega-epp', tipo: 'epp', tema: 'Entrega de elementos de protección personal', tipo_doc: 'epp', construir: (t) => P.docEPP(t) });
  const abrirIRL = () => unoPorTrabajador('Información de riesgos laborales (IRL)', { nombreArchivo: 'irl', tipo: 'otro', tema: 'Información de riesgos laborales (IRL)', tipo_doc: 'odi', construir: (t) => P.docODI(t) });
  const evaluables = evaluaciones.filter((x) => !x.v.endsWith('|pauta'));
  const abrirEvaluacion = () => firmable('Evaluación de aprendizaje', {
    nombreArchivo: 'evaluacion', variantes: evaluables,
    construir: (v, PER) => P.porPersona(PER, (t) => P.docEvaluacion(v, t)),
    registro: (x) => ({ tipo: 'capacitacion', tema: `Evaluación: ${P.CAP_DOC[x.variante]?.n ?? 'capacitación'}`, fecha: hoyISO(), relator: relatorPrev() }),
  });
  const abrirCarta = () => firmable('Carta de compromiso', {
    nombreArchivo: 'carta-compromiso', construir: (v, PER) => P.docCarta('compromiso', PER),
    registro: () => ({ tipo: 'otro', tema: 'Carta de compromiso', fecha: hoyISO(), relator: relatorPrev() }),
  });

  // Firmar un PDF: se elige el archivo y se abre con las firmas guardadas encima de la página elegida
  const firmarPdf = () => {
    const inp = el('input', { type: 'file', accept: 'application/pdf,.pdf' });
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0]; if (!f) return;
      avisar('Leyendo el PDF…');
      try {
        const pags = await leerPaginas(f);
        formato('Firmar un PDF', { nombreArchivo: `${f.name.replace(/\.pdf$/i, '')}-firmado`,
          variantes: pags.map((p, k) => ({ v: String(k + 1), n: `Firmas en la página ${k + 1} de ${pags.length}` })), variante: paginaFirmas(pags),
          construir: (v) => htmlFirmado(pags, v, P.firmaPrevHtml, P.firmaRepHtml) });
        avisar('Arrastra las firmas a su lugar. Si van en otra hoja, elige la página arriba.');
      } catch (e) { avisar(e.message || 'No se pudo leer el PDF.', 'error'); }
    });
    inp.click();
  };

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
  // Documentos de la empresa por carpeta: [{ titulo, docs: [{ slug, nombre }] }]
  const carpetasEmpresa = () => P.EMP_CARPETAS.filter((c) => c.k !== 'legal').map((c) => ({ titulo: c.n,
    docs: c.tipos.filter(([slug]) => P.EMP_GEN[slug] || P.PTS_DOC[slug] || slug === 'pts_funciones').map(([slug, nombre]) => ({ slug, nombre })) }));
  return { P, faltan, config, todos, elegibles, actualDe: (id) => todos.find((x) => x.v.persona_id === id) ?? null, guardadaDe, formato, evaluaciones, abrirCharla, abrirChecklist,
    abrirCapacitacion, abrirEPP, abrirIRL, abrirEvaluacion, hayEvaluaciones: evaluables.length > 0, abrirCarta, firmarPdf, docEmpresa, lineaVersion, carpetasEmpresa };
}
