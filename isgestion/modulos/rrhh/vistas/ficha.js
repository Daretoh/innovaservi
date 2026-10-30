// Ficha de un trabajador: documentación (con archivos privados) y datos personales.
// Ruta: #/rrhh.ficha?p=<persona_id>
import { el } from '../../../core/ui/dom.js?v=245d3ab';
import { icono } from '../../../core/ui/iconos.js?v=245d3ab';
import { boton } from '../../../core/ui/tabla.js?v=245d3ab';
import { abrirFormulario } from '../../../core/ui/modal.js?v=245d3ab';
import { leerVence } from '../../../core/ui/leer-vence.js?v=245d3ab';
import { avisar } from '../../../core/ui/aviso.js?v=245d3ab';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=245d3ab';
import { cargarActividad, resumen, panelActividad } from '../actividad.js?v=245d3ab';
import { cargarRrhh, cumplimiento, estadoDoc, chipEstado, avatar, nombreCompleto, nivel, VINCULOS, nombreVinculo } from '../datos.js?v=245d3ab';

const TIPOS_ARCHIVO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_ARCHIVO = 10 * 1024 * 1024;
let pestana = 'docs';

const fecha = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-CL') : '');

export default async function vista(ctx) {
  const personaId = ctx.params.p;
  const datos = await cargarRrhh(ctx, { personaId });
  const v = datos.vinculos[0];
  if (!v) {
    return el('section', {}, el('h1', {}, 'Persona no encontrada'),
      el('p', { class: 'texto-suave' }, 'No tiene vínculo con esta empresa o tu rol no puede verla.'),
      el('a', { href: ctx.ruta('rrhh.trabajadores') }, 'Volver a Trabajadores'));
  }
  const p = v.personas;
  const c = cumplimiento(datos, personaId);

  const pestanas = [['docs', 'Documentación'], ['actividad', 'Actividad'], ['datos', 'Datos personales']];
  const barra = el('div', { class: 'pestanas', role: 'tablist' }, pestanas.map(([id, t]) =>
    el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(pestana === id),
      onclick: () => { pestana = id; ctx.refrescar(); },
    }, t)));

  return el('section', { class: 'listado' },
    el('a', { class: 'volver', href: ctx.ruta('rrhh.trabajadores') }, icono('volver', { tam: 16 }), 'Trabajadores'),
    el('header', { class: 'ficha-cabecera' },
      avatar(p, c.pct, 68),
      el('div', {},
        el('h1', {}, nombreCompleto(p)),
        el('p', { class: 'texto-suave' }, [v.cargo, nombreVinculo[v.tipo_vinculo], p.rut].filter(Boolean).join(' · ')),
        el('p', {},
          el('strong', { class: `pct-${nivel(c.pct)}` }, `${c.pct}% de documentación al día`),
          el('span', { class: 'texto-suave' }, ` · ${c.ok} de ${c.n} vigentes`),
          c.venc ? el('span', { class: 'pct-mal' }, ` · ${c.venc} vencido${c.venc === 1 ? '' : 's'}`) : null,
          c.prox ? el('span', { class: 'pct-medio' }, ` · ${c.prox} por vencer`) : null)),
      el('div', { class: 'tp-chips' },
        ctx.config.usa_buk ? el('span', { class: `chip chip-buk ${v.buk ? 'activo' : ''}` }, v.buk ? icono('check', { tam: 14 }) : null, v.buk ? 'En Buk' : 'Sin Buk') : null,
        el('span', { class: `chip ${v.estado === 'activo' ? 'chip-ok' : 'chip-na'}` }, v.estado === 'activo' ? 'Activo' : 'Inactivo'))),
    barra,
    pestana === 'docs' ? documentacion(ctx, datos, v)
      : pestana === 'actividad' ? panelActividad(resumen((await cargarActividad(ctx, { persona: personaId })).get(personaId)))
        : datosPersonales(ctx, v),
  );
}

// ---------------------------------------------------------------- Documentación

