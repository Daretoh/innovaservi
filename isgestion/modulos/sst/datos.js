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
  let q = ctx.api.from('persona_empresa').select('persona_id, cargo, estado, personas(nombres, apellido_paterno, apellido_materno, rut)')
    .eq('empresa_id', ctx.empresa.id).is('deleted_at', null);
  if (!todas) q = q.eq('estado', 'activo');
  const { data, error } = await q;
  if (error) throw error;
  const lista = data.map((v) => ({ id: v.persona_id, cargo: v.cargo, estado: v.estado, rut: v.personas?.rut, nombre: nombreCompleto(v.personas) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { lista, de: new Map(lista.map((p) => [p.id, p])) };
}

export async function cargarConfig(ctx) {
  const { data, error } = await ctx.api.from('sst_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle();
  if (error) throw error;
  return data ?? { cargo_rep: 'Representante legal' };
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
