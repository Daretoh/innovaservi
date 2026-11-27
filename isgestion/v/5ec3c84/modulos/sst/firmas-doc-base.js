// Sin dependencias: lo usa revisar-ia.js para saber si cargar el bloque de firmas (firmas-doc.js) solo cuando hace falta
export const tieneFirmas = (doc) => (doc?.secciones ?? []).some((s) => (s.bloques ?? []).some((b) => b.tipo === 'firmas'));
