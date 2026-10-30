// Auditoría: quién cambió qué y cuándo en la empresa activa.
import { el } from '../../../core/ui/dom.js?v=462b5ff';
import { listado } from '../../../core/ui/tabla.js?v=462b5ff';

const TABLAS = {
  empresas: 'Empresa',
  empresa_modulos: 'Módulo de la empresa',
  roles: 'Rol',
  rol_permisos: 'Permiso de rol',
  usuario_empresa: 'Acceso de usuario',
  config: 'Configuración',
  persona_empresa: 'Vínculo de persona',
  terceros: 'Cliente o proveedor',
  adjuntos: 'Adjunto',
};
const ACCIONES = { insert: 'Creó', update: 'Modificó', delete: 'Eliminó' };
const IGNORAR = new Set(['updated_at', 'created_at', 'created_by']);
const PERIODOS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['', 'Todo']];

const filtro = { modulo: '', dias: '30' };   // se mantiene al refrescar

let correos = new Map();   // user_id -> correo, para nombrar los accesos de usuario

// Nombre legible del registro afectado.
function nombreRegistro(f) {
  const d = f.despues ?? f.antes ?? {};
  if (f.tabla === 'usuario_empresa') return correos.get(d.user_id) ?? '';
  return d.razon_social ?? d.nombre ?? d.cargo ?? d.clave ?? (d.modulo_id && d.accion ? `${d.modulo_id}: ${d.accion}` : '') ?? '';
}

const corto = (v) => {
  const t = v == null ? 'vacío' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};

// Qué campos cambiaron en una modificación.
function detalle(f) {
  if (f.accion !== 'update') return nombreRegistro(f);
  const antes = f.antes ?? {};
  const despues = f.despues ?? {};
  const cambios = Object.keys(despues)
    .filter((k) => !IGNORAR.has(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]))
    .map((k) => `${k}: ${corto(antes[k])} → ${corto(despues[k])}`);
  const nombre = nombreRegistro(f);
  return [nombre, ...cambios].filter(Boolean).join(' · ') || 'Sin cambios visibles';
}

export default async function vista(ctx) {
  const desde = filtro.dias ? new Date(Date.now() - Number(filtro.dias) * 86400000).toISOString() : null;
  const [registros, modulos, usuarios] = await Promise.all([
    ctx.api.rpc('auditoria_empresa', { p_empresa: ctx.empresa.id, p_modulo: filtro.modulo || null, p_desde: desde, p_limite: 500 }),
    ctx.api.from('empresa_modulos').select('modulo_id, modulos(nombre)').eq('empresa_id', ctx.empresa.id),
    ctx.api.rpc('usuarios_empresa', { p_empresa: ctx.empresa.id }),
  ]);
  if (registros.error) throw registros.error;
  if (modulos.error) throw modulos.error;
  correos = new Map((usuarios.data ?? []).map((u) => [u.user_id, u.email]));

  const selector = (opciones, valor, alCambiar, etiqueta) => {
    const s = el('select', { class: 'campo campo-filtro', 'aria-label': etiqueta },
      opciones.map(([v, t]) => el('option', { value: v, selected: v === valor }, t)));
    s.addEventListener('change', () => { alCambiar(s.value); ctx.refrescar(); });
    return s;
  };
  const filtros = [
    selector([['', 'Todos los módulos'], ...modulos.data.map((m) => [m.modulo_id, m.modulos?.nombre ?? m.modulo_id])],
      filtro.modulo, (v) => { filtro.modulo = v; }, 'Filtrar por módulo'),
    selector(PERIODOS, filtro.dias, (v) => { filtro.dias = v; }, 'Periodo'),
  ];

  const vistaListado = listado({
    titulo: 'Auditoría',
    filas: registros.data,
    acciones: filtros,
    vacio: 'No hay cambios registrados en este periodo.',
    columnas: [
      { titulo: 'Fecha', valor: (f) => new Date(f.at).toLocaleString('es-CL') },
      { titulo: 'Usuario', valor: (f) => f.email },
      { titulo: 'Acción', valor: (f) => el('span', { class: 'etiqueta' }, ACCIONES[f.accion] ?? f.accion) },
      { titulo: 'Qué', valor: (f) => TABLAS[f.tabla] ?? f.tabla },
      { titulo: 'Detalle', valor: (f) => el('span', { class: 'celda-detalle', title: detalle(f) }, detalle(f)) },
    ],
  });
  if (registros.data.length === 500) {
    vistaListado.append(el('p', { class: 'texto-suave' }, 'Se muestran los 500 cambios más recientes. Acota el periodo o el módulo para ver más.'));
  }
  return vistaListado;
}
