// Recepción: agendar un vehículo y crear su orden de trabajo. Hoja propia (maqueta B-Agendar, 2026-10-28): en el teléfono
// sube desde abajo; en pantalla grande es una ventana al centro. Primero se pregunta lo mismo que en el mesón:
// "¿Es su primera vez con nosotros?". Si ya es cliente se busca por nombre, teléfono o patente y trae su teléfono y sus
// vehículos; si es primera vez se escribe nombre y teléfono. La patente conocida trae el vehículo, su dueño y cuántas
// veces vino. Un cliente "siempre por cotizar" (terceros.por_cotizar) marca el servicio a convenir y queda con Factura.
// Devuelve una promesa que se cumple al cerrar la hoja (la barra del teléfono anima el "+" mientras está abierta).
import { el } from '../../core/ui/dom.js?v=245d3ab';
import { icono } from '../../core/ui/iconos.js?v=245d3ab';
import { avisar } from '../../core/ui/aviso.js?v=245d3ab';
import { placa } from '../../core/ui/placa.js?v=245d3ab';
import { hoyISO, telefono, dinero } from '../../core/ui/formato.js?v=245d3ab';
import { PRIORIDADES, TALLAS, normalizarPatente, verPatente, nombreTercero, precioTalla, cargarServicios, cargarTrabajadores, siguienteNumero, esEmpresa } from './datos.js?v=245d3ab';

const AYUDA_TALLA = { S: 'City car', M: 'Sedán o hatchback', L: 'SUV', XL: 'Camioneta o van' };
const soloDigitos = (t) => (t ?? '').replace(/\D/g, '');
const nombreAuto = (x) => [x?.marca, x?.modelo].filter(Boolean).join(' ') || 'Vehículo';

