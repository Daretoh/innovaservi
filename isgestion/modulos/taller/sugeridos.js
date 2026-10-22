// Servicios sugeridos para un taller de estética automotriz (genéricos; cada empresa pone sus precios).
// [nombre, categoría, [S, M, L, XL] | null si es a convenir, duración, tareas]
export const SERVICIOS = [
  ['Lavado básico', 'Lavado', [20000, 25000, 30000, 35000], '1-2 horas', ['Prelavado', 'Lavado de carrocería', 'Aspirado', 'Vidrios']],
  ['Lavado full', 'Lavado', [35000, 40000, 45000, 50000], '2-3 horas', ['Prelavado', 'Lavado de carrocería', 'Llantas y neumáticos', 'Aspirado completo', 'Paneles interiores', 'Vidrios']],
  ['Limpieza de motor', 'Lavado', [20000, 25000, 30000, 35000], '1 hora', ['Proteger componentes eléctricos', 'Desengrasar', 'Enjuagar', 'Abrillantar plásticos']],
  ['Pulido de pintura', 'Pintura', [100000, 120000, 140000, 160000], '1-2 días', ['Descontaminado', 'Pulido de corte', 'Abrillantado', 'Sellado']],
  ['Tratamiento cerámico 1 año', 'Protección', [180000, 220000, 260000, 300000], '2-3 días', ['Descontaminado', 'Pulido', 'Desengrase IPA', 'Aplicación cerámico', 'Curado']],
  ['Detallado interior', 'Interior', [110000, 130000, 150000, 180000], '1 día', ['Aspirado profundo', 'Lavado de tapices', 'Plásticos y paneles', 'Sanitizado']],
  ['Limpieza de asientos', 'Interior', null, '2-3 horas', ['Aspirado', 'Inyección-extracción', 'Secado']],
  ['Preparación para la venta', 'Otros', [80000, 95000, 110000, 130000], '5-6 horas', ['Lavado full', 'Limpieza de motor', 'Detallado rápido interior']],
];

export const TALLAS = ['S', 'M', 'L', 'XL'];
