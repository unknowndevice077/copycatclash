// Bundles the server (and the TypeScript sources of @ccc/shared) into dist/index.js.
// Every other npm dependency stays external and is resolved from node_modules at runtime.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@ccc/shared');

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external,
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' });
await build({ ...common, entryPoints: ['src/scripts/migrate.ts'], outfile: 'dist/migrate.js' });
await build({ ...common, entryPoints: ['src/scripts/seedManifest.ts'], outfile: 'dist/seedManifest.js' });
await build({ ...common, entryPoints: ['src/scripts/fetchStarterPhotos.ts'], outfile: 'dist/fetchStarterPhotos.js' });
console.log('server built -> dist/');
