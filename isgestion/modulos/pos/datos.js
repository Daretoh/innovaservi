// Datos compartidos del POS.
export const MEDIOS = [['efectivo', 'Efectivo'], ['debito', 'Débito'], ['credito', 'Crédito'], ['transferencia', 'Transferencia'], ['otro', 'Otro']];
export const nombreMedio = Object.fromEntries(MEDIOS);
export const DOCS = [['boleta', 'Boleta'], ['factura', 'Factura'], ['sin', 'Sin documento']];
export const nombreDocVenta = Object.fromEntries(DOCS);
