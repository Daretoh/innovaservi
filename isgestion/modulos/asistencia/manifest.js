export default {
  id: 'asistencia',
  nombre: 'Asistencia',
  version: '1.0.0',
  icono: 'reloj',
  categoria: 'Operaciones',
  depende: ['nucleo', 'personas'],
  rubros: ['todos'],
  acciones: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  menu: [
    { id: 'asistencia.horas', label: 'Registro de horas', vista: () => import('./vistas/horas.js?v=9540066') },
    { id: 'asistencia.marcajes', label: 'Marcajes', oculto: true, padre: 'asistencia.horas', vista: () => import('./vistas/marcajes.js?v=9540066') },
    { id: 'asistencia.resumen', label: 'Resumen del mes', icono: 'reloj', vista: () => import('./vistas/resumen.js?v=9540066') },
    { id: 'asistencia.atrasos', label: 'Atrasos y ausencias', icono: 'alerta', vista: () => import('./vistas/atrasos.js?v=9540066') },
  ],
  config: {
    // Atrasos (2026-11-13, Asistencia 009): minutos de gracia antes de contar un atraso o una salida anticipada
    // Asistencia automática de fijos (Asistencia 012): apagada, los fijos con turno marcan en la tablet como todos
    fijos_automatico: { tipo: 'bool', etiqueta: 'Asistencia automática de fijos: quedan presentes según su turno sin marcar', default: true },
    tolerancia_atraso: { tipo: 'number', etiqueta: 'Tolerancia para atrasos y salidas anticipadas (minutos)', default: 5 },
    // Aviso privado a la persona en la tablet al marcar su entrada tarde
    aviso_atraso_tablet: { tipo: 'bool', etiqueta: 'Mostrar el atraso a la persona en la tablet al marcar su entrada', default: true },
    // Aviso al teléfono de quien edita Asistencia
    avisar_atrasos: { tipo: 'bool', etiqueta: 'Avisar al jefe (quien edita Asistencia) cuando alguien marca su entrada tarde', default: false },
    // Vueltas solo a las personas marcadas (sugerencia #142, 2026-11-25, Enzo: por persona, no por cargo); sin ninguna
    // marcada sigue como antes. Guarda persona_id.
    personas_vueltas: { tipo: 'lista', etiqueta: 'Quiénes hacen vueltas (en el Registro de horas el campo Vueltas sale solo a ellos; sin nadie marcado, sale a todos)', default: [],
      cargar: async (ctx) => {
        const { data, error } = await ctx.api.rpc('asis_personas', { p_empresa: ctx.empresa.id });
        if (error) return [];
        return (data ?? []).filter((x) => x.estado === 'activo')
          .map((x) => [x.persona_id, [String(x.nombres ?? '').trim().split(/\s+/)[0], x.apellido_paterno, x.apellido_materno].filter(Boolean).join(' ') + (x.cargo ? ` · ${x.cargo}` : '')])
          .sort((a, b) => a[1].localeCompare(b[1], 'es'));
      } },
  },
  migraciones: ['db/001_asistencia.sql', 'db/002_origen.sql', 'db/003_solo_vueltas.sql', 'db/004_fijos_automatico.sql', 'db/005_condiciones_editar.sql', 'db/006_licencias.sql', 'db/007_sin_salida.sql', 'db/008_sin_entrada.sql', 'db/009_puntualidad.sql', 'db/010_motivo_salida.sql', 'db/011_solo_fijos.sql', 'db/012_fijos_opcion.sql'],
};
