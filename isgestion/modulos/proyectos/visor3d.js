// Visor 3D de Proyectos: muebles (mallas del exportador de SketchUp, en R2), la construcción completa (muros, pisos,
// cielos y piezas, con sus líneas, texturas y etiquetas) y áreas con cada objeto en su posición real.
// Modos: órbita, Recorrer (como D5: teclado o joystick en pantalla), Mirar con la tablet (giroscopio) y realidad
// aumentada en Android (WebXR). three.js 0.147.0 (jsDelivr, versión fija) se carga solo al abrir un 3D.
// SketchUp (cm, Z arriba) → visor (m, Y arriba): (x, y, z) → (x/100, z/100, -y/100).
import { el } from '../../core/ui/dom.js?v=4b574d1';
import { icono } from '../../core/ui/iconos.js?v=4b574d1';
import { boton } from '../../core/ui/tabla.js?v=4b574d1';
import { urlsFirmadas } from '../../core/adjuntos.js?v=4b574d1';
import { instanciasDe, subtotal, tienePrecio, clp, fmtNum } from './datos.js?v=4b574d1';

const CDN3 = 'https://cdn.jsdelivr.net/npm/three@0.147.0/';
const cargarScript = (src) => new Promise((ok, mal) => {
  const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error(src));
  document.head.append(s);
});
let cargaThree = null;
export function asegurarThree() {
  if (window.THREE?.OrbitControls) return Promise.resolve();
  cargaThree ??= (async () => {
    if (!window.THREE) await cargarScript(`${CDN3}build/three.min.js`);
    if (!window.THREE.OrbitControls) await cargarScript(`${CDN3}examples/js/controls/OrbitControls.js`);
  })().catch((e) => { cargaThree = null; throw e; });
  return cargaThree;
}

// ---------------------------------------------------------------- Mallas y texturas (R2, con caché)
const cache = new Map();     // modelo_id:id → datos
const rutas = new Map();     // modelo_id → Map(id → ruta)
const texCache = new Map();  // modelo_id:id → THREE.Texture
async function rutasDe(ctx, modeloId) {
  if (rutas.has(modeloId)) return rutas.get(modeloId);
  const { data, error } = await ctx.api.from('pro_mallas').select('m3d, ruta').eq('modelo_id', modeloId).is('deleted_at', null);
  if (error) throw new Error(error.message);
  const m = new Map(data.map((x) => [x.m3d, x.ruta]));
  rutas.set(modeloId, m);
  return m;
}
export const olvidarMallas = (modeloId) => rutas.delete(modeloId);
// Deja una malla ya leída en la caché (por ejemplo la que se acaba de subir)
export const precargarMalla = (modeloId, id, datos) => cache.set(`${modeloId}:${id}`, datos);
export async function cargarMallas(ctx, modeloId, ids) {
  const faltan = [...new Set(ids)].filter((id) => !cache.has(`${modeloId}:${id}`));
  if (faltan.length) {
    const r = await rutasDe(ctx, modeloId);
    const conRuta = faltan.filter((id) => r.has(id));
    for (let i = 0; i < conRuta.length; i += 150) {
      const trozo = conRuta.slice(i, i + 150);
      const urls = await urlsFirmadas(ctx.api, trozo.map((id) => r.get(id)), 300);
      await Promise.all(trozo.map(async (id) => {
        const u = urls.get(r.get(id)); if (!u) return;
        const resp = await fetch(u).catch(() => null);
        if (!resp?.ok) return;
        // Las partes de la construcción vienen comprimidas (gzip)
        const datos = /\.gz$/.test(r.get(id)) ? await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json() : await resp.json();
        cache.set(`${modeloId}:${id}`, datos);
      }));
    }
  }
  return new Map(ids.filter((id) => cache.has(`${modeloId}:${id}`)).map((id) => [id, cache.get(`${modeloId}:${id}`)]));
}
// Texturas que usan unas mallas (Map id → THREE.Texture). Las que no están subidas se ven con su color.
export async function texturasPara(ctx, modeloId, datos) {
  const { THREE } = window;
  const ids = [...new Set(datos.flatMap((d) => (d?.mats ?? []).map((m) => m.t).filter(Boolean)))];
  const faltan = ids.filter((id) => !texCache.has(`${modeloId}:${id}`));
  if (faltan.length) {
    const r = await rutasDe(ctx, modeloId);
    const conRuta = faltan.filter((id) => r.has(id));
    const urls = conRuta.length ? await urlsFirmadas(ctx.api, conRuta.map((id) => r.get(id)), 3600).catch(() => new Map()) : new Map();
    const cargador = new THREE.TextureLoader(); cargador.setCrossOrigin('anonymous');
    await Promise.all(conRuta.map((id) => new Promise((ok) => {
      const u = urls.get(r.get(id)); if (!u) { ok(); return; }
      cargador.load(u, (t) => {
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
        texCache.set(`${modeloId}:${id}`, t); ok();
      }, undefined, () => ok());
    })));
  }
  return new Map(ids.filter((id) => texCache.has(`${modeloId}:${id}`)).map((id) => [id, texCache.get(`${modeloId}:${id}`)]));
}

