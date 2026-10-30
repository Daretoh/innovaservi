// Nómina para el cliente (como en InnovaGestión): la nómina del personal activo para enviar al mandante (casino,
// torniquetes, acreditación) y el aviso de baja de una persona. Nómina: elegir personas, copiar la tabla (se pega en
// Excel o en el correo con columnas), PDF con el membrete de la empresa y Excel. Baja: trabajador y fecha, con el
// texto del correo listo para copiar o abrir en el correo. No envía nada: lo envía quien la usa, desde su correo.
// Parámetros: ?m=baja&p=<persona>&f=<fecha> abre el aviso de baja prellenado (desde "Pasar a inactivo").
import { el } from '../../../core/ui/dom.js?v=462b5ff';
import { icono } from '../../../core/ui/iconos.js?v=462b5ff';
import { boton } from '../../../core/ui/tabla.js?v=462b5ff';
import { avisar } from '../../../core/ui/aviso.js?v=462b5ff';
import { hoyISO } from '../../../core/ui/formato.js?v=462b5ff';
import { cargarRrhh, nombreCompleto } from '../datos.js?v=462b5ff';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaTexto = (f) => { const [a, m, d] = (f || hoyISO()).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const fechaNum = (f) => (f || hoyISO()).split('-').reverse().join('/');
const titulo = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
function telefono(s) {
  s = (s || '').trim(); const d = s.replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') return `+56 9 ${d.slice(1, 5)} ${d.slice(5)}`;
  if (d.length === 11 && d.startsWith('569')) return `+56 9 ${d.slice(3, 7)} ${d.slice(7)}`;
  return s;
}
const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

let modo = 'nomina';

export default async function vista(ctx) {
  const datos = await cargarRrhh(ctx);
  const empresa = ctx.empresa.nombre_fantasia || ctx.empresa.razon_social;
  const firma = ctx.usuario?.nombre || titulo((ctx.usuario?.email ?? '').split('@')[0].replace(/[._-]+/g, ' '));
  if (ctx.params.m === 'baja') modo = 'baja';
  const clavePara = `isg.nomina.para.${ctx.empresa.id}`;

  const personas = datos.vinculos.map((v) => ({
    id: v.persona_id, nombre: titulo(nombreCompleto(v.personas)), rut: v.personas.rut ?? '', telefono: telefono(v.personas.telefono),
    cargo: v.cargo ?? '', activo: v.estado === 'activo',
  }));
  const activos = personas.filter((p) => p.activo);
  const elegidos = new Set(activos.map((p) => p.id));
  const lista = () => activos.filter((p) => elegidos.has(p.id));

  // ---- Correo: para y asunto (comunes)
  const para = el('input', { type: 'email', class: 'campo', placeholder: 'correo@cliente.cl', autocomplete: 'off', 'aria-label': 'Para' });
  try { para.value = localStorage.getItem(clavePara) ?? ''; } catch { /* */ }
  para.addEventListener('change', () => { try { localStorage.setItem(clavePara, para.value.trim()); } catch { /* */ } });
  const asunto = el('input', { type: 'text', class: 'campo', 'aria-label': 'Asunto' });
  let asuntoEditado = false;
  asunto.addEventListener('input', () => { asuntoEditado = true; });

  // ---- Nómina
  const contador = el('span', { class: 'texto-suave' });
  const aviso = el('div');
  const cuerpoTabla = el('tbody');
  const pintarNomina = () => {
    const L = lista(); const sinRut = L.filter((p) => !p.rut).length;
    contador.textContent = `· ${L.length} de ${activos.length}`;
    aviso.replaceChildren(sinRut ? el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), `${sinRut} persona${sinRut > 1 ? 's' : ''} sin RUT en la ficha: complétalo antes de enviar.`) : '');
    cuerpoTabla.replaceChildren(...activos.map((p) => el('tr', { class: 'nom-fila', onclick: (ev) => { if (ev.target.tagName !== 'INPUT') { elegidos.has(p.id) ? elegidos.delete(p.id) : elegidos.add(p.id); refrescar(); } } },
      el('td', {}, el('input', { type: 'checkbox', class: 'casilla-sola', checked: elegidos.has(p.id), 'aria-label': `Incluir a ${p.nombre}`,
        onchange: (ev) => { ev.target.checked ? elegidos.add(p.id) : elegidos.delete(p.id); refrescar(); } })),
      el('td', {}, p.nombre),
      el('td', { class: p.rut ? '' : 'pct-mal' }, p.rut || 'sin RUT'),
      el('td', { class: p.telefono ? '' : 'texto-suave' }, p.telefono || 'sin teléfono'))));
  };
  const columnas = ['N°', 'Nombre', 'RUT', 'Teléfono'];
  const filas = () => lista().map((p, i) => [i + 1, p.nombre, p.rut, p.telefono]);
  const exigir = () => { if (!lista().length) throw new Error('No hay personas seleccionadas.'); };
  // Nombre del archivo desde el asunto, sin la fecha que trae (se agrega la de hoy)
  const base = () => slug(asunto.value).replace(/-\d{2}-\d{2}-\d{4}$/, '') || 'nomina-personal-activo';
  const copiarTabla = async () => {
    exigir();
    const tsv = [columnas, ...filas()].map((f) => f.join('\t')).join('\r\n');
    const html = `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse"><tr>${columnas.map((c) => `<th>${c}</th>`).join('')}</tr>${filas().map((f) => `<tr>${f.map((v) => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table>`;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([tsv], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
    } catch { await navigator.clipboard.writeText(tsv); }
    avisar('Tabla copiada: pégala en el correo o en Excel.');
  };
  const pdf = async () => {
    exigir();
    const { nuevoPdf } = await import('../../../core/pdf.js?v=462b5ff');
    const L = lista();
    const p = await nuevoPdf(ctx, { titulo: asunto.value.trim() || 'Nómina de personal activo', subtitulo: `${empresa} · al ${fechaTexto()} · ${L.length} persona${L.length === 1 ? '' : 's'}` });
    p.tabla({ columnas, filas: filas().map((f) => f.map((v) => String(v || '—'))) });
    p.guardar(base());
  };
  const excel = async () => {
    exigir();
    const { exportarExcel } = await import('../../../core/excel.js?v=462b5ff');
    const L = lista();
    await exportarExcel(ctx, { titulo: asunto.value.trim() || 'Nómina de personal activo', subtitulo: `${empresa} · al ${fechaTexto()} · ${L.length} persona${L.length === 1 ? '' : 's'}`,
      columnas, filas: filas(), nombre: base() });
  };
  const accion = (fn) => async () => { try { await fn(); } catch (e) { avisar(e.message, 'error'); } };

  const panelNomina = el('div', { class: 'ficha' },
    el('div', { class: 'listado-acciones' }, el('h2', {}, 'Personas activas ', contador),
      el('span', {}, boton('Todos', { onclick: () => { activos.forEach((p) => elegidos.add(p.id)); refrescar(); } }), ' ',
        boton('Ninguno', { onclick: () => { elegidos.clear(); refrescar(); } }))),
    aviso,
    activos.length ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla nom-tabla' },
      el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', {}, 'Nombre'), el('th', {}, 'RUT'), el('th', {}, 'Teléfono'))), cuerpoTabla))
      : el('p', { class: 'texto-suave' }, 'No hay trabajadores activos.'),
    el('div', { class: 'listado-acciones' },
      boton('Copiar tabla', { icono: 'copiar', tipo: 'primario', onclick: accion(copiarTabla) }),
      boton('Descargar PDF', { icono: 'descargar', onclick: accion(pdf) }),
      boton('Descargar Excel', { icono: 'descargar', onclick: accion(excel) })),
    el('p', { class: 'texto-suave texto-chico' }, '"Copiar tabla" la pega en el correo o en Excel con las columnas separadas. El PDF o el Excel se descargan para adjuntar.'));

  // ---- Aviso de baja
  const trabajador = el('select', { class: 'campo', 'aria-label': 'Trabajador' },
    el('option', { value: '' }, 'Elige el trabajador…'),
    [...personas].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => el('option', { value: p.id, selected: p.id === ctx.params.p }, `${p.nombre}${p.activo ? '' : ' (inactivo)'}`)));
  const fecha = el('input', { type: 'date', class: 'campo', value: ctx.params.f || hoyISO(), 'aria-label': 'Deja de prestar servicios desde' });
  const cuerpo = el('textarea', { class: 'campo', rows: 11, 'aria-label': 'Texto del correo' });
  const panelBaja = el('div', { class: 'ficha' },
    el('div', { class: 'rejilla-campos' },
      el('label', { class: 'form-fila' }, 'Trabajador', trabajador),
      el('label', { class: 'form-fila' }, 'Deja de prestar servicios desde', fecha)),
    el('label', { class: 'form-fila' }, 'Texto del correo (puedes editarlo)', cuerpo),
    el('div', { class: 'listado-acciones' },
      boton('Copiar texto', { icono: 'copiar', tipo: 'primario', onclick: accion(async () => { if (!trabajador.value) throw new Error('Elige el trabajador.'); await navigator.clipboard.writeText(cuerpo.value); avisar('Texto copiado.'); }) }),
      boton('Abrir en el correo', { icono: 'correo', onclick: accion(() => {
        if (!trabajador.value) throw new Error('Elige el trabajador.');
        location.href = `mailto:${encodeURIComponent(para.value.trim())}?subject=${encodeURIComponent(asunto.value)}&body=${encodeURIComponent(cuerpo.value)}`;
      }) })),
    el('p', { class: 'texto-suave texto-chico' }, 'El correo se abre con el texto listo; lo envías tú desde tu cuenta.'));
  let cuerpoEditado = false;
  cuerpo.addEventListener('input', () => { cuerpoEditado = true; });
  for (const c of [trabajador, fecha]) c.addEventListener('change', () => { cuerpoEditado = false; refrescar(); });

  const textoBaja = () => {
    const p = personas.find((x) => x.id === trabajador.value);
    return `Hola, buenos días:\n\nInformo que la siguiente persona dejó de prestar servicios en ${empresa} a contar del ${fechaTexto(fecha.value)}, por lo que solicito su desactivación del sistema (ticket de casino y torniquetes):\n\n${p?.nombre ?? '[nombre]'}\n${p?.rut || '[RUT]'}\n\nQuedo atento.\n\nSaludos cordiales,\n${firma}`;
  };
  const asuntoAuto = () => {
    if (modo === 'baja') { const p = personas.find((x) => x.id === trabajador.value); return `Baja de personal ${empresa}${p ? ` – ${p.nombre}` : ''}`; }
    return `Nómina personal activo ${empresa} – ${fechaNum()}`;
  };
  function refrescar() {
    pintarNomina();
    if (!asuntoEditado) asunto.value = asuntoAuto();
    if (!cuerpoEditado) cuerpo.value = textoBaja();
    panelNomina.hidden = modo !== 'nomina'; panelBaja.hidden = modo !== 'baja';
  }

  const segmento = el('div', { class: 'segmento', role: 'group', 'aria-label': 'Qué enviar' },
    [['nomina', 'Nómina de activos'], ['baja', 'Aviso de baja']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(modo === v),
      onclick: (ev) => { modo = v; asuntoEditado = false; for (const b of ev.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); refrescar(); } }, t)));

  refrescar();
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Nómina para clientes'),
      el('p', { class: 'texto-suave' }, 'Personal activo y avisos de baja para el mandante (casino, torniquetes, acreditación).'))),
    segmento,
    el('div', { class: 'ficha' }, el('div', { class: 'rejilla-campos' },
      el('label', { class: 'form-fila' }, 'Para (correo)', para),
      el('label', { class: 'form-fila' }, 'Asunto / título del documento', asunto))),
    panelNomina, panelBaja);
}
