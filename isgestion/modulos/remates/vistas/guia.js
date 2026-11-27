// Remates → Cómo funciona y fuentes: resumen de un remate judicial en Chile (garantía, pasos y plazos, riesgos,
// costos) y de dónde salen las oportunidades, con lo que se puede automatizar, lo pagado y lo que se revisa a mano.
// Información general (no es asesoría legal ni financiera); revisada el 2026-11-23.
// Ruta: #/remates.guia
import { el } from '../../../core/ui/dom.js?v=5ec3c84';
import { icono } from '../../../core/ui/iconos.js?v=5ec3c84';
import { cargarEstilos } from '../datos.js?v=5ec3c84';

const a = (href, t) => el('a', { href, target: '_blank', rel: 'noopener' }, t);

const PASOS = [
  ['Aviso', 'El tribunal publica el remate (diarios y sitios de avisos legales; Tesorería solo en remates.tgr.cl desde enero de 2025) con tribunal, rol de la causa, mínimo, fecha y hora.'],
  ['Estudio', 'Leer las bases y la causa en la Oficina Judicial Virtual, pedir al Conservador el dominio vigente y el certificado de hipotecas y gravámenes, ver el avalúo y la deuda de contribuciones, y ver la propiedad.'],
  ['Garantía', 'Normalmente el 10 % del mínimo, con vale vista a la orden del tribunal o depósito en su cuenta; el comprobante se sube en la Oficina Judicial Virtual antes del plazo del aviso (el día anterior o hasta una hora antes). A quien no gana se le devuelve.'],
  ['Remate', 'Presencial o por videoconferencia. Gana la mejor postura sobre el mínimo.'],
  ['Acta', 'Se firma el mismo día (en la Oficina Judicial Virtual si es remoto).'],
  ['Saldo', 'Al contado y en pocos días (en muchas bases, dentro de 5 días hábiles). Si no se paga, el remate queda sin efecto y se pierde la garantía.'],
  ['Escritura e inscripción', 'Escritura de adjudicación, inscripción en el Conservador y alzamiento de hipotecas y embargos.'],
  ['Entrega', 'Si hay ocupantes, el lanzamiento se pide en la misma causa (dentro del año) o con un juicio de precario: suele tomar de 3 a 6 meses o más.'],
];

const RIESGOS = [
  ['Ocupantes', 'Casi siempre sigue viviendo el deudor o un arrendatario. Desalojar toma meses y cuesta abogado y receptor.'],
  ['Deudas', 'Las bases suelen dejar a cargo de quien compra las contribuciones, los gastos comunes y los servicios impagos.'],
  ['Hipotecas de otros', 'Las hipotecas se extinguen con el remate solo si los acreedores fueron citados (art. 2428 del Código Civil). Hay que verlo en el certificado y en la causa.'],
  ['Nulidad', 'El deudor o terceros pueden plantear incidentes o pedir la nulidad del remate: el negocio puede demorar o caerse.'],
  ['Estado', 'Normalmente no se ve por dentro: hay que reservar plata para reparaciones.'],
  ['Plazo', 'Entre el remate y poder vender o usar pueden pasar varios meses; la plata queda inmovilizada.'],
];

const COSTOS = [
  ['Garantía', '10 % del mínimo (se recupera si no se gana).'],
  ['Escritura e inscripción', 'Notaría y Conservador: unas 5 a 10 UF más el arancel del Conservador (las fuentes no coinciden: entre 0,2 % y 0,5 % del precio).'],
  ['Abogado', 'Estudio de títulos y trámite posterior: cotizar (no hay tarifa pública).'],
  ['Deudas', 'Contribuciones, gastos comunes (en condominios, a veces 20 a 100 UF) y servicios.'],
  ['Desalojo y reparaciones', 'Receptor, abogado y arreglos.'],
  ['Vehículos y maquinaria', 'Comisión del martillero (suele ser un porcentaje más IVA), transferencia, retiro y traslado.'],
];