function documentacion(ctx, datos, v) {
  const puede = ctx.puede('rrhh', 'editar') || ctx.puede('rrhh', 'crear');
  if (!datos.tiposActivos.length) {
    return el('p', { class: 'texto-suave' }, 'No hay tipos de documento configurados en esta empresa.');
  }
  const grupos = [['documento', 'Documentos'], ['capacitacion', 'Capacitaciones y cursos']];
  return el('div', { class: 'doc-grupos' }, grupos.map(([cat, titulo]) => {
    const tipos = datos.tiposActivos.filter((t) => t.categoria === cat);
    if (!tipos.length) return null;
    return el('div', { class: 'ficha doc-grupo' },
      el('h2', {}, titulo),
      tipos.map((t) => filaDoc(ctx, t, datos.doc(v.persona_id, t.slug), v, puede)));
  }));
}

function filaDoc(ctx, tipo, doc, v, puede) {
  const e = estadoDoc(tipo, doc);
  const detalle = [
    doc?.fecha ? `Entregado ${fecha(doc.fecha)}` : null,
    doc?.vence ? `Vence ${fecha(doc.vence)}` : null,
    doc?.nota || null,
  ].filter(Boolean).join(' · ');
  const ver = (ruta, texto) => el('button', {
    type: 'button', class: 'boton-enlace',
    onclick: async () => {
      try { window.open(await urlFirmada(ctx.api, ruta, 120), '_blank', 'noopener'); } catch (err) { avisar(err.message, 'error'); }
    },
  }, icono('ojo', { tam: 15 }), texto);

  return el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' },
      el('strong', {}, tipo.nombre),
      tipo.ambito === 'persona'
        ? el('span', { class: 'etiqueta', title: 'Se sube una vez y sirve para todas las empresas del grupo' }, 'Personal')
        : null,
      !tipo.cuenta ? el('span', { class: 'etiqueta etiqueta-apagada', title: 'No suma al % de cumplimiento' }, 'No cuenta') : null),
    chipEstado(e),
    detalle ? el('span', { class: 'texto-suave doc-detalle' }, detalle) : null,
    el('div', { class: 'doc-acciones' },
      doc?.archivo ? ver(doc.archivo, tipo.slug === 'cedula' ? 'Frente' : 'Ver') : null,
      doc?.archivo2 ? ver(doc.archivo2, 'Reverso') : null,
      // Generador de documentos (si la empresa lo tiene): contrato, perfil, ficha de datos, EPP, IRL y entregas de PTS
      ctx.puede('documentos', 'ver') && /^(contrato|perfil|datos|epp|odi|pts_)/.test(tipo.slug) ? el('button', {
        type: 'button', class: 'boton-icono', title: 'Generar con el formato de la empresa', 'aria-label': `Generar ${tipo.nombre}`,
        onclick: async () => {
          try {
            const { generarParaTrabajador, sePuedeGenerar } = await import('../../documentos/integracion.js?v=245d3ab');
            if (!sePuedeGenerar(ctx, tipo.slug)) { avisar('No hay formato para este documento.', 'error'); return; }
            await generarParaTrabajador(ctx, tipo.slug, v.persona_id);
          } catch (err) { avisar(err.message, 'error'); }
        },
      }, icono('documento', { tam: 16 })) : null,
      puede ? el('button', {
        type: 'button', class: 'boton-icono', title: 'Actualizar documento', 'aria-label': `Actualizar ${tipo.nombre}`,
        onclick: () => editarDoc(ctx, tipo, doc, v),
      }, icono('editar', { tam: 16 })) : null),
  );
}