const colorDe = (c) => new window.THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();
// Materiales compartidos dentro de un mismo grupo (cache): un mueble resalta solo sus copias, no todo lo del mismo color
function material(m, texturas, materiales = new Map()) {
  const { THREE } = window;
  const a = m.a ?? 1;
  const tex = m.t && Array.isArray(m.uv) ? texturas?.get(m.t) : null;
  const clave = `${m.c?.join(',')}|${a}|${tex ? m.t : ''}`;
  if (!materiales.has(clave)) {
    materiales.set(clave, new THREE.MeshLambertMaterial({ color: tex ? 0xffffff : colorDe(m.c ?? [205, 205, 200]), map: tex ?? null,
      transparent: a < 1, opacity: a, side: THREE.DoubleSide, depthWrite: a >= 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  }
  return materiales.get(clave);
}
function geometria(m) {
  const { THREE } = window;
  const p = m.p; const arr = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { arr[i] = p[i] / 100; arr[i + 1] = p[i + 2] / 100; arr[i + 2] = -p[i + 1] / 100; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  if (m.t && Array.isArray(m.uv) && m.uv.length === (p.length / 3) * 2) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(m.uv), 2));
  geo.computeVertexNormals();
  return geo;
}
function mallasAThree(d, texturas) {
  const { THREE } = window;
  const g = new THREE.Group(); const cache = new Map();
  for (const m of d.mats || []) if (m.p?.length) g.add(new THREE.Mesh(geometria(m), material(m, texturas, cache)));
  return g;
}

// ---------------------------------------------------------------- Visor reutilizable
const css = (v, d) => getComputedStyle(document.body).getPropertyValue(v).trim() || d;
const rayoDesde = (v, e) => {
  const { THREE } = window;
  const r = v.renderer.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), v.camera);
  return ray;
};
// three.js no salta lo oculto: solo cuenta lo que se ve (recintos o etiquetas apagadas, cajas invisibles para el clic)
const seVe = (q) => { for (; q; q = q.parent) if (!q.visible) return false; return true; };
export function crearVisor(cont) {
  const { THREE } = window;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.xr.enabled = true;
  renderer.domElement.classList.add('pro-lienzo');
  renderer.domElement.tabIndex = 0;
  cont.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(css('--fondo-sutil', '#fafbfc')).convertSRGBToLinear();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9488, 0.85));
  const sol = new THREE.DirectionalLight(0xfff6e8, 0.75); sol.position.set(4, 7, 3); scene.add(sol);
  const relleno = new THREE.DirectionalLight(0xe8f0ff, 0.25); relleno.position.set(-5, 3, -4); scene.add(relleno);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 500);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.05; controls.screenSpacePanning = true; controls.zoomSpeed = 1.4;
  const v = { cont, renderer, scene, camera, controls, obj: null, grid: null, radio: 1, raf: 0, alElegir: null, marcados: [], resaltado: null };
  let abajo = null;
  // Sin selección de texto ni arrastre nativo desde el lienzo (cortaban el movimiento con el mouse)
  ['selectstart', 'dragstart', 'contextmenu'].forEach((t) => renderer.domElement.addEventListener(t, (e) => e.preventDefault()));
  renderer.domElement.addEventListener('mousedown', (e) => { e.preventDefault(); renderer.domElement.focus({ preventScroll: true }); });
  renderer.domElement.addEventListener('pointerdown', (e) => { abajo = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 6 || !v.obj || !(v.alElegir || v.alMedir)) return;
    const ray = rayoDesde(v, e);
    const hits = ray.intersectObject(v.obj, true).filter((h) => h.object.isMesh && seVe(h.object));
    const hit = hits[0];
    if (v.alMedir) { if (hit) v.alMedir(hit.point.clone()); return; }
    const filaDe = (q) => { while (q && !q.userData.fila) q = q.parent; return q; };
    // Lo primero que toca; si es la construcción, un objeto del inventario justo detrás (piezas dentro de muros)
    let o = filaDe(hit?.object);
    if (!o && hit && !hit.object.userData.escena) o = filaDe(hits.find((h) => h.distance - hit.distance < 0.05 && filaDe(h.object))?.object);
    limpiarMarcas(v);
    const fila = o?.userData.fila ?? null;
    if (fila) {
      // Resalta todas las copias del mismo ítem
      v.obj.traverse((q) => { if (q.userData.fila === fila) q.traverse((w) => { if (w.isMesh) [].concat(w.material).forEach((m) => { if (m.emissive && !m.userData.foco) { m.emissive.setHex(0x0b3a5c); v.marcados.push(m); } }); }); });
      v.alElegir?.(fila);
    } else if (hit?.object.userData.escena) {
      const info = piezaDeEscena(v, hit);
      v.alElegir?.(info);
    } else v.alElegir?.(null);
  });
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (v.paso || !v.obj) return;
    const hit = rayoDesde(v, e).intersectObject(v.obj, true).find((h) => h.object.isMesh && seVe(h.object));
    if (!hit) return;
    const mover = hit.point.clone().sub(controls.target);
    controls.target.add(mover); camera.position.add(mover.multiplyScalar(0.6)); controls.update();
  });
  new ResizeObserver(() => tam(v)).observe(cont);
  return v;
}
function limpiarMarcas(v) {
  v.marcados.forEach((m) => m.emissive?.setHex(0x000000));
  v.marcados = [];
  if (v.resaltado) { v.resaltado.parent?.remove(v.resaltado); v.resaltado.geometry.dispose(); v.resaltado = null; }
}
// Pieza de la construcción tocada: su nombre, medidas, etiqueta y ruta; se resaltan todos sus triángulos
function piezaDeEscena(v, hit) {
  const { THREE } = window;
  const u = hit.object.userData.escena;
  const idx = u.o?.[hit.faceIndex];
  const obj = idx != null ? u.objetos?.[idx] : null;
  if (!obj) return { escena: true, nombre: 'Construcción', etiqueta: u.etiqueta };
  const pos = [];
  hit.object.parent.parent?.traverse((q) => {
    const w = q.userData.escena;
    if (!q.isMesh || !w || w.parte !== u.parte || !w.o) return;
    const p = q.geometry.attributes.position.array;
    for (let t = 0; t < w.o.length; t++) if (w.o[t] === idx) for (let k = 0; k < 9; k++) pos.push(p[t * 9 + k]);
  });
  if (pos.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    v.resaltado = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1f7ae0, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    v.resaltado.renderOrder = 5;
    hit.object.parent.add(v.resaltado);
  }
  return { escena: true, nombre: obj.n, medidas_cm: obj.m, etiqueta: obj.e, ruta: obj.r };
}
function tam(v) {
  const w = v.cont.clientWidth; const h = v.cont.clientHeight;
  if (!w || !h || v.renderer.xr.isPresenting) return;
  v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
}
function bucle(v) {
  if (!v.renderer.domElement.isConnected) { v.raf = 0; v.renderer.dispose(); v.alSalir?.(); return; }   // se dejó la vista
  if (v.ar) { v.raf = 0; return; }   // en realidad aumentada dibuja la sesión XR
  if (v.pausado) { v.antes = null; v.raf = requestAnimationFrame(() => bucle(v)); return; }   // oculto: no dibuja
  const ahora = performance.now(); const dt = Math.min(0.1, (ahora - (v.antes ?? ahora)) / 1000); v.antes = ahora;
  if (v.paso) v.paso(dt); else v.controls.update();
  v.renderer.render(v.scene, v.camera);
  v.raf = requestAnimationFrame(() => bucle(v));
}
export function camara(v, modo) {
  if (!v?.obj) return;
  const d = v.radio * 2.6;
  const pos = { iso: [d * 0.8, d * 0.55, d * 0.9], frente: [0, d * 0.12, d * 1.15], lado: [d * 1.15, d * 0.12, 0], arriba: [0, d * 1.2, 0.0001] }[modo] || [d, d, d];
  v.camera.position.set(...pos); v.controls.target.set(0, 0, 0); v.controls.update();
}