const FUENTES = [
  ['Remates judiciales', 'Avisos legales (Diario Constitucional, El Observador, La Tercera, DF, Cooperativa) y la causa en la Oficina Judicial Virtual.', 'Sí: leer los avisos nuevos cada semana y filtrar por región.', 'Gratis (hay agregadores privados pagados).', 'Bases, causa, certificados, visita.', 'https://oficinajudicialvirtual.pjud.cl/'],
  ['Tesorería (contribuciones)', 'remates.tgr.cl: tribunal, rol, fecha, deudor, dirección, rol de avalúo y tasación.', 'Sí: el listado es ordenado y público.', 'Gratis.', 'Casi nunca se concretan: entre 2020 y 2025 entraron 2.275 inmuebles y no se remató ninguna vivienda (los deudores pagan antes).', 'https://remates.tgr.cl/'],
  ['Bancos y recuperadoras', 'BancoEstado con Macal, Venegas o Zárate; Tattersall. Venden lo que se adjudicaron.', 'En parte: catálogos por remate.', 'Inscripción en el martillero y garantía (en Macal, del orden de $4 millones); comisión.', 'Condiciones de cada remate.', 'https://www.macal.cl/'],
  ['Bienes Nacionales', 'Portal de licitaciones con visor de mapa (plan 2026: 234 inmuebles, 159 por licitación).', 'En parte.', 'Gratis consultar.', 'Bases de cada licitación.', 'https://www.bienesnacionales.cl/'],
  ['Liquidaciones concursales', 'Boletín Concursal: empresas en liquidación (ej.: salmoneras) venden inmuebles, embarcaciones, balsas-jaula, maquinaria y vehículos, con martillero o plataforma electrónica.', 'Sí: buscar en el boletín y en los martilleros.', 'Gratis consultar.', 'Inventario, estado de los bienes, retiro.', 'https://www.boletinconcursal.cl/'],
  ['Vehículos y maquinaria', 'Macal, Compañía General de Remates, Fuenzalida, Venegas, Karcal; DICREP (Tía Rica) con ClaveÚnica.', 'Sí: catálogos en línea.', 'Inscripción, garantía y comisión.', 'Exhibición, papeles, anotaciones.', 'https://www.dicrep.cl/'],
  ['Conservador de Bienes Raíces', 'Dominio vigente, hipotecas y gravámenes, prohibiciones y litigios.', 'No: cada certificado se pide y se paga.', 'Pocos miles de pesos por certificado; demora hasta 4 días hábiles.', 'Siempre antes de postular.', 'https://conservadoresdigitales.cl/'],
  ['SII', 'Avalúo fiscal por rol o dirección y SII Mapas (valores por área homogénea).', 'A medias (sin API oficial).', 'Gratis.', '—', 'https://www4.sii.cl/mapasui/internet/'],
  ['Precio de mercado', 'Portal Inmobiliario, TocToc, Chileautos y estudios por comuna (UF/m²).', 'A medias: comparables publicados.', 'Informes de TocToc pagados.', 'Comparar con propiedades parecidas de verdad.', 'https://www.portalinmobiliario.com/'],
];

export default async function vista() {
  cargarEstilos();
  const lista = (items) => el('ol', { class: 'rem-pasos' }, items.map(([t, d]) => el('li', {}, el('strong', {}, t), ' ', d)));
  return el('section', { class: 'listado rem-guia' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, icono('documento', { tam: 22 }), ' Cómo funciona un remate')),
    el('p', { class: 'texto-suave texto-chico' }, 'Resumen general revisado el 23-11-2026. Cada remate tiene sus propias bases: mandan las bases, el tribunal y un abogado. No es una recomendación de inversión.'),
    el('section', { class: 'rem-bloque' }, el('h2', {}, 'Pasos de un remate judicial'), lista(PASOS)),
    el('div', { class: 'rem-columnas rem-columnas-iguales' },
      el('section', { class: 'rem-bloque' }, el('h2', {}, 'Riesgos'), lista(RIESGOS)),
      el('section', { class: 'rem-bloque' }, el('h2', {}, 'Costos además del precio'), lista(COSTOS))),
    el('section', { class: 'rem-bloque' }, el('h2', {}, 'De dónde salen las oportunidades'),
      el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
        el('thead', {}, el('tr', {}, ['Fuente', 'Qué hay', 'Se puede automatizar', 'Pago', 'A mano'].map((t) => el('th', {}, t)))),
        el('tbody', {}, FUENTES.map(([f, q, au, pa, m, u]) => el('tr', {}, el('td', {}, a(u, f)), el('td', {}, q), el('td', {}, au), el('td', {}, pa), el('td', {}, m))))))));
}
