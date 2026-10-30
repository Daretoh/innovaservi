// Botón "Leer vencimiento del documento" para un campo de fecha de un formulario (abrirFormulario → accion).
// fuentes(valores) → [archivo o URL] (la cédula: [reverso, frente]); tipo: clave del documento (reglas de vigencia);
// cedula: usa el lector del carnet (MRZ o frente) y compara el RUN con rut; emision: campo donde poner la fecha
// de emisión si se lee. El lector se carga solo al hacer clic.
export function leerVence({ fuentes, tipo = null, cedula = false, rut = null, emision = null }) {
  return {
    texto: 'Leer vencimiento del documento', icono: 'ojo',
    alClic: async ({ valores, poner, estado }) => {
      const F = (await fuentes(valores)).filter((x) => x && !(x instanceof File && !x.size));
      if (!F.length) { estado('Primero elige el archivo del documento.', 'mal'); return; }
      const L = await import('../lector-venc.js?v=b52224b');
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
