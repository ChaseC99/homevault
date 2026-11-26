import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir) {
  let out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = dir + '/' + entry.name;
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.name !== 'sw.js') out.push(p);
  }
  return out;
}
const files = (await walk('dist')).sort(),
  hash = createHash('sha256');
const workerSource = await readFile('scripts/service-worker.js', 'utf8');
for (const f of files) hash.update(await readFile(f));
hash.update(await readFile('scripts/build-sw.mjs'));
hash.update(workerSource);
const version = hash.digest('hex').slice(0, 16);
const paths = files.map((f) => f.slice(5));
await writeFile(
  'dist/sw.js',
  workerSource
    .replace('__BUILD_VERSION__', version)
    .replace('__PRECACHE_FILES__', JSON.stringify(paths)),
);
console.log('Precached ' + paths.length + ' local assets, version ' + version);
