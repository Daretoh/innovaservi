// Seguimiento de práctica (RRHH 005): horas hechas / exigidas desde el Registro de horas de la empresa (tablet o a
// mano, sin descontar colación), lo que falta, ritmo de las últimas 4 semanas y fecha estimada de término con ese
// ritmo y con el horario planificado desde una fecha. Pestaña "Práctica" de la ficha (vínculo de tipo práctica).
import { el } from '../../core/ui/dom.js?v=190b5a4';
import { boton } from '../../core/ui/tabla.js?v=190b5a4';
import { abrirFormulario } from '../../core/ui/modal.js?v=190b5a4';
import { avisar } from '../../core/ui/aviso.js?v=190b5a4';
import { horas, fechaLarga, nombreDia, sumarDias } from '../../core/ui/formato.js?v=190b5a4';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hh = (min) => { const m = Math.round(min || 0); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };   // 1335 → "22:15"
const conDia = (iso) => (iso ? `${nombreDia(iso)} ${fechaLarga(iso)}` : '—');

export async function cargarPractica(ctx, personaId) {
  const { data, error } = await ctx.api.rpc('rrhh_practica', { p_empresa: ctx.empresa.id, p_persona: personaId });
  if (error) throw error;
  return data;
}

// "9:00-18:15" / "09:00 – 18:15" → ['09:00', '18:15']; vacío → null
function leerHorario(texto, dia) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`${dia}: escribe el horario como 9:00-18:15.`);
  const a = `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`, b = `${m[3].padStart(2, '0')}:${m[4] ?? '00'}`;
  if (+m[1] > 23 || +m[3] > 23 || a >= b) throw new Error(`${dia}: la salida debe ser después de la entrada.`);
  return [a, b];
}

export function editarPractica(ctx, v, pr, alGuardar) {
  const plan = pr?.plan ?? {};
  abrirFormulario({
    titulo: pr ? 'Editar práctica' : 'Configurar práctica',
    mensaje: 'Las horas se cuentan solas desde el Registro de horas de esta empresa (tablet o a mano), sin descontar colación.',
    campos: [
      { id: 'institucion', etiqueta: 'Institución', valor: pr?.institucion ?? '' },
      { id: 'carrera', etiqueta: 'Carrera', valor: pr?.carrera ?? '' },
      { id: 'horas_exigidas', etiqueta: 'Horas exigidas', tipo: 'number', requerido: true, valor: pr?.horas_exigidas ?? '' },
      { id: 'inicio', etiqueta: 'Inicio de la práctica', tipo: 'date', requerido: true, valor: pr?.inicio ?? v.fecha_ingreso ?? '' },
      { id: 'plan_desde', etiqueta: 'Horario planificado desde', tipo: 'date', valor: pr?.plan_desde ?? '',
        ayuda: 'Opcional: desde esa fecha la estimación usa el horario de abajo en vez del ritmo de las últimas 4 semanas.' },
      ...DIAS.map((d, i) => ({ id: `d${i + 1}`, etiqueta: d, valor: plan[i + 1] ? `${plan[i + 1][0]}-${plan[i + 1][1]}` : '', ayuda: i === 0 ? 'Ej.: 9:00-18:15. Vacío = no viene.' : null })),
      { id: 'notas', etiqueta: 'Notas', tipo: 'textarea', valor: pr?.notas ?? '' },
    ],
    alGuardar: async (x) => {
      const nuevo = {};
      DIAS.forEach((d, i) => { const h = leerHorario(x[`d${i + 1}`], d); if (h) nuevo[i + 1] = h; });
      if (x.plan_desde && !Object.keys(nuevo).length) throw new Error('Indica el horario de al menos un día o deja vacía la fecha del horario planificado.');
      const fila = {
        vinculo_id: v.id, empresa_id: ctx.empresa.id, institucion: x.institucion.trim() || null, carrera: x.carrera.trim() || null,
        horas_exigidas: Number(x.horas_exigidas), inicio: x.inicio, plan_desde: x.plan_desde || null, plan: nuevo, notas: x.notas.trim() || null,
      };
      const { error } = await ctx.api.from('rrhh_practicas').upsert(fila, { onConflict: 'vinculo_id' });
      if (error) throw error;
      avisar('Práctica guardada.');
      alGuardar?.();
    },
  });
}

