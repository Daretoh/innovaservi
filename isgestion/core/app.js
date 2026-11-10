// Arranque de ISgestión: sesión → empresas y permisos → barra con selector → menú → vista.
import { iniciarApi, db, urlApp } from './api.js?v=dd03031';
import { sesionActual, iniciarSesion, cerrarSesion, alCambiarSesion, recuperarClave, errorAuth } from './auth.js?v=dd03031';
import { cargarPermisos, crearPuede } from './permisos.js?v=dd03031';
import { cargarEmpresas, cargarModulosEmpresa, elegirEmpresa, recordarEmpresa, nombreEmpresa } from './empresas.js?v=dd03031';
import { cargarManifiestos, modulosVisibles, apartadosPorCategoria, configModulo } from './modulos.js?v=dd03031';
import { el } from './ui/dom.js?v=dd03031';
import { activarCombos } from './ui/combo.js?v=dd03031';
import { icono } from './ui/iconos.js?v=dd03031';
import { boton } from './ui/tabla.js?v=dd03031';
import inicio from './vistas/inicio.js?v=dd03031';
import mas from './vistas/mas.js?v=dd03031';
import { franja, botonNotificaciones, desactivar } from './push.js?v=dd03031';
import { barraMovil, marcarBarraMovil, bienvenidaInicial, recordarMarca, marcaGuardada, CORTE_TELEFONO } from './movil.js?v=dd03031';
import { botonSoporte } from './soporte.js?v=dd03031';

const COLOR_BASE = '#1f4e8c';
const CLAVE_MINIMA = 10;   // 08 Seguridad §4
const raiz = document.getElementById('app');

