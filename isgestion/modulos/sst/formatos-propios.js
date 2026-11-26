// Formatos de terreno nuestros (Documentos preventivos de la categoría "Formatos de terreno…", ej.: AST, permiso de trabajo
// crítico, control y cierre y medición de gases de Sal Lobos) impresos con los datos de una faena-día: fecha, hora,
// supervisor, trabajadores (nombre, RUT y cargo), quién ingresa al estanque, vigía, operador del medidor y rescate.
// Las firmas y lo que se mide en terreno quedan en blanco. Se arma un PDF nuevo desde el contenido de la versión vigente;
// la versión guardada no cambia.
import { abrirFormulario } from '../../core/ui/modal.js?v=cd68dd0';
import { fechaLarga } from '../../core/ui/formato.js?v=cd68dd0';
import { datosDeFaena } from './formatos.js?v=cd68dd0';
import { exportarPdf } from './revisar-ia.js?v=cd68dd0';

const vacia = (cols) => cols.map(() => '');
const idx = (cols, re) => cols.findIndex((c) => re.test(String(c)));

// Escribe los datos en las tablas del documento (sin tocar textos ni lo que se completa en terreno)
export function rellenarContenido(doc, x) {
  const c = structuredClone(doc);
  const gente = x.personas ?? [];
  for (const s of c.secciones ?? []) for (const b of s.bloques ?? []) {
    if (b.tipo !== 'tabla') continue;
    const cols = b.columnas ?? []; const filas = b.filas ?? [];
    // Tabla Dato | Detalle (identificación, equipo de medición)
    if (/^dato$/i.test(cols[0] ?? '')) {
      for (const f of filas) {
        const k = String(f[0] ?? '');
        const v = /^fecha$/i.test(k) ? x.fecha : /^supervisor/i.test(k) ? x.supervisor : /^hora de inicio/i.test(k) ? x.hora
          : /^operador/i.test(k) ? x.operador : null;
        if (v) f[1] = v;
      }
      continue;
    }
    // Lista de trabajadores con nombre y RUT (AST): una fila por persona y dos vacías para quien se sume
    const iNom = idx(cols, /^nombre/i), iRut = idx(cols, /^ru[tn]/i);
    if (iNom >= 0 && iRut >= 0 && gente.length) {
      const iN = idx(cols, /^n°/i), iCar = idx(cols, /^cargo/i);
      const nuevas = gente.map((p, i) => { const f = vacia(cols); if (iN >= 0) f[iN] = String(i + 1); f[iNom] = p.nombre; f[iRut] = p.rut; if (iCar >= 0) f[iCar] = p.cargo; return f; });
      while (nuevas.length < Math.max(filas.length, gente.length + 2)) { const f = vacia(cols); if (iN >= 0) f[iN] = String(nuevas.length + 1); nuevas.push(f); }
      b.filas = nuevas;
      continue;
    }
    // Registro de ingreso y salida: quienes ingresan al estanque (o toda la cuadrilla)
    if (/^trabajador$/i.test(cols[0] ?? '')) {
      const nombres = x.entran?.length ? x.entran : gente.map((p) => p.nombre);
      if (!nombres.length) continue;
      const nuevas = nombres.map((n) => { const f = vacia(cols); f[0] = n; return f; });
      while (nuevas.length < Math.max(filas.length, nombres.length + 3)) nuevas.push(vacia(cols));
      b.filas = nuevas;
      continue;
    }
    // Responsables: Función | Nombre | Firma
    if (/^funci[oó]n$/i.test(cols[0] ?? '')) {
      const iNombre = idx(cols, /^nombre/i);
      if (iNombre < 0) continue;
      for (const f of filas) {
        const k = String(f[0] ?? '');
        const v = /ingresa/i.test(k) ? (x.entran ?? []).join(', ') : /^supervisor/i.test(k) ? x.supervisor : /vig[ií]a/i.test(k) ? x.vigia
          : /medidor|gases/i.test(k) ? x.operador : /rescate/i.test(k) ? x.rescate : null;
        if (v) f[iNombre] = v;
      }
    }
  }
  return c;
}

