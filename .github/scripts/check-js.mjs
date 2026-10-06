// Valida que el JS embebido en las páginas de la PWA compile (solo sintaxis, no ejecuta).
// Reemplaza el chequeo manual `node -e compileFunction` que se hacía antes de cada deploy.
import fs from 'node:fs';
import vm from 'node:vm';

const files = ['app/index.html', 'planificacion/index.html', 'index.html', 'ficha/index.html'];
let fail = false, revisados = 0;

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  // Solo <script> embebidos (sin src). Los que tienen src no traen código inline.
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++; revisados++;
    try { vm.compileFunction(m[1]); }
    catch (e) { console.error(`✗ ${f} (bloque ${n}): ${e.message}`); fail = true; }
  }
  console.log(`• ${f}: ${n} bloque(s) de script revisados`);
}

if (!revisados) { console.error('No se encontró ningún bloque de script para revisar.'); process.exit(1); }
if (fail) { console.error('\n❌ Hay JS que no compila. No se debe desplegar así.'); process.exit(1); }
console.log('\n✅ Todo el JS compila.');
