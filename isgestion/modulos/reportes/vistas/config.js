// Diseño del informe: textos de la caja "Contratista", lema de la portada, contactos de la contraportada, colores de
// las franjas laterales y logo grande de portada y contraportada (como InnovaGestión). El logo chico y el color salen
// de los datos de la empresa; teléfono, correo, web y dirección de la empresa también van a la contraportada.
import { el } from '../../../core/ui/dom.js?v=b52224b';
import { boton } from '../../../core/ui/tabla.js?v=b52224b';
import { avisar } from '../../../core/ui/aviso.js?v=b52224b';
import { subirArchivo, urlFirmada } from '../../../core/adjuntos.js?v=b52224b';

const lineas = (t) => t.split('\n').map((x) => x.trim()).filter(Boolean);

export default async function vista(ctx) {
  const { data: cfg, error } = await ctx.api.from('rep_config').select('*').eq('empresa_id', ctx.empresa.id).maybeSingle();
  if (error) throw error;
  const editable = ctx.puede('reportes', 'editar') && ctx.puede('reportes', 'crear');
  const c = cfg ?? { lineas: [], contactos: [] };

  const fila = (id, etiqueta, valor, { largo = false, ayuda } = {}) => {
    const control = largo
      ? Object.assign(el('textarea', { id: `c-${id}`, class: 'campo', rows: 4, disabled: !editable }), { value: valor ?? '' })
      : el('input', { id: `c-${id}`, class: 'campo', value: valor ?? '', disabled: !editable });
    return { control, nodo: el('div', { class: 'form-fila' }, el('label', { for: `c-${id}` }, etiqueta), control, ayuda ? el('span', { class: 'texto-suave texto-chico' }, ayuda) : null) };
  };
  const f = {
    responsable: fila('responsable', 'Responsable de faena por defecto', c.responsable, { ayuda: 'Se copia en cada parte nuevo; en el parte se puede cambiar.' }),
    lineas: fila('lineas', 'Líneas de la caja "Contratista"', (c.lineas ?? []).join('\n'), { largo: true, ayuda: 'Una por línea: registros, resoluciones sanitarias, certificaciones.' }),
    lema: fila('lema', 'Lema de la portada', c.lema),
    web: fila('web', 'Sitio web', c.web),
    contactos: fila('contactos', 'Contactos adicionales de la contraportada', (c.contactos ?? []).join('\n'), { largo: true, ayuda: 'Una por línea: otros teléfonos, correos o direcciones. Los de la empresa (Administración → Empresa) ya van.' }),
    franjas: fila('franjas', 'Colores de las franjas laterales', (c.franjas ?? []).join(', '), { ayuda: 'Hasta 5 colores en hex, separados por coma (ej.: #f2a71b, #ed4620, #1f28b0). Vacío: el color de la empresa.' }),
  };
  let logoPortada = c.logo_portada ?? null;
  const vistaLogo = el('div', { class: 'logo-vacio texto-suave' }, 'Sin logo grande: se usa el logo de la empresa');
  const pintarLogo = async () => {
    if (!logoPortada) return;
    vistaLogo.replaceChildren(el('img', { class: 'logo-vista', alt: 'Logo de portada', src: await urlFirmada(ctx.api, logoPortada, 300).catch(() => '') }));
  };
  pintarLogo();
  const entradaLogo = el('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'campo', 'aria-label': 'Logo grande de portada', disabled: !editable });
  entradaLogo.addEventListener('change', async () => {
    const archivo = entradaLogo.files[0]; if (!archivo) return;
    try {
      const { ruta } = await subirArchivo(ctx.api, { empresaId: ctx.empresa.id, modulo: 'reportes', archivo, tabla: 'rep_config', registroId: ctx.empresa.id, tipos: ['image/png', 'image/jpeg'], maxBytes: 2 * 1024 * 1024 });
      logoPortada = ruta; await pintarLogo(); avisar('Logo cargado: guarda para usarlo.');
    } catch (e) { avisar(e.message, 'error'); }
  });

  const guardar = async (ev) => {
    const b = ev.currentTarget; b.disabled = true;
    const v = {
      responsable: f.responsable.control.value.trim() || null,
      lineas: lineas(f.lineas.control.value),
      lema: f.lema.control.value.trim() || null,
      web: f.web.control.value.trim() || null,
      contactos: lineas(f.contactos.control.value),
      franjas: f.franjas.control.value.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^#[0-9a-f]{6}$/.test(x)).slice(0, 5),
      logo_portada: logoPortada,
    };
    // Actualizar o crear (la empresa del registro no se puede cambiar, por eso no se usa upsert)
    const u = await ctx.api.from('rep_config').update(v).eq('empresa_id', ctx.empresa.id).select('empresa_id');
    const { error: e } = u.error || u.data?.length ? u : await ctx.api.from('rep_config').insert({ empresa_id: ctx.empresa.id, ...v });
    b.disabled = false;
    if (e) avisar(e.message, 'error'); else avisar('Diseño guardado.');
  };

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' },
      el('div', {}, el('h1', {}, 'Diseño del informe'),
        el('p', { class: 'texto-suave' }, 'El logo y el color del informe son los de la empresa. Estos textos completan la portada, la caja del contratista y la contraportada.')),
      editable ? el('div', { class: 'listado-acciones' }, boton('Guardar', { icono: 'check', tipo: 'primario', onclick: guardar })) : null),
    el('div', { class: 'plan-editor' },
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Portada y contratista'), f.responsable.nodo, f.lineas.nodo, f.lema.nodo),
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Contraportada'), f.web.nodo, f.contactos.nodo),
      el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Marca'), f.franjas.nodo,
        el('div', { class: 'form-fila' }, el('label', {}, 'Logo grande (portada y contraportada)'), vistaLogo, editable ? entradaLogo : null))));
}
