// Plantillas de WhatsApp (Marketing 009): datos comunes de la pestaña Plantillas y de la bandeja.
// En el editor se escriben con datos con nombre ({nombre}, {fecha}…); al guardar se pasan a {{1}}, {{2}}… como pide
// Meta, y se guarda qué dato va en cada una (variables) con un ejemplo para la revisión.
export const DATOS = {
  nombre: { etiqueta: 'Nombre del cliente', ejemplo: 'Juan' },
  fecha: { etiqueta: 'Fecha', ejemplo: 'jueves 20 de noviembre' },
  hora: { etiqueta: 'Hora', ejemplo: '10:00' },
  servicio: { etiqueta: 'Servicio', ejemplo: 'Pulido premium' },
  patente: { etiqueta: 'Patente', ejemplo: 'ABCD-12' },
  sellos: { etiqueta: 'Sellos', ejemplo: '4 de 6' },
  premio: { etiqueta: 'Premio', ejemplo: 'Lavado CORE' },
  empresa: { etiqueta: 'Empresa', ejemplo: 'IS Performance' },
  enlace: { etiqueta: 'Enlace', ejemplo: 'https://innovaservi.cl/isgestion/agenda/' },
  texto: { etiqueta: 'Texto libre', ejemplo: 'tu vehículo ya está listo' },
};
export const USOS = [['hora_confirmada', 'Hora confirmada'], ['recordatorio', 'Recordatorio de hora'], ['hora_rechazada', 'Hora no disponible'],
  ['sello', 'Sello en la tarjeta'], ['premio', 'Premio de la tarjeta'], ['seguimiento', 'Seguimiento después del servicio'], ['promocion', 'Promoción'], ['otro', 'Otro']];
export const nombreUso = Object.fromEntries(USOS);
export const CATEGORIAS = [['UTILITY', 'Utilidad (avisos de una atención: más barata)'], ['MARKETING', 'Marketing (promociones y novedades)']];
export const ESTADOS = { borrador: ['Borrador', 'chip-pend'], pendiente: ['En revisión de Meta', 'chip-prox'], aprobada: ['Aprobada', 'chip-ok'],
  rechazada: ['Rechazada', 'chip-venc'], pausada: ['Pausada por Meta', 'chip-prox'], desactivada: ['Desactivada', 'chip-na'] };

// Sugeridas para un taller (Meta no deja una variable al principio ni al final del texto)
export const SUGERIDAS = [
  { uso: 'hora_confirmada', categoria: 'UTILITY', texto: 'Hola {nombre}, tu hora en {empresa} quedó confirmada para el {fecha} a las {hora} ({servicio}). Si necesitas cambiarla, respóndenos este mensaje.' },
  { uso: 'recordatorio', categoria: 'UTILITY', texto: 'Hola {nombre}, te recordamos tu hora en {empresa} el {fecha} a las {hora}. ¡Te esperamos!' },
  { uso: 'hora_rechazada', categoria: 'UTILITY', texto: 'Hola {nombre}, el {fecha} a las {hora} no tenemos disponibilidad. Respóndenos y te buscamos otro horario.' },
  { uso: 'premio', categoria: 'UTILITY', texto: 'Hola {nombre}, completaste tu tarjeta de cliente de {empresa}. Tu premio es {premio}: lo canjeas en tu próxima visita.' },
  { uso: 'sello', categoria: 'MARKETING', texto: 'Hola {nombre}, sumaste un sello en tu tarjeta de {empresa}: llevas {sellos}. Revisa tu tarjeta en {enlace} y sigue sumando.' },
  { uso: 'seguimiento', categoria: 'MARKETING', texto: 'Hola {nombre}, ¿qué te pareció el {servicio} de tu vehículo? Tu opinión nos ayuda a mejorar en {empresa}.' },
];

// {nombre} … → {{1}} …, con la lista de datos y ejemplos
export function aMeta(texto) {
  const variables = [];
  const cuerpo = String(texto).trim().replace(/\{([a-z]+)\}/g, (m, k) => {
    if (!DATOS[k]) return m;
    variables.push(k);
    return `{{${variables.length}}}`;
  });
  return { cuerpo, variables, ejemplos: variables.map((k) => DATOS[k].ejemplo) };
}
// {{1}} … → {nombre} … (para editar)
export const deMeta = (cuerpo, variables) => String(cuerpo).replace(/\{\{(\d+)\}\}/g, (m, n) => `{${variables[Number(n) - 1] ?? 'texto'}}`);
// Vista previa con los ejemplos o con valores reales
export const armar = (cuerpo, valores) => String(cuerpo).replace(/\{\{(\d+)\}\}/g, (m, n) => valores[Number(n) - 1] || `[${n}]`);
export const nombreMeta = (uso, existentes) => {
  let base = `${uso}`.replace(/[^a-z0-9_]/g, '_').slice(0, 50) || 'plantilla';
  let n = base; let i = 2;
  while (existentes.has(n)) n = `${base}_${i++}`;
  return n;
};