// ---------------------------------------------------------------- Recorrer
// Como D5 o un juego: W A S D o flechas para caminar, arrastrar para mirar, Q / E para bajar y subir, Shift para ir
// más rápido, la rueda avanza o retrocede y el doble clic lleva hasta ese punto. En pantallas táctiles, un joystick
// para caminar y el dedo para mirar. Con "Mirar con la tablet" la vista sigue al giroscopio. Parte a la altura de una
// persona (1,60 m sobre el piso del modelo).
const ALTURA = 1.6;
const tactil = () => window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window;
export function recorrer(v, on) {
  const { THREE } = window;
  const lienzo = v.renderer.domElement;
  if (!on) { v.limpiarRecorrido?.(); return; }
  if (v.paso) return;
  v.controls.enabled = false;
  v.fovOrbita = v.camera.fov; v.camera.fov = 65; v.camera.updateProjectionMatrix();   // ángulo amplio, como al caminar
  const dir = new THREE.Vector3(); v.camera.getWorldDirection(dir);
  let yaw = Math.atan2(-dir.x, -dir.z); let pitch = 0;
  const desde = v.inicio ?? v.controls.target;
  v.camera.position.set(desde.x, (v.piso ?? 0) + ALTURA, desde.z);
  const teclas = new Set();
  const joy = { x: 0, y: 0 };
  // Solo se ignoran las teclas al escribir en un campo de texto (no en casillas ni botones de la barra)
  const enCampo = (e) => { const t = e.target; return t?.isContentEditable || /TEXTAREA|SELECT/.test(t?.tagName ?? '') || (t?.tagName === 'INPUT' && !/checkbox|radio|button|range/.test(t.type)); };
  const abajo = (e) => { if (enCampo(e)) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { teclas.add(k); e.preventDefault(); } };
  const arriba = (e) => teclas.delete(e.key.toLowerCase());
  let arrastre = null;
  const capturar = (n, id) => { try { n.setPointerCapture(id); } catch { /* sin captura */ } };
  const pd = (e) => { if (e.button > 0) return; arrastre = [e.clientX, e.clientY]; capturar(lienzo, e.pointerId); };
  const pm = (e) => {
    if (!arrastre || giro.activo) return;
    const f = e.pointerType === 'touch' ? 0.006 : 0.004;
    yaw -= (e.clientX - arrastre[0]) * f; pitch -= (e.clientY - arrastre[1]) * f;
    pitch = Math.max(-1.45, Math.min(1.45, pitch)); arrastre = [e.clientX, e.clientY];
  };
  const pu = () => { arrastre = null; };
  const soltarTodo = () => { arrastre = null; teclas.clear(); };   // al cambiar de ventana no quedan teclas pegadas
  const rueda = (e) => { e.preventDefault(); const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); v.camera.position.addScaledVector(f, -Math.sign(e.deltaY) * 0.5); };
  const doble = (e) => {
    e.preventDefault();
    const hit = rayoDesde(v, e).intersectObject(v.obj, true).find((h) => h.object.isMesh && seVe(h.object));
    if (!hit) return;
    // Va hasta ese punto, a la altura de los ojos sobre lo que tocó (piso) o frente a él (muro)
    const p = hit.point; const de = v.camera.position.clone();
    const hacia = new THREE.Vector3(p.x, Math.max((v.piso ?? 0) + ALTURA, Math.min(p.y + ALTURA, de.y)), p.z);
    const atras = hacia.clone().sub(de).setY(0).normalize().multiplyScalar(0.4);
    if (Math.abs(hit.face?.normal?.y ?? 0) < 0.5) hacia.sub(atras);
    v.camera.position.copy(hacia);
  };
  window.addEventListener('keydown', abajo); window.addEventListener('keyup', arriba);
  lienzo.addEventListener('pointerdown', pd); lienzo.addEventListener('pointermove', pm); lienzo.addEventListener('pointerup', pu);
  lienzo.addEventListener('pointercancel', pu); lienzo.addEventListener('lostpointercapture', pu); window.addEventListener('blur', soltarTodo);
  lienzo.addEventListener('wheel', rueda, { passive: false }); lienzo.addEventListener('dblclick', doble);
  lienzo.style.cursor = 'grab';

  // Joystick en pantalla (tablet y teléfono): caminar con el pulgar; dos botones para subir y bajar
  let mando = null;
  if (tactil()) {
    const perilla = el('div', { class: 'pro-joy-perilla' });
    const base = el('div', { class: 'pro-joy', 'aria-label': 'Caminar' }, perilla);
    const subir = el('button', { type: 'button', class: 'pro-joy-alt', 'aria-label': 'Subir' }, icono('arriba', { tam: 18 }));
    const bajar = el('button', { type: 'button', class: 'pro-joy-alt', 'aria-label': 'Bajar' }, icono('abajo', { tam: 18 }));
    const alto = (k) => ({ onpointerdown: () => teclas.add(k), onpointerup: () => teclas.delete(k), onpointerleave: () => teclas.delete(k) });
    Object.entries(alto('e')).forEach(([ev, f]) => subir.addEventListener(ev.slice(2), f));
    Object.entries(alto('q')).forEach(([ev, f]) => bajar.addEventListener(ev.slice(2), f));
    let id = null;
    const mover = (e) => {
      const r = base.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2; const rad = r.width / 2;
      let dx = (e.clientX - cx) / rad; let dy = (e.clientY - cy) / rad; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      joy.x = dx; joy.y = dy; perilla.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
    };
    base.addEventListener('pointerdown', (e) => { id = e.pointerId; capturar(base, id); mover(e); e.stopPropagation(); });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) mover(e); });
    const soltar = () => { id = null; joy.x = 0; joy.y = 0; perilla.style.transform = ''; };
    base.addEventListener('pointerup', soltar); base.addEventListener('pointercancel', soltar);
    mando = el('div', { class: 'pro-mando' }, base, el('div', { class: 'pro-joy-alturas' }, subir, bajar));
    v.cont.append(mando);
  }

  // Mirar con la tablet: el giroscopio gira la vista (la posición sigue con el joystick o el doble toque)
  const giro = { activo: false, q: null, ajuste: null };
  const zee = new THREE.Vector3(0, 0, 1); const euler = new THREE.Euler(); const q0 = new THREE.Quaternion();
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
  const alGirar = (e) => {
    if (e.alpha == null) return;
    const g = THREE.MathUtils.DEG2RAD;
    const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * g;
    const q = new THREE.Quaternion();
    euler.set(e.beta * g, e.alpha * g, -e.gamma * g, 'YXZ'); q.setFromEuler(euler); q.multiply(q1); q.multiply(q0.setFromAxisAngle(zee, -orient));
    if (!giro.ajuste) {
      // La primera lectura deja la vista mirando hacia donde ya miraba (calibrar)
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      giro.ajuste = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw - Math.atan2(-f.x, -f.z));
    }
    giro.q = giro.ajuste.clone().multiply(q);
  };
  v.giroscopio = async (activar) => {
    if (!activar) {
      window.removeEventListener('deviceorientation', alGirar);
      giro.activo = false; giro.q = null; giro.ajuste = null;
      const d = new THREE.Vector3(); v.camera.getWorldDirection(d);
      yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
      return true;
    }
    if (typeof DeviceOrientationEvent === 'undefined') throw new Error('Este equipo no tiene giroscopio.');
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {   // iPad y iPhone piden permiso
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') throw new Error('Sin permiso para usar el movimiento del equipo.');
    }
    giro.ajuste = null; giro.activo = true;
    window.addEventListener('deviceorientation', alGirar);
    return true;
  };
  v.recalibrar = () => { giro.ajuste = null; };

  v.paso = (dt) => {
    const rapido = teclas.has('shift') ? 4 : 1.4;
    if (giro.activo && giro.q) {
      v.camera.quaternion.copy(giro.q);
      const d = new THREE.Vector3(); v.camera.getWorldDirection(d); yaw = Math.atan2(-d.x, -d.z);
    }
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); const der = new THREE.Vector3(-f.z, 0, f.x);
    const m = new THREE.Vector3();
    if (teclas.has('w') || teclas.has('arrowup')) m.add(f);
    if (teclas.has('s') || teclas.has('arrowdown')) m.sub(f);
    if (teclas.has('d') || teclas.has('arrowright')) m.add(der);
    if (teclas.has('a') || teclas.has('arrowleft')) m.sub(der);
    if (m.lengthSq()) v.camera.position.addScaledVector(m.normalize(), rapido * dt);
    if (joy.x || joy.y) v.camera.position.addScaledVector(f, -joy.y * 1.4 * dt).addScaledVector(der, joy.x * 1.4 * dt);
    if (teclas.has('e')) v.camera.position.y += rapido * dt;
    if (teclas.has('q')) v.camera.position.y -= rapido * dt;
    if (!(giro.activo && giro.q)) {
      const mira = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      v.camera.lookAt(v.camera.position.clone().add(mira));
    }
  };
  v.limpiarRecorrido = () => {
    window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba);
    window.removeEventListener('deviceorientation', alGirar);
    lienzo.removeEventListener('pointerdown', pd); lienzo.removeEventListener('pointermove', pm); lienzo.removeEventListener('pointerup', pu);
    lienzo.removeEventListener('pointercancel', pu); lienzo.removeEventListener('lostpointercapture', pu); window.removeEventListener('blur', soltarTodo);
    lienzo.removeEventListener('wheel', rueda); lienzo.removeEventListener('dblclick', doble);
    lienzo.style.cursor = '';
    mando?.remove();
    // Vuelve a la órbita mirando hacia donde estaba mirando
    const d = new THREE.Vector3(); v.camera.getWorldDirection(d);
    v.controls.target.copy(v.camera.position).addScaledVector(d, 2);
    v.camera.fov = v.fovOrbita ?? 38; v.camera.updateProjectionMatrix();
    v.paso = null; v.limpiarRecorrido = null; v.alSalir = null; v.giroscopio = null; v.recalibrar = null; v.controls.enabled = true; v.controls.update();
  };
  v.alSalir = v.limpiarRecorrido;
}

