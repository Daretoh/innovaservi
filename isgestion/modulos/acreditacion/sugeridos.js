// Carpetas, documentos y requisitos sugeridos (basados en lo que usa InnovaServi). Cada empresa los
// carga con un clic y después los cambia a su gusto.
// Documento: [nombre, vence, varios_vigentes]
export const CARPETAS = [
  ['Legal y previsional', [
    ['e-RUT de la empresa', false, true],
    ['Escritura y estatutos', false, false],
    ['Certificado de vigencia', true, false],
    ['Certificado de adhesión a la mutual', false, false],
    ['Certificado de tasa de cotización', true, false],
  ]],
  ['Laboral', [
    ['Certificado de antecedentes laborales F30', true, false],
    ['Certificado de cumplimiento de obligaciones laborales F30-1', true, false],
    ['Recepción RIOHS Inspección del Trabajo', false, false],
    ['Recepción RIOHS Servicio de Salud', false, false],
  ]],
  ['Reglamento y gestión preventiva', [
    ['Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)', false, false],
    ['Programa de trabajo preventivo', false, false],
    ['Matriz de riesgos (IPER)', false, false],
    ['Matriz de elementos de protección personal', false, false],
    ['Procedimiento de emergencia y accidentes', false, false],
    ['Protocolo de prevención Ley Karin', false, false],
  ]],
  ['Seguros y otros', [
    ['Póliza de seguro', true, true],
  ]],
];

// Requisitos típicos de un mandante: [nombre, periodicidad, documento de empresa (si es único), nota]
export const REQUISITOS = [
  ['Certificado F30-1 (cumplimiento laboral y previsional)', 'mensual', null, 'Dirección del Trabajo'],
  ['Planillas de pago Previred', 'mensual', null, 'Previred'],
  ['Libro de remuneraciones electrónico (LRE)', 'mensual', null, 'Dirección del Trabajo'],
  ['Nómina de trabajadores', 'mensual', null, 'Quienes trabajaron para el mandante ese mes'],
  ['Informe mensual de accidentes', 'mensual', null, 'Se genera en Prevención SST'],
  ['Certificado de antecedentes laborales F30', 'unica', 'Certificado de antecedentes laborales F30', null],
  ['Certificado de adhesión a la mutual', 'unica', 'Certificado de adhesión a la mutual', null],
  ['Reglamento Interno (RIOHS)', 'unica', 'Reglamento Interno de Orden, Higiene y Seguridad (RIOHS)', null],
  ['Escritura y estatutos', 'unica', 'Escritura y estatutos', null],
];
