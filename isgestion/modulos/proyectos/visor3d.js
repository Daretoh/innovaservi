// Visor 3D de Proyectos: muebles (mallas del exportador de SketchUp, en R2) y áreas completas con cada objeto en su
// posición real. three.js 0.147.0 (jsDelivr, versión fija) se carga solo al abrir un 3D.
// SketchUp (cm, Z arriba) → visor (m, Y arriba): (x, y, z) → (x/100, z/100, -y/100).
import { el } from '../../core/ui/dom.js?v=75c4885';
import { icono } from '../../core/ui/iconos.js?v=75c4885';
import { boton } from '../../core/ui/tabla.js?v=75c4885';
import { urlsFirmadas } from '../../core/adjuntos.js?v=75c4885';
import { instanciasDe, subtotal, tienePrecio, clp, fmtNum } from './datos.js?v=75c4885';

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

// ---------------------------------------------------------------- Mallas (R2, con caché)
const cache = new Map();   // modelo_id:m3d → datos
const rutas = new Map();   // modelo_id → Map(m3d → ruta)
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
        const datos = /\.gz$/.test(r.get(id)) ? await new Response(resp.body.pipeThrough(new DecompressionStream('gzip'))).json() : await resp.json();
        cache.set(`${modeloId}:${id}`, datos);
      }));
    }
  }
  return new Map(ids.filter((id) => cache.has(`${modeloId}:${id}`)).map((id) => [id, cache.get(`${modeloId}:${id}`)]));
}

function mallasAThree(d) {
  const { THREE } = window;
  const g = new THREE.Group();
  for (const m of d.mats || []) {
    const p = m.p; const arr = new Float32Array(p.length);
    for (let i = 0; i < p.length; i += 3) { arr[i] = p[i] / 100; arr[i + 1] = p[i + 2] / 100; arr[i + 2] = -p[i + 1] / 100; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.computeVertexNormals();
    const a = m.a ?? 1;
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(m.c[0] / 255, m.c[1] / 255, m.c[2] / 255),
      transparent: a < 1, opacity: a, side: THREE.DoubleSide, depthWrite: a >= 1 })));
  }
  return g;
}

