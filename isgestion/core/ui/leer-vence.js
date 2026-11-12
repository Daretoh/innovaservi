// Botón "Leer vencimiento del documento" para un campo de fecha de un formulario (abrirFormulario → accion).
// fuentes(valores) → [archivo o URL] (la cédula: [reverso, frente]); tipo: clave del documento (reglas de vigencia);
// cedula: usa el lector del carnet (MRZ o frente) y compara el RUN con rut; emision: campo donde poner la fecha
// de emisión si se lee. ia: { api, empresaId, modulo } lee primero con Claude (fotos o PDF, Edge Function
// leer-documento, modo vence); si falla o no hay clave, sigue con el lector del navegador. Nunca guarda: propone.
export function leerVence({ fuentes, tipo = null, cedula = false, rut = null, emision = null, ia = null }) {
  return {
    texto: 'Leer vencimiento del documento', icono: 'ojo',
    alClic: async ({ valores, poner, estado }) => {
      const F = (await fuentes(valores)).filter((x) => x && !(x instanceof File && !x.size));
      if (!F.length) { estado('Primero elige el archivo del documento.', 'mal'); return; }
      if (ia && await leerConIA({ F, ia, tipo, cedula, rut, emision, poner, estado })) return;
      const L = await import('../lector-venc.js?v=9dfb925');
      if (cedula) {
        const r = await L.leerVencCedula(F, rut, (t) => estado(t));
        const R = L.resumenCedula(r);
        if (r?.venc) poner('vence', r.venc);
        estado(R.texto, R.clase);
      } else {
        const x = await L.leerVencDoc(F[F.length - 1], tipo, (t) => estado(t));
        const R = L.resumenDoc(x);
        if (x?.venc) poner('vence', x.venc);
        if (emision && x?.emis) poner(emision, x.emis);
        estado(R.texto, R.clase);
      }
    },
  };
}

// Lectura con IA. Devuelve true si dejó un resultado (aunque sea "no trae vencimiento"); false para seguir con el
// lector del navegador (sin clave o error).
async function leerConIA({ F, ia, tipo, cedula, rut, emision, poner, estado }) {
  const { leerVencConIA, iaDisponible, fechaIA, textoModelo } = await import('../lector-ia.js?v=9dfb925');
  if (!iaDisponible()) return false;
  estado('Leyendo con IA…');
  let r;
  try { r = await leerVencConIA(ia.api, { empresaId: ia.empresaId, modulo: ia.modulo, fuentes: F }); }
  catch (e) { estado(`${e.message}. Probando con el lector del navegador…`); return false; }
  const d = r?.datos ?? {};
  const f = (x) => x.split('-').reverse().join('-');
  let venc = fechaIA(d.vence);
  const emis = fechaIA(d.emision);
  let nota = '';
  if (!venc && emis) {
    const { REGLAS_VIGENCIA } = await import('../lector-venc.js?v=9dfb925');
    const regla = REGLAS_VIGENCIA[tipo];
    if (regla) { const x = new Date(`${emis}T12:00`); x.setDate(x.getDate() + regla.dias); venc = x.toISOString().slice(0, 10); nota = ` ${regla.texto}`; }
  }
  if (venc) poner('vence', venc);
  if (emision && emis) poner(emision, emis);
  // En la cédula, compara el RUN leído con el de la ficha (sin puntos ni dígito verificador)
  const cuerpo = (x) => String(x ?? '').replace(/[^\dkK]/g, '').slice(0, -1);
  const rutAviso = cedula && rut && d.rut ? (cuerpo(d.rut) === cuerpo(rut) ? ' El RUN coincide con la ficha.' : ' Atención: el RUN leído no coincide con la ficha.') : '';
  const quien = textoModelo(r);
  if (!venc) estado(`${quien}: el documento no indica vencimiento${emis ? ` (emitido el ${f(emis)})` : ''}. Escríbelo si corresponde.${d.observaciones ? ` ${d.observaciones}` : ''}`, 'prox');
  else estado(`${quien}: vence el ${f(venc)}. Confírmalo con el documento.${nota}${rutAviso}`, rutAviso.includes('no coincide') ? 'mal' : nota ? 'prox' : 'ok');
  return true;
}