export async function panelPractica(ctx, v) {
  const pr = await cargarPractica(ctx, v.persona_id);
  const puede = ctx.puede('rrhh', 'editar');
  const refrescar = () => ctx.refrescar();
  if (!pr) {
    return el('div', { class: 'ficha' },
      el('h2', {}, 'Práctica'),
      el('p', { class: 'texto-suave' }, 'Configura las horas exigidas y el inicio para seguir su avance con las horas que marca en la tablet o se cargan en Asistencia.'),
      puede ? boton('Configurar práctica', { icono: 'mas', tipo: 'primario', onclick: () => editarPractica(ctx, v, null, refrescar) }) : null);
  }
  const meta = pr.horas_exigidas * 60;
  const pct = Math.min(100, Math.round((pr.minutos_hechos / meta) * 100));
  const plan = pr.plan ?? {};

  // Semanas desde el inicio con el acumulado
  let acum = 0;
  const filas = (pr.semanas ?? []).map((s) => {
    acum += s.minutos;
    return el('tr', {},
      el('td', {}, `${fechaLarga(s.lunes)} – ${fechaLarga(sumarDias(s.lunes, 6))}`),
      el('td', { class: 'num' }, String(s.dias)),
      el('td', { class: 'num' }, hh(s.minutos)),
      el('td', { class: 'num' }, `${hh(acum)} (${Math.min(100, Math.round((acum / meta) * 100))}%)`));
  }).reverse();

  const kpi = (valor, texto) => el('div', {}, el('strong', {}, valor), el('span', {}, ...texto));
  return el('div', { class: 'act' },
    el('div', { class: 'ficha' },
      el('div', { class: 'listado-cabecera' },
        el('div', {}, el('h2', {}, 'Avance de la práctica'),
          el('p', { class: 'texto-suave texto-chico' }, [pr.institucion, pr.carrera, `desde el ${fechaLarga(pr.inicio)}`].filter(Boolean).join(' · '))),
        puede ? boton('Editar', { icono: 'lapiz', onclick: () => editarPractica(ctx, v, pr, refrescar) }) : null),
      el('div', { class: 'pra-barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Avance de la práctica' },
        el('i', { style: `width: ${pct}%` })),
      el('p', { class: 'pra-total' }, el('strong', {}, `${hh(pr.minutos_hechos)} de ${pr.horas_exigidas} h`), el('span', { class: 'texto-suave' }, ` · ${pct}%`)),
      el('div', { class: 'act-kpis pra-kpis' },
        kpi(pr.cumplida ? 'Cumplida' : hh(pr.minutos_faltan), pr.cumplida ? ['el ', fechaLarga(pr.cumplida)] : ['horas', el('br'), 'por hacer']),
        kpi(hh(pr.ritmo_semana), ['horas por semana', el('br'), 'últimas 4 semanas']),
        kpi(pr.fecha_ritmo ? fechaLarga(pr.fecha_ritmo).slice(0, -5) : '—', ['término con', el('br'), 'el ritmo actual']),
        pr.plan_desde ? kpi(pr.fecha_plan ? fechaLarga(pr.fecha_plan).slice(0, -5) : '—', ['término con el horario', el('br'), `desde el ${fechaLarga(pr.plan_desde).slice(0, -5)}`]) : null),
      !pr.cumplida ? el('p', { class: 'texto-suave texto-chico' },
        pr.fecha_ritmo ? `Con el ritmo actual termina el ${conDia(pr.fecha_ritmo)}. ` : 'Sin horas en las últimas semanas: no se puede estimar con el ritmo. ',
        pr.plan_desde && pr.fecha_plan ? `Con el horario desde el ${fechaLarga(pr.plan_desde)}: ${conDia(pr.fecha_plan)}. ` : '',
        'Si viene más horas, la fecha se adelanta sola.') : null),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Ritmo y horario'),
      el('div', { class: 'pra-dias' }, DIAS.map((d, i) => {
        const ahora = (pr.horario_dia ?? {})[i + 1];
        return el('div', {},
          el('strong', {}, d.slice(0, 3)),
          el('span', {}, pr.ritmo_dia[i] ? hh(pr.ritmo_dia[i]) : '—'),
          el('span', { class: 'texto-suave texto-chico' }, ahora ? `${ahora[0]}–${ahora[1]}` : 'no viene'),
          pr.plan_desde ? el('span', { class: 'pra-plan texto-chico' }, plan[i + 1] ? `${plan[i + 1][0]}–${plan[i + 1][1]}` : 'no viene') : null);
      })),
      el('p', { class: 'texto-suave texto-chico' }, 'Arriba: horas promedio de cada día y el horario que viene (entrada y salida más frecuentes) en las últimas 4 semanas.',
        pr.plan_desde ? ` En color: horario desde el ${fechaLarga(pr.plan_desde)} (${hh(pr.plan_semana)} h por semana).` : ''),
      pr.notas ? el('p', {}, pr.notas) : null),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Horas por semana'),
      filas.length
        ? el('div', { class: 'tabla-contenedor' }, el('table', { class: 'tabla' },
            el('thead', {}, el('tr', {}, el('th', {}, 'Semana'), el('th', { class: 'num' }, 'Días'), el('th', { class: 'num' }, 'Horas'), el('th', { class: 'num' }, 'Acumulado'))),
            el('tbody', {}, filas)))
        : el('p', { class: 'texto-suave' }, 'Aún no tiene horas registradas desde el inicio.'),
      el('p', { class: 'texto-suave texto-chico' }, 'Cuentan las horas del Registro de horas de esta empresa (marcaje en la tablet o carga a mano), sin descontar colación. Una línea sin salida no cuenta hasta completarla.')));
}
