// Documentos por cargo (SST 010): qué documentos recibe cada cargo, en general o para la acreditación de un mandante y
// lugar (ej.: SAL LOBOS → Camanchaca, Ensenada). Un cuadro: documentos en filas, cargos en columnas; marcar o desmarcar
// guarda al tiro. La entrega individual los propone solos según el cargo de cada trabajador.
// Ruta: #/sst.cargos[?a=<tercero>|<sitio>]
import { el } from '../../../core/ui/dom.js?v=db2b2b7';
import { icono } from '../../../core/ui/iconos.js?v=db2b2b7';
import { avisar } from '../../../core/ui/aviso.js?v=db2b2b7';
import { cargarDestinos, leerDestino } from '../acreditacion.js?v=db2b2b7';

export const claveCargo = (t) => String(t ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const estado = { a: null };

// Documentos que se pueden asignar: los preventivos (PDF), las plantillas del generador y la IRL propia de cada persona
export async function documentosAsignables(ctx) {
  const { data } = await ctx.api.from('sst_documentos').select('id, codigo, titulo, activo').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).eq('activo', true).order('codigo');
  const lista = (data ?? []).map((d) => ({ id: d.id, texto: [d.codigo, d.titulo].filter(Boolean).join(' · '), grupo: 'Documentos preventivos' }));
  if (ctx.puede('documentos', 'ver')) {
    try {
      const { cargarPlantillas } = await import('../../documentos/editor.js?v=db2b2b7');
      const { P } = await cargarPlantillas(ctx);
      if (P.EMP_GEN?.iper) lista.push({ id: 'tpl:iper', texto: 'Matriz IPER · plantilla general', grupo: 'Plantillas' });
      for (const slug of Object.keys(P.PTS_DOC ?? {})) {
        let dd = null; try { dd = P.ptsDatos(slug); } catch { /* sin datos */ }
        lista.push({ id: `tpl:${slug}`, texto: [dd?.cod, dd?.titulo || slug].filter(Boolean).join(' · '), grupo: 'Plantillas' });
      }
      lista.push({ id: 'tpl:pts_funciones', texto: 'PTS-FUN · PTS acorde a sus funciones (sale según el cargo)', grupo: 'Plantillas' });
    } catch { /* sin plantillas */ }
  }
  lista.push({ id: 'irl_persona', texto: 'IRL propia de cada persona (se sube al entregar, en el formato que usan)', grupo: 'De cada persona' });
  return lista;
}

// Filas de la matriz para un alcance; si el mandante o lugar no tiene nada, se usa el general
export async function matrizCargos(ctx, { tercero = null, sitio = null } = {}) {
  const { data, error } = await ctx.api.from('sst_docs_cargo').select('id, tercero_id, sitio_id, cargo, documento, orden').eq('empresa_id', ctx.empresa.id).order('orden');
  if (error) throw error;
  const de = (t, s) => data.filter((r) => (r.tercero_id ?? null) === t && (r.sitio_id ?? null) === s);
  const filas = [de(tercero, sitio), tercero && sitio ? de(tercero, null) : [], de(null, null)].find((x) => x.length) ?? [];
  return { filas, docsDe: (cargo) => filas.filter((r) => claveCargo(r.cargo) === claveCargo(cargo)).sort((a, b) => a.orden - b.orden).map((r) => r.documento) };
}