// ---------------------------------------------------------------- Visor reutilizable
const css = (v, d) => getComputedStyle(document.body).getPropertyValue(v).trim() || d;
export function crearVisor(cont) {
  const { THREE } = window;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.classList.add('pro-lienzo');
  cont.append(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(css('--fondo-sutil', '#fafbfc'));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f8c, 0.95));
  const sol = new THREE.DirectionalLight(0xffffff, 0.7); sol.position.set(3, 5, 4); scene.add(sol);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 400);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 0.05; controls.screenSpacePanning = true; controls.zoomSpeed = 1.4;
  const v = { cont, renderer, scene, camera, controls, obj: null, grid: null, radio: 1, raf: 0, alElegir: null, marcados: [] };
  let abajo = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { abajo = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 4 || !v.obj || !(v.alElegir || v.alMedir)) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    // three.js no salta lo oculto: solo cuenta lo que se ve (recintos apagados)
    const seVe = (q) => { for (; q; q = q.parent) if (!q.visible) return false; return true; };
    const hit = ray.intersectObject(v.obj, true).find((h) => h.object.isMesh && seVe(h.object));
    if (v.alMedir) { if (hit) v.alMedir(hit.point.clone()); return; }
    const filaDe = (q) => { while (q && !q.userData.fila) q = q.parent; return q; };
    let o = filaDe(hit?.object);
    if (!o && hit) o = filaDe(ray.intersectObject(v.obj, true).find((h) => h.object.isMesh && seVe(h.object) && h.distance - hit.distance < 0.05 && filaDe(h.object))?.object);
    v.marcados.forEach((m) => m.emissive?.setHex(0x000000));
    v.marcados = [];
    const fila = o?.userData.fila ?? null;
    // Resalta todas las copias del mismo ítem
    if (fila) v.obj.traverse((q) => { if (q.userData.fila === fila) q.traverse((w) => { if (w.isMesh) [].concat(w.material).forEach((m) => { if (m.emissive) { m.emissive.setHex(0x0b3a5c); v.marcados.push(m); } }); }); });
    v.alElegir(fila);
  });
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (v.paso || !v.obj) return;
    const r = renderer.domElement.getBoundingClientRect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObject(v.obj, true).find((h) => h.object.isMesh);
    if (!hit) return;
    const mover = hit.point.clone().sub(controls.target);
    controls.target.add(mover); camera.position.add(mover.multiplyScalar(0.6)); controls.update();
  });
  new ResizeObserver(() => tam(v)).observe(cont);
  return v;
}
function tam(v) {
  const w = v.cont.clientWidth; const h = v.cont.clientHeight;
  if (!w || !h) return;
  v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
}
function bucle(v) {
  if (!v.renderer.domElement.isConnected) { v.raf = 0; v.renderer.dispose(); v.alSalir?.(); return; }   // se dejó la vista
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
// Recorrido (como D5 o un juego): W A S D o flechas para caminar, arrastrar para mirar, Q / E para bajar y subir,
// Shift para ir más rápido, la rueda avanza o retrocede y el doble clic lleva hasta ese punto. Parte a la altura de
// una persona (1,60 m sobre el piso del modelo).
const ALTURA = 1.6;
export function recorrer(v, on) {
  const { THREE } = window;
  const lienzo = v.renderer.domElement;
  if (!on) { v.limpiarRecorrido?.(); return; }
  if (v.paso) return;
  v.controls.enabled = false;
  v.fovOrbita = v.camera.fov; v.camera.fov = 65; v.camera.updateProjectionMatrix();   // ángulo amplio, como al caminar
  const dir = new THREE.Vector3(); v.camera.getWorldDirection(dir);
  let yaw = Math.atan2(-dir.x, -dir.z); let pitch = 0;
  // Parte en el centro del modelo, a la altura de los ojos
  const desde = v.inicio ?? v.controls.target;
  v.camera.position.set(desde.x, (v.piso ?? 0) + ALTURA, desde.z);
  const teclas = new Set();
  const enCampo = (e) => /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '');
  const abajo = (e) => { if (enCampo(e)) return; const k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { teclas.add(k); e.preventDefault(); } };
  const arriba = (e) => teclas.delete(e.key.toLowerCase());
  let arrastre = null;
  const pd = (e) => { arrastre = [e.clientX, e.clientY]; lienzo.setPointerCapture?.(e.pointerId); };
  const pm = (e) => {
    if (!arrastre) return;
    yaw -= (e.clientX - arrastre[0]) * 0.004; pitch -= (e.clientY - arrastre[1]) * 0.004;
    pitch = Math.max(-1.45, Math.min(1.45, pitch)); arrastre = [e.clientX, e.clientY];
  };
  const pu = () => { arrastre = null; };
  const rueda = (e) => { e.preventDefault(); const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); v.camera.position.addScaledVector(f, -Math.sign(e.deltaY) * 0.5); };
  const doble = (e) => {
    const r = lienzo.getBoundingClientRect(); const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), v.camera);
    const hit = ray.intersectObject(v.obj, true).find((h) => h.object.isMesh);
    if (!hit) return;
    // Va hasta ese punto, quedando a la altura de los ojos sobre lo que tocó (piso) o frente a él (muro)
    const p = hit.point; const desde = v.camera.position.clone();
    const hacia = new THREE.Vector3(p.x, Math.max((v.piso ?? 0) + ALTURA, Math.min(p.y + ALTURA, desde.y)), p.z);
    const atras = hacia.clone().sub(desde).setY(0).normalize().multiplyScalar(0.4);
    if (Math.abs(hit.face?.normal?.y ?? 0) < 0.5) hacia.sub(atras);
    v.camera.position.copy(hacia);
  };
  window.addEventListener('keydown', abajo); window.addEventListener('keyup', arriba);
  lienzo.addEventListener('pointerdown', pd); lienzo.addEventListener('pointermove', pm); lienzo.addEventListener('pointerup', pu);
  lienzo.addEventListener('wheel', rueda, { passive: false }); lienzo.addEventListener('dblclick', doble);
  lienzo.style.cursor = 'grab';
  v.paso = (dt) => {
    const rapido = teclas.has('shift') ? 4 : 1.4;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); const der = new THREE.Vector3(-f.z, 0, f.x);
    const m = new THREE.Vector3();
    if (teclas.has('w') || teclas.has('arrowup')) m.add(f);
    if (teclas.has('s') || teclas.has('arrowdown')) m.sub(f);
    if (teclas.has('d') || teclas.has('arrowright')) m.add(der);
    if (teclas.has('a') || teclas.has('arrowleft')) m.sub(der);
    if (m.lengthSq()) v.camera.position.addScaledVector(m.normalize(), rapido * dt);
    if (teclas.has('e')) v.camera.position.y += rapido * dt;
    if (teclas.has('q')) v.camera.position.y -= rapido * dt;
    const mira = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    v.camera.lookAt(v.camera.position.clone().add(mira));
  };
  v.limpiarRecorrido = () => {
    window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba);
    lienzo.removeEventListener('pointerdown', pd); lienzo.removeEventListener('pointermove', pm); lienzo.removeEventListener('pointerup', pu);
    lienzo.removeEventListener('wheel', rueda); lienzo.removeEventListener('dblclick', doble);
    lienzo.style.cursor = '';
    // Vuelve a la órbita mirando hacia donde estaba mirando
    const d = new THREE.Vector3(); v.camera.getWorldDirection(d);
    v.controls.target.copy(v.camera.position).addScaledVector(d, 2);
    v.camera.fov = v.fovOrbita ?? 38; v.camera.updateProjectionMatrix();
    v.paso = null; v.limpiarRecorrido = null; v.alSalir = null; v.controls.enabled = true; v.controls.update();
  };
  v.alSalir = v.limpiarRecorrido;
}