// Pregunta los roles del día y abre el PDF del formato con los datos de la faena
export async function imprimirConFaena(ctx, doc, { faenaId, fecha }) {
  const contenido = doc.vigente?.contenido ?? null;
  if (!contenido?.secciones?.length) throw new Error('Este formato no tiene contenido editable. Ábrelo en Editar y guarda una versión.');
  const [d, { data: vinc }] = await Promise.all([
    datosDeFaena(ctx, faenaId, fecha),
    ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno, rut)').eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
  ]);
  const nombreDe = (p) => [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ');
  const activos = (vinc ?? []).filter((x) => x.estado === 'activo' && x.personas).map((x) => ({ id: x.persona_id, nombre: nombreDe(x.personas), cargo: x.cargo ?? '' }))
    .filter((x) => !d.personas.some((p) => p.id === x.id)).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const ops = [['', '(en blanco, se escribe en terreno)'], ...d.personas.map((p) => [p.nombre, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''}`]),
    ...activos.map((p) => [p.nombre, `${p.nombre}${p.cargo ? ` · ${p.cargo}` : ''} (no está en la faena)`])];
  const supervisor = d.supervisor || activos.find((p) => /supervisor/i.test(p.cargo))?.nombre || '';
  // Solo se preguntan los roles que el formato rellena (filas de Responsables o Dato, o el registro de ingreso)
  const tablas = (contenido.secciones ?? []).flatMap((s) => (s.bloques ?? []).filter((b) => b.tipo === 'tabla'));
  const filasDe = (re) => tablas.filter((t) => re.test(t.columnas?.[0] ?? '')).flatMap((t) => (t.filas ?? []).map((f) => String(f[0] ?? '')));
  const roles = [...filasDe(/^funci[oó]n$/i), ...filasDe(/^dato$/i)];
  const usa = (re) => roles.some((k) => re.test(k));
  const registroIngreso = tablas.some((t) => /^trabajador$/i.test(t.columnas?.[0] ?? ''));
  return abrirFormulario({
      titulo: `Imprimir ${doc.titulo} con la faena`,
      mensaje: [`Faena del ${fechaLarga(fecha)}. Se completan la fecha, la hora y los trabajadores; las firmas y las mediciones quedan en blanco.`,
        d.gente_de ? `Ese día aún no tiene gente planificada: se usan los trabajadores del ${fechaLarga(d.gente_de)}.` : null,
        d.personas.length ? null : 'La faena no tiene gente planificada: la lista de trabajadores queda en blanco.'].filter(Boolean).join(' '),
      campos: [
        { id: 'supervisor', etiqueta: 'Supervisor', opciones: ops.some(([k]) => k === supervisor) ? ops : [...ops, [supervisor, supervisor]], valor: supervisor },
        (usa(/ingresa/i) || registroIngreso) && d.personas.length ? { id: 'entran', etiqueta: 'Quiénes ingresan al estanque', ayuda: 'Van en el permiso y en el registro de ingreso y salida. Sin marcar, el registro lleva a toda la cuadrilla.', tipo: 'checks', opciones: d.personas.map((p) => [p.nombre, p.nombre]), valor: [] } : null,
        usa(/vig[ií]a/i) ? { id: 'vigia', etiqueta: 'Vigía en el exterior', opciones: ops } : null,
        usa(/^operador/i) ? { id: 'operador', etiqueta: 'Operador del medidor de gases', opciones: ops } : null,
        usa(/rescate/i) ? { id: 'rescate', etiqueta: 'Responsable del rescate', opciones: ops } : null,
      ].filter(Boolean),
      textoGuardar: 'Imprimir',
      alGuardar: async (r) => {
        const v = window.open('', '_blank');
        const lleno = rellenarContenido(contenido, { fecha: fecha.split('-').reverse().join('-'), hora: d.hora_inicio, supervisor: r.supervisor, personas: d.personas,
          entran: r.entran ?? [], vigia: r.vigia, operador: r.operador, rescate: r.rescate });
        const blob = await exportarPdf(ctx, lleno);
        const u = URL.createObjectURL(blob);
        if (v && !v.closed) v.location = u; else window.open(u, '_blank', 'noopener');
      },
  });
}