export default async function vista(ctx) {
  const [dest, docs, todas, vinc] = await Promise.all([
    cargarDestinos(ctx).catch(() => null),
    documentosAsignables(ctx),
    ctx.api.from('sst_docs_cargo').select('id, tercero_id, sitio_id, cargo, documento, orden').eq('empresa_id', ctx.empresa.id),
    ctx.api.from('persona_empresa').select('cargo').eq('empresa_id', ctx.empresa.id).eq('estado', 'activo').is('deleted_at', null),
  ]);
  if (todas.error) throw todas.error;
  // Se abre donde hay documentos definidos (si el general está vacío, el primer mandante y lugar con datos)
  const conDatos = [...new Set(todas.data.map((r) => (r.tercero_id ? `${r.tercero_id}|${r.sitio_id ?? ''}` : '')))];
  const a = estado.a ?? ctx.params.a ?? (conDatos.includes('') ? '' : conDatos[0] ?? '');
  const { acr_tercero_id: tercero, acr_sitio_id: sitio } = leerDestino(a);
  const filas = todas.data.filter((r) => (r.tercero_id ?? null) === (tercero ?? null) && (r.sitio_id ?? null) === (sitio ?? null));
  // Cargos: los de los trabajadores activos y los que ya tienen documentos (sin repetir por tildes o mayúsculas)
  const cargos = new Map();
  for (const c of [...(vinc.data ?? []).map((v) => v.cargo), ...todas.data.map((r) => r.cargo)]) if (c && !cargos.has(claveCargo(c))) cargos.set(claveCargo(c), c.trim());
  const lista = [...cargos.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  const puede = { agregar: ctx.puede('sst', 'crear'), quitar: ctx.puede('sst', 'editar') };

  const alternar = async (caja, doc, clave, nombre) => {
    const fila = filas.find((r) => r.documento === doc.id && claveCargo(r.cargo) === clave);
    caja.disabled = true;
    if (fila) {
      const { error } = await ctx.api.from('sst_docs_cargo').delete().eq('id', fila.id);
      if (error) { caja.checked = true; avisar(error.message, 'error'); } else filas.splice(filas.indexOf(fila), 1);
    } else {
      const { data, error } = await ctx.api.from('sst_docs_cargo').insert({ empresa_id: ctx.empresa.id, tercero_id: tercero, sitio_id: sitio, cargo: nombre, documento: doc.id, orden: docs.indexOf(doc) + 1 }).select('*').single();
      if (error) { caja.checked = false; avisar(error.message, 'error'); } else filas.push(data);
    }
    caja.disabled = !(caja.checked ? puede.quitar : puede.agregar);
    contar();
  };
  const totales = lista.map(() => el('span', { class: 'texto-chico texto-suave' }));
  const contar = () => lista.forEach(([k], i) => { const n = filas.filter((r) => claveCargo(r.cargo) === k).length; totales[i].textContent = n ? `${n} doc.` : 'sin definir'; });

  const selector = el('select', { class: 'campo', 'aria-label': 'Para qué acreditación' },
    el('option', { value: '' }, `General (todos los mandantes)${conDatos.includes('') ? ' · con documentos' : ''}`),
    (dest?.opciones ?? []).map(([v, t]) => el('option', { value: v, selected: v === a }, `${t}${conDatos.includes(v) ? ' · con documentos' : ''}`)));
  selector.addEventListener('change', () => { estado.a = selector.value; ctx.refrescar(); });

  const grupos = [...new Set(docs.map((d) => d.grupo))];
  const tabla = el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla dc-tabla' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Documento'), lista.map(([, nombre], i) => el('th', { class: 'dc-cargo' }, el('div', {}, nombre), totales[i])))),
    el('tbody', {}, grupos.flatMap((g) => [
      el('tr', { class: 'dc-grupo' }, el('td', { colspan: String(lista.length + 1) }, g)),
      ...docs.filter((d) => d.grupo === g).map((d) => el('tr', {}, el('td', { class: 'dc-doc' }, d.texto),
        lista.map(([k, nombre]) => {
          const marcado = filas.some((r) => r.documento === d.id && claveCargo(r.cargo) === k);
          const caja = el('input', { type: 'checkbox', checked: marcado, disabled: !(marcado ? puede.quitar : puede.agregar), 'aria-label': `${d.texto} para ${nombre}` });
          caja.addEventListener('change', () => alternar(caja, d, k, nombre));
          return el('td', { class: 'dc-celda' }, caja);
        }))),
    ]))));
  contar();
  const usaGeneral = (tercero || sitio) && !filas.length && todas.data.some((r) => !r.tercero_id);
  return el('section', { class: 'listado' },
    el('a', { class: 'volver', href: ctx.ruta('sst.documentos') }, icono('volver', { tam: 16 }), 'Documentos preventivos'),
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Documentos por cargo'),
        el('p', { class: 'texto-suave' }, 'Qué documentos recibe cada cargo. La entrega individual los propone solos según el cargo de cada trabajador (el cargo sale de su ficha en RRHH).')),
      el('div', { class: 'listado-acciones' }, el('label', { class: 'texto-chico' }, 'Para '), selector)),
    conDatos.length ? el('p', { class: 'texto-suave texto-chico' }, `Definidos para: ${conDatos.map((k) => (k ? dest?.texto(...k.split('|')) ?? 'un mandante' : 'General')).join(' · ')}.`) : null,
    usaGeneral ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Este mandante o lugar no tiene documentos por cargo propios: mientras tanto se usan los generales.') : null,
    lista.length ? tabla : el('p', { class: 'texto-suave' }, 'No hay cargos en las fichas de los trabajadores.'),
    el('p', { class: 'texto-suave texto-chico' }, 'Marcar o desmarcar guarda al tiro. Para una IRL o un PTS por cargo con el formato que usan, súbelo en Documentos preventivos (ej.: "IRL Supervisor") y márcalo aquí para ese cargo; "IRL propia de cada persona" pide subir la de cada uno al entregar.'));
}