export function aristas(v, on) { v?.obj?.traverse((o) => { if (o.userData.arista) o.visible = on; }); }

// Pone un objeto en el visor (centrado, con grilla) y devuelve el texto de medidas
function poner(v, escena, conAristas) {
  const { THREE } = window;
  v.marcados = [];
  if (v.obj) v.scene.remove(v.obj);
  if (v.grid) v.scene.remove(v.grid);
  const raiz = new THREE.Group(); raiz.add(escena);
  const linea = new THREE.LineBasicMaterial({ color: 0x2b2f2d, transparent: true, opacity: 0.5 });
  const mallas = [];
  escena.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) mallas.push(o); });
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
export const ponerMueble = (v, datos, conAristas = true) => poner(v, mallasAThree(datos), conAristas);

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
  if (!partes.length) return { vacio: ligadas ? 'Para ver áreas completas en 3D vuelve a exportar el modelo desde SketchUp: ahora guarda dónde está cada objeto.' : 'Ninguna fila de aquí está ligada a objetos del modelo. Agrégalas desde la vista Modelo SketchUp.' };
  // Las partidas que suman todo el modelo pueden traer objetos de otras salas: se dejan los que están juntos
  const os = partes.flatMap((pp) => pp.lista);
  const mediana = (l) => [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)];
  const mx = mediana(os.map((a) => a[0])); const my = mediana(os.map((a) => a[1]));
  const lim = Math.max(600, 3 * mediana(os.map((a) => Math.hypot(a[0] - mx, a[1] - my))));
  const cerca = (a) => Math.hypot(a[0] - mx, a[1] - my) <= lim;
  const mallas = await cargarMallas(ctx, modeloId, partes.filter((pp) => pp.m3d).map((pp) => pp.m3d));
  const C = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, -0.01, 0, 0, 0, 0, 0, 1); const Ci = C.clone().invert();
  const raiz = new THREE.Group(); const lineas = [];
  let n = 0; let fuera = 0;
  for (const pp of partes) {
    const lista = pp.lista.filter((a) => (cerca(a) ? true : (fuera++, false)));
    if (!lista.length) continue;
    if (pp.m3d) {
      const d = mallas.get(pp.m3d); if (!d) continue;
      const base = mallasAThree(d);
      for (const a of lista) {
        const o = base.clone(); o.matrixAutoUpdate = false;
        o.matrix.multiplyMatrices(C, matrizSU(a)).multiply(Ci);
        o.userData.fila = pp.fila; raiz.add(o); n++;
      }
    } else {
      const c = pp.it.color || [196, 196, 190];
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0.5, 0.5);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), side: THREE.DoubleSide }), lista.length);
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
// opciones: { modeloId, m3d } (un mueble) o { modeloId, filas, inv, alElegir } (un área o zona)
export async function ventana3d(ctx, titulo, opciones) {
  const msg = el('div', { class: 'pro-v3-msg' }, 'Cargando…');
  const cuerpo = el('div', { class: 'pro-v3-cuerpo' }, msg);
  const pie = el('span', { class: 'pro-v3-med texto-suave' });
  const chk = el('input', { type: 'checkbox', checked: true });
  let v = null;
  const vistas = ['iso', 'frente', 'lado', 'arriba'].map((m, i) => boton(['3D', 'Frente', 'Lado', 'Arriba'][i], { class: 'boton boton-secundario boton-chico', onclick: () => camara(v, m) }));
  chk.addEventListener('change', () => aristas(v, chk.checked));
  const dialogo = el('dialog', { class: 'modal pro-v3', 'aria-label': titulo },
    el('header', { class: 'modal-cabecera' }, el('h2', {}, titulo),
      el('button', { type: 'button', class: 'boton-icono', 'aria-label': 'Cerrar', onclick: () => { dialogo.close(); dialogo.remove(); } }, icono('cerrar'))),
    cuerpo,
    el('div', { class: 'pro-v3-pie' }, pie, vistas, el('label', { class: 'casilla' }, chk, 'Aristas')));
  document.body.append(dialogo);
  dialogo.showModal();
  try { await asegurarThree(); } catch { msg.textContent = 'No se pudo cargar el visor 3D. Revisa la conexión a internet.'; return; }
  try {
    if (opciones.m3d) {
      const datos = (await cargarMallas(ctx, opciones.modeloId, [opciones.m3d])).get(opciones.m3d);
      if (!datos) { msg.textContent = 'Este mueble todavía no tiene su archivo 3D: sube de nuevo la exportación con la carpeta de mallas.'; return; }
      v = crearVisor(cuerpo); pie.textContent = ponerMueble(v, datos, chk.checked);
    } else {
      msg.textContent = 'Armando el área en 3D…';
      const a = await armarArea(ctx, opciones.modeloId, opciones.filas, opciones.inv);
      if (a.vacio) { msg.textContent = a.vacio; return; }
      v = crearVisor(cuerpo); poner(v, a.raiz, chk.checked);
      const texto = `${a.n} objetos de ${a.ligadas} ${a.ligadas === 1 ? 'partida' : 'partidas'}${a.fuera ? ` · ${a.fuera} lejos de aquí no se muestran` : ''} · Clic en un objeto para ver qué es`;
      pie.textContent = texto;
      v.alElegir = (x) => {
        pie.textContent = x ? [x.item, x.detalle, `${fmtNum(x.cantidad, 'cantidad')} ${x.unidad || ''}`.trim(), tienePrecio(x) ? clp(subtotal(x)) : null].filter(Boolean).join(' · ') : texto;
        if (x) opciones.alElegir?.(x);
      };
    }
    msg.remove();
  } catch (e) { msg.textContent = `No se pudo mostrar el 3D: ${e.message}`; }
}

