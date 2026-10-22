// CSV para Excel en Chile: separador ';', BOM UTF-8 (tildes) y protección contra fórmulas (OWASP).
const celda = (valor) => {
  const t = valor == null ? '' : String(valor);
  const seguro = /^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t) ? `'${t}` : t;
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
};

export const csv = (filas) => `﻿${filas.map((f) => f.map(celda).join(';')).join('\r\n')}\r\n`;

export function descargar(texto, nombre, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