// Modo claro u oscuro (preferencia de este navegador, isg.modo: claro | oscuro | sistema; por omisión claro, para que se vea el tema de la empresa). Se aplica como
// data-modo en <html>; el modo oscuro solo cambia las variables de color (core/ui/estilos.css), sobre cualquier tema.
const MODOS = { sistema: ['Modo: como el sistema', 'pantalla'], claro: ['Modo claro', 'sol'], oscuro: ['Modo oscuro', 'luna'] };
const modoGuardado = () => { try { return localStorage.getItem('isg.modo') || 'claro'; } catch { return 'claro'; } };
function aplicarModo() {
  const m = modoGuardado();
  const oscuro = m === 'oscuro' || (m === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.modo = oscuro ? 'oscuro' : 'claro';
  return m;
}
aplicarModo();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', aplicarModo);
function cambiarModo(sig) {
  try { localStorage.setItem('isg.modo', sig); } catch { /* sin almacenamiento: dura hasta recargar */ document.documentElement.dataset.modo = sig === 'oscuro' ? 'oscuro' : 'claro'; return; }
  aplicarModo();
}
// Salir: este dispositivo deja de recibir notificaciones de la cuenta
async function salir() { await desactivar(); await cerrarSesion(); }

function botonModo() {
  const b = el('button', { type: 'button', class: 'boton-icono solo-escritorio' });
  const pintar = () => { const [t, ic] = MODOS[modoGuardado()] ?? MODOS.sistema; b.title = `${t} (toca para cambiar)`; b.setAttribute('aria-label', b.title); b.replaceChildren(icono(ic)); };
  b.addEventListener('click', () => {
    const orden = ['sistema', 'claro', 'oscuro'];
    const sig = orden[(orden.indexOf(modoGuardado()) + 1) % orden.length];
    try { localStorage.setItem('isg.modo', sig); } catch { /* sin almacenamiento: dura hasta recargar */ document.documentElement.dataset.modo = sig === 'oscuro' ? 'oscuro' : 'claro'; }
    aplicarModo(); pintar();
  });
  pintar();
  return b;
}

// Enlace de invitación o recuperación (#access_token=…&type=invite). Se lee antes de que
// Supabase procese la URL, para saber si hay que pedir una contraseña nueva.
const enlace = (() => {
  const p = new URLSearchParams(location.hash.replace(/^#\/?/, ''));
  if (!p.has('access_token') && !p.has('error')) return null;
  return { tipo: p.get('type'), error: p.get('error_description') };
})();

const estado = {
  usuario: null,
  empresas: [],
  empresa: null,
  puede: () => false,
  modulosEmpresa: new Map(),
  visibles: [],
  rutas: new Map(),
  menu: null,
  contenido: null,
  selector: null,
  render: 0,
};

function pantalla(...hijos) {
  raiz.replaceChildren(el('main', { class: 'pantalla-centro' }, ...hijos));
}

// Ingreso y contraseña nueva: panel de marca a la izquierda (se oculta en teléfono) y el formulario
function pantallaAcceso(form) {
  const punto = (t) => el('li', {}, icono('check', { tam: 16 }), t);
  raiz.replaceChildren(el('main', { class: 'acceso' },
    el('aside', { class: 'acceso-marca' },
      el('span', { class: 'acceso-logo' }, 'ISgestión'),
      el('div', {},
        el('h2', {}, 'Personas, operaciones y finanzas de tus empresas en un solo lugar.'),
        el('ul', {}, punto('Una cuenta para todas tus empresas'), punto('Permisos por rol y por módulo'), punto('Funciona en computador, tablet y celular'))),
      el('span', { class: 'acceso-pie' }, `© ${new Date().getFullYear()} ISgroup`)),
    el('div', { class: 'acceso-form' }, form)));
}

// Campo de contraseña con botón para mostrarla
function campoClave(input) {
  const ver = el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Mostrar contraseña', title: 'Mostrar contraseña' }, icono('ojo', { tam: 16 }));
  ver.addEventListener('click', () => {
    const oculta = input.type === 'password';
    input.type = oculta ? 'text' : 'password';
    ver.setAttribute('aria-label', oculta ? 'Ocultar contraseña' : 'Mostrar contraseña');
    ver.classList.toggle('activo', oculta);
  });
  return el('div', { class: 'campo-clave' }, input, ver);
}

// ---------------------------------------------------------------- Login

function pantallaLogin(mensaje = '') {
  document.documentElement.style.setProperty('--empresa', COLOR_BASE);
  delete document.documentElement.dataset.tema;
  document.title = 'ISgestión';
  const error = el('p', { class: 'texto-error', role: 'alert' }, mensaje);
  const entrar = boton('Ingresar', { tipo: 'primario', type: 'submit' });
  const form = el('form', { class: 'tarjeta-login' },
    el('div', { class: 'acceso-titulo' }, el('h1', {}, 'Ingresar'), el('p', { class: 'texto-suave' }, 'Usa el correo y la contraseña de tu cuenta.')),
    el('div', { class: 'form-fila' },
      el('label', { for: 'login-email' }, 'Correo'),
      el('input', { id: 'login-email', name: 'email', type: 'email', class: 'campo', autocomplete: 'username', required: true })),
    el('div', { class: 'form-fila' },
      el('label', { for: 'login-clave' }, 'Contraseña'),
      campoClave(el('input', { id: 'login-clave', name: 'clave', type: 'password', class: 'campo', autocomplete: 'current-password', required: true }))),
    error,
    entrar,
    // Sin contraseña o sin poder entrar: correo con un enlace para crear una nueva (2026-11-02)
    el('button', { type: 'button', class: 'boton-enlace texto-chico', onclick: async (ev) => {
      const email = form.elements.email.value.trim();
      if (!email || !form.elements.email.checkValidity()) { error.textContent = 'Escribe tu correo y vuelve a tocar "¿Olvidaste tu contraseña?".'; form.elements.email.focus(); return; }
      const b = ev.currentTarget; b.disabled = true; error.textContent = '';
      try {
        await recuperarClave(email, urlApp());
        error.className = 'texto-suave'; error.textContent = `Si ${email} tiene cuenta, le llegó un correo con un enlace para crear una contraseña nueva (revisa también spam).`;
      } catch (e) { error.className = 'texto-error'; error.textContent = e.message; } finally { b.disabled = false; }
    } }, '¿Olvidaste tu contraseña?'),
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.className = 'texto-error';
    error.textContent = '';
    entrar.disabled = true;
    const { email, clave } = Object.fromEntries(new FormData(form));
    try {
      const sesion = await iniciarSesion(email.trim(), clave);
      await arrancarSesion(sesion);
    } catch (e) {
      error.textContent = e.message;
      entrar.disabled = false;
    }
  });
  pantallaAcceso(form);
  form.querySelector('input').focus();
}

// Primera contraseña (invitación) o contraseña nueva (recuperación).
function pantallaClave(sesion) {
  const error = el('p', { class: 'texto-error', role: 'alert' });
  const guardar = boton('Guardar contraseña', { tipo: 'primario', type: 'submit' });
  const campo = (id, etiqueta) => el('div', { class: 'form-fila' },
    el('label', { for: id }, etiqueta),
    campoClave(el('input', { id, name: id, type: 'password', class: 'campo', autocomplete: 'new-password', minlength: CLAVE_MINIMA, required: true })));
  const form = el('form', { class: 'tarjeta-login' },
    el('div', { class: 'acceso-titulo' }, el('h1', {}, 'Crea tu contraseña')),
    el('p', {}, `Hola ${sesion.user.email}. Crea tu contraseña para entrar (mínimo ${CLAVE_MINIMA} caracteres).`),
    campo('clave1', 'Contraseña nueva'),
    campo('clave2', 'Repite la contraseña'),
    error,
    guardar,
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { clave1, clave2 } = Object.fromEntries(new FormData(form));
    if (clave1.length < CLAVE_MINIMA) { error.textContent = `Debe tener al menos ${CLAVE_MINIMA} caracteres.`; return; }
    if (clave1 !== clave2) { error.textContent = 'Las contraseñas no coinciden.'; return; }
    guardar.disabled = true;
    const { error: e } = await db().auth.updateUser({ password: clave1 });
    if (e) { error.textContent = errorAuth(e); guardar.disabled = false; return; }
    await arrancarSesion(sesion);
  });
  pantallaAcceso(form);
  form.querySelector('input').focus();
}

// ---------------------------------------------------------------- Sesión y empresa

async function arrancarSesion(sesion) {
  estado.usuario = { id: sesion.user.id, email: sesion.user.email };
  // Bienvenida con el logo de la última empresa usada mientras carga (core/movil.js); reemplaza la pantalla de carga
  const splash = bienvenidaInicial();
  pantalla(el('div', { class: 'arranque', 'aria-busy': 'true', 'aria-label': 'Cargando' }));
  try {
    const [empresas] = await Promise.all([cargarEmpresas(), cargarPermisos()]);
    if (!empresas.length) {
      pantalla(
        el('h1', {}, 'Sin acceso'),
        el('p', { class: 'texto-suave' }, `${estado.usuario.email} no tiene empresas asignadas. Pide acceso al administrador.`),
        el('div', {}, boton('Cerrar sesión', { icono: 'salir', onclick: () => salir() })),
      );
      return;
    }
    estado.empresas = empresas;
    let ultima = null;
    try { ultima = localStorage.getItem('isg.empresa'); } catch { /* sin almacenamiento */ }
    if (ultima === GRUPO && empresas.length > 1) await activarGrupo();
    else await activarEmpresa(elegirEmpresa(empresas));
  } finally {
    splash.cerrar();
  }
}

async function activarEmpresa(empresa) {
  estado.empresa = empresa;
  recordarEmpresa(empresa.id);
  estado.puede = crearPuede(empresa.id);
  const [modulosEmpresa, manifiestos] = await Promise.all([cargarModulosEmpresa(empresa.id), cargarManifiestos()]);
  estado.modulosEmpresa = modulosEmpresa;
  estado.grupo = null;
  // Los módulos del espacio Grupo (espacio: 'grupo') no van en el menú de una empresa
  estado.visibles = modulosVisibles(manifiestos.filter((m) => !m.espacio), modulosEmpresa, estado.puede);
  montar(empresa);
}

// Espacio Grupo (02 Arquitectura §7, "Grupo ISgroup"): todas las empresas del usuario juntas, con sus propios
// módulos (manifiestos con espacio: 'grupo'). Cada vista calcula cada empresa con los permisos que el usuario tiene
// en ella (ctx.grupo: [{ empresa, puede, modulos }]); un ítem con requiere: [modulo, accion] solo se muestra si el
// usuario tiene ese permiso en alguna empresa (con el módulo activo).
async function activarGrupo() {
  const [modulos, manifiestos] = await Promise.all([Promise.all(estado.empresas.map((e) => cargarModulosEmpresa(e.id))), cargarManifiestos()]);
  estado.grupo = estado.empresas.map((e, i) => ({ empresa: e, puede: crearPuede(e.id), modulos: modulos[i] }));
  const enAlguna = (m, a) => estado.grupo.some((g) => g.modulos.has(m) && g.puede(m, a));
  estado.empresa = empresaGrupo(estado.empresas);
  recordarEmpresa(GRUPO);
  estado.puede = enAlguna;
  estado.modulosEmpresa = new Map();
  estado.visibles = manifiestos.filter((m) => m.espacio === 'grupo')
    .map((m) => ({ ...m, menu: m.menu.filter((it) => !it.requiere || enAlguna(...it.requiere)) }))
    .filter((m) => m.menu.some((it) => !it.oculto));
  montar(estado.empresa);
}

const GRUPO = 'grupo';
function empresaGrupo(empresas) {
  return { id: GRUPO, grupo: true, razon_social: 'Grupo', nombre_fantasia: 'Grupo · todas las empresas', rut: empresas.map((e) => e.rut).join(' · '),
    giro: `${empresas.length} empresas`, color: '#334155', config: {} };
}

function montar(empresa) {
  estado.rutas = new Map();
  // Pantallas recorridas en esta empresa (para "Volver"); se guardan en la pestaña para que sobrevivan a una recarga
  try { const g = JSON.parse(sessionStorage.getItem('isg.historial') ?? 'null'); estado.historial = g?.empresa === empresa?.id ? g.h : []; } catch { estado.historial = []; }
  for (const m of estado.visibles) for (const item of m.menu) estado.rutas.set(item.id, { item, modulo: m });
  // Apartados (una opción del menú con sus pantallas como pestañas) y a qué apartado pertenece cada pantalla
  estado.apartados = apartadosPorCategoria(estado.visibles);
  estado.apartadoDe = new Map([...estado.apartados.porId.values()].flatMap((ap) => ap.items.map((it) => [it.id, ap])));

  document.documentElement.style.setProperty('--empresa', empresa.color || COLOR_BASE);
  // Tema visual de la empresa (Administración → Empresa): clasico (sin atributo), taller o moderno
  const tema = empresa.config?.tema;
  if (tema && tema !== 'clasico') document.documentElement.dataset.tema = tema; else delete document.documentElement.dataset.tema;
  document.title = `${nombreEmpresa(empresa)} · ISgestión`;
  const conLogo = empresa.grupo ? Promise.resolve(null) : recordarMarca(db(), empresa);   // logo y color para la próxima bienvenida (core/movil.js)
  pintarApp();
  conLogo.then((logo) => ponerLogo(logo));
  navegar();
}

// ---------------------------------------------------------------- Estructura

function pintarApp() {
  estado.selector = selectorEmpresa();
  ponerLogo(marcaGuardada(estado.empresa.id)?.logo);   // el guardado, sin esperar la descarga
  estado.menu = el('nav', { class: 'menu', 'aria-label': 'Menú principal' });
  estado.contenido = el('main', { class: 'contenido' });
  pintarMenu();
  Promise.resolve(db().rpc('es_equipo')).then(({ data }) => { if (data && estado.consola) estado.consola.hidden = false; }).catch(() => {});
  // Teléfono: el menú es un panel lateral que abre el botón de la barra
  // Teléfono (≤760 px): panel que se abre y cierra. Pantallas mayores: barra completa o compacta (solo iconos,
  // se despliega al pasar el mouse); la preferencia se recuerda en el navegador. En tablet parte compacta.
  const telefono = () => matchMedia('(max-width: 760px)').matches;
  let pref = null;
  try { pref = localStorage.getItem('isg.menu'); } catch { /* sin almacenamiento */ }
  document.body.classList.toggle('menu-compacto', pref ? pref === 'compacto' : matchMedia('(max-width: 1100px)').matches);
  const alternarMenu = (abrir) => {
    if (abrir === false || telefono()) { document.body.classList.toggle('menu-abierto', abrir); return; }
    const compacto = document.body.classList.toggle('menu-compacto');
    try { localStorage.setItem('isg.menu', compacto ? 'compacto' : 'completo'); } catch { /* sin almacenamiento */ }
  };
  estado.menu.addEventListener('click', (ev) => { if (ev.target.closest('a')) alternarMenu(false); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') alternarMenu(false); });
  raiz.replaceChildren(
    el('div', { class: 'app' },
      el('header', { class: 'barra' },
        el('button', { type: 'button', class: 'boton-icono menu-boton', 'aria-label': 'Mostrar u ocultar el menú', title: 'Mostrar u ocultar el menú', onclick: () => alternarMenu() }, icono('menu')),
        el('span', { class: 'marca' }, 'ISgestión'),
        estado.selector,
        el('div', { class: 'barra-espacio' }),
        el('div', { class: 'usuario' },
          (estado.consola = el('a', { class: 'boton boton-secundario boton-chico solo-escritorio', href: 'consola/', hidden: true, title: 'Consola de la plataforma (equipo ISgestión)' }, icono('ajustes', { tam: 14 }), 'Consola')),
          el('button', { type: 'button', class: 'correo solo-escritorio', title: 'Mi PIN personal (crear o cambiar)', onclick: () => import('./pin.js?v=dd03031').then((m) => m.miPin(db())) }, estado.usuario.email),
          (estado.botonNotif = botonNotificaciones(estado.usuario.id, () => (estado.empresa?.grupo ? estado.empresas[0]?.id : estado.empresa?.id))),
          botonModo(),
          el('button', { type: 'button', class: 'boton-icono solo-escritorio', title: 'Cerrar sesión', 'aria-label': 'Cerrar sesión', onclick: () => salir() }, icono('salir')))),
      franja(),
      el('div', { class: 'cuerpo' }, estado.menu, el('div', { class: 'menu-velo', onclick: () => alternarMenu(false) }), estado.contenido),
      // Teléfono: barra de navegación abajo (core/movil.js; oculta en pantallas grandes)
      (estado.barraMovil = barraMovil({ visibles: estado.visibles, apartados: estado.apartados, rutas: estado.rutas, puede: estado.puede, ctx: contexto })),
      // Ayuda con IA (core/soporte.js): conoce solo las pantallas que esta cuenta ve en el menú
      botonSoporte({
        db: db(),
        empresaId: () => (estado.empresa?.grupo ? estado.empresas[0]?.id : estado.empresa?.id),
        pantallas: () => [...estado.rutas.values()].filter(({ item }) => !item.oculto).map(({ item }) => ({ id: item.id, nombre: item.label })),
      }),
    ),
  );
}

// Icono de cada opción del menú (para distinguirlas con la barra compacta): el del manifiesto (item.icono),
// uno según lo que hace la vista, o el del módulo.
const ICONO_VISTA = [
  [/documentos de empresa/i, 'carpeta'], [/panel|resultados|utilidad|grupo/i, 'grafico'], [/tablero/i, 'columnas'], [/agenda|calendario|planificaci/i, 'calendario'],
  [/roles y permisos|firma/i, 'escudo'], [/trabajadores|usuarios|^personas|roles operativos/i, 'users'],
  [/horas|marcaje|asistencia/i, 'reloj'], [/accidentes|salidas m[eé]dicas/i, 'alerta'], [/resumen/i, 'lista'],
  [/precio|cargos y tratos|condiciones/i, 'etiqueta'], [/veh[ií]culos|flota/i, 'camion'], [/servicios/i, 'llave'],
  [/pago|cobro|venta|^caja$|gastos|cuentas|por cobrar|cierres/i, 'dinero'],
  [/stock|movimientos|almacenes|conteo|solicitudes/i, 'caja'], [/tareas|matriz|estado documental/i, 'check'],
  [/auditor/i, 'ojo'], [/empresa|clientes/i, 'building'], [/dise[ñn]o|par[aá]metros|categor[ií]as|tipos de/i, 'ajustes'],
  [/documento|fichas|partes|informe|registros|requisitos|cotizaciones/i, 'documento'],
];
const iconoVista = (it) => it.icono ?? ICONO_VISTA.find(([re]) => re.test(it.label))?.[1] ?? it.modulo.icono;

// Con pocas pantallas (p. ej. alguien que solo tiene Taller), el menú muestra cada pantalla en vez de un apartado con
// pestañas: así un operador ve Tablero, Calendario, Agenda… directo en la columna (pedido de Enzo, 2026-10-27).
const MAX_MENU_EXPANDIDO = 10;

function pintarMenu() {
  const enlace = (href, ic, texto) => el('a', { href, title: texto }, icono(ic), el('span', { class: 'menu-texto' }, texto));
  const total = [...estado.apartados.grupos.values()].flat().reduce((s, ap) => s + ap.items.length, 0);
  estado.menuExpandido = total <= MAX_MENU_EXPANDIDO;
  // Grupos plegables (Enzo, 2026-11-02): el título abre o cierra el grupo y se recuerda en el navegador (isg.menu.cerrados)
  let cerrados = [];
  try { cerrados = JSON.parse(localStorage.getItem('isg.menu.cerrados') ?? '[]'); } catch { /* sin almacenamiento */ }
  const plegar = (ev) => {
    const g = ev.currentTarget.closest('.menu-grupo');
    const cerrado = g.classList.toggle('cerrado');
    ev.currentTarget.setAttribute('aria-expanded', String(!cerrado));
    const ahora = [...estado.menu.querySelectorAll('.menu-grupo.cerrado')].map((x) => x.dataset.grupo);
    try { localStorage.setItem('isg.menu.cerrados', JSON.stringify(ahora)); } catch { /* sin almacenamiento */ }
  };
  const enlaces = (apartados) => apartados.flatMap((ap) => {
    if (estado.menuExpandido) return ap.items.map((it) => { const a = enlace(`#/${it.id}`, iconoVista(it), it.label); a.dataset.vista = it.id; return a; });
    const a = enlace(`#/${ap.items[0].id}`, ap.items.length > 1 ? ap.icono : iconoVista(ap.items[0]), ap.items.length > 1 ? ap.label : ap.items[0].label);
    a.dataset.apartado = ap.id;
    return [a];
  });
  // Orden (Enzo, 2026-11-02): los módulos sin categoría (Tareas) van fijos arriba, junto a Inicio; RRHH al final
  const categorias = [...estado.apartados.grupos].filter(([c]) => c).sort(([a], [b]) => (a === 'RRHH') - (b === 'RRHH'));
  const fijos = estado.apartados.grupos.get('') ?? [];
  const grupos = categorias.map(([categoria, apartados]) =>
    el('div', { class: `menu-grupo${cerrados.includes(categoria) ? ' cerrado' : ''}`, 'data-grupo': categoria },
      el('h3', {}, el('button', { type: 'button', class: 'menu-plegar', 'aria-expanded': String(!cerrados.includes(categoria)), onclick: plegar },
        el('span', {}, categoria), icono('abajo', { tam: 14 }))),
      enlaces(apartados)));
  // En el Grupo no hay Inicio: su primera pantalla hace de inicio
  const arriba = [...(estado.empresa.grupo ? [] : [enlace('#/', 'inicio', 'Inicio')]), ...enlaces(fijos)];
  estado.menu.replaceChildren(...(arriba.length ? [el('div', { class: 'menu-grupo' }, arriba)] : []), ...grupos);
}

// Logo de la empresa en el selector de la barra, en lugar del punto de color (si la empresa tiene logo)
function ponerLogo(logo) {
  const punto = estado.selector?.querySelector('.punto, .selector-logo');
  if (!logo || !punto) return;
  punto.replaceWith(el('img', { class: 'selector-logo', src: logo, alt: '' }));
}

// Selector de empresa en la barra (02 Arquitectura §7). Oculto si tiene una sola.
function selectorEmpresa() {
  const nombre = el('span', {}, estado.empresa.grupo ? 'Grupo' : nombreEmpresa(estado.empresa));
  if (estado.empresas.length < 2) {
    return el('div', { class: 'selector' }, el('span', { class: 'selector-boton', 'aria-label': 'Empresa' }, el('span', { class: 'punto' }), nombre));
  }
  const filtro = el('input', { type: 'search', class: 'campo', placeholder: 'Buscar empresa…', 'aria-label': 'Buscar empresa' });
  const opciones = el('div', { role: 'listbox' });
  const lista = el('div', { class: 'selector-lista', hidden: true }, filtro, opciones,
    el('div', { class: 'atajo' }, 'Ctrl+K para cambiar de empresa'));
  const botonSel = el('button', { type: 'button', class: 'selector-boton', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
    el('span', { class: 'punto' }), nombre, icono('abajo', { tam: 16 }));

  function pintarOpciones() {
    const q = filtro.value.trim().toLowerCase();
    // Primera opción: el espacio Grupo (todas las empresas juntas)
    const grupo = !q || 'grupo todas las empresas'.includes(q) ? (() => {
      const op = el('button', { type: 'button', class: 'selector-opcion selector-grupo', role: 'option', 'aria-current': String(!!estado.empresa.grupo) },
        el('span', { class: 'selector-grupo-icono' }, icono('building', { tam: 14 })), 'Grupo', el('span', { class: 'rut' }, 'todas las empresas'));
      op.addEventListener('click', () => { cerrar(); if (!estado.empresa.grupo) { history.replaceState(null, '', `${location.pathname}${location.search}#/`); activarGrupo(); } });
      return op;
    })() : null;
    opciones.replaceChildren(...(grupo ? [grupo] : []), ...estado.empresas
      .filter((e) => !q || `${nombreEmpresa(e)} ${e.rut}`.toLowerCase().includes(q))
      .map((e) => {
        const op = el('button', { type: 'button', class: 'selector-opcion', role: 'option', 'aria-current': String(e.id === estado.empresa.id) },
          el('span', { class: 'punto', style: `background:${e.color || COLOR_BASE}` }),
          nombreEmpresa(e), el('span', { class: 'rut' }, e.rut));
        op.addEventListener('click', () => {
          cerrar(); if (e.id === estado.empresa.id) return;
          if (estado.empresa.grupo) history.replaceState(null, '', `${location.pathname}${location.search}#/`);   // las vistas del Grupo no existen en una empresa
          activarEmpresa(e);
        });
        return op;
      }));
  }
  function abrir() {
    lista.hidden = false; botonSel.setAttribute('aria-expanded', 'true');
    filtro.value = ''; pintarOpciones(); filtro.focus();
  }
  function cerrar() { lista.hidden = true; botonSel.setAttribute('aria-expanded', 'false'); }

  botonSel.addEventListener('click', () => (lista.hidden ? abrir() : cerrar()));
  filtro.addEventListener('input', pintarOpciones);
  filtro.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') opciones.querySelector('.selector-opcion')?.click();
    if (ev.key === 'Escape') { cerrar(); botonSel.focus(); }
  });
  const contenedor = el('div', { class: 'selector' }, botonSel, lista);
  contenedor.abrir = abrir;
  contenedor.cerrar = cerrar;
  return contenedor;
}

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k' && estado.selector?.abrir) {
    ev.preventDefault();
    estado.selector.abrir();
  }
});
// Casillas redondas (estilos.css): el destello solo cuando la persona marca, no al pintar una lista ya marcada
document.addEventListener('change', (ev) => {
  const c = ev.target;
  if (c.matches?.('.casilla > input[type="checkbox"]:not(.interruptor), input[type="checkbox"].casilla-sola')) c.classList.toggle('casilla-anim', c.checked);
});
document.addEventListener('click', (ev) => {
  if (estado.selector?.cerrar && !estado.selector.contains(ev.target)) estado.selector.cerrar();
});