export function aristas(v, on) { v?.obj?.traverse((o) => { if (o.userData.arista) o.visible = on; }); }

// Pone un objeto en el visor (centrado, con grilla) y devuelve el texto de medidas
function poner(v, escena, conAristas) {
  const { THREE } = window;
  limpiarMarcas(v);
  if (v.obj) v.scene.remove(v.obj);
  if (v.grid) v.scene.remove(v.grid);
  const raiz = new THREE.Group(); raiz.add(escena);
  const linea = new THREE.LineBasicMaterial({ color: 0x2b2f2d, transparent: true, opacity: 0.5 });
  const mallas = [];
  escena.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.escena) mallas.push(o); });
  for (const o of mallas) {
    const g = o.geometry;
    const eg = g.userData.aristas || (g.userData.aristas = new THREE.EdgesGeometry(g, 28));
    const a = new THREE.LineSegments(eg, linea); a.userData.arista = true; o.add(a);
  }
  raiz.updateMatrixWorld(true);
  // Caja total (las copias instanciadas se miden una por una: Box3.setFromObject no las mide en r147)
  const caja = new THREE.Box3(); const b = new THREE.Box3(); const mi = new THREE.Matrix4();
  escena.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mi); caja.union(b.copy(o.geometry.boundingBox).applyMatrix4(mi).applyMatrix4(o.matrixWorld)); }
    else caja.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  if (caja.isEmpty()) caja.setFromObject(escena);
  const t = caja.getSize(new THREE.Vector3()); const centro = caja.getCenter(new THREE.Vector3());
  escena.position.sub(centro);
  v.obj = raiz; v.scene.add(raiz);
  v.radio = Math.max(t.x, t.y, t.z) / 2 || 0.5;
  const g = new THREE.GridHelper(Math.max(t.x, t.z) * 2.2 || 1, 12, new THREE.Color(css('--borde', '#dde1e7')), new THREE.Color(css('--fondo-hundido', '#eef1f5')));
  g.position.y = -t.y / 2; v.grid = g; v.scene.add(g);
  v.piso = -t.y / 2;
  aristas(v, conAristas);
  tam(v); camara(v, 'iso');
  if (!v.raf) bucle(v);
  const cm = (n) => String(Math.round(n * 1000) / 10).replace('.', ',');
  return `Ancho ${cm(Math.max(t.x, t.z))} · Fondo ${cm(Math.min(t.x, t.z))} · Alto ${cm(t.y)} cm`;
}
export const ponerMueble = (v, datos, conAristas = true, texturas = null) => poner(v, mallasAThree(datos, texturas), conAristas);

// Matriz SketchUp (origen y ejes, en cm) a la del visor
const matrizSU = (a) => new window.THREE.Matrix4().set(a[3], a[6], a[9], a[0], a[4], a[7], a[10], a[1], a[5], a[8], a[11], a[2], 0, 0, 0, 1);

// Arma un área o zona: muebles con su malla en `pos` y piezas como cajas orientadas (`cajas`, `color`)
async function armarArea(ctx, modeloId, filas, inv) {
  const { THREE } = window;
  const partes = []; let ligadas = 0;
  for (const x of filas) {
    const its = instanciasDe(x, inv);
    if (its.length) ligadas++;
    for (const it of its) {
      if (it.m3d && it.pos?.length) partes.push({ fila: x, it, m3d: it.m3d, lista: it.pos });
      else if (it.cajas?.length) partes.push({ fila: x, it, lista: it.cajas });
    }
  }
  if (!partes.length) return { vacio: ligadas ? 'Para ver áreas completas en 3D vuelve a enviar el modelo desde SketchUp: ahora guarda dónde está cada objeto.' : 'Ninguna fila de aquí está ligada a objetos del modelo. Agrégalas desde la vista Modelo SketchUp.' };
  // Las partidas que suman todo el modelo pueden traer objetos de otras salas: se dejan los que están juntos
  const os = partes.flatMap((pp) => pp.lista);
  const mediana = (l) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
  const mx = mediana(os.map((a) => a[0])); const my = mediana(os.map((a) => a[1]));
  const lim = Math.max(600, 3 * mediana(os.map((a) => Math.hypot(a[0] - mx, a[1] - my))));
  const cerca = (a) => Math.hypot(a[0] - mx, a[1] - my) <= lim;
  const mallas = await cargarMallas(ctx, modeloId, partes.filter((pp) => pp.m3d).map((pp) => pp.m3d));
  const texturas = await texturasPara(ctx, modeloId, [...mallas.values()]).catch(() => new Map());
  const C = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, -0.01, 0, 0, 0, 0, 0, 1); const Ci = C.clone().invert();
  const raiz = new THREE.Group(); const lineas = [];
  let n = 0; let fuera = 0;
  for (const pp of partes) {
    const lista = pp.lista.filter((a) => (cerca(a) ? true : (fuera++, false)));
    if (!lista.length) continue;
    if (pp.m3d) {
      const d = mallas.get(pp.m3d); if (!d) continue;
      const base = mallasAThree(d, texturas);
      for (const a of lista) {
        const o = base.clone(); o.matrixAutoUpdate = false;
        o.matrix.multiplyMatrices(C, matrizSU(a)).multiply(Ci);
        o.userData.fila = pp.fila; raiz.add(o); n++;
      }
    } else {
      const c = pp.it.color || [196, 196, 190];
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0.5, 0.5);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: colorDe(c), side: THREE.DoubleSide }), lista.length);
      lista.forEach((a, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(C, matrizSU(a)));
        const q = (u) => { const x = a[0] + a[3] * u[0] + a[6] * u[1] + a[9] * u[2]; const y = a[1] + a[4] * u[0] + a[7] * u[1] + a[10] * u[2]; const z = a[2] + a[5] * u[0] + a[8] * u[1] + a[11] * u[2]; return [x / 100, z / 100, -y / 100]; };
        [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 1, 0, 0, 1, 0], [1, 1, 0, 1, 0, 0], [1, 1, 0, 1, 1, 1],
          [1, 0, 1, 0, 0, 1], [1, 0, 1, 1, 1, 1], [1, 0, 1, 1, 0, 0], [0, 1, 1, 0, 0, 1], [0, 1, 1, 1, 1, 1], [0, 1, 1, 0, 1, 0]]
          .forEach((e) => lineas.push(...q(e.slice(0, 3)), ...q(e.slice(3))));
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      im.userData.fila = pp.fila; raiz.add(im); n += lista.length;
    }
  }
  if (lineas.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2f2d, transparent: true, opacity: 0.35 }));
    l.userData.arista = true; raiz.add(l);
  }
  if (!n) return { vacio: 'No se pudieron cargar los objetos de esta área (falta subir sus mallas 3D).' };
  return { raiz, n, ligadas, fuera };
}