function editarDoc(ctx, tipo, doc, v) {
  const personal = tipo.ambito === 'persona';
  const estados = [['pendiente', 'Pendiente'], ['entregado', 'Entregado'], ...(tipo.permite_na ? [['no_aplica', 'No aplica']] : [])];
  const campos = [
    { id: 'estado', etiqueta: 'Estado', opciones: estados, valor: doc?.estado ?? 'entregado' },
    { id: 'fecha', etiqueta: 'Fecha de entrega', tipo: 'date', valor: doc?.fecha ?? new Date().toISOString().slice(0, 10) },
    ...(tipo.vence ? [{ id: 'vence', etiqueta: 'Fecha de vencimiento', tipo: 'date', valor: doc?.vence ?? '',
      // Lee el vencimiento del archivo elegido o, si no se eligió, del que ya está guardado
      accion: leerVence({
        cedula: tipo.slug === 'cedula', rut: v.personas?.rut, tipo: tipo.slug,
        fuentes: async (x) => {
          const ya = async (ruta) => (ruta ? urlFirmada(ctx.api, ruta, 300) : null);
          return tipo.slug === 'cedula'
            ? [x.archivo2?.size ? x.archivo2 : await ya(doc?.archivo2), x.archivo?.size ? x.archivo : await ya(doc?.archivo)]
            : [x.archivo?.size ? x.archivo : await ya(doc?.archivo)];
        },
      }) }] : []),
    {
      id: 'archivo', etiqueta: tipo.slug === 'cedula' ? 'Archivo (frente)' : 'Archivo', tipo: 'file', accept: TIPOS_ARCHIVO.join(','),
      ayuda: doc?.archivo ? 'Ya tiene archivo. Si subes otro, reemplaza al actual. PDF o imagen, máx. 10 MB.' : 'PDF o imagen, máx. 10 MB.',
    },
    ...(tipo.slug === 'cedula' ? [{ id: 'archivo2', etiqueta: 'Archivo (reverso)', tipo: 'file', accept: TIPOS_ARCHIVO.join(',') }] : []),
    { id: 'nota', etiqueta: 'Nota', valor: doc?.nota ?? '' },
  ];

  abrirFormulario({
    titulo: tipo.nombre,
    mensaje: personal ? 'Documento personal: sirve para todas las empresas del grupo donde trabaja esta persona.' : null,
    campos,
    alGuardar: async (val) => {
      if (val.estado === 'entregado' && tipo.vence && !val.vence) throw new Error('Indica la fecha de vencimiento.');
      const destino = personal ? { personaId: v.persona_id } : { empresaId: ctx.empresa.id };
      const subir = async (archivo) => (archivo && archivo.size
        ? (await subirArchivo(ctx.api, { ...destino, modulo: 'rrhh', archivo, tabla: 'rrhh_documentos', tipos: TIPOS_ARCHIVO, maxBytes: MAX_ARCHIVO })).ruta
        : null);
      const nuevo1 = await subir(val.archivo);
      const nuevo2 = await subir(val.archivo2);

      const cambios = {
        estado: val.estado,
        fecha: val.estado === 'entregado' ? val.fecha || null : null,
        vence: val.estado === 'entregado' && tipo.vence ? val.vence || null : null,
        nota: val.nota.trim() || null,
        ...(nuevo1 ? { archivo: nuevo1 } : {}),
        ...(nuevo2 ? { archivo2: nuevo2 } : {}),
      };
      const r = doc
        ? await ctx.api.from('rrhh_documentos').update(cambios).eq('id', doc.id).select('id')
        : await ctx.api.from('rrhh_documentos').insert({
          empresa_id: personal ? null : ctx.empresa.id, persona_id: v.persona_id, tipo_slug: tipo.slug, ...cambios,
        }).select('id');
      if (r.error || !r.data?.length) {
        // No dejar archivos sueltos si el registro falló.
        for (const ruta of [nuevo1, nuevo2]) if (ruta) await eliminarArchivo(ctx.api, ruta).catch(() => {});
        throw new Error(r.error?.message ?? 'No tienes permiso para guardar este documento.');
      }
      // Los archivos reemplazados ya no se usan (salvo un registro firmado compartido, ej. de SST).
      if (nuevo1 && doc?.archivo) await borrarSiNoSeUsa(ctx, doc.archivo);
      if (nuevo2 && doc?.archivo2) await borrarSiNoSeUsa(ctx, doc.archivo2);
      avisar('Documento actualizado.');
      ctx.refrescar();
    },
  });
}

// ---------------------------------------------------------------- Datos personales

