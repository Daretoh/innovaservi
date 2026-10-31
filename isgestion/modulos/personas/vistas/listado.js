// Personas con vínculo en la empresa activa.
import { el } from '../../../core/ui/dom.js?v=7860387';
import { listado, boton } from '../../../core/ui/tabla.js?v=7860387';
import { abrirFormulario } from '../../../core/ui/modal.js?v=7860387';
import { avisar } from '../../../core/ui/aviso.js?v=7860387';

const VINCULOS = [['contrato', 'Contrato'], ['spot', 'Spot'], ['honorarios', 'Honorarios'], ['practica', 'Práctica']];
const nombreVinculo = Object.fromEntries(VINCULOS);

export default async function vista(ctx) {
  const { data, error } = await ctx.api
    .from('persona_empresa')
    .select('id, cargo, tipo_vinculo, estado, fecha_ingreso, personas(rut, nombres, apellido_paterno, apellido_materno)')
    .eq('empresa_id', ctx.empresa.id)
    .is('deleted_at', null)
    .order('fecha_ingreso', { ascending: false });
  if (error) throw error;

  const acciones = [];
  if (ctx.puede('personas', 'exportar') && data.length) {
    acciones.push(boton('Exportar PDF', { icono: 'descargar', onclick: (ev) => exportarPdf(ctx, data, ev.currentTarget) }));
  }
  if (ctx.puede('personas', 'crear')) {
    acciones.push(boton('Nueva persona', { icono: 'mas', tipo: 'primario', onclick: () => nueva(ctx) }));
  }

  return listado({
    titulo: 'Personas',
    filas: data,
    acciones,
    vacio: 'Esta empresa aún no tiene personas registradas.',
    columnas: [
      { titulo: 'RUT', valor: (f) => f.personas.rut },
      { titulo: 'Nombre', valor: (f) => [f.personas.nombres, f.personas.apellido_paterno, f.personas.apellido_materno].filter(Boolean).join(' ') },
      { titulo: 'Cargo', valor: (f) => f.cargo },
      { titulo: 'Vínculo', valor: (f) => el('span', { class: 'etiqueta' }, nombreVinculo[f.tipo_vinculo] ?? f.tipo_vinculo) },
      { titulo: 'Ingreso', valor: (f) => f.fecha_ingreso },
      { titulo: 'Estado', valor: (f) => (f.estado === 'activo' ? 'Activo' : 'Inactivo') },
    ],
  });
}

async function exportarPdf(ctx, filas, boton) {
  boton.disabled = true;
  try {
    const { nuevoPdf } = await import('../../../core/pdf.js?v=7860387');
    const pdf = await nuevoPdf(ctx, { titulo: 'Nómina de personas' });
    pdf.tabla({
      columnas: ['RUT', 'Nombre', 'Cargo', 'Vínculo', 'Ingreso', 'Estado'],
      filas: filas.map((f) => [
        f.personas.rut,
        [f.personas.nombres, f.personas.apellido_paterno, f.personas.apellido_materno].filter(Boolean).join(' '),
        f.cargo,
        nombreVinculo[f.tipo_vinculo] ?? f.tipo_vinculo,
        f.fecha_ingreso ? new Date(`${f.fecha_ingreso}T00:00`).toLocaleDateString('es-CL') : '',
        f.estado === 'activo' ? 'Activo' : 'Inactivo',
      ]),
    });
    pdf.guardar('nomina-personas');
  } catch (e) {
    avisar(`No se pudo generar el PDF: ${e.message}`, 'error');
  } finally {
    boton.disabled = false;
  }
}

function nueva(ctx) {
  abrirFormulario({
    titulo: 'Nueva persona',
    campos: [
      { id: 'rut', etiqueta: 'RUT (ej.: 12.345.678-5)', requerido: true },
      { id: 'nombres', etiqueta: 'Nombres', requerido: true },
      { id: 'apellido_paterno', etiqueta: 'Apellido paterno', requerido: true },
      { id: 'apellido_materno', etiqueta: 'Apellido materno' },
      { id: 'cargo', etiqueta: 'Cargo' },
      { id: 'tipo_vinculo', etiqueta: 'Vínculo', opciones: VINCULOS },
      { id: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'date' },
    ],
    alGuardar: async (v) => {
      const { data: personaId, error } = await ctx.api.rpc('alta_persona', {
        p_empresa: ctx.empresa.id,
        p_rut: v.rut,
        p_nombres: v.nombres.trim(),
        p_apellido_paterno: v.apellido_paterno.trim(),
        p_apellido_materno: v.apellido_materno.trim() || null,
        p_tipo_vinculo: v.tipo_vinculo,
        p_cargo: v.cargo.trim() || null,
        p_fecha_ingreso: v.fecha_ingreso || null,
      });
      if (error) {
        throw new Error(error.code === '23505' ? 'Esta persona ya tiene un vínculo activo en esta empresa.' : error.message);
      }
      // Si el RUT ya estaba (en otra empresa del grupo), se usa esa ficha: avisar si el nombre escrito era otro
      const { data: ya } = await ctx.api.from('personas').select('nombres, apellido_paterno, apellido_materno').eq('id', personaId).maybeSingle();
      const escrito = [v.nombres, v.apellido_paterno, v.apellido_materno].map((x) => (x ?? '').trim().toLowerCase()).filter(Boolean).join(' ');
      const ficha = ya ? [ya.nombres, ya.apellido_paterno, ya.apellido_materno].filter(Boolean).join(' ') : '';
      avisar(ya && ficha.toLowerCase() !== escrito ? `Ese RUT ya estaba registrado como ${ficha}: se usó esa ficha (los datos personales se comparten entre las empresas del grupo).` : 'Persona registrada.');
      ctx.refrescar();
    },
  });
}
