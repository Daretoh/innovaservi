// Diseño de la cotización: validez, información de pago, nota, firma y contactos del pie.
// Logo y color salen de los datos de la empresa.
import { el } from '../../../core/ui/dom.js?v=0e371c2';
import { boton } from '../../../core/ui/tabla.js?v=0e371c2';
import { avisar } from '../../../core/ui/aviso.js?v=0e371c2';
import { cargarConfig } from '../datos.js?v=0e371c2';

const lineas = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

export default async function vista(ctx) {
  const cfg = await cargarConfig(ctx);
  const editable = ctx.puede('cotizaciones', 'editar') && ctx.puede('cotizaciones', 'crear');
  const fila = (id, etiqueta, valor, { largo = false, tipo = 'text', ayuda } = {}) => {
    const c = largo
      ? Object.assign(el('textarea', { class: 'campo', id: `k-${id}`, rows: 4, disabled: !editable }), { value: valor ?? '' })
      : el('input', { class: 'campo', id: `k-${id}`, type: tipo, value: valor ?? '', disabled: !editable, min: tipo === 'number' ? 1 : null });
    return { c, nodo: el('div', { class: 'form-fila' }, el('label', { for: `k-${id}` }, etiqueta), c, ayuda ? el('span', { class: 'texto-suave texto-chico' }, ayuda) : null) };
  };
  const f = {
    validez_dias: fila('validez_dias', 'Validez por defecto (días)', cfg.validez_dias, { tipo: 'number' }),
    pago: fila('pago', 'Información de pago (una línea por dato)', (cfg.pago ?? []).join('\n'), { largo: true, ayuda: 'Razón social, RUT, banco, tipo y N° de cuenta, correo para el comprobante.' }),
    nota: fila('nota', 'Nota al pie', cfg.nota, { largo: true, ayuda: 'Se agrega después de "La cotización es válida por N días".' }),
    firma: fila('firma', 'Nombre bajo la firma', cfg.firma, { ayuda: 'Ej.: Área comercial. Si se deja vacío no se muestra.' }),
    contactos: fila('contactos', 'Contactos del pie (uno por línea)', (cfg.contactos ?? []).join('\n'), { largo: true, ayuda: 'Teléfono, sitio web, correo.' }),
  };
  // Agrupar secciones (como el OS): cada sección en una línea con su total; "Extras" se detalla
  const agrupar = el('input', { type: 'checkbox', class: 'interruptor', id: 'k-agrupar', checked: !!cfg.agrupar_secciones, disabled: !editable });
  const filaAgrupar = el('div', { class: 'form-fila' },
    el('label', { class: 'casilla' }, agrupar, 'Agrupar las secciones en el PDF'),
    el('span', { class: 'texto-suave texto-chico' }, 'Cada sección sale en una sola línea con su total, sin sus ítems; la sección "Extras" se detalla. Con un cliente "siempre por cotizar" no se muestra el valor de cada línea, solo el total de cada vehículo.'));
  const guardar = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const v = {
      validez_dias: Math.min(365, Math.max(1, Number(f.validez_dias.c.value) || 7)),
      pago: lineas(f.pago.c.value), nota: f.nota.c.value.trim() || null, firma: f.firma.c.value.trim() || null, contactos: lineas(f.contactos.c.value),
      agrupar_secciones: agrupar.checked,
    };
    // Actualizar o crear (la empresa del registro no se puede cambiar, por eso no se usa upsert)
    const u = await ctx.api.from('cot_config').update(v).eq('empresa_id', ctx.empresa.id).select('empresa_id');
    const { error } = u.error || u.data?.length ? u : await ctx.api.from('cot_config').insert({ empresa_id: ctx.empresa.id, ...v });
    b.disabled = false;
    if (error) avisar(error.message, 'error'); else avisar('Diseño guardado.');
  };
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Diseño de la cotización'), el('p', { class: 'texto-suave' }, 'El logo y el color son los de la empresa. Estos textos completan el PDF.')),
      editable ? el('div', { class: 'listado-acciones' }, boton('Guardar', { icono: 'check', tipo: 'primario', onclick: guardar })) : null),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' }, f.validez_dias.nodo, f.pago.nodo, f.firma.nodo),
      el('div', { class: 'ficha doc-grupo' }, f.nota.nodo, f.contactos.nodo, filaAgrupar)));
}
