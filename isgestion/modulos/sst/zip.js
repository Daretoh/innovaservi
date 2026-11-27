// Descargar registros de entrega en ZIP (pedido de Enzo, 2026-11-23): una carpeta por trabajador con cada documento
// (firmado si ya se firmó), en partes de hasta 19 MB para adjuntarlas en Outlook (límite de 20 MB por correo).
// JSZip 3.10.1 fijo desde cdnjs, se carga solo al usarlo.
import { avisar } from '../../core/ui/aviso.js?v=0cc60b3';
import { hoyISO, fechaLarga } from '../../core/ui/formato.js?v=0cc60b3';
import { urlsFirmadas } from '../../core/adjuntos.js?v=0cc60b3';

const MAX_PARTE = 19 * 1024 * 1024;
let jszip = null;
async function cargarJsZip() {
  if (jszip) return jszip;
  await new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el generador de ZIP. Revisa la conexión.'));
    document.head.append(s);
  });
  jszip = window.JSZip;
  return jszip;
}
const limpio = (t, n = 80) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .()·-]+/g, ' ').replace(/·/g, '-').replace(/\s+/g, ' ').trim().slice(0, n) || 'archivo';
const nombreDe = (p) => [p?.apellido_paterno, p?.apellido_materno, p?.nombres].filter(Boolean).join(' ');

// ids: registros de entrega a incluir; nombre: para el archivo ZIP
// soloDoc (opcional): (documento) => boolean, para bajar un solo documento de una entrega individual
export async function descargarEntregasZip(ctx, ids, { nombre = 'Registros de entrega', boton = null, soloDoc = null } = {}) {
  if (!ids?.length) { avisar('No hay registros para descargar.'); return; }
  boton?.classList.add('cargando'); if (boton) boton.disabled = true;
  try {
    const Zip = await cargarJsZip();
    const { data, error } = await ctx.api.from('sst_entregas')
      .select('id, tema, fecha, estado, archivo, documentos, sst_entrega_personas(persona_id, personas(nombres, apellido_paterno, apellido_materno, rut))')
      .in('id', ids).is('deleted_at', null).order('fecha');
    if (error) throw error;
    const archivos = [];   // { ruta, destino }
    const leeme = [`${ctx.empresa.razon_social} · ${nombre} · descargado el ${fechaLarga(hoyISO())}`, ''];
    for (const ent of data ?? []) {
      const gente = (ent.sst_entrega_personas ?? []).map((x) => x.personas).filter(Boolean);
      const firmado = ent.estado === 'firmado';
      if (Array.isArray(ent.documentos) && ent.documentos.length && gente.length === 1) {
        // Entrega individual: carpeta del trabajador, un PDF por documento
        const lista = soloDoc ? ent.documentos.filter(soloDoc) : ent.documentos;
        if (!lista.length) continue;
        const p = gente[0]; const carpeta = limpio(`${nombreDe(p)} (${p.rut ?? 'sin RUT'})`);
        const firmados = lista.filter((d) => d.archivo_firmado).length;
        leeme.push(`${nombreDe(p)} (${p.rut ?? 'sin RUT'}): ${lista.length} documento${lista.length === 1 ? '' : 's'}, ${firmados === lista.length ? 'firmado' + (lista.length === 1 ? '' : 's') : firmados ? `${firmados} con firma` : 'por firmar'}`);
        lista.forEach((d, k) => archivos.push({ ruta: d.archivo_firmado || d.archivo, destino: `${carpeta}/${String(k + 1).padStart(2, '0')} ${limpio(d.titulo, 90)}${d.archivo_firmado ? '' : ' (por firmar)'}.pdf` }));
      } else if (ent.archivo) {
        // Registro grupal (charla, capacitación…): un PDF con la lista
        const ext = (ent.archivo.match(/\.(\w+)$/)?.[1] ?? 'pdf').toLowerCase();
        leeme.push(`${ent.fecha} · ${ent.tema}: ${gente.length} participante${gente.length === 1 ? '' : 's'}, ${firmado ? 'firmado' : 'por firmar'}`);
        archivos.push({ ruta: ent.archivo, destino: `Registros grupales/${ent.fecha} ${limpio(ent.tema, 90)}${firmado ? '' : ' (por firmar)'}.${ext}` });
      }
    }
    if (!archivos.length) throw new Error('Los registros elegidos no tienen documentos.');
    leeme.push('', 'Cada documento firmado electrónicamente lleva un código y un QR para verificar la firma en innovaservi.cl/isgestion/verificar.', 'Generado con ISgestión.');
    const urls = await urlsFirmadas(ctx.api, [...new Set(archivos.map((a) => a.ruta))], 900);
    const partes = []; let zip = new Zip(); let tam = 0;
    const cerrar = async () => { zip.file('LEEME.txt', leeme.join('\r\n')); partes.push(await zip.generateAsync({ type: 'blob' })); zip = new Zip(); tam = 0; };
    const usados = new Set();
    // Cada carpeta (trabajador) va entera en una parte, salvo que ella sola pase el límite
    const grupos = new Map();
    for (const a of archivos) { const g = a.destino.split('/')[0]; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(a); }
    let hechos = 0;
    for (const lista of grupos.values()) {
      const blobs = [];
      for (const a of lista) {
        const url = urls.get(a.ruta); hechos++;
        if (!url) continue;
        avisar(`Preparando el ZIP: ${hechos} de ${archivos.length}…`);
        blobs.push([a, await (await fetch(url)).blob()]);
      }
      const total = blobs.reduce((s, [, b]) => s + b.size, 0);
      if (tam && tam + total > MAX_PARTE) await cerrar();
      for (const [a, blob] of blobs) {
        if (tam && tam + blob.size > MAX_PARTE) await cerrar();
        let destino = a.destino; let n = 2;
        while (usados.has(destino)) destino = a.destino.replace(/(\.\w+)$/, ` (${n++})$1`);
        usados.add(destino);
        zip.file(destino, blob);
        tam += blob.size;
      }
    }
    await cerrar();
    partes.forEach((p, i) => {
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(p);
      enlace.download = `${limpio(nombre)} ${hoyISO()}${partes.length > 1 ? ` parte ${i + 1} de ${partes.length}` : ''}.zip`;
      document.body.append(enlace); enlace.click(); enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 60000);
    });
    avisar(`ZIP descargado${partes.length > 1 ? ` en ${partes.length} partes de hasta 19 MB (para adjuntar en Outlook)` : ''}: ${archivos.length} documento${archivos.length === 1 ? '' : 's'}.`);
  } catch (err) { avisar(err.message, 'error'); } finally { boton?.classList.remove('cargando'); if (boton) boton.disabled = false; }
}
