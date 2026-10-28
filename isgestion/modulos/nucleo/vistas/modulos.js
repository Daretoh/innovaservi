// Módulos de la empresa (Administración): qué módulos tiene contratados, sus opciones (las del manifiesto, guardadas
// en empresa_modulos.config) y acceso directo a las pantallas de ajustes de cada uno (ítems con `ajustes: true`).
// Activar o quitar módulos y ocultar pantallas lo hace el equipo ISgestión desde la Consola.
import { el } from '../../../core/ui/dom.js?v=b8da9fc';
import { icono } from '../../../core/ui/iconos.js?v=b8da9fc';
import { boton } from '../../../core/ui/tabla.js?v=b8da9fc';
import { avisar } from '../../../core/ui/aviso.js?v=b8da9fc';
import { cargarManifiestos, configModulo } from '../../../core/modulos.js?v=b8da9fc';

export default async function vista(ctx) {
  const [manifiestos, { data, error }] = await Promise.all([
    cargarManifiestos(),
    ctx.api.from('empresa_modulos').select('modulo_id, activo, config, desde, pantallas_ocultas').eq('empresa_id', ctx.empresa.id),
  ]);
  if (error) throw error;
  const editable = ctx.puede('nucleo', 'editar');
  const porId = new Map(data.map((m) => [m.modulo_id, m]));
  const activos = manifiestos.filter((m) => porId.get(m.id)?.activo && m.id !== 'nucleo');
  const fecha = (d) => (d ? new Date(`${d}T12:00`).toLocaleDateString('es-CL') : '');

  const tarjeta = (m) => {
    const fila = porId.get(m.id);
    const ocultas = new Set(fila.pantallas_ocultas ?? []);
    const opciones = Object.entries(m.config ?? {});
    const valores = configModulo(m, fila.config);
    const ajustes = m.menu.filter((it) => it.ajustes && !ocultas.has(it.id) && ctx.puede(m.id, 'ver'));
    const campos = opciones.map(([k, op]) => {
      const id = `mc-${m.id}-${k}`;
      const control = op.tipo === 'bool'
        ? el('input', { type: 'checkbox', class: 'interruptor', id, checked: !!valores[k], disabled: !editable })
        : op.opciones
          ? el('select', { class: 'campo', id, disabled: !editable }, op.opciones.map(([v, t]) => el('option', { value: v, selected: String(valores[k]) === v }, t)))
          : el('input', { class: 'campo', id, type: op.tipo === 'number' ? 'number' : 'text', value: valores[k] ?? '', disabled: !editable });
      control.dataset.clave = k; control.dataset.tipo = op.tipo ?? 'text';
      return op.tipo === 'bool' ? el('label', { class: 'casilla', for: id }, control, op.etiqueta) : el('div', { class: 'form-fila' }, el('label', { for: id }, op.etiqueta), control);
    });
    const guardar = async (ev) => {
      const tarjetaNodo = ev.currentTarget.closest('.ficha');
      const nuevo = { ...(fila.config ?? {}) };
      for (const c of tarjetaNodo.querySelectorAll('[data-clave]')) {
        nuevo[c.dataset.clave] = c.dataset.tipo === 'bool' ? c.checked : c.dataset.tipo === 'number' ? (c.value === '' ? null : Number(c.value)) : c.value.trim();
      }
      const r = await ctx.api.from('empresa_modulos').update({ config: nuevo }).eq('empresa_id', ctx.empresa.id).eq('modulo_id', m.id).select('modulo_id');
      if (r.error || !r.data?.length) { avisar(r.error?.message ?? 'No tienes permiso para cambiar esto.', 'error'); return; }
      avisar(`Opciones de ${m.nombre} guardadas.`);
      setTimeout(() => location.reload(), 600);   // la configuración se lee al entrar a la empresa
    };
    return el('div', { class: 'ficha mod-tarjeta' },
      el('div', { class: 'mod-cab' },
        el('span', { class: 'mod-icono' }, icono(m.icono ?? 'carpeta', { tam: 18 })),
        el('div', {}, el('h2', {}, m.nombre),
          el('span', { class: 'texto-suave texto-chico' }, [m.categoria, `versión ${m.version}`, fila.desde ? `desde el ${fecha(fila.desde)}` : null, ocultas.size ? `${ocultas.size} pantalla${ocultas.size === 1 ? '' : 's'} oculta${ocultas.size === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')))),
      campos.length ? el('div', { class: 'mod-opciones' }, campos, editable ? boton('Guardar opciones', { icono: 'check', onclick: guardar }) : null) : null,
      ajustes.length ? el('div', { class: 'mod-ajustes' }, ajustes.map((it) => el('a', { class: 'boton boton-secundario boton-chico', href: ctx.ruta(it.id) }, icono('ajustes', { tam: 14 }), it.label))) : null,
      !campos.length && !ajustes.length ? el('p', { class: 'texto-suave texto-chico' }, 'Sin ajustes.') : null);
  };

  const inactivos = data.filter((x) => !x.activo).map((x) => manifiestos.find((m) => m.id === x.modulo_id)?.nombre ?? x.modulo_id);
  return el('section', { class: 'listado' },
    el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Módulos'),
      el('p', { class: 'texto-suave' }, `${activos.length} módulos contratados. Cada uno con sus opciones y sus pantallas de ajustes.`))),
    el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Para contratar o quitar un módulo, u ocultar pantallas, habla con el equipo ISgestión.'),
    el('div', { class: 'mod-rejilla' }, activos.map(tarjeta)),
    inactivos.length ? el('p', { class: 'texto-suave texto-chico' }, `Desactivados: ${inactivos.join(', ')}.`) : null);
}
