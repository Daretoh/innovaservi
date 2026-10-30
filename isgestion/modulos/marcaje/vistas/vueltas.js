// Vueltas del chofer (como la "Pantalla del chofer" de InnovaGestión): desde el celular elige el vehículo y el chofer,
// cuenta las vueltas de hoy (ida y vuelta o solo ida) y, si pagó peaje, el monto y la foto del voucher. Se guarda en el
// vehículo (Flota) y las vueltas se suman en Remuneraciones. Los peajes no se reembolsan: quedan como gasto del vehículo.
import { el } from '../../../core/ui/dom.js?v=ca87e0a';
import { icono } from '../../../core/ui/iconos.js?v=ca87e0a';
import { boton } from '../../../core/ui/tabla.js?v=ca87e0a';
import { avisar } from '../../../core/ui/aviso.js?v=ca87e0a';
import { hoyISO, fechaLarga, nombreDia, dinero } from '../../../core/ui/formato.js?v=ca87e0a';
import { subirArchivo } from '../../../core/adjuntos.js?v=ca87e0a';
import { comprimirFoto } from '../../../core/imagenes.js?v=ca87e0a';

const CLAVE = 'isg.chofer.vehiculo';

export default async function vista(ctx) {
  const e = ctx.empresa.id;
  const hoy = hoyISO();
  const titulo = el('header', { class: 'listado-cabecera' }, el('div', {}, el('h1', {}, 'Vueltas del chofer'),
    el('p', { class: 'texto-suave' }, `${nombreDia(hoy)} ${fechaLarga(hoy)}`)));
  if (!ctx.puede('marcaje', 'crear')) {
    return el('section', { class: 'listado' }, titulo,
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'Tu rol no puede registrar vueltas. Pide el rol "Chofer".'));
  }
  const { data: d, error } = await ctx.api.rpc('mar_chofer_datos', { p_empresa: e });
  if (error) throw error;
  if (!d.vehiculos.length) {
    return el('section', { class: 'listado' }, titulo,
      el('p', { class: 'aviso-bandeja' }, icono('alerta', { tam: 16 }), 'No hay vehículos activos. Agrégalos en Flota para poder registrar vueltas.'));
  }

  let guardado = null;
  try { guardado = localStorage.getItem(CLAVE); } catch { /* sin almacenamiento */ }
  const vehiculo = el('select', { class: 'campo', 'aria-label': 'Vehículo' },
    d.vehiculos.map((v) => el('option', { value: v.id, selected: v.id === guardado }, `${v.nombre}${v.patente ? ` · ${v.patente}` : ''}`)));
  const chofer = el('select', { class: 'campo', 'aria-label': 'Chofer' },
    el('option', { value: '' }, 'Elige el chofer…'),
    d.personas.map((p) => el('option', { value: p.id, selected: p.id === d.yo }, p.nombre)));

  // ---- Contador de vueltas
  let vueltas = 0;
  const numero = el('output', { class: 'cho-numero', 'aria-live': 'polite' }, '0');
  const cambiar = (n) => { vueltas = Math.max(0, Math.min(20, vueltas + n)); numero.textContent = String(vueltas); };
  let sentido = 'ida_vuelta';
  const opcion = (valor, texto) => el('button', { type: 'button', 'aria-pressed': String(valor === sentido),
    onclick: (ev) => { sentido = valor; for (const b of ev.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget)); } }, texto);

  // ---- Peaje
  const peaje = el('input', { type: 'text', inputmode: 'numeric', class: 'campo', placeholder: 'Monto (opcional)', 'aria-label': 'Monto del peaje' });
  peaje.addEventListener('input', () => { const v = peaje.value.replace(/\D/g, ''); peaje.value = v ? Number(v).toLocaleString('es-CL') : ''; });
  let foto = null;
  const nombreFoto = el('span', { class: 'texto-suave texto-chico' }, 'Sin voucher');
  const archivo = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true,
    onchange: () => { foto = archivo.files[0] ?? null; nombreFoto.textContent = foto ? foto.name : 'Sin voucher'; } });

  const guardar = async (ev) => {
    const b = ev.currentTarget;
    if (b.classList.contains('cargando')) return;
    b.classList.add('cargando');
    try { await registrar(); } catch (err) { avisar(err.message, 'error'); } finally { b.classList.remove('cargando'); }
  };
  const registrar = async () => {
    const monto = Number(peaje.value.replace(/\D/g, '') || 0);
    if (!chofer.value) throw new Error('Elige el chofer.');
    if (!vueltas && !monto && !foto) throw new Error('Agrega vueltas o un peaje.');
    let ruta = null;
    if (foto) {
      const comprimida = await comprimirFoto(foto);
      ruta = (await subirArchivo(ctx.api, { empresaId: e, modulo: 'marcaje', archivo: comprimida, tabla: 'flo_registros', tipos: ['image/jpeg', 'image/png', 'image/webp'] })).ruta;
    }
    const { error: er } = await ctx.api.rpc('mar_chofer_registrar', { p_empresa: e, p_vehiculo: vehiculo.value, p_chofer: chofer.value,
      p_vueltas: vueltas, p_sentido: sentido, p_peaje: monto, p_archivo: ruta });
    if (er) throw new Error(er.message);
    try { localStorage.setItem(CLAVE, vehiculo.value); } catch { /* */ }
    avisar([vueltas ? `${vueltas} vuelta${vueltas > 1 ? 's' : ''}` : null, monto || foto ? 'peaje' : null].filter(Boolean).join(' y ') + ' registrado.');
    ctx.refrescar();
  };

  // ---- Registrado hoy por mí
  const quitar = async (r) => {
    if (!confirm(`¿Quitar ${r.categoria === 'vuelta' ? `${r.cantidad} vuelta${r.cantidad > 1 ? 's' : ''}` : 'el peaje'} de ${r.vehiculo}?`)) return;
    const { error: er } = await ctx.api.rpc('mar_chofer_quitar', { p_registro: r.id });
    if (er) avisar(er.message, 'error'); else { avisar('Registro quitado.'); ctx.refrescar(); }
  };
  const fila = (r) => el('div', { class: 'doc-fila' },
    el('div', { class: 'doc-nombre' },
      el('strong', {}, r.categoria === 'vuelta' ? `${r.cantidad} vuelta${r.cantidad > 1 ? 's' : ''} · ${r.sentido === 'ida' ? 'solo ida' : 'ida y vuelta'}` : `Peaje${r.monto ? ` ${dinero(r.monto)}` : ''}`),
      el('span', { class: 'texto-suave texto-chico' }, `${r.vehiculo} · ${r.chofer ?? 'sin chofer'}`)),
    el('button', { type: 'button', class: 'boton-icono', title: 'Quitar', 'aria-label': 'Quitar este registro', onclick: () => quitar(r) }, icono('cerrar', { tam: 16 })));

  return el('section', { class: 'listado cho' },
    titulo,
    el('div', { class: 'ficha' },
      el('label', { class: 'form-fila' }, 'Vehículo', vehiculo),
      el('label', { class: 'form-fila' }, 'Chofer', chofer)),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Vueltas'),
      el('div', { class: 'cho-contador' },
        el('button', { type: 'button', class: 'boton cho-mas', 'aria-label': 'Una vuelta menos', onclick: () => cambiar(-1) }, '−'),
        numero,
        el('button', { type: 'button', class: 'boton cho-mas', 'aria-label': 'Una vuelta más', onclick: () => cambiar(1) }, '+')),
      el('div', { class: 'segmento cho-sentido', role: 'group', 'aria-label': 'Sentido' }, opcion('ida_vuelta', 'Ida y vuelta'), opcion('ida', 'Solo ida'))),
    el('div', { class: 'ficha' },
      el('h2', {}, 'Peaje'),
      peaje,
      el('div', { class: 'listado-acciones' }, nombreFoto, boton('Foto del voucher', { icono: 'camara', onclick: () => archivo.click() }), archivo),
      el('p', { class: 'texto-suave texto-chico' }, 'Queda como gasto del vehículo (no se reembolsa en el sueldo).')),
    el('div', { class: 'cho-guardar' }, boton('Registrar', { icono: 'check', tipo: 'primario', onclick: guardar })),
    d.hoy.length ? el('div', { class: 'ficha doc-grupo' }, el('h2', {}, 'Registrado hoy'), d.hoy.map(fila)) : null);
}
