// Datos y utilidades compartidas de Prevención SST.

export const SINTOMAS = ['Dolor de cabeza', 'Dolor estomacal', 'Resfrío o congestión nasal', 'Dolor muscular', 'Dolor de oído',
  'Fiebre', 'Mareos', 'Cólicos', 'Fatiga y decaimiento', 'Malestar general'];
export const TRASLADOS = ['Por sus propios medios', 'Acompañado por un familiar', 'Acompañado por personal de la empresa', 'En vehículo de la empresa', 'Ambulancia'];
export const TIPOS_ACC = [['trabajo', 'Accidente del trabajo'], ['trayecto', 'Accidente de trayecto'], ['enfermedad', 'Enfermedad profesional'], ['incidente', 'Incidente (sin lesión)']];
export const GRAVEDAD = [['leve', 'Leve'], ['grave', 'Grave'], ['fatal', 'Fatal']];
export const TIPOS_ENTREGA = [['capacitacion', 'Capacitación'], ['charla', 'Charla'], ['epp', 'Entrega de EPP'], ['pts', 'Entrega de PTS'], ['otro', 'Otro']];
export const nombreDe = (lista) => Object.fromEntries(lista);

export const nombreCompleto = (p) => (p ? [p.nombres, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ') : '');
export const nombreTercero = (t) => t?.nombre_fantasia || t?.razon_social || '';

// Mes "AAAA-MM"
export const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const mesTexto = (p) => {
  const [a, m] = p.split('-').map(Number);
  return `${new Date(a, m - 1, 1).toLocaleDateString('es-CL', { month: 'long' })} del ${a}`;
};

// Personas con vínculo en la empresa (activas primero), con cargo y RUT
export async function cargarPersonas(ctx, { todas = false } = {}) {
  let q = ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno, rut, telefono)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null);
  if (!todas) q = q.eq('estado', 'activo');
  const { data, error } = await q;
  if (error) throw error;
  const lista = data.map((v) => ({ id: v.persona_id, cargo: v.cargo, estado: v.estado, rut: v.personas?.rut, telefono: v.personas?.telefono, nombre: nombreCompleto(v.personas) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { lista, de: new Map(lista.map((p) => [p.id, p])) };
}

// Representante, firma y timbre: los de "Datos y firmas" (gen_config, lo mismo que usan los documentos del generador);
// lo que falte ahí sale de la configuración antigua de Prevención (sst_config). Sin permiso para leer una, se usa la otra.
export async function cargarConfig(ctx, empresaId = ctx.empresa.id) {
  const [sst, gen] = await Promise.all([
    ctx.api.from('sst_config').select('*').eq('empresa_id', empresaId).maybeSingle().then((r) => r, () => ({ data: null })),
    ctx.api.from('gen_config').select('representante, rep_cargo, firma_ruta, timbre_ruta, prevencionista, prev_cargo, firma_prev_ruta').eq('empresa_id', empresaId).maybeSingle().then((r) => r, () => ({ data: null })),
  ]);
  const a = sst.data ?? {}; const g = gen.data ?? {};
  return { ...a, representante: g.representante || a.representante || null, cargo_rep: g.rep_cargo || a.cargo_rep || 'Representante legal',
    firma_ruta: g.firma_ruta || a.firma_ruta || null, timbre_ruta: g.timbre_ruta || a.timbre_ruta || null,
    prevencionista: g.prevencionista || null, prev_cargo: g.prev_cargo || null, firma_prev_ruta: g.firma_prev_ruta || null };
}

export async function cargarClientes(ctx) {
  const [t, m] = await Promise.all([
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, rut, direccion').eq('empresa_id', ctx.empresa.id)
      .is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('sst_mandantes').select('*').eq('empresa_id', ctx.empresa.id),
  ]);
  if (t.error) throw t.error;
  if (m.error) throw m.error;
  const mand = new Map(m.data.map((x) => [x.tercero_id, x]));
  return t.data.map((c) => ({ ...c, nombre: nombreTercero(c), mandante: mand.get(c.id) ?? null }));
}
