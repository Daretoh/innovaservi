// Exportación "Datos para Buk": una fila por trabajador con sus datos personales y del vínculo.
// CSV para Excel (separador, tildes y protección contra fórmulas en core/csv.js).
import { nombreVinculo } from './datos.js?v=a8e0f26';
import { csv, descargar } from '../../core/csv.js?v=a8e0f26';

const COLUMNAS = [
  ['RUT', (p) => p.rut],
  ['Nombres', (p) => p.nombres],
  ['Apellido paterno', (p) => p.apellido_paterno],
  ['Apellido materno', (p) => p.apellido_materno],
  ['Fecha de nacimiento', (p) => p.fecha_nacimiento],
  ['Sexo', (p) => p.sexo],
  ['Nacionalidad', (p) => p.nacionalidad],
  ['Estado civil', (p) => p.estado_civil],
  ['Teléfono', (p) => p.telefono],
  ['Correo', (p) => p.email],
  ['Calle', (p) => p.direccion],
  ['Número', (p) => p.numero],
  ['Población', (p) => p.poblacion],
  ['Comuna', (p) => p.comuna],
  ['Región', (p) => p.region],
  ['AFP', (p) => p.afp],
  ['Salud', (p) => p.salud],
  ['Régimen previsional', (p) => p.regimen_prev],
  ['Seguro de cesantía', (p) => p.regimen_afc],
  ['Cargas familiares', (p) => p.cargas],
  ['Tramo asignación familiar', (p) => p.tramo_cargas],
  ['Discapacidad', (p) => p.discapacidad],
  ['Pensión de invalidez', (p) => p.invalidez],
  ['Banco', (p) => p.banco],
  ['Tipo de cuenta', (p) => p.tipo_cuenta],
  ['Número de cuenta', (p) => p.num_cuenta],
  ['Título', (p) => p.titulo_educacion],
  ['Institución', (p) => p.institucion_titulo],
  ['Contacto de emergencia', (p) => p.emergencia],
  ['Cargo', (p, v) => v.cargo],
  ['Tipo de contrato', (p, v) => nombreVinculo[v.tipo_vinculo] ?? v.tipo_vinculo],
  ['Jornada', (p, v) => v.jornada],
  ['Fecha de ingreso', (p, v) => v.fecha_ingreso],
];

export const csvBuk = (vinculos) => csv([COLUMNAS.map(([t]) => t), ...vinculos.map((v) => COLUMNAS.map(([, f]) => f(v.personas, v)))]);

export { descargar };