// ---------------------------------------------------------------- Ventana grande
// opciones: { modeloId, m3d } (un mueble), { modeloId, filas, inv, alElegir } (un área o zona) o
// { modeloId, inv, foco } (todo el modelo con las piezas de la partida `foco` resaltadas)
export async function ventana3d(ctx, titulo, opciones) {
  const msg = el('div', { class: 'pro-v3-msg' }, 'Cargando…');
  const cuerpo = el('div', { class: 'pro-v3-cuerpo' }, msg);
  const pie = el('span', { class: 'pro-v3-med texto-suave' });
  const chk = el('input', { type: 'checkbox', checked: true });
  let v = null; let vm = null;
  const vistas = ['iso', 'frente', 'lado', 'arriba'].map((m, i) => boton(['3D', 'Frente', 'Lado', 'Arriba'][i], { class: 'boton boton-secundario boton-chico', onclick: () => camara(v, m) }));
  const pieza = opciones.foco ? boton('La pieza', { icono: 'buscar', class: 'boton boton-secundario boton-chico', title: 'Volver a acercar la cámara a la pieza', onclick: () => vm?.encuadrar() }) : null;
  chk.addEventListener('change', () => aristas(v, chk.checked));
  const dialogo = el('dialog', { class: 'modal pro-v3', 'aria-label': titulo },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, titulo),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => { dialogo.close(); dialogo.remove(); } }, icono('cerrar'))),
    cuerpo,
    el('div', { class: 'pro-v3-pie' }, pie, pieza, vistas, opciones.foco ? null : el('label', { class: 'casilla' }, chk, 'Aristas')));
  document.body.append(dialogo);
  dialogo.showModal();
  try { await asegurarThree(); } catch { msg.textContent = 'No se pudo cargar el visor 3D. Revisa la conexión a internet.'; return; }
  try {
    if (opciones.foco) {
      vm = await vistaModelo(ctx, cuerpo, { modeloId: opciones.modeloId, inv: opciones.inv, alProgreso: (t) => { msg.textContent = t; } });
      if (vm.sinPosiciones) { msg.textContent = 'Para ubicar piezas, vuelve a enviar el modelo desde SketchUp: ahora guarda dónde está cada objeto.'; return; }
      v = vm.visor;
      const n = vm.resaltar(opciones.foco);
      pie.textContent = n ? `${n} ${n === 1 ? 'pieza resaltada' : 'piezas resaltadas'} en el modelo · arrastra para girar, rueda para acercar` : 'Esta partida no se encontró en el 3D del modelo.';
    } else if (opciones.m3d) {
      const datos = (await cargarMallas(ctx, opciones.modeloId, [opciones.m3d])).get(opciones.m3d);
      if (!datos) { msg.textContent = 'Este mueble todavía no tiene su archivo 3D: envía de nuevo el modelo desde SketchUp.'; return; }
      const texturas = await texturasPara(ctx, opciones.modeloId, [datos]).catch(() => new Map());
      v = crearVisor(cuerpo); pie.textContent = ponerMueble(v, datos, chk.checked, texturas);
    } else {
      msg.textContent = 'Armando el área en 3D…';
      const a = await armarArea(ctx, opciones.modeloId, opciones.filas, opciones.inv);
      if (a.vacio) { msg.textContent = a.vacio; return; }
      v = crearVisor(cuerpo); poner(v, a.raiz, chk.checked);
      const texto = `${a.n} objetos de ${a.ligadas} ${a.ligadas === 1 ? 'partida' : 'partidas'}${a.fuera ? ` · ${a.fuera} lejos de aquí no se muestran` : ''} · Clic en un objeto para ver qué es`;
      pie.textContent = texto;
      v.alElegir = (x) => {
        if (x?.escena) return;
        pie.textContent = x ? [x.item, x.detalle, `${fmtNum(x.cantidad, 'cantidad')} ${x.unidad || ''}`.trim(), tienePrecio(x) ? clp(subtotal(x)) : null].filter(Boolean).join(' · ') : texto;
        if (x) opciones.alElegir?.(x);
      };
    }
    msg.remove();
  } catch (e) { msg.textContent = `No se pudo mostrar el 3D: ${e.message}`; }
}

