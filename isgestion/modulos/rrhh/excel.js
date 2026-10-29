// Exportar trabajadores a Excel (como en InnovaGestión): hoja Resumen (totales, por cargo, documentación de activos y
// vencimientos de los próximos 60 días) y hoja Trabajadores con grupos de columnas plegables (+ / −), filtros,
// estados con color y la primera fila y columnas fijas. ExcelJS se carga con core/excel.js solo al exportar.
import { cargarLogo } from '../../core/pdf.js?v=6f62ff2';
import { cargarExcelJS, argb } from '../../core/excel.js?v=6f62ff2';
import { nombreEmpresa } from '../../core/empresas.js?v=6f62ff2';
import { cumplimiento, estadoDoc, nombreCompleto, nombreVinculo } from './datos.js?v=6f62ff2';

const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`) : null);
const edad = (n) => { if (!n) return null; const d = new Date(`${n}T12:00:00`); const h = new Date(); let e = h.getFullYear() - d.getFullYear(); if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) e -= 1; return Number.isNaN(e) ? null : e; };
const ESTADO = { activo: 'Activo', inactivo: 'Inactivo' };

export async function exportarExcel(ctx, datos) {
  const e = ctx.empresa;
  // Condiciones de pago, si se pueden ver (Remuneraciones)
  let condiciones = new Map(); let cargos = new Map();
  if (ctx.puede('remu', 'ver')) {
    const [c, g] = await Promise.all([
      ctx.api.from('remu_condiciones').select('*').eq('empresa_id', e.id),
      ctx.api.from('remu_cargos').select('id, nombre, trato').eq('empresa_id', e.id),
    ]);
    condiciones = new Map((c.data ?? []).map((x) => [x.vinculo_id, x]));
    cargos = new Map((g.data ?? []).map((x) => [x.id, x]));
  }
  const [ExcelJS, logo] = await Promise.all([cargarExcelJS(), cargarLogo(ctx.api, e.logo_url)]);
  const COLOR = argb(e.color); const NAVY = 'FF1A1F6E'; const DEEP = 'FF0C0F2E'; const ALT = 'FFF5F6FB'; const LINEA = 'FFE3E5EE'; const SUAVE = 'FF8B93A7'; const TINTA = 'FF1B1F4D';
  const relleno = (c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const borde = { bottom: { style: 'thin', color: { argb: LINEA } } };
  const EST = { Activo: ['FFE7F6EE', 'FF16794A'], Inactivo: ['FFF1F2F6', 'FF6B7390'], Entregado: ['FFE7F6EE', 'FF16794A'], 'Por vencer': ['FFFFF4E6', 'FFB45309'],
    Vencido: ['FFFDECEC', 'FFB91C1C'], Pendiente: ['FFFDECEC', 'FFB91C1C'], 'No aplica': ['FFF1F2F6', 'FF6B7390'] };
  const hoy = new Date(); const fhoy = hoy.toLocaleDateString('es-CL');

  const lista = [...datos.vinculos].sort((a, b) => (a.estado === 'activo' ? 0 : 1) - (b.estado === 'activo' ? 0 : 1)
    || (a.cargo ?? '').localeCompare(b.cargo ?? '') || nombreCompleto(a.personas).localeCompare(nombreCompleto(b.personas)));
  const tipos = datos.tiposActivos.filter((t) => t.cuenta);
  const est = (v, t) => { const k = estadoDoc(t, datos.doc(v.persona_id, t.slug)).k; return { ok: 'Entregado', prox: 'Por vencer', venc: 'Vencido', pend: 'Pendiente', na: 'No aplica' }[k]; };
  const cond = (v) => condiciones.get(v.id) ?? null;
  const p = (v) => v.personas ?? {};

  // [clave, título, grupo, valor(v), formato, ancho]  formato: t texto · d fecha · n número · $ dinero · p porcentaje · e estado
  const C = [
    ['nombre', 'Nombre', 'Principal', (v) => nombreCompleto(p(v)), 't', 30],
    ['rut', 'RUT', 'Principal', (v) => p(v).rut, 't', 13],
    ['cargo', 'Cargo', 'Principal', (v) => v.cargo, 't', 24],
    ['estado', 'Estado', 'Principal', (v) => ESTADO[v.estado] ?? v.estado, 'e', 11],
    ['ingreso', 'Fecha ingreso', 'Principal', (v) => fecha(v.fecha_ingreso), 'd', 12],
    ...(ctx.config.usa_buk ? [['buk', 'En Buk', 'Principal', (v) => (v.buk ? 'Sí' : 'No'), 't', 8]] : []),
    ['vinculo', 'Vínculo', 'Contrato y remuneración', (v) => nombreVinculo[v.tipo_vinculo] ?? v.tipo_vinculo, 't', 13],
    ['jornada', 'Jornada', 'Contrato y remuneración', (v) => v.jornada, 't', 14],
    ['termino', 'Fecha término', 'Contrato y remuneración', (v) => fecha(v.fecha_termino), 'd', 12],
    ['tipo_contrato', 'Tipo de contrato', 'Contrato y remuneración', (v) => (v.contrato_indefinido ? 'Indefinido' : v.contrato_vence ? 'Plazo fijo' : 'Spot / sin fecha'), 't', 14],
    ['contrato_vence', 'Vence contrato', 'Contrato y remuneración', (v) => fecha(v.contrato_vence), 'd', 12],
    ...(ctx.puede('remu', 'ver') ? [
      ['modo', 'Tipo de pago', 'Contrato y remuneración', (v) => ((cond(v)?.modo ?? (v.tipo_vinculo === 'contrato' ? 'fijo' : 'hora')) === 'fijo' ? 'Contrato fijo' : 'Por hora'), 't', 13],
      ['sueldo', 'Sueldo base', 'Contrato y remuneración', (v) => cond(v)?.sueldo_base ?? null, '$', 13],
      ['trato', 'Trato del cargo', 'Contrato y remuneración', (v) => cargos.get(cond(v)?.cargo_id)?.trato ?? null, '$', 13],
      ['vhora', 'Valor hora', 'Contrato y remuneración', (v) => cond(v)?.valor_hora ?? null, '$', 11],
    ] : []),
    ['tel', 'Teléfono', 'Contacto', (v) => p(v).telefono, 't', 15],
    ['email', 'Correo', 'Contacto', (v) => p(v).email, 't', 28],
    ['dir', 'Dirección', 'Contacto', (v) => p(v).direccion, 't', 26],
    ['num', 'Número', 'Contacto', (v) => p(v).numero, 't', 8],
    ['pob', 'Población / villa', 'Contacto', (v) => p(v).poblacion, 't', 18],
    ['comuna', 'Comuna', 'Contacto', (v) => p(v).comuna, 't', 15],
    ['region', 'Región', 'Contacto', (v) => p(v).region, 't', 15],
    ['emerg', 'Contacto de emergencia', 'Contacto', (v) => p(v).emergencia, 't', 24],
    ['fnac', 'Fecha nacimiento', 'Datos personales', (v) => fecha(p(v).fecha_nacimiento), 'd', 12],
    ['apat', 'Apellido paterno', 'Datos personales', (v) => p(v).apellido_paterno, 't', 15],
    ['amat', 'Apellido materno', 'Datos personales', (v) => p(v).apellido_materno, 't', 15],
    ['nombres', 'Nombres', 'Datos personales', (v) => p(v).nombres, 't', 18],
    ['sexo', 'Sexo', 'Datos personales', (v) => p(v).sexo, 't', 8],
    ['nac', 'Nacionalidad', 'Datos personales', (v) => p(v).nacionalidad, 't', 12],
    ['edad', 'Edad', 'Datos personales', (v) => edad(p(v).fecha_nacimiento), 'n', 7],
    ['civil', 'Estado civil', 'Datos personales', (v) => p(v).estado_civil, 't', 12],
    ['titulo', 'Título / educación', 'Datos personales', (v) => p(v).titulo_educacion, 't', 20],
    ['inst', 'Institución', 'Datos personales', (v) => p(v).institucion_titulo, 't', 18],
    ['disc', 'Discapacidad', 'Datos personales', (v) => p(v).discapacidad, 't', 11],
    ['inval', 'Invalidez', 'Datos personales', (v) => p(v).invalidez, 't', 10],
    ['afp', 'AFP', 'Previsión y tallas', (v) => p(v).afp, 't', 12],
    ['salud', 'Salud', 'Previsión y tallas', (v) => p(v).salud, 't', 12],
    ['regprev', 'Régimen previsional', 'Previsión y tallas', (v) => p(v).regimen_prev, 't', 14],
    ['afc', 'Régimen AFC', 'Previsión y tallas', (v) => p(v).regimen_afc, 't', 12],
    ['cargas', 'N° cargas', 'Previsión y tallas', (v) => p(v).cargas ?? null, 'n', 8],
    ['tramo', 'Tramo cargas', 'Previsión y tallas', (v) => p(v).tramo_cargas, 't', 10],
    ['botas', 'Talla botas', 'Previsión y tallas', (v) => p(v).tallas?.botas, 't', 9],
    ['ropa', 'Talla ropa', 'Previsión y tallas', (v) => p(v).tallas?.ropa, 't', 9],
    ['banco', 'Banco', 'Datos bancarios', (v) => p(v).banco, 't', 16],
    ['tcta', 'Tipo de cuenta', 'Datos bancarios', (v) => p(v).tipo_cuenta, 't', 14],
    ['ncta', 'N° de cuenta', 'Datos bancarios', (v) => p(v).num_cuenta, 't', 16],
    ['pct', '% al día', 'Documentación', (v) => cumplimiento(datos, v.persona_id).pct / 100, 'p', 9],
  ];
  for (const t of tipos) {
    C.push([`d_${t.slug}`, t.corto || t.nombre, 'Documentación', (v) => est(v, t), 'e', 12]);
    if (t.vence) C.push([`v_${t.slug}`, `${t.corto || t.nombre} vence`, 'Documentación', (v) => { const d = datos.doc(v.persona_id, t.slug); return d?.estado === 'entregado' ? fecha(d.vence) : null; }, 'd', 12]);
  }

  const wb = new ExcelJS.Workbook(); wb.creator = 'ISgestión'; wb.created = hoy;
  const img = logo ? wb.addImage({ base64: logo.dataUrl, extension: logo.formato === 'PNG' ? 'png' : 'jpeg' }) : null;
  const cabecera = (ws, titulo, sub, ncol) => {
    ws.getRow(1).height = 26; ws.getRow(2).height = 18; ws.getRow(3).height = 18;
    if (img != null) ws.addImage(img, { tl: { col: 0.15, row: 0.15 }, ext: { width: Math.round(63 * (logo.ancho / logo.alto)), height: 63 } });
    Object.assign(ws.getCell(1, 3), { value: titulo, font: { name: 'Calibri', size: 16, bold: true, color: { argb: TINTA } } });
    Object.assign(ws.getCell(2, 3), { value: `${e.razon_social} · RUT ${e.rut}`, font: { size: 10, color: { argb: SUAVE } } });
    Object.assign(ws.getCell(3, 3), { value: sub, font: { size: 10, italic: true, color: { argb: SUAVE } } });
    for (let i = 1; i <= ncol; i++) ws.getCell(4, i).fill = relleno(i <= Math.ceil(ncol * 0.7) ? COLOR : NAVY);
    ws.getRow(4).height = 4;
  };
  const cnt = { Activo: lista.filter((v) => v.estado === 'activo').length, Inactivo: lista.filter((v) => v.estado !== 'activo').length };

  // ---------- Hoja Resumen
  const R = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: COLOR } }, views: [{ showGridLines: false }] });
  R.columns = [{ width: 16 }, { width: 34 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  cabecera(R, 'Trabajadores · Resumen', `Exportado el ${fhoy} desde ISgestión`, 7);
  let fila = 6;
  const titulo = (t) => { Object.assign(R.getCell(fila, 2), { value: t, font: { bold: true, size: 12, color: { argb: TINTA } } }); R.getRow(fila).height = 20; fila += 1; };
  const tabla = (cab, filas) => {
    cab.forEach((h, i) => Object.assign(R.getCell(fila, 2 + i), { value: h, fill: relleno(NAVY), font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }, alignment: { vertical: 'middle', horizontal: i ? 'center' : 'left' } }));
    R.getRow(fila).height = 20; fila += 1;
    filas.forEach((f, k) => { f.forEach((v, i) => { const c = R.getCell(fila, 2 + i); c.value = v; c.border = borde; c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle', wrapText: typeof v === 'string' }; if (k % 2) c.fill = relleno(ALT); if (i === 0) c.font = { bold: true, color: { argb: TINTA } }; }); fila += 1; });
    fila += 1;
  };
  [['Total', lista.length, NAVY], ['Activos', cnt.Activo, 'FF16794A'], ['Inactivos', cnt.Inactivo, 'FF6B7390']].forEach(([t, n, c], i) => {
    Object.assign(R.getCell(fila, 2 + i), { value: t, font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }, fill: relleno(c), alignment: { horizontal: 'center' } });
    Object.assign(R.getCell(fila + 1, 2 + i), { value: n, font: { bold: true, size: 20, color: { argb: c } }, alignment: { horizontal: 'center', vertical: 'middle' },
      border: { bottom: { style: 'medium', color: { argb: c } }, left: { style: 'thin', color: { argb: LINEA } }, right: { style: 'thin', color: { argb: LINEA } } } });
  });
  R.getRow(fila + 1).height = 34; fila += 3;
  const porCargo = new Map();
  for (const v of lista) { const k = v.cargo || '(sin cargo)'; const x = porCargo.get(k) ?? { a: 0, i: 0 }; if (v.estado === 'activo') x.a += 1; else x.i += 1; porCargo.set(k, x); }
  titulo('Personas por cargo');
  tabla(['Cargo', 'Activos', 'Inactivos', 'Total'], [...porCargo].sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, x.a, x.i, x.a + x.i]));
  const activos = lista.filter((v) => v.estado === 'activo');
  titulo(`Documentación de activos (${activos.length} personas)`);
  tabla(['Documento', 'Entregado', 'Por vencer', 'Vencido', 'Pendiente', 'No aplica'], tipos.map((t) => {
    const c = { Entregado: 0, 'Por vencer': 0, Vencido: 0, Pendiente: 0, 'No aplica': 0 };
    for (const v of activos) c[est(v, t)] += 1;
    return [t.nombre, c.Entregado, c['Por vencer'], c.Vencido, c.Pendiente, c['No aplica']];
  }));
  const ven = [];
  for (const v of activos) for (const t of tipos) {
    const d = datos.doc(v.persona_id, t.slug);
    if (!d || d.estado !== 'entregado' || !d.vence) continue;
    const n = Math.floor((fecha(d.vence) - hoy) / 864e5);
    if (n <= 60) ven.push([nombreCompleto(p(v)), t.nombre, fecha(d.vence), n < 0 ? `Vencido hace ${-n} d` : n === 0 ? 'Vence hoy' : `En ${n} d`]);
  }
  ven.sort((a, b) => a[2] - b[2]);
  titulo('Vencimientos (vencidos y próximos 60 días)');
  if (ven.length) { const f0 = fila; tabla(['Trabajador', 'Documento', 'Vence', 'Plazo'], ven); for (let q = f0 + 1; q < f0 + 1 + ven.length; q++) R.getCell(q, 4).numFmt = 'dd-mm-yyyy'; } else { Object.assign(R.getCell(fila, 2), { value: 'Sin vencimientos en los próximos 60 días.', font: { italic: true, color: { argb: SUAVE } } }); fila += 2; }
  Object.assign(R.getCell(fila, 2), { value: 'Cómo usar la hoja "Trabajadores": filtra con las flechas de cada título; con los botones + / − sobre las columnas muestras u ocultas cada grupo de datos.', font: { size: 9, italic: true, color: { argb: SUAVE } } });
  R.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };

  // ---------- Hoja Trabajadores
  const nc = C.length + 1; const H = 6;
  const W = wb.addWorksheet('Trabajadores', { properties: { tabColor: { argb: NAVY } }, views: [{ state: 'frozen', xSplit: 3, ySplit: H, showGridLines: false }] });
  W.columns = [{ width: 5 }, ...C.map((c) => ({ width: c[5] }))];
  cabecera(W, 'Trabajadores', `${lista.length} personas · Activos ${cnt.Activo} · Inactivos ${cnt.Inactivo} · exportado el ${fhoy} · Usa + sobre las columnas para ver más datos`, nc);
  for (let ini = 0; ini < C.length;) {
    const g = C[ini][2]; let fin = ini; while (fin + 1 < C.length && C[fin + 1][2] === g) fin += 1;
    const c1 = ini + 2; const c2 = fin + 2;
    if (c2 > c1) W.mergeCells(5, c1, 5, c2);
    W.getColumn(c1).width = Math.max(W.getColumn(c1).width || 10, g.length + 5);
    Object.assign(W.getCell(5, c1), { value: g.toUpperCase(), font: { bold: true, size: 9, color: { argb: 'FFFFB27A' } }, alignment: { horizontal: 'left', vertical: 'middle', indent: 1 } });
    for (let k = c1; k <= c2; k++) { W.getCell(5, k).fill = relleno(DEEP); if (g !== 'Principal' && k > c1) { W.getColumn(k).outlineLevel = 1; W.getColumn(k).hidden = true; } }
    ini = fin + 1;
  }
  W.getCell(5, 1).fill = relleno(DEEP); W.getRow(5).height = 18;
  const hr = W.getRow(H); hr.height = 34;
  ['N°', ...C.map((c) => c[1])].forEach((t, i) => Object.assign(hr.getCell(i + 1), { value: t, fill: relleno(NAVY), font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
    alignment: { vertical: 'middle', horizontal: i ? 'left' : 'center', wrapText: true }, border: { right: { style: 'thin', color: { argb: 'FF2A3190' } } } }));
  lista.forEach((v, r) => {
    const row = W.getRow(H + 1 + r); const off = v.estado !== 'activo';
    Object.assign(row.getCell(1), { value: r + 1, alignment: { horizontal: 'center' }, font: { color: { argb: SUAVE }, size: 10 }, border: borde });
    if (r % 2) row.getCell(1).fill = relleno(ALT);
    C.forEach((c, i) => {
      let x; try { x = c[3](v); } catch { x = null; }
      const cell = row.getCell(i + 2);
      cell.value = x === '' || x === undefined ? null : x;
      if (c[4] === 'd') cell.numFmt = 'dd-mm-yyyy'; else if (c[4] === '$') cell.numFmt = '"$"#,##0'; else if (c[4] === 'p') cell.numFmt = '0%';
      if (c[4] === 'e' && EST[x]) { cell.fill = relleno(EST[x][0]); cell.font = { bold: true, size: 10, color: { argb: EST[x][1] } }; cell.alignment = { horizontal: 'center' }; }
      else {
        cell.font = { size: 10, color: { argb: off ? SUAVE : TINTA }, bold: i === 0 };
        if (c[4] === 'p' && x != null) cell.font = { size: 10, bold: true, color: { argb: x >= 1 ? 'FF16794A' : x >= 0.6 ? 'FFB45309' : 'FFB91C1C' } };
        if (r % 2) cell.fill = relleno(ALT);
      }
      cell.border = borde;
    });
  });
  W.autoFilter = { from: { row: H, column: 1 }, to: { row: H + Math.max(lista.length, 1), column: nc } };
  W.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:6', margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
  W.headerFooter = { oddFooter: `&L&8${nombreEmpresa(e)} · Trabajadores&R&8Página &P de &N` };
  wb.views = [{ activeTab: 0 }];

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `trabajadores-${nombreEmpresa(e).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
