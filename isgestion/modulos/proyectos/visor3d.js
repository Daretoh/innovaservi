// Visor 3D de Proyectos: muebles (mallas del exportador de SketchUp, en R2) y áreas completas con cada objeto en su
// posición real. three.js 0.147.0 (jsDelivr, versión fija) se carga solo al abrir un 3D.
// SketchUp (cm, Z arriba) → visor (m, Y arriba): (x, y, z) → (x/100, z/100, -y/100).
import { el } from '../../core/ui/dom.js?v=40804ef';
import { icono } from '../../core/ui/iconos.js?v=40804ef';
import { boton } from '../../core/ui/tabla.js?v=40804ef';
import { urlsFirmadas } from '../../core/adjuntos.js?v=40804ef';
import { instanciasDe, subtotal, tienePrecio, clp, fmtNum } from './datos.js?v=40804ef';

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
        if (resp?.ok) cache.set(`${modeloId}:${id}`, await resp.json());
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
  const v = { cont, renderer, scene, camera, controls, obj: null, grid: null, radio: 1, raf: 0, alElegir: null, marcados: [] };
  let abajo = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { abajo = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!abajo || Math.hypot(e.clientX - abajo[0], e.clientY - abajo[1]) > 4 || !v.obj || !v.alElegir) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    let o = ray.intersectObject(v.obj, true).find((h) => h.object.isMesh)?.object;
    while (o && !o.userData.fila) o = o.parent;
    v.marcados.forEach((m) => m.emissive?.setHex(0x000000));
    v.marcados = [];
    const fila = o?.userData.fila ?? null;
    // Resalta todas las copias del mismo ítem
    if (fila) v.obj.traverse((q) => { if (q.userData.fila === fila) q.traverse((w) => { if (w.isMesh) [].concat(w.material).forEach((m) => { if (m.emissive) { m.emissive.setHex(0x0b3a5c); v.marcados.push(m); } }); }); });
    v.alElegir(fila);
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
  if (!v.renderer.domElement.isConnected) { v.raf = 0; v.renderer.dispose(); return; }   // se dejó la vista
  v.controls.update(); v.renderer.render(v.scene, v.camera);
  v.raf = requestAnimationFrame(() => bucle(v));
}
export function camara(v, modo) {
  if (!v?.obj) return;
  const d = v.radio * 2.6;
  const pos = { iso: [d * 0.8, d * 0.55, d * 0.9], frente: [0, d * 0.12, d * 1.15], lado: [d * 1.15, d * 0.12, 0], arriba: [0, d * 1.2, 0.0001] }[modo] || [d, d, d];
  v.camera.position.set(...pos); v.controls.target.set(0, 0, 0); v.controls.update();
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