// ---------------------------------------------------------------- Modelo completo
// Todo el modelo en su lugar: muebles por recinto y la construcción por etiqueta (para mostrar u ocultar), con clic
// para ver qué es, medir, recorrer, mirar con la tablet y realidad aumentada.
export const CONSTRUCCION = 'Construcción (muros, pisos, cielos)';
const nombreEtiqueta = (e) => (!e || e === 'Layer0' || e === 'Untagged' ? 'Sin etiqueta' : e);
export async function vistaModelo(ctx, cont, { modeloId, inv, alElegir, alMedida, alProgreso }) {
  await asegurarThree();
  const { THREE } = window;
  const items = inv.items.filter((it) => (it.m3d && it.pos?.length) || it.cajas?.length);
  const partesEscena = (inv.escena ?? []).map((x) => x.id);
  if (!items.length && !partesEscena.length) return { sinPosiciones: true };
  const ids = [...new Set(items.filter((it) => it.m3d && it.pos?.length).map((it) => it.m3d)), ...partesEscena];
  alProgreso?.(`Cargando el modelo (${ids.length} partes)…`);
  const mallas = await cargarMallas(ctx, modeloId, ids);
  alProgreso?.('Cargando las texturas…');
  const texturas = await texturasPara(ctx, modeloId, [...mallas.values()]).catch(() => new Map());
  const C = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, -0.01, 0, 0, 0, 0, 0, 1); const Ci = C.clone().invert();
  const raiz = new THREE.Group();
  const grupos = new Map();   // recinto → { g, n, lineas }
  const grupoDe = (r) => { if (!grupos.has(r)) { const g = new THREE.Group(); g.userData.recinto = r; grupos.set(r, { g, n: 0, lineas: [] }); raiz.add(g); } return grupos.get(r); };
  const etiquetas = new Map();   // etiqueta → { objetos: [], n }
  const deEtiqueta = (e) => { const k = nombreEtiqueta(e); if (!etiquetas.has(k)) etiquetas.set(k, { objetos: [], n: 0 }); return etiquetas.get(k); };
  for (const it of items) {
    const gr = grupoDe(it.recinto || 'General');
    const et = deEtiqueta(it.etiqueta);
    if (it.m3d && it.pos?.length) {
      const d = mallas.get(it.m3d);
      if (!d) continue;
      const base = mallasAThree(d, texturas);
      for (const a of it.pos) {
        const o = base.clone(); o.matrixAutoUpdate = false;
        o.matrix.multiplyMatrices(C, matrizSU(a)).multiply(Ci);
        o.userData.fila = it; gr.g.add(o); gr.n++; et.objetos.push(o); et.n++;
      }
    } else if (it.cajas?.length) {
      const c = it.color || [196, 196, 190];
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0.5, 0.5);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: colorDe(c), side: THREE.DoubleSide }), it.cajas.length);
      it.cajas.forEach((a, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(C, matrizSU(a)));
        const q = (u) => [(a[0] + a[3] * u[0] + a[6] * u[1] + a[9] * u[2]) / 100, (a[2] + a[5] * u[0] + a[8] * u[1] + a[11] * u[2]) / 100, -(a[1] + a[4] * u[0] + a[7] * u[1] + a[10] * u[2]) / 100];
        [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 1, 0, 0, 1, 0], [1, 1, 0, 1, 0, 0], [1, 1, 0, 1, 1, 1],
          [1, 0, 1, 0, 0, 1], [1, 0, 1, 1, 1, 1], [1, 0, 1, 1, 0, 0], [0, 1, 1, 0, 0, 1], [0, 1, 1, 1, 1, 1], [0, 1, 1, 0, 1, 0]]
          .forEach((e) => gr.lineas.push(...q(e.slice(0, 3)), ...q(e.slice(3))));
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      im.userData.fila = it; gr.g.add(im); gr.n += it.cajas.length; et.objetos.push(im); et.n += it.cajas.length;
    }
  }
  // Construcción (muros, pisos, cielos, piezas) con su forma real, texturas y líneas, por etiqueta
  if (partesEscena.length) {
    const gr = grupoDe(CONSTRUCCION);
    const porEtiqueta = new Map();   // etiqueta → THREE.Group
    const matsEscena = new Map();
    const grupoEt = (e) => {
      const k = nombreEtiqueta(e);
      if (!porEtiqueta.has(k)) { const g = new THREE.Group(); g.userData.etiqueta = k; porEtiqueta.set(k, g); gr.g.add(g); deEtiqueta(k).objetos.push(g); }
      return porEtiqueta.get(k);
    };
    for (const id of partesEscena) {
      const d = mallas.get(id); if (!d) continue;
      for (const m of d.mats ?? []) {
        if (!m.p?.length) continue;
        const malla = new THREE.Mesh(geometria(m), material(m, texturas, matsEscena));
        malla.userData.escena = { parte: id, o: m.o ?? null, objetos: d.objetos ?? [], etiqueta: nombreEtiqueta(m.e) };
        grupoEt(m.e).add(malla);
        const tris = m.p.length / 9; gr.n += tris; deEtiqueta(m.e).n += tris;
      }
      // Líneas: v3 por etiqueta [{ e, p }]; v2 una sola lista
      const conjuntos = Array.isArray(d.lineas) && d.lineas.length && typeof d.lineas[0] === 'object' ? d.lineas : [{ e: null, p: d.lineas ?? [] }];
      for (const c of conjuntos) {
        const l = c.p ?? []; if (!l.length) continue;
        const arr = new Float32Array(l.length);
        for (let i = 0; i < l.length; i += 3) { arr[i] = l[i] / 100; arr[i + 1] = l[i + 2] / 100; arr[i + 2] = -l[i + 1] / 100; }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const ls = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f2321, transparent: true, opacity: 0.5 }));
        ls.userData.linea = true;
        grupoEt(c.e).add(ls);
      }
    }
    gr.n = Math.round(gr.n);
    // Las piezas ya se ven con su forma real: sus cajas quedan invisibles, solo para el clic
    for (const otro of grupos.values()) {
      if (otro === gr) continue;
      otro.lineas = [];
      otro.g.traverse((o) => { if (o.isInstancedMesh) o.material.visible = false; });
    }
  }
  for (const gr of grupos.values()) {
    if (!gr.lineas.length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(gr.lineas, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2f2d, transparent: true, opacity: 0.3 }));
    l.userData.arista = true; gr.g.add(l);
  }
  const v = crearVisor(cont);
  poner(v, raiz, false);
  // Dónde parte el recorrido: donde se juntan los muebles (mediana de sus posiciones), que cae dentro de un recinto
  const os = items.flatMap((it) => it.pos ?? []);
  if (os.length) {
    const med = (l) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
    v.inicio = new THREE.Vector3(med(os.map((a) => a[0])) / 100, 0, -med(os.map((a) => a[1])) / 100).add(raiz.position);
  }
  v.alElegir = (it) => alElegir?.(it);
  // Medir: dos clics en el modelo dan la distancia (en cm); cada medida nueva reemplaza la anterior
  let puntos = []; let marcas = [];
  const limpiar = () => { marcas.forEach((m) => v.scene.remove(m)); marcas = []; puntos = []; };
  const punto = (p) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(Math.min(v.radio / 120, 0.03), 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6b00, depthTest: false }));
    s.position.copy(p); s.renderOrder = 10; v.scene.add(s); marcas.push(s);
  };
  const alMedir = (p) => {
    if (puntos.length === 2) limpiar();
    puntos.push(p); punto(p);
    if (puntos.length === 2) {
      const g = new THREE.BufferGeometry().setFromPoints(puntos);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff6b00, depthTest: false }));
      l.renderOrder = 10; v.scene.add(l); marcas.push(l);
      const [a, b] = puntos;
      const cm = (n) => Math.round(Math.abs(n) * 1000) / 10;
      alMedida?.({ total: cm(a.distanceTo(b)), x: cm(b.x - a.x), y: cm(b.z - a.z), z: cm(b.y - a.y) });
    } else alMedida?.(null);
  };
  const visEt = new Map([...etiquetas.keys()].map((k) => [k, true]));
  const foco = resaltador(v, raiz, inv);
  return {
    visor: v,
    // Pinta las piezas de una partida con el color de la empresa, atenúa el resto y encuadra la cámara en ellas.
    // Devuelve cuántas piezas encontró (0 = no están en el 3D). Con null vuelve a la vista normal.
    resaltar: (x, opciones) => foco.resaltar(x, opciones),
    encuadrar: () => foco.encuadrar(),
    recintos: [...grupos.entries()].map(([nombre, gr]) => ({ nombre, n: gr.n })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    etiquetas: [...etiquetas.entries()].map(([nombre, e]) => ({ nombre, n: Math.round(e.n) })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    mostrar: (r, on) => { const gr = grupos.get(r); if (gr) gr.g.visible = on; },
    mostrarEtiqueta: (e, on) => { visEt.set(e, on); etiquetas.get(e)?.objetos.forEach((o) => { o.visible = on; }); },
    camara: (m) => camara(v, m),
    aristas: (on) => aristas(v, on),
    recorrer: (on) => recorrer(v, on),
    giroscopio: (on) => (v.giroscopio ? v.giroscopio(on) : Promise.reject(new Error('Primero entra a Recorrer.'))),
    recalibrar: () => v.recalibrar?.(),
    medir: (on) => { v.alMedir = on ? alMedir : null; if (!on) limpiar(); },
    ar: realidadAumentada(v),
    // Centra la cámara en un objeto (al elegirlo en la lista)
    enfocar: (it) => {
      const caja = new THREE.Box3(); const b = new THREE.Box3(); const mi = new THREE.Matrix4();
      v.obj.updateMatrixWorld(true);
      v.obj.traverse((o) => {
        if (o.userData.fila !== it) return;
        o.traverse((w) => {
          if (!w.isMesh) return;
          if (!w.geometry.boundingBox) w.geometry.computeBoundingBox();
          if (w.isInstancedMesh) for (let i = 0; i < w.count; i++) { w.getMatrixAt(i, mi); caja.union(b.copy(w.geometry.boundingBox).applyMatrix4(mi).applyMatrix4(w.matrixWorld)); }
          else caja.union(b.copy(w.geometry.boundingBox).applyMatrix4(w.matrixWorld));
        });
      });
      if (caja.isEmpty()) return;
      const c = caja.getCenter(new THREE.Vector3()); const r = Math.max(caja.getSize(new THREE.Vector3()).length(), 0.6);
      v.controls.target.copy(c); v.camera.position.set(c.x + r * 1.4, c.y + r * 1.1, c.z + r * 1.4); v.controls.update();
    },
  };
}

// ---------------------------------------------------------------- Piezas de una partida dentro del modelo
// Para que se entienda dónde va un material: sus piezas en el color de la empresa y todo lo demás atenuado.
// Se buscan así (todo en el inventario y la construcción que ya están cargados):
//   - muebles y conjuntos con malla (`pos`): sus copias en el modelo;
//   - piezas: los triángulos de la construcción del mismo nombre, medidas y grupo padre que estén dentro de sus cajas;
//     si la construcción no las trae (por ejemplo, piezas dentro de un mueble), sus cajas;
//   - conjuntos sin malla: todo lo que la construcción tiene dentro de ellos y las piezas hijas del inventario.
const igualMed = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((n, i) => Math.abs(n - b[i]) < 0.06);
const ultimo = (r) => String(r || '').split(' > ').at(-1);
// ¿Punto del visor (m) dentro de alguna caja de SketchUp (esquina y 3 lados, en cm)? Con 1 cm de holgura.
function dentroDeCajas(cajas, x, y, z) {
  const p = [x * 100, -z * 100, y * 100];
  return cajas.some((a) => {
    const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    for (let k = 3; k < 12; k += 3) {
      const l2 = a[k] * a[k] + a[k + 1] * a[k + 1] + a[k + 2] * a[k + 2];
      if (!l2) continue;
      const t = (d[0] * a[k] + d[1] * a[k + 1] + d[2] * a[k + 2]) / l2; const h = 1 / Math.sqrt(l2);
      if (t < -h || t > 1 + h) return false;
    }
    return true;
  });
}
function resaltador(v, raiz, inv) {
  const { THREE } = window;
  let actual = null;   // { capa, cambiados, caja }
  const quitar = () => {
    if (!actual) return;
    actual.capa.parent?.remove(actual.capa);
    actual.capa.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    actual.cambiados.forEach(([o, m]) => { o.material = m; });
    actual = null;
  };
  const encuadrar = () => {
    const caja = actual?.caja; if (!caja || caja.isEmpty()) return;
    const c = caja.getCenter(new THREE.Vector3()); const s = caja.getSize(new THREE.Vector3()).length();
    // Lo bastante lejos para ver la pieza y lo que la rodea (en qué parte del modelo está)
    const dist = Math.max(s * 1.6, Math.min(v.radio * 1.6, 6), 1.2);
    if (v.paso) v.limpiarRecorrido?.();
    v.controls.target.copy(c);
    v.camera.position.copy(c).add(new THREE.Vector3(0.62, 0.5, 0.6).normalize().multiplyScalar(dist));
    v.controls.update();
  };
  const resaltar = (x, { encuadrar: enc = true } = {}) => {
    quitar();
    if (!x) return 0;
    let its = instanciasDe(x, inv);
    if (!its.length && x.modelo) its = [{ tipo: 'conjunto', nombre: x.modelo }];
    // Conjuntos sin malla: sus piezas hijas también (cajas por si la construcción no las trae)
    const sinMalla = its.filter((it) => it.tipo !== 'pieza' && !it.pos?.length);
    const hijos = sinMalla.flatMap((it) => (inv?.items ?? []).filter((i) => i.padre === it.nombre && i.tipo === 'pieza'));
    const piezas = [...its, ...hijos.filter((h) => !its.includes(h))];
    const enSet = new Set(piezas);
    const conjuntos = new Set(sinMalla.map((it) => it.nombre));
    const acento = new THREE.Color(css('--empresa', '#ff6b00')).convertSRGBToLinear();
    const mAcento = new THREE.MeshLambertMaterial({ color: acento, emissive: acento.clone().multiplyScalar(0.35), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mTenue = new THREE.MeshLambertMaterial({ color: 0xb4b8be, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lTenue = new THREE.LineBasicMaterial({ color: 0x80868e, transparent: true, opacity: 0.32, depthWrite: false });
    mAcento.userData.foco = true; mTenue.userData.foco = true;
    const capa = new THREE.Group(); capa.userData.foco = true;
    const cambiados = []; const caja = new THREE.Box3(); const b = new THREE.Box3(); const mi = new THREE.Matrix4();
    const poner = (o, m) => { cambiados.push([o, o.material]); o.material = m; };
    const filaDe = (q) => { while (q && !q.userData.fila) q = q.parent; return q?.userData.fila; };
    const hechas = new Set(); let n = 0;
    raiz.updateMatrixWorld(true);
    // 1. Muebles de la partida en el color; todo lo demás atenuado (las cajas invisibles siguen invisibles)
    const copias = new Set();
    raiz.traverse((o) => {
      if (o.userData.foco || !(o.isMesh || o.isLine)) return;
      if ([].concat(o.material).some((m) => m?.visible === false)) return;
      const fila = filaDe(o);
      if (o.isMesh && !o.isInstancedMesh && fila && enSet.has(fila)) {
        poner(o, mAcento); hechas.add(fila);
        let g = o; while (g.parent && !g.userData.fila) g = g.parent; copias.add(g);
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        caja.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      } else poner(o, o.isMesh ? mTenue : lTenue);
    });
    n += copias.size;
    // 2. Piezas y conjuntos de la construcción: sus triángulos en una capa aparte
    const buscadas = piezas.filter((it) => it.tipo === 'pieza' && !hechas.has(it));
    const pos = [];
    raiz.traverse((o) => {
      const w = o.userData.escena;
      if (!o.isMesh || !w?.o || !w.objetos?.length || (!buscadas.length && !conjuntos.size)) return;
      const m = new Map();   // índice de objeto → piezas del inventario que calzan (o true si es parte de un conjunto)
      w.objetos.forEach((ob, i) => {
        const its = buscadas.filter((p) => ob.n === p.nombre && ultimo(ob.r) === (p.padre ?? '') && igualMed(ob.m, p.medidas_cm));
        if (its.length) m.set(i, its);
        else if (conjuntos.size && (conjuntos.has(ob.n) || String(ob.r || '').split(' > ').some((r) => conjuntos.has(r)))) m.set(i, true);
      });
      if (!m.size) return;
      const p = o.geometry.attributes.position.array; const vistos = new Set();
      for (let t = 0; t < w.o.length; t++) {
        const its = m.get(w.o[t]); if (!its) continue;
        // Si las piezas traen todas sus cajas, solo cuenta lo que cae dentro (una pieza igual en otro recinto no)
        if (its !== true && its.every((it) => it.cajas?.length >= it.cant)) {
          const i = t * 9; const cx = (p[i] + p[i + 3] + p[i + 6]) / 3; const cy = (p[i + 1] + p[i + 4] + p[i + 7]) / 3; const cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
          if (!its.some((it) => dentroDeCajas(it.cajas, cx, cy, cz))) continue;
        }
        for (let k = 0; k < 9; k++) pos.push(p[t * 9 + k]);
        if (its !== true) its.forEach((it) => hechas.add(it));
        vistos.add(w.o[t]);
      }
      n += vistos.size;
    });
    if (pos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const malla = new THREE.Mesh(g, mAcento); malla.renderOrder = 3; capa.add(malla);
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 28), new THREE.LineBasicMaterial({ color: acento.clone().multiplyScalar(0.45) }));
      l.renderOrder = 4; capa.add(l);
    }
    // 3. Piezas que la construcción no trae: sus cajas
    const C = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, -0.01, 0, 0, 0, 0, 0, 1);
    for (const it of piezas) {
      if (hechas.has(it) || !it.cajas?.length) continue;
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0.5, 0.5);
      const im = new THREE.InstancedMesh(geo, mAcento, it.cajas.length);
      it.cajas.forEach((a, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(C, matrizSU(a))));
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.renderOrder = 3;
      capa.add(im); n += it.cajas.length;
    }
    raiz.add(capa); capa.updateMatrixWorld(true);
    capa.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mi); caja.union(b.copy(o.geometry.boundingBox).applyMatrix4(mi).applyMatrix4(o.matrixWorld)); }
      else caja.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    });
    actual = { capa, cambiados, caja };
    if (!n) { quitar(); return 0; }
    if (enc) encuadrar();
    return n;
  };
  return { resaltar, encuadrar, quitar };
}

