// Datos de la empresa activa. El RUT y el estado los administra la plataforma.
import { el } from '../../../core/ui/dom.js?v=08113ef';
import { boton } from '../../../core/ui/tabla.js?v=08113ef';
import { avisar } from '../../../core/ui/aviso.js?v=08113ef';
import { subirArchivo, urlFirmada, eliminarArchivo } from '../../../core/adjuntos.js?v=08113ef';

const TIPOS_LOGO = ['image/png', 'image/jpeg'];

const CAMPOS = [
  { id: 'razon_social', etiqueta: 'Razón social', requerido: true },
  { id: 'nombre_fantasia', etiqueta: 'Nombre de fantasía (se muestra en el selector)' },
  { id: 'giro', etiqueta: 'Giro' },
  { id: 'direccion', etiqueta: 'Dirección' },
  { id: 'telefono', etiqueta: 'Teléfono', tipo: 'tel' },
  { id: 'email', etiqueta: 'Correo de contacto', tipo: 'email' },
  { id: 'web', etiqueta: 'Sitio web' },
];

// Temas visuales (core/ui/estilos.css, atributo data-tema): se guardan en empresas.config.tema
const TEMAS = [['innova', 'Innova (barra azul marino y naranja, como InnovaGestión)'], ['clasico', 'Clásico (claro, sobrio)'], ['taller', 'Taller (barra y menú grafito)'], ['moderno', 'Moderno (redondeado, tarjetas suaves)']];

export default async function vista(ctx) {
  const { data: e, error } = await ctx.api.from('empresas')
    .select('id, rut, razon_social, nombre_fantasia, giro, direccion, telefono, email, web, color, logo_url, config')
    .eq('id', ctx.empresa.id).single();
  if (error) throw error;

  const editable = ctx.puede('nucleo', 'editar');
  const mensaje = el('p', { class: 'texto-error', role: 'alert' });
  const guardar = boton('Guardar cambios', { tipo: 'primario', type: 'submit' });

  const fila = (id, etiqueta, control) => el('div', { class: 'form-fila' }, el('label', { for: `emp-${id}` }, etiqueta), control);
  const form = el('form', { class: 'ficha' },
    fila('rut', 'RUT', el('input', { id: 'emp-rut', class: 'campo', value: e.rut, disabled: true })),
    CAMPOS.map((c) => fila(c.id, c.etiqueta,
      el('input', { id: `emp-${c.id}`, name: c.id, type: c.tipo ?? 'text', class: 'campo', value: e[c.id] ?? '', required: c.requerido, disabled: !editable }))),
    el('p', { class: 'texto-suave texto-chico' }, 'Dirección, teléfono, correo y web salen en el membrete y al pie de los PDF y en los Excel.'),
    fila('color', 'Color de la empresa (franja superior y botones)',
      el('input', { id: 'emp-color', name: 'color', type: 'color', class: 'campo campo-color', value: e.color || '#1f4e8c', disabled: !editable })),
    fila('tema', 'Tema visual',
      el('select', { id: 'emp-tema', name: 'tema', class: 'campo', disabled: !editable },
        TEMAS.map(([k, n]) => el('option', { value: k, selected: k === (e.config?.tema ?? 'clasico') }, n)))),
    mensaje,
    editable ? el('div', {}, guardar) : el('p', { class: 'texto-suave' }, 'Tu rol solo permite ver estos datos.'),
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    mensaje.textContent = '';
    guardar.disabled = true;
    const v = Object.fromEntries(new FormData(form));
    const cambios = {
      razon_social: v.razon_social.trim(),
      nombre_fantasia: v.nombre_fantasia.trim() || null,
      giro: v.giro.trim() || null,
      direccion: v.direccion.trim() || null,
      telefono: v.telefono.trim() || null,
      email: v.email.trim() || null,
      web: v.web.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || null,
      color: v.color,
      config: { ...(e.config ?? {}), tema: v.tema },
    };
    const { data, error: e2 } = await ctx.api.from('empresas').update(cambios).eq('id', e.id).select('id');
    guardar.disabled = false;
    if (e2) { mensaje.textContent = e2.message; return; }
    if (!data.length) { mensaje.textContent = 'No tienes permiso para cambiar estos datos.'; return; }
    avisar('Datos de la empresa guardados.');
    // El nombre, el color y el tema se ven en toda la app: recargar para aplicarlos.
    setTimeout(() => location.reload(), 600);
  });

  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('h1', {}, 'Empresa')),
    await seccionLogo(ctx, e, editable),
    form,
  );
}

// Logo para el membrete de los PDF. Se guarda en el bucket privado (adjuntos/<empresa>/nucleo/…).
async function seccionLogo(ctx, e, editable) {
  const vista = e.logo_url
    ? el('img', { class: 'logo-vista', alt: 'Logo de la empresa', src: await urlFirmada(ctx.api, e.logo_url, 300).catch(() => '') })
    : el('div', { class: 'logo-vacio texto-suave' }, 'Sin logo');
  const mensaje = el('p', { class: 'texto-error', role: 'alert' });
  const entrada = el('input', { type: 'file', accept: TIPOS_LOGO.join(','), class: 'campo', 'aria-label': 'Archivo del logo' });

  entrada.addEventListener('change', async () => {
    mensaje.textContent = '';
    const archivo = entrada.files[0];
    if (!archivo) return;
    entrada.disabled = true;
    try {
      const { ruta } = await subirArchivo(ctx.api, {
        empresaId: e.id, modulo: 'nucleo', archivo, tabla: 'empresas', registroId: e.id,
        tipos: TIPOS_LOGO, maxBytes: 1024 * 1024,
      });
      const { error } = await ctx.api.from('empresas').update({ logo_url: ruta }).eq('id', e.id);
      if (error) throw new Error(error.message);
      if (e.logo_url) await eliminarArchivo(ctx.api, e.logo_url).catch(() => {});   // el anterior ya no se usa
      avisar('Logo actualizado.');
      setTimeout(() => location.reload(), 600);
    } catch (err) {
      mensaje.textContent = err.message;
      entrada.disabled = false;
    }
  });

  return el('div', { class: 'ficha' },
    el('div', { class: 'form-fila' }, el('label', {}, 'Logo (aparece en el membrete de los PDF)'), vista),
    editable ? el('div', { class: 'form-fila' }, entrada, el('span', { class: 'texto-suave' }, 'PNG o JPG, máximo 1 MB.')) : null,
    mensaje,
  );
}