const SECCIONES = [
  ['Identificación', [
    ['nombres', 'Nombres', { requerido: true }], ['apellido_paterno', 'Apellido paterno', { requerido: true }],
    ['apellido_materno', 'Apellido materno'], ['fecha_nacimiento', 'Fecha de nacimiento', { tipo: 'date' }],
    ['sexo', 'Sexo', { opciones: [['', '—'], ['F', 'Femenino'], ['M', 'Masculino'], ['X', 'Otro']] }],
    ['nacionalidad', 'Nacionalidad'], ['estado_civil', 'Estado civil'],
  ]],
  ['Contacto', [
    ['telefono', 'Teléfono', { tipo: 'tel' }], ['email', 'Correo', { tipo: 'email' }],
    ['direccion', 'Dirección'], ['numero', 'Número'], ['poblacion', 'Población o villa'],
    ['comuna', 'Comuna'], ['region', 'Región'], ['emergencia', 'Contacto de emergencia (nombre y teléfono)'],
  ]],
  ['Previsión y salud', [
    ['afp', 'AFP'], ['salud', 'Salud (Fonasa o Isapre)'], ['regimen_prev', 'Régimen previsional'],
    ['regimen_afc', 'Seguro de cesantía (AFC)'], ['cargas', 'Cargas familiares', { tipo: 'number' }],
    ['tramo_cargas', 'Tramo de asignación familiar'], ['discapacidad', 'Discapacidad'], ['invalidez', 'Pensión de invalidez'],
  ]],
  ['Datos bancarios', [['banco', 'Banco'], ['tipo_cuenta', 'Tipo de cuenta'], ['num_cuenta', 'Número de cuenta']]],
  ['Educación', [['titulo_educacion', 'Título o nivel'], ['institucion_titulo', 'Institución']]],
  ['Tallas', [['talla_ropa', 'Ropa'], ['talla_botas', 'Calzado']]],
];
const ESTADOS_VINCULO = [['activo', 'Activo'], ['inactivo', 'Inactivo']];