// ---------------------------------------------------------------- Realidad aumentada (Android, WebXR)
// El diseño se pone a escala real sobre la cámara. Se ubica así: en Recorrer te paras en el modelo donde estás parado
// en la obra y miras hacia donde miras en la obra; al entrar, ese punto queda bajo tus pies y esa dirección al frente.
// Después se afina con los botones (girar, mover, subir o bajar). Por omisión muestra solo los muebles (la obra real
// pone los muros); "Construcción" la agrega.
function realidadAumentada(v) {
  const { THREE } = window;
  return {
    soportada: async () => {
      try { return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { return false; }
    },
    async iniciar({ conConstruccion = false, alSalir } = {}) {
      if (!navigator.xr) throw new Error('Este navegador no tiene realidad aumentada. En Android usa Chrome.');
      // Punto y dirección del modelo que quedan donde estás: los de Recorrer (o el inicio del recorrido)
      const enRecorrido = !!v.paso;
      const dir = new THREE.Vector3(); v.camera.getWorldDirection(dir);
      const yawModelo = Math.atan2(-dir.x, -dir.z);
      const pie = enRecorrido ? v.camera.position.clone() : (v.inicio ?? v.controls.target).clone();
      const piso = v.piso ?? 0;
      const ajuste = { giro: 0, x: 0, z: 0, y: 0 };
      let base = null;   // { x, z, yaw } del equipo al ubicar
      let reubicar = true;

      // Controles sobre la cámara (DOM overlay)
      const estado = el('div', { class: 'pro-ar-estado' }, 'Mueve el teléfono despacio para que reconozca el piso…');
      const paso = (k, d) => () => { ajuste[k] += d; };
      const b = (txt, ic, f, t) => el('button', { type: 'button', class: 'pro-ar-boton', title: t, 'aria-label': t, onclick: f }, ic ? icono(ic, { tam: 18 }) : null, txt);
      const constr = el('input', { type: 'checkbox', checked: conConstruccion });
      const capa = el('div', { class: 'pro-ar' },
        el('div', { class: 'pro-ar-arriba' }, estado,
          el('label', { class: 'pro-ar-casilla' }, constr, 'Construcción'),
          b('Salir', 'cerrar', () => sesion?.end(), 'Salir de la realidad aumentada')),
        el('div', { class: 'pro-ar-abajo' },
          el('div', { class: 'pro-ar-fila' },
            b('', 'deshacer', paso('giro', 2 * Math.PI / 180), 'Girar a la izquierda'),
            b('Aquí', 'enlace', () => { reubicar = true; Object.assign(ajuste, { giro: 0, x: 0, z: 0, y: 0 }); }, 'Volver a ubicar el diseño donde estoy'),
            b('', 'flecha', paso('giro', -2 * Math.PI / 180), 'Girar a la derecha')),
          el('div', { class: 'pro-ar-fila' },
            b('', 'volver', () => mover(-0.05, 0), 'Mover a la izquierda'),
            b('', 'arriba', () => mover(0, 0.05), 'Mover hacia adelante'),
            b('', 'abajo', () => mover(0, -0.05), 'Mover hacia atrás'),
            b('', 'derecha', () => mover(0.05, 0), 'Mover a la derecha')),
          el('div', { class: 'pro-ar-fila' },
            b('Subir', null, paso('y', 0.02), 'Subir 2 cm'), b('Bajar', null, paso('y', -0.02), 'Bajar 2 cm'))));
      document.body.append(capa);
      // Mover en la dirección en que mira el teléfono (más natural que los ejes del modelo)
      let yawEquipo = 0;
      const mover = (dx, dz) => {
        const f = new THREE.Vector3(-Math.sin(yawEquipo), 0, -Math.cos(yawEquipo)); const der = new THREE.Vector3(-f.z, 0, f.x);
        ajuste.x += f.x * dz + der.x * dx; ajuste.z += f.z * dz + der.z * dx;
      };

      let sesion = null;
      try {
        sesion = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'], optionalFeatures: ['dom-overlay'], domOverlay: { root: capa } });
      } catch (e) {
        capa.remove();
        throw new Error(`No se pudo abrir la realidad aumentada (${e.message}). Necesita Android con Chrome y ARCore (Servicios de Google Play para RA).`);
      }
      // Pausa el visor normal y arma el contenedor que se ubica sobre la cámara
      v.ar = true;
      const fondo = v.scene.background; v.scene.background = null;
      if (v.grid) v.grid.visible = false;
      const ancla = new THREE.Group(); ancla.matrixAutoUpdate = false;
      v.scene.add(ancla); ancla.add(v.obj);
      const construccion = []; v.obj.traverse((o) => { if (o.userData.recinto === CONSTRUCCION) construccion.push(o); });
      const verConstr = () => construccion.forEach((o) => { o.userData.visibleAntes ??= o.visible; o.visible = constr.checked; });
      constr.addEventListener('change', verConstr); verConstr();
      v.renderer.xr.setReferenceSpaceType('local-floor');
      await v.renderer.xr.setSession(sesion);
      const rep = v.renderer.xr.getReferenceSpace();
      const T = new THREE.Matrix4(); const R = new THREE.Matrix4(); const S = new THREE.Matrix4();
      v.renderer.setAnimationLoop((t, frame) => {
        const pose = frame?.getViewerPose(rep);
        if (pose) {
          const p = pose.transform.position; const o = pose.transform.orientation;
          const f = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
          yawEquipo = Math.atan2(-f.x, -f.z);
          if (reubicar) { base = { x: p.x, z: p.z, yaw: yawEquipo }; reubicar = false; estado.textContent = 'Diseño ubicado donde estás. Afina con los botones si no calza.'; }
        }
        if (base) {
          // ancla = T(equipo + ajuste) · Ry(giro) · T(-punto del modelo bajo los pies)
          S.makeTranslation(-pie.x, -piso, -pie.z);
          R.makeRotationY(base.yaw - yawModelo + ajuste.giro);
          T.makeTranslation(base.x + ajuste.x, ajuste.y, base.z + ajuste.z);
          ancla.matrix.copy(T).multiply(R).multiply(S);
          ancla.matrixWorldNeedsUpdate = true;
        }
        v.renderer.render(v.scene, v.camera);
      });
      sesion.addEventListener('end', () => {
        v.renderer.setAnimationLoop(null);
        construccion.forEach((o) => { o.visible = o.userData.visibleAntes ?? true; delete o.userData.visibleAntes; });
        v.scene.add(v.obj); v.scene.remove(ancla);
        v.scene.background = fondo; if (v.grid) v.grid.visible = true;
        capa.remove();
        v.ar = false; v.antes = null;
        tam(v); if (!v.raf) bucle(v);
        alSalir?.();
      });
    },
  };
}