// ---------------------------------------------------------------- Rutas (#/<modulo>.<vista>?param=valor)

// Arma el enlace a una vista: ruta('rrhh.ficha', { p: id }) → '#/rrhh.ficha?p=…'
export function ruta(id, params = {}) {
  const q = new URLSearchParams(params).toString();
  return `#/${id}${q ? `?${q}` : ''}`;
}

// Contexto que reciben las vistas (y la acción del "+" de la barra del teléfono)
function contexto(query = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?')[1] ?? '') {
  return {
    empresa: estado.empresa,
    usuario: estado.usuario,
    puede: estado.puede,
    api: db(),
    params: Object.fromEntries(new URLSearchParams(query)),
    ruta,
    hayVista: (id) => estado.rutas.has(id),   // la pantalla existe para esta empresa y rol (no oculta)
    refrescar: navegar,
    // Espacio Grupo: las empresas con los permisos del usuario en cada una, y abrir una pantalla en una empresa
    grupo: estado.grupo,
    empresas: estado.empresas,
    abrirEnEmpresa: (empresa, hash) => { history.pushState(null, '', `${location.pathname}${location.search}${hash}`); activarEmpresa(empresa); },
  };
}

async function navegar() {
  if (!estado.contenido) return;
  const [id, query = ''] = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?');
  const actual = estado.rutas.get(id);
  // Se marca el apartado de la vista (las vistas ocultas, ej.: la ficha, marcan el de su vista padre).
  const resaltar = actual?.item.padre ?? id;
  // Si la pantalla padre está oculta para la empresa (vista compartida), se marca el apartado de su módulo
  const apartado = estado.apartadoDe?.get(resaltar) ?? [...(estado.apartadoDe?.values() ?? [])].find((ap) => ap.items.some((it) => it.id.split('.')[0] === id.split('.')[0]));
  for (const a of estado.menu.querySelectorAll('a')) {
    const marcado = a.dataset.vista ? a.dataset.vista === resaltar
      : apartado ? a.dataset.apartado === apartado.id : a.getAttribute('href') === `#/${resaltar}`;
    a.toggleAttribute('aria-current', marcado);
    if (marcado) { a.setAttribute('aria-current', 'page'); a.closest('.menu-grupo.cerrado')?.classList.remove('cerrado'); }
  }
  marcarBarraMovil(estado.barraMovil, id, actual?.item.padre);
  anotarHistorial(id);
  const turno = ++estado.render;
  const ctx = contexto(query);

  if (id === 'mas') {
    const nodo = mas(ctx, {
      empresas: estado.empresas, cambiarEmpresa: (e) => { location.hash = '#/'; activarEmpresa(e); }, apartados: estado.apartados,
      modo: modoGuardado, cambiarModo, abrirNotificaciones: () => estado.botonNotif?.click(), salir, iconoDe: (it) => iconoVista({ ...it, modulo: estado.rutas.get(it.id)?.modulo ?? {} }),
    });
    if (estado.vistaActual !== location.hash) nodo.classList.add('vista-entra');
    estado.contenido.replaceChildren(nodo); estado.vistaActual = location.hash; return;
  }

  // En el Grupo, el inicio es su primera pantalla
  if (!id && estado.empresa.grupo) {
    const primera = estado.visibles[0]?.menu.find((it) => !it.oculto);
    if (primera) { history.replaceState(null, '', `${location.pathname}${location.search}#/${primera.id}`); navegar(); return; }
  }
  if (!id) {
    const nodo = inicio(ctx, estado.visibles, { abrirNotificaciones: () => estado.botonNotif?.click() });
    if (estado.vistaActual !== '') nodo.classList.add('vista-entra');
    estado.contenido.replaceChildren(nodo); estado.vistaActual = ''; return;
  }

  if (!actual) {
    // Un enlace de otra empresa (ej.: el taller abierto con InnovaServi elegida): ofrecer abrirlo en las otras
    const nodo = estadoVacio('candado', 'Sección no disponible', 'No existe o tu rol no tiene acceso en esta empresa.');
    const otras = estado.empresas.filter((e) => !e.grupo && e.id !== estado.empresa?.id);
    nodo.querySelector('.listado-acciones').prepend(...otras.map((e) => el('button', { type: 'button', class: 'boton boton-secundario', onclick: () => activarEmpresa(e) }, `Abrir en ${nombreEmpresa(e)}`)));
    estado.contenido.replaceChildren(nodo);
    return;
  }
  // Al refrescar la misma vista no se borra lo que hay mientras carga (evita parpadeo y salto de scroll).
  const nueva = estado.vistaActual !== location.hash;
  if (nueva) estado.contenido.replaceChildren(esqueleto());
  estado.vistaActual = location.hash;
  try {
    const vista = (await actual.item.vista()).default;
    const nodo = await vista({ ...ctx, config: configModulo(actual.modulo, estado.modulosEmpresa.get(actual.modulo.id)) });
    if (nueva) nodo.classList.add('vista-entra');   // solo al llegar a otra vista, no al refrescar la misma
    // Icono de la vista junto al título (el mismo del menú)
    const h1 = nodo.querySelector?.(':scope > .listado-cabecera > h1, :scope > header > h1, :scope > .listado-cabecera > div > h1');
    if (h1 && !h1.querySelector('.titulo-icono')) h1.prepend(el('span', { class: 'titulo-icono' }, icono(iconoVista({ ...(actual.item.padre ? estado.rutas.get(actual.item.padre)?.item ?? actual.item : actual.item), modulo: actual.modulo }), { tam: 20 })));
    // Pestañas del apartado (si tiene más de una pantalla), sobre la vista; no en las vistas ocultas (fichas)
    const ap = !actual.item.oculto && !estado.menuExpandido ? estado.apartadoDe.get(id) : null;   // con el menú expandido las pestañas ya están en él
    const contenido = ap && ap.items.length > 1
      ? el('div', { class: `apartado${nueva ? ' vista-entra' : ''}` },
        el('nav', { class: 'pestanas pestanas-apartado', 'aria-label': ap.label },
          ap.items.map((it) => el('a', { class: 'pestana', href: `#/${it.id}`, 'aria-current': it.id === id ? 'page' : null, title: it.pestana ? it.label : null }, it.pestana ?? it.label))),
        nodo)
      : nodo;
    if (contenido !== nodo) nodo.classList.remove('vista-entra');
    ajustarVolver(nodo, id);
    if (turno === estado.render) estado.contenido.replaceChildren(contenido);
  } catch (e) {
    if (turno === estado.render) {
      estado.contenido.replaceChildren(estadoVacio('alerta', 'No se pudo cargar', e.message, true));
    }
  }
}
// "Volver" vuelve a la pantalla de donde se llegó (pedido de Enzo, 2026-11-03): de Facturas a una cotización y
// "Volver" debe dejar en Facturas, no en la lista de cotizaciones. Se anota cada pantalla visitada; ir a la
// penúltima es volver (se saca la última) y cambiar solo los parámetros de la misma pantalla la reemplaza.
function anotarHistorial(id) {
  const h = estado.historial ??= [];
  const hash = location.hash || '#/';
  if (h.at(-1) === hash) return;
  const idDe = (x) => x.replace(/^#\/?/, '').split('?')[0];
  if (h.at(-2) === hash) h.pop();
  else if (h.length && idDe(h.at(-1)) === id) h[h.length - 1] = hash;
  else h.push(hash);
  if (h.length > 50) h.shift();
  try { sessionStorage.setItem('isg.historial', JSON.stringify({ empresa: estado.empresa?.id, h })); } catch { /* sin almacenamiento */ }
}
// Los enlaces "Volver" de las fichas (a.volver, y el del taller en el teléfono) apuntan a la pantalla anterior, con su
// nombre, si se llegó desde otra pantalla; si se abrió directo (enlace, recarga), queda el destino fijo de la vista.
function ajustarVolver(nodo, id) {
  const previo = estado.historial?.at(-2);
  if (!previo) return;
  const idPrevio = previo.replace(/^#\/?/, '').split('?')[0];
  if (idPrevio === id) return;
  const nombre = idPrevio === '' ? 'Inicio' : estado.rutas.get(idPrevio)?.item.label ?? (idPrevio === 'mas' ? 'Más' : null);
  if (!nombre) return;
  for (const a of nodo.querySelectorAll?.('a.volver, a.om-volver') ?? []) {
    if (a.getAttribute('href') === previo) continue;
    a.setAttribute('href', previo);
    a.onclick = null;
    if (a.classList.contains('om-volver')) { a.setAttribute('aria-label', `Volver a ${nombre}`); continue; }
    for (const n of [...a.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    a.append(nombre);
  }
}
window.addEventListener('hashchange', navegar);
// Inicio, Tablero, Orden y Agenda tienen versión de teléfono: al cruzar el corte (girar la tablet, achicar la ventana) se repintan
matchMedia(CORTE_TELEFONO).addEventListener('change', () => { if (estado.contenido?.isConnected) navegar(); });

// Pantalla vacía o de error: icono, título, texto y acceso a Inicio (o reintentar)
function estadoVacio(ic, titulo, texto, reintentar = false) {
  return el('section', { class: 'estado-vacio' },
    el('span', { class: 'estado-vacio-icono' }, icono(ic, { tam: 28 })),
    el('h1', {}, titulo),
    el('p', { class: reintentar ? 'texto-error' : 'texto-suave' }, texto),
    el('div', { class: 'listado-acciones' },
      reintentar ? el('button', { type: 'button', class: 'boton boton-primario', onclick: () => navegar() }, 'Reintentar') : null,
      el('a', { class: `boton ${reintentar ? 'boton-secundario' : 'boton-primario'}`, href: '#/' }, 'Ir al inicio')));
}

// Bloques grises animados mientras llega la vista
// Mientras carga una vista: el cargador al centro (aparece tras un instante para no parpadear en cargas rápidas)
function esqueleto() {
  return el('div', { class: 'cargando-vista', 'aria-busy': 'true', 'aria-label': 'Cargando' }, el('span', { class: 'cargador', 'aria-hidden': 'true' }));
}

// ---------------------------------------------------------------- Inicio

async function arrancar() {
  activarCombos(document.body);   // listas largas con búsqueda y sugerencias en toda la app (core/ui/combo.js)
  try {
    await iniciarApi();
    alCambiarSesion((evento) => {
      if (evento === 'SIGNED_OUT') {
        estado.contenido = null;
        estado.selector = null;
        pantallaLogin();
      }
    });
    const sesion = await sesionActual();
    if (enlace) history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    if (enlace?.error) pantallaLogin('El enlace no es válido o ya expiró. Pide una nueva invitación.');
    else if (sesion && (enlace?.tipo === 'invite' || enlace?.tipo === 'recovery')) pantallaClave(sesion);
    else if (sesion) await arrancarSesion(sesion);
    else pantallaLogin();
  } catch (err) {
    pantalla(el('h1', {}, 'ISgestión'), el('p', { class: 'texto-error' }, err.message));
  }
}

arrancar();