// ---------------------------------------------------------------- Modelo completo
// Todo el modelo en su lugar, agrupado por recinto (para mostrar u ocultar), con clic para ver qué es y medir.
// Devuelve { recintos: [{ nombre, n }], mostrar(recinto, on), camara(modo), medir(on), sinPosiciones }
const CONSTRUCCION = 'Construcción (muros, pisos, cielos)';
export async function vistaModelo(ctx, cont, { modeloId, inv, alElegir, alMedida, alProgreso }) {
  await asegurarThree();
  const { THREE } = window;
  const items = inv.items.filter((it) => (it.m3d && it.pos?.length) || it.cajas?.length);
  const partesEscena = (inv.escena ?? []).map((x) => x.id);
  if (!items.length && !partesEscena.length) return { sinPosiciones: true };
  const ids = [...new Set(items.filter((it) => it.m3d && it.pos?.length).map((it) => it.m3d)), ...partesEscena];
  alProgreso?.(`Cargando ${ids.length} muebles en 3D…`);
  const mallas = await cargarMallas(ctx, modeloId, ids);
  const C = new THREE.Matrix4().set(0.01, 0, 0, 0, 0, 0, 0.01, 0, 0, -0.01, 0, 0, 0, 0, 0, 1); const Ci = C.clone().invert();
  const raiz = new THREE.Group();
  const grupos = new Map();
  const grupoDe = (r) => { if (!grupos.has(r)) { const g = new THREE.Group(); g.userData.recinto = r; grupos.set(r, { g, n: 0, lineas: [] }); raiz.add(g); } return grupos.get(r); };
  for (const it of items) {
    const gr = grupoDe(it.recinto || 'General');
    if (it.m3d && it.pos?.length) {
      const d = mallas.get(it.m3d);
      if (!d) continue;
      const base = mallasAThree(d);
      for (const a of it.pos) {
        const o = base.clone(); o.matrixAutoUpdate = false;
        o.matrix.multiplyMatrices(C, matrizSU(a)).multiply(Ci);
        o.userData.fila = it; gr.g.add(o); gr.n++;
      }
    } else if (it.cajas?.length) {
      const c = it.color || [196, 196, 190];
      const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0.5, 0.5, 0.5);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0] / 255, c[1] / 255, c[2] / 255), side: THREE.DoubleSide }), it.cajas.length);
      it.cajas.forEach((a, i) => {
        im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(C, matrizSU(a)));
        const q = (u) => [(a[0] + a[3] * u[0] + a[6] * u[1] + a[9] * u[2]) / 100, (a[2] + a[5] * u[0] + a[8] * u[1] + a[11] * u[2]) / 100, -(a[1] + a[4] * u[0] + a[7] * u[1] + a[10] * u[2]) / 100];
        [[0, 0, 0, 1, 0, 0], [0, 0, 0, 0, 1, 0], [0, 0, 0, 0, 0, 1], [1, 1, 0, 0, 1, 0], [1, 1, 0, 1, 0, 0], [1, 1, 0, 1, 1, 1],
          [1, 0, 1, 0, 0, 1], [1, 0, 1, 1, 1, 1], [1, 0, 1, 1, 0, 0], [0, 1, 1, 0, 0, 1], [0, 1, 1, 1, 1, 1], [0, 1, 1, 0, 1, 0]]
          .forEach((e) => gr.lineas.push(...q(e.slice(0, 3)), ...q(e.slice(3))));
      });
      im.instanceMatrix.needsUpdate = true; im.frustumCulled = false;
      im.userData.fila = it; gr.g.add(im); gr.n += it.cajas.length;
    }
  }
  // Construcción (muros, pisos, cielos, piezas) con su forma real y sus líneas, ya en coordenadas del modelo
  if (partesEscena.length) {
    const gr = grupoDe(CONSTRUCCION);
    const lineas = [];
    for (const id of partesEscena) {
      const d = mallas.get(id); if (!d) continue;
      const g = mallasAThree(d); g.userData.construccion = true; gr.g.add(g);
      gr.n += (d.mats ?? []).reduce((t, m) => t + m.p.length / 9, 0);
      const l = d.lineas ?? [];
      for (let i = 0; i < l.length; i += 3) lineas.push(l[i] / 100, l[i + 2] / 100, -l[i + 1] / 100);
    }
    if (lineas.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lineas, 3));
      gr.g.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f2321, transparent: true, opacity: 0.55 })));
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
    const s = new THREE.Mesh(new THREE.SphereGeometry(v.radio / 120, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6b00, depthTest: false }));
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
  return {
    recintos: [...grupos.entries()].map(([nombre, gr]) => ({ nombre, n: gr.n })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    mostrar: (r, on) => { const gr = grupos.get(r); if (gr) gr.g.visible = on; },
    camara: (m) => camara(v, m),
    aristas: (on) => aristas(v, on),
    recorrer: (on) => recorrer(v, on),
    medir: (on) => { v.alMedir = on ? alMedir : null; if (!on) limpiar(); },
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
