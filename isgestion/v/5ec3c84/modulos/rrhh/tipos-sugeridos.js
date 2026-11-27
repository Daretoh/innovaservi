// Tipos de documento sugeridos al activar RRHH (los mismos que usaba InnovaGestión).
// ambito 'persona': un solo documento por persona, sirve para todas las empresas del grupo.
export default [
  { slug: 'cedula', nombre: 'Cédula de identidad', corto: 'Cédula', categoria: 'documento', ambito: 'persona', vence: true, permite_na: false },
  { slug: 'antecedentes', nombre: 'Certificado de antecedentes', corto: 'Antecedentes', categoria: 'documento', ambito: 'persona', vence: false, permite_na: false },
  { slug: 'pts_quimicos', nombre: 'PTS manejo de químicos', corto: 'PTS químicos', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'pts_extintores', nombre: 'PTS uso de extintores', corto: 'PTS extintores', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'pts_altura', nombre: 'PTS trabajo en altura', corto: 'PTS altura', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'pts_confinados', nombre: 'PTS espacios confinados', corto: 'PTS confinados', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'pts_alzahombre', nombre: 'PTS alza hombre / grúa', corto: 'PTS alza hombre', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'pts_funciones', nombre: 'PTS acorde a sus funciones', corto: 'PTS funciones', categoria: 'documento', ambito: 'empresa', vence: false, permite_na: false },
  { slug: 'examen_altura', nombre: 'Examen de altura física', corto: 'Ex. altura', categoria: 'documento', ambito: 'persona', vence: true, permite_na: true },
  { slug: 'cap_barcos', nombre: 'Trabajo seguro en barcos', corto: 'Barcos', categoria: 'capacitacion', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'cap_frigo', nombre: 'Trabajo en cámaras frigoríficas', corto: 'Cámaras frío', categoria: 'capacitacion', ambito: 'empresa', vence: false, permite_na: true },
  { slug: 'cap_primeros', nombre: 'Primeros auxilios', corto: 'Primeros aux.', categoria: 'capacitacion', ambito: 'empresa', vence: true, permite_na: true },
];
