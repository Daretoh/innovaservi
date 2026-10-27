// Indicadores económicos del día (UF, UTM y dólar observado) desde mindicador.cl, como InnovaGestión; si no responde,
// desde findic.cl (mismo formato).
// Se guardan en el navegador por el día; si el servicio no responde, se usa el último guardado (o null).
const CLAVE = 'isg.economia';

const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE)) ?? null; } catch { return null; } };
const guardar = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };
const hoy = () => new Date().toLocaleDateString('sv');

async function traer(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error(r.statusText);
    const d = await r.json();
    if (!d?.dolar?.valor) throw new Error('Sin datos');
    return d;
  } finally { clearTimeout(t); }
}

let enCurso = null;
export function indicadoresDelDia() {
  const g = leer();
  if (g?.dia === hoy()) return Promise.resolve(g);
  enCurso ??= (async () => {
    try {
      const d = await traer('https://mindicador.cl/api').catch(() => traer('https://findic.cl/api/'));
      const v = { dia: hoy(), uf: d.uf?.valor ?? null, utm: d.utm?.valor ?? null, dolar: d.dolar?.valor ?? null, euro: d.euro?.valor ?? null };
      guardar(v);
      return v;
    } catch {
      return g;   // el último conocido, aunque sea de otro día
    } finally { enCurso = null; }
  })();
  return enCurso;
}

export async function dolarDelDia() { return (await indicadoresDelDia())?.dolar ?? null; }