function datosPersonales(ctx, v) {
  const p = v.personas;
  const editable = ctx.puede('personas', 'editar');
  const valorPersona = (id) => (id === 'talla_ropa' ? p.tallas?.ropa : id === 'talla_botas' ? p.tallas?.botas : p[id]);
  const mensaje = el('p', { class: 'texto-error', role: 'alert' });
  const guardar = boton('Guardar cambios', { tipo: 'primario', type: 'submit' });

  const control = (nombre, valor, op = {}) => (op.opciones
    ? el('select', { id: `fd-${nombre}`, name: nombre, class: 'campo', disabled: !editable },
        op.opciones.map(([val, t]) => el('option', { value: val, selected: String(valor ?? '') === val }, t)))
    : el('input', { id: `fd-${nombre}`, name: nombre, class: 'campo', type: op.tipo ?? 'text', value: valor ?? '', required: op.requerido, disabled: !editable, min: op.tipo === 'number' ? 0 : null }));
  const fila = (nombre, etiqueta, valor, op) => el('div', { class: 'form-fila' }, el('label', { for: `fd-${nombre}` }, etiqueta), control(nombre, valor, op));

  // Vence contrato + casilla Indefinido (al marcarla se limpia y bloquea la fecha)
  function filaContrato() {
    const fechaC = el('input', { id: 'fd-v.contrato_vence', name: 'v.contrato_vence', class: 'campo', type: 'date', value: v.contrato_indefinido ? '' : v.contrato_vence ?? '', disabled: !editable || v.contrato_indefinido });
    const indef = el('input', { type: 'checkbox', name: 'v.contrato_indefinido', checked: !!v.contrato_indefinido, disabled: !editable });
    indef.addEventListener('change', () => { if (indef.checked) fechaC.value = ''; fechaC.disabled = !editable || indef.checked; });
    return el('div', { class: 'form-fila' }, el('label', { for: 'fd-v.contrato_vence' }, 'Vence contrato'), fechaC, el('label', { class: 'casilla' }, indef, 'Indefinido (sin fecha de término)'));
  }

  const form = el('form', { class: 'ficha-datos' },
    el('div', { class: 'ficha' },
      el('h2', {}, 'Vínculo con esta empresa'),
      el('div', { class: 'rejilla-campos' },
        fila('v.cargo', 'Cargo', v.cargo),
        fila('v.tipo_vinculo', 'Vínculo', v.tipo_vinculo, { opciones: VINCULOS }),
        fila('v.jornada', 'Jornada', v.jornada),
        fila('v.estado', 'Estado', v.estado, { opciones: ESTADOS_VINCULO }),
        fila('v.fecha_ingreso', 'Fecha de ingreso', v.fecha_ingreso, { tipo: 'date' }),
        fila('v.fecha_termino', 'Fecha de término', v.fecha_termino, { tipo: 'date' }),
        filaContrato()),
      el('p', { class: 'texto-suave texto-chico' }, 'Vence contrato: fecha de término del contrato a plazo fijo (se copia de Buk). Indefinido: sin fecha de término. Vacío y sin marcar: spot. Aparece en Inicio y Alertas 30 días antes.')),
    SECCIONES.map(([titulo, campos]) => el('div', { class: 'ficha' },
      el('h2', {}, titulo),
      el('div', { class: 'rejilla-campos' },
        titulo === 'Identificación' ? fila('rut', 'RUT', p.rut, {}) : null,
        campos.map(([id, etiqueta, op]) => fila(`p.${id}`, etiqueta, valorPersona(id), op))))),
    mensaje,
    editable
      ? el('div', {}, guardar, el('span', { class: 'texto-suave' }, '  Los datos personales se comparten con las otras empresas del grupo donde trabaja.'))
      : el('p', { class: 'texto-suave' }, 'Tu rol solo permite ver estos datos.'),
  );
  form.querySelector('[name="rut"]').disabled = true;

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    mensaje.textContent = '';
    guardar.disabled = true;
    const f = Object.fromEntries(new FormData(form));
    const persona = {};
    for (const [, campos] of SECCIONES) {
      for (const [id] of campos) {
        if (id === 'talla_ropa' || id === 'talla_botas') continue;
        const val = (f[`p.${id}`] ?? '').trim();
        persona[id] = id === 'cargas' ? (val === '' ? null : Number(val)) : (val || null);
      }
    }
    persona.tallas = { ...(p.tallas ?? {}), ropa: f['p.talla_ropa'].trim() || undefined, botas: f['p.talla_botas'].trim() || undefined };
    const vinculo = {
      cargo: f['v.cargo'].trim() || null, tipo_vinculo: f['v.tipo_vinculo'], jornada: f['v.jornada'].trim() || null,
      estado: f['v.estado'], fecha_ingreso: f['v.fecha_ingreso'] || null, fecha_termino: f['v.fecha_termino'] || null,
      contrato_indefinido: f['v.contrato_indefinido'] === 'on', contrato_vence: f['v.contrato_indefinido'] === 'on' ? null : f['v.contrato_vence'] || null,
    };
    const [r1, r2] = await Promise.all([
      ctx.api.from('personas').update(persona).eq('id', p.id).select('id'),
      ctx.api.from('persona_empresa').update(vinculo).eq('id', v.id).select('id'),
    ]);
    guardar.disabled = false;
    const err = r1.error ?? r2.error;
    if (err) { mensaje.textContent = err.message; return; }
    if (!r1.data?.length || !r2.data?.length) { mensaje.textContent = 'No tienes permiso para cambiar estos datos.'; return; }
    avisar('Datos guardados.');
    ctx.refrescar();
  });
  return form;
}

// Un registro firmado de una entrega (SST) es un solo archivo para varias personas: solo se borra
// si nadie más lo usa y no fue subido por otro registro.
async function borrarSiNoSeUsa(ctx, ruta) {
  const [otros, adj] = await Promise.all([
    ctx.api.from('rrhh_documentos').select('id', { count: 'exact', head: true }).or(`archivo.eq.${ruta},archivo2.eq.${ruta}`).is('deleted_at', null),
    ctx.api.from('adjuntos').select('tabla').eq('ruta', ruta).maybeSingle(),
  ]);
  if (otros.error || otros.count || (adj.data?.tabla && adj.data.tabla !== 'rrhh_documentos')) return;
  await eliminarArchivo(ctx.api, ruta).catch(() => {});
}