export async function recepcion(ctx, { fecha = hoyISO(), vehiculo = null } = {}) {
  const [servicios, trabajadores, clientes, vehiculos, visitas] = await Promise.all([
    cargarServicios(ctx),
    cargarTrabajadores(ctx),
    ctx.api.from('terceros').select('id, razon_social, nombre_fantasia, telefono, rut, por_cotizar').eq('empresa_id', ctx.empresa.id).is('deleted_at', null).contains('tipo', ['cliente']).order('razon_social'),
    ctx.api.from('tal_vehiculos').select('id, tercero_id, patente, marca, modelo, anio, talla').eq('empresa_id', ctx.empresa.id).is('deleted_at', null),
    ctx.api.from('tal_ordenes').select('vehiculo_id').eq('empresa_id', ctx.empresa.id).neq('estado', 'anulada'),
  ]);
  const listaClientes = clientes.data ?? [];
  const listaVeh = vehiculos.data ?? [];
  const vecesDe = (id) => (visitas.data ?? []).filter((o) => o.vehiculo_id === id).length;
  const clienteDe = (id) => listaClientes.find((c) => c.id === id) ?? null;
  const servicioCotizar = servicios.find((s) => /cotiz/i.test(s.nombre)) ?? servicios.find((s) => s.variable);

  // Estado de la hoja
  const fijo = vehiculo ? listaVeh.find((x) => x.id === vehiculo.id) ?? vehiculo : null;
  const e = {
    primera: fijo ? false : null,   // null: aún no se responde
    cliente: fijo ? clienteDe(fijo.tercero_id) : null,
    vehiculo: fijo,                 // vehículo ya registrado elegido (o null: nuevo)
    nuevo: { patente: '', marca: '', modelo: '', anio: '', talla: 'M' },
    nombre: '', contacto: fijo ? clienteDe(fijo.tercero_id)?.telefono ?? '' : '',
    servicios: new Set(fijo && clienteDe(fijo.tercero_id)?.por_cotizar && servicioCotizar ? [servicioCotizar.id] : []),
    fecha, hora: '', llego: false, prioridad: 'normal', trabajador: '', notas: '',
  };
  const talla = () => e.vehiculo?.talla || e.nuevo.talla || 'M';

  return new Promise((listo) => {
    // ---------- Estructura
    const cuerpo = el('div', { class: 'agh-cuerpo' });
    const error = el('p', { class: 'texto-error', role: 'alert' });
    const total = el('strong', {});
    const totalTexto = el('span', {});
    const guardar = el('button', { type: 'submit', class: 'agh-guardar' }, icono('check', { tam: 20 }), 'Agendar');
    const cerrarBtn = el('button', { type: 'button', class: 'agh-cerrar', 'aria-label': 'Cerrar', onclick: () => cerrar() }, icono('cerrar', { tam: 20 }));
    const cabecera = el('header', { class: 'agh-cabecera' },
      el('span', { class: 'agh-asa', 'aria-hidden': 'true' }),
      el('div', { class: 'agh-titulo' }, el('h2', {}, fijo ? `Agendar · ${verPatente(fijo.patente) || 'vehículo'}` : 'Agendar vehículo'), cerrarBtn));
    const form = el('form', { class: 'agh-form', novalidate: true }, cuerpo,
      el('footer', { class: 'agh-pie' }, error, el('div', { class: 'agh-total' }, totalTexto, total), guardar));
    const dialogo = el('dialog', { class: 'agh', 'aria-label': 'Agendar vehículo' }, cabecera, form);

    let cerrada = false;
    function cerrar() {
      if (cerrada) return; cerrada = true;
      dialogo.classList.add('sale');
      const fin = () => { dialogo.close(); dialogo.remove(); listo(); };
      dialogo.addEventListener('animationend', fin, { once: true });
      setTimeout(fin, 400);   // sin animación (reducir movimiento)
    }
    dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(); });
    dialogo.addEventListener('click', (ev) => { if (ev.target === dialogo) cerrar(); });   // tocar fuera
    // Deslizar la hoja hacia abajo desde la cabecera la cierra (teléfono)
    let y0 = null;
    cabecera.addEventListener('touchstart', (ev) => { y0 = ev.touches[0].clientY; }, { passive: true });
    cabecera.addEventListener('touchmove', (ev) => { if (y0 != null) dialogo.style.transform = `translateY(${Math.max(0, ev.touches[0].clientY - y0)}px)`; }, { passive: true });
    cabecera.addEventListener('touchend', (ev) => {
      const dy = (ev.changedTouches[0]?.clientY ?? y0) - y0; y0 = null;
      dialogo.style.transform = '';
      if (dy > 90) cerrar();
    }, { passive: true });

    // ---------- Piezas
    const seccion = (titulo, ...hijos) => el('section', { class: 'agh-seccion' }, titulo ? el('h3', {}, titulo) : null, ...hijos);
    const segmento = (opciones, actual, alElegir, etiqueta) => el('div', { class: 'agh-segmento', role: 'radiogroup', 'aria-label': etiqueta },
      opciones.map(([v, t, sub]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(actual === v), onclick: () => alElegir(v) },
        el('span', {}, t), sub ? el('small', {}, sub) : null)));
    const campo = (etiqueta, control, ayuda) => el('label', { class: 'agh-campo' }, el('span', {}, etiqueta), control, ayuda ? el('small', { class: 'texto-suave' }, ayuda) : null);
    const entrada = (valor, alEscribir, attrs = {}) => {
      const i = el('input', { class: 'campo', value: valor ?? '', ...attrs });
      i.addEventListener('input', () => alEscribir(i.value));
      return i;
    };

    // Elegir un cliente existente: su teléfono, sus vehículos (si tiene uno, queda elegido) y el "por cotizar"
    const elegirCliente = (c, patente = null) => {
      e.cliente = c; e.primera = false;
      if (c.telefono) e.contacto = c.telefono;
      const suyos = listaVeh.filter((x) => x.tercero_id === c.id);
      if (e.vehiculo && e.vehiculo.tercero_id !== c.id) e.vehiculo = null;
      const porPatente = patente && patente.length >= 3 ? suyos.filter((x) => x.patente?.includes(patente)) : [];
      if (!e.vehiculo && (suyos.length === 1 || porPatente.length === 1)) e.vehiculo = porPatente.length === 1 ? porPatente[0] : suyos[0];
      if (c.por_cotizar && servicioCotizar && !e.servicios.has(servicioCotizar.id)) {
        e.servicios.add(servicioCotizar.id);
        avisar(`${nombreTercero(c)} va por cotizar: se marcó "${servicioCotizar.nombre}" y la orden queda con Factura.`);
      }
      pintar();
    };

    // ---- Cliente
    const parteCliente = () => {
      if (fijo) {
        return seccion('Cliente', e.cliente
          ? el('div', { class: 'agh-elegido' }, el('span', { class: 'agh-avatar' }, icono('users', { tam: 18 })),
            el('div', {}, el('strong', {}, nombreTercero(e.cliente)), e.cliente.telefono ? el('small', {}, e.cliente.telefono) : null))
          : el('p', { class: 'texto-suave' }, 'Vehículo sin dueño registrado.'),
        campo('Teléfono de contacto', entrada(e.contacto, (t) => { e.contacto = t; }, { type: 'tel', inputmode: 'tel', autocomplete: 'off' })));
      }
      const pregunta = segmento([[false, 'Ya es cliente', 'Lo busco'], [true, 'Primera vez', 'Cliente nuevo']], e.primera,
        (v) => { e.primera = v; if (v) { e.cliente = null; e.vehiculo = null; } pintar(); (v ? cuerpo.querySelector('.agh-nombre') : cuerpo.querySelector('.agh-buscar input'))?.focus(); },
        '¿Es su primera vez con nosotros?');
      const hijos = [pregunta];
      if (e.primera === true) {
        hijos.push(el('div', { class: 'agh-fila' },
          campo('Nombre', entrada(e.nombre, (t) => { e.nombre = t; }, { class: 'campo agh-nombre', autocomplete: 'off', autocapitalize: 'words' })),
          campo('Teléfono', entrada(e.contacto, (t) => { e.contacto = t; }, { type: 'tel', inputmode: 'tel', autocomplete: 'off', placeholder: '+56 9 …' }))));
      } else if (e.primera === false && e.cliente) {
        hijos.push(el('div', { class: 'agh-elegido' },
          el('span', { class: 'agh-avatar' }, icono('users', { tam: 18 })),
          el('div', {}, el('strong', {}, nombreTercero(e.cliente)), el('small', {}, [e.cliente.telefono, `${listaVeh.filter((x) => x.tercero_id === e.cliente.id).length} vehículos`].filter(Boolean).join(' · '))),
          el('button', { type: 'button', class: 'agh-cambiar', onclick: () => { e.cliente = null; e.vehiculo = null; pintar(); cuerpo.querySelector('.agh-buscar input')?.focus(); } }, 'Cambiar')),
        campo('Teléfono de contacto', entrada(e.contacto, (t) => { e.contacto = t; }, { type: 'tel', inputmode: 'tel', autocomplete: 'off' })));
      } else if (e.primera === false) {
        const resultados = el('div', { class: 'agh-resultados', role: 'listbox', 'aria-label': 'Clientes' });
        const buscar = (q) => {
          q = q.trim().toLowerCase();
          const dig = soloDigitos(q); const pat = normalizarPatente(q);
          const hallados = !q ? [] : listaClientes.filter((c) => nombreTercero(c).toLowerCase().includes(q)
            || (dig.length >= 4 && soloDigitos(c.telefono).includes(dig))
            || (pat && pat.length >= 3 && listaVeh.some((x) => x.tercero_id === c.id && x.patente?.includes(pat)))).slice(0, 6);
          resultados.replaceChildren(...(hallados.length ? hallados.map((c) => el('button', { type: 'button', role: 'option', class: 'agh-resultado', onclick: () => elegirCliente(c, pat) },
            el('strong', {}, nombreTercero(c)),
            el('small', {}, [c.telefono, ...listaVeh.filter((x) => x.tercero_id === c.id).slice(0, 3).map((x) => verPatente(x.patente))].filter(Boolean).join(' · '))))
            : q ? [el('div', { class: 'agh-nada' }, el('span', {}, 'No aparece.'), el('button', { type: 'button', class: 'agh-cambiar', onclick: () => { e.primera = true; e.nombre = /\d/.test(q) ? '' : q.replace(/\b\w/g, (l) => l.toUpperCase()); if (dig.length >= 8) e.contacto = q; pintar(); } }, 'Es primera vez'))] : []));
        };
        const caja = entrada('', buscar, { type: 'search', placeholder: 'Nombre, teléfono o patente', autocomplete: 'off', 'aria-label': 'Buscar cliente' });
        hijos.push(el('label', { class: 'agh-buscar' }, icono('buscar', { tam: 18 }), caja), resultados);
      }
      return seccion('¿Es su primera vez con nosotros?', ...hijos);
    };

    // ---- Vehículo
    // Datos de una patente nueva (Edge Function "patente" con GetAPI): marca, modelo, año y talla sugerida. Una consulta
    // por patente; llena solo lo que está vacío o lo que llenó una consulta anterior, nunca lo que escribió la persona.
    const consultadas = new Map();
    let espera = null;
    const VALIDA = /^([A-Z]{4}\d{2}|[A-Z]{2}\d{4}|[A-Z]{3}\d{2,3})$/;
    const consultarPatente = (p) => {
      clearTimeout(espera);
      if (!p || !VALIDA.test(p)) { if (e.info) { e.info = null; refrescarVehiculo(); } return; }
      espera = setTimeout(async () => {
        if (!consultadas.has(p)) {
          e.info = { clase: 'buscando', texto: 'Buscando los datos de la patente…' }; refrescarVehiculo();
          consultadas.set(p, ctx.api.functions.invoke('patente', { body: { empresa_id: ctx.empresa.id, patente: p } })
            .then(async ({ data, error }) => {
              if (error) { const cuerpo = await error.context?.json?.().catch(() => null); return { error: cuerpo?.error || error.message, sinClave: cuerpo?.sinClave }; }
              return data;
            }).catch((x) => ({ error: x.message })));
        }
        const r = await consultadas.get(p);
        if (normalizarPatente(e.nuevo.patente) !== p || e.vehiculo) return;   // ya escribió otra o eligió un vehículo
        if (r?.sinClave) e.info = null;
        else if (r?.error) e.info = { clase: 'mal', texto: `No se pudo buscar la patente: ${r.error}. Escribe los datos a mano.` };
        else if (!r?.encontrado) e.info = { clase: 'mal', texto: 'No encontramos esa patente: escribe los datos a mano.' };
        else {
          const auto = e.auto ?? {};
          const poner = (k, v) => { if (v != null && v !== '' && (!e.nuevo[k] || e.nuevo[k] === auto[k])) { e.nuevo[k] = String(v); auto[k] = String(v); } };
          poner('marca', r.marca); poner('modelo', r.modelo); poner('anio', r.anio);
          if (r.talla && (!e.tallaTocada)) { e.nuevo.talla = r.talla; }
          e.auto = auto;
          e.info = { clase: 'ok', texto: [[r.marca, r.modelo].filter(Boolean).join(' '), r.anio, r.color, r.tipo, r.talla ? `talla ${r.talla} sugerida` : null].filter(Boolean).join(' · ') };
        }
        refrescarVehiculo();
      }, 450);
    };
    // Repinta la hoja sin perder el cursor en la patente
    const refrescarVehiculo = () => {
      const foco = document.activeElement?.classList.contains('agh-patente');
      pintar();
      if (foco) { const i = cuerpo.querySelector('.agh-patente'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
    };

    const parteVehiculo = () => {
      if (e.primera === null && !fijo) return null;
      if (e.vehiculo) {
        const veces = vecesDe(e.vehiculo.id);
        return seccion('Vehículo',
          el('div', { class: 'agh-vehiculo' }, placa(e.vehiculo.patente),
            el('div', {}, el('strong', {}, nombreAuto(e.vehiculo)), el('small', {}, [`Talla ${e.vehiculo.talla || 'M'}`, e.vehiculo.anio, veces ? `vino ${veces} ${veces === 1 ? 'vez' : 'veces'}` : 'primera visita'].filter(Boolean).join(' · '))),
            fijo ? null : el('button', { type: 'button', class: 'agh-cambiar', onclick: () => { e.vehiculo = null; pintar(); } }, 'Otro')));
      }
      const suyos = e.cliente ? listaVeh.filter((x) => x.tercero_id === e.cliente.id) : [];
      const aviso = el('div', { class: 'agh-conocido', hidden: true });
      const info = el('div', { class: `agh-patente-info${e.info ? ` ${e.info.clase}` : ''}`, 'aria-live': 'polite', hidden: !e.info }, e.info ? [e.info.clase === 'buscando' ? el('span', { class: 'cargador', 'aria-hidden': 'true' }) : icono(e.info.clase === 'ok' ? 'check' : 'alerta', { tam: 18 }), el('span', {}, e.info.texto)] : null);
      const vista = el('div', { class: 'agh-placa-vista' }, placa(e.nuevo.patente || ''));
      const patente = entrada(e.nuevo.patente, (t) => {
        e.nuevo.patente = t.toUpperCase();
        vista.replaceChildren(placa(e.nuevo.patente));
        const p = normalizarPatente(t);
        const x = p && p.length >= 5 && listaVeh.find((y) => y.patente === p);
        aviso.hidden = !x;
        if (!x) consultarPatente(p);
        if (x) {
          const dueno = clienteDe(x.tercero_id); const veces = vecesDe(x.id);
          aviso.replaceChildren(icono('check', { tam: 18 }), el('span', {}, [nombreAuto(x), veces ? `ya vino ${veces} ${veces === 1 ? 'vez' : 'veces'}` : null, dueno ? `cliente ${nombreTercero(dueno)}` : null].filter(Boolean).join(' · ')),
            el('button', { type: 'button', class: 'agh-cambiar', onclick: () => { e.vehiculo = x; if (dueno && e.cliente?.id !== dueno.id) elegirCliente(dueno); else pintar(); } }, 'Usar'));
        }
      }, { maxlength: 8, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'campo agh-patente', placeholder: 'ABCD12' });
      return seccion('Vehículo',
        suyos.length ? el('div', { class: 'agh-suyos' }, el('span', { class: 'texto-suave texto-chico' }, 'Elige uno de sus vehículos o escribe uno nuevo'),
          el('div', {}, suyos.map((x) => el('button', { type: 'button', class: 'agh-suyo', onclick: () => { e.vehiculo = x; pintar(); } }, placa(x.patente, { tam: 'chica' }), el('small', {}, nombreAuto(x)))))) : null,
        el('div', { class: 'agh-fila agh-fila-placa' }, vista, campo('Patente', patente, 'Si es nueva, se buscan sus datos solos')),
        aviso,
        info,
        el('div', { class: 'agh-fila' },
          campo('Marca', entrada(e.nuevo.marca, (t) => { e.nuevo.marca = t; }, { autocomplete: 'off', autocapitalize: 'words' })),
          campo('Modelo', entrada(e.nuevo.modelo, (t) => { e.nuevo.modelo = t; }, { autocomplete: 'off', autocapitalize: 'words' })),
          campo('Año', entrada(e.nuevo.anio, (t) => { e.nuevo.anio = t; }, { type: 'number', inputmode: 'numeric', min: 1950, max: 2100 }))),
        el('div', { class: 'agh-campo' }, el('span', {}, 'Talla'),
          segmento(TALLAS.map((t) => [t, t, AYUDA_TALLA[t]]), e.nuevo.talla, (t) => { e.nuevo.talla = t; e.tallaTocada = true; pintar(); }, 'Talla')));
    };

    // ---- Servicios (con el precio de la talla) y total
    const parteServicios = () => {
      if (e.primera === null && !fijo) return null;
      return seccion('Servicios', el('div', { class: 'agh-chips' }, servicios.map((s) => {
        const precio = precioTalla(s, talla());
        return el('button', { type: 'button', class: 'agh-chip', 'aria-pressed': String(e.servicios.has(s.id)),
          onclick: (ev) => { if (e.servicios.has(s.id)) e.servicios.delete(s.id); else e.servicios.add(s.id); ev.currentTarget.setAttribute('aria-pressed', String(e.servicios.has(s.id))); pintarTotal(); } },
        el('span', {}, s.nombre), el('small', {}, s.variable ? 'a convenir' : precio != null ? dinero(precio) : ''));
      })));
    };
    const pintarTotal = () => {
      const elegidos = servicios.filter((s) => e.servicios.has(s.id));
      const suma = elegidos.reduce((t, s) => t + (s.variable ? 0 : precioTalla(s, talla()) ?? 0), 0);
      totalTexto.textContent = elegidos.length ? `Total estimado · talla ${talla()}` : 'Sin servicios aún';
      total.textContent = elegidos.length ? `${dinero(suma)}${elegidos.some((s) => s.variable) ? ' + a convenir' : ''}` : '';
    };

    // ---- Cuándo
    const parteCuando = () => {
      if (e.primera === null && !fijo) return null;
      const mas = el('details', { class: 'agh-mas' }, el('summary', {}, 'Prioridad, trabajador y notas'),
        el('div', { class: 'agh-fila' },
          campo('Prioridad', (() => { const s = el('select', { class: 'campo' }, PRIORIDADES.map(([k, n]) => el('option', { value: k, selected: k === e.prioridad }, n))); s.addEventListener('change', () => { e.prioridad = s.value; }); return s; })()),
          campo('Trabajador', (() => { const s = el('select', { class: 'campo' }, el('option', { value: '' }, 'Sin asignar'), trabajadores.lista.filter((t) => t.estado === 'activo').map((t) => el('option', { value: t.id, selected: t.id === e.trabajador }, t.nombre))); s.addEventListener('change', () => { e.trabajador = s.value; }); return s; })())),
        campo('Notas', (() => { const t = Object.assign(el('textarea', { class: 'campo', rows: 2 }), { value: e.notas }); t.addEventListener('input', () => { e.notas = t.value; }); return t; })()));
      return seccion('¿Cuándo?',
        segmento([[false, 'Es una cita'], [true, 'Llegó ahora']], e.llego, (v) => { e.llego = v; if (v) e.fecha = hoyISO(); pintar(); }, '¿Ya está en el taller?'),
        e.llego ? null : el('div', { class: 'agh-fila' },
          campo('Fecha', entrada(e.fecha, (t) => { e.fecha = t; }, { type: 'date', required: true })),
          campo('Hora', entrada(e.hora, (t) => { e.hora = t; }, { type: 'time' }))),
        mas);
    };

    function pintar() {
      const y = cuerpo.scrollTop;
      cuerpo.replaceChildren(...[parteCliente(), parteVehiculo(), parteServicios(), parteCuando()].filter(Boolean));
      cuerpo.scrollTop = y;
      guardar.disabled = e.primera === null && !fijo;
      pintarTotal();
    }

    // ---------- Guardar
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      error.textContent = '';
      guardar.disabled = true; guardar.classList.add('cargando');
      try {
        if (e.primera === true && !e.nombre.trim()) throw new Error('Escribe el nombre del cliente.');
        if (!e.llego && !e.fecha) throw new Error('Indica la fecha de la cita.');
        let veh = e.vehiculo ? { ...e.vehiculo } : null;
        let terceroId = e.cliente?.id ?? null;
        if (e.primera === true) {
          const { data, error: er } = await ctx.api.from('terceros').insert({ empresa_id: ctx.empresa.id, razon_social: e.nombre.trim(), tipo: ['cliente'], telefono: telefono(e.contacto) }).select('id').single();
          if (er) throw new Error(`No se pudo crear el cliente: ${er.message}`);
          terceroId = data.id;
        }
        if (!veh) {
          const patente = normalizarPatente(e.nuevo.patente);
          if (patente) veh = (await ctx.api.from('tal_vehiculos').select('*').eq('empresa_id', ctx.empresa.id).eq('patente', patente).is('deleted_at', null).maybeSingle()).data;
          if (!veh) {
            if (!patente && !e.nuevo.marca.trim() && !e.nuevo.modelo.trim()) throw new Error('Indica la patente o la marca y modelo.');
            const { data, error: er } = await ctx.api.from('tal_vehiculos').insert({
              empresa_id: ctx.empresa.id, tercero_id: terceroId, patente, marca: e.nuevo.marca.trim() || null, modelo: e.nuevo.modelo.trim() || null,
              anio: e.nuevo.anio ? Number(e.nuevo.anio) : null, talla: e.nuevo.talla,
            }).select('*').single();
            if (er) throw new Error(er.message);
            veh = data;
          }
        }
        if (terceroId && !veh.tercero_id) { await ctx.api.from('tal_vehiculos').update({ tercero_id: terceroId }).eq('id', veh.id); veh.tercero_id = terceroId; }
        const terceroOrden = terceroId ?? veh.tercero_id ?? null;
        let cliente = clienteDe(terceroOrden);
        if (terceroOrden && !cliente) cliente = (await ctx.api.from('terceros').select('rut, por_cotizar').eq('id', terceroOrden).maybeSingle()).data;
        const factura = esEmpresa(cliente) || !!cliente?.por_cotizar;
        const elegidos = servicios.filter((s) => e.servicios.has(s.id));
        const numero = await siguienteNumero(ctx);
        const { data: orden, error: er } = await ctx.api.from('tal_ordenes').insert({
          empresa_id: ctx.empresa.id, numero, vehiculo_id: veh.id, tercero_id: terceroOrden, contacto: telefono(e.contacto),
          doc_tipo: factura ? 'factura' : 'boleta',
          estado: e.llego ? 'espera' : 'agendado', prioridad: e.prioridad, trabajador_id: e.trabajador || null,
          fecha_cita: e.llego ? hoyISO() : e.fecha, hora_cita: e.llego ? null : e.hora || null, ingreso_at: e.llego ? new Date().toISOString() : null, notas: e.notas.trim() || null,
          tareas: [...new Set(elegidos.flatMap((s) => s.tareas))].map((t) => ({ t, ok: false })),   // sin repetir tareas comunes
        }).select('id').single();
        if (er) throw new Error(er.message);
        if (elegidos.length) {
          const { error: e2 } = await ctx.api.from('tal_orden_servicios').insert(elegidos.map((s, i) => ({
            orden_id: orden.id, empresa_id: ctx.empresa.id, servicio_id: s.id, nombre: s.nombre, precio: precioTalla(s, veh.talla) ?? 0, orden: i + 1,
          })));
          if (e2) throw new Error(e2.message);
        }
        avisar(`Orden N° ${numero} creada${factura ? ' con Factura' : ''}.`);
        cerrar();
        location.hash = ctx.ruta('taller.orden', { id: orden.id });
      } catch (x) {
        error.textContent = x.message;
      } finally {
        guardar.disabled = false; guardar.classList.remove('cargando');
      }
    });

    pintar();
    document.body.append(dialogo);
    dialogo.showModal();
    cerrarBtn.blur();
  });
}
