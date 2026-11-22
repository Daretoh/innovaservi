// Proyectos: conectar SketchUp a un proyecto. Crea el código de conexión (pro_sketchup_crear; se muestra una sola vez)
// y ofrece descargar el script sketchup/enviar_a_isgestion.rb, que envía el modelo directo a ISgestión (Edge Function
// proyectos-sketchup). Crear un código nuevo invalida el anterior.
import { el } from '../../core/ui/dom.js?v=fce4a19';
import { icono } from '../../core/ui/iconos.js?v=fce4a19';
import { boton } from '../../core/ui/tabla.js?v=fce4a19';
import { avisar } from '../../core/ui/aviso.js?v=fce4a19';

const SCRIPT = new URL('./sketchup/enviar_a_isgestion.rb', import.meta.url).href;

export async function conectarSketchup(ctx, d) {
  const { data: previo } = await ctx.api.from('pro_sketchup').select('created_at, usado_at').eq('proyecto_id', d.proyecto.id).maybeSingle();
  const cuerpo = el('div', { class: 'modal-cuerpo' });
  const dialogo = el('dialog', { class: 'modal', 'aria-label': 'Conectar SketchUp' },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, 'Conectar SketchUp'),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar'))), cuerpo);
  const cerrar = () => { dialogo.close(); dialogo.remove(); };
  const fecha = (t) => new Date(t).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });

  const descargar = boton('Descargar el script', { icono: 'descargar', onclick: async () => {
    try {
      const r = await fetch(SCRIPT);
      if (!r.ok) throw new Error('No se pudo descargar el script.');
      const a = el('a', { href: URL.createObjectURL(new Blob([await r.text()], { type: 'text/plain' })), download: 'enviar_a_isgestion.rb' });
      document.body.append(a); a.click(); a.remove();
    } catch (e) { avisar(e.message, 'error'); }
  } });
  const pasos = () => el('ol', { class: 'pro-pasos' },
    el('li', {}, 'Descarga el script (una sola vez) y déjalo en tu carpeta Descargas.'),
    el('li', {}, 'Abre el modelo en SketchUp, ve a Ventana → Consola de Ruby y pega:',
      el('code', { class: 'pro-codigo' }, "load File.join(ENV['USERPROFILE'], 'Downloads', 'enviar_a_isgestion.rb')")),
    el('li', {}, 'La primera vez te pide el código de conexión: pégalo. Queda recordado para ese archivo .skp.'),
    el('li', {}, 'Las veces siguientes basta con Extensiones → Enviar a ISgestión. Las mallas que ya están no se vuelven a enviar.'));

  function mostrarCodigo(codigo) {
    const campo = el('input', { class: 'campo pro-codigo-campo', value: codigo, readonly: true, 'aria-label': 'Código de conexión' });
    cuerpo.replaceChildren(
      el('p', { class: 'modal-mensaje' }, `Código de conexión de "${d.proyecto.nombre}". Cópialo ahora: por seguridad no se vuelve a mostrar (puedes crear otro cuando quieras).`),
      el('div', { class: 'pro-codigo-fila' }, campo, boton('Copiar', { icono: 'copiar', onclick: async () => {
        try { await navigator.clipboard.writeText(codigo); avisar('Código copiado'); } catch { campo.select(); }
      } })),
      pasos(), el('div', { class: 'modal-pie' }, descargar, boton('Listo', { tipo: 'primario', onclick: () => { cerrar(); ctx.refrescar(); } })));
    campo.select();
  }
  const crear = boton(previo ? 'Crear un código nuevo' : 'Crear código de conexión', { tipo: 'primario', onclick: async () => {
    crear.disabled = true; crear.classList.add('cargando');
    const { data, error } = await ctx.api.rpc('pro_sketchup_crear', { p_proyecto: d.proyecto.id });
    crear.disabled = false; crear.classList.remove('cargando');
    if (error) { avisar(error.message, 'error'); return; }
    mostrarCodigo(data);
  } });
  cuerpo.append(
    el('p', { class: 'modal-mensaje' }, `Envía el modelo de SketchUp directo a "${d.proyecto.nombre}": el inventario, la posición de cada objeto y los muebles en 3D, sin subir archivos a mano.`),
    previo ? el('p', { class: 'texto-suave texto-chico' }, `Ya tiene un código, creado el ${fecha(previo.created_at)}${previo.usado_at ? `; último envío el ${fecha(previo.usado_at)}` : ''}. Si creas uno nuevo, el anterior deja de funcionar y SketchUp te lo pedirá de nuevo.`) : null,
    pasos(),
    el('div', { class: 'modal-pie' }, descargar, crear));
  document.body.append(dialogo);
  dialogo.showModal();
}
