// Bundles src/ into dist/ so index.html runs straight from disk, no server needed.
//   node build.mjs           one-off minified build
//   node build.mjs --watch   rebuild on change
//   node build.mjs --serve   rebuild on change and serve on http://localhost:8080
import * as esbuild from 'esbuild';

const dev = process.argv.includes('--watch') || process.argv.includes('--serve');
const common = { bundle: true, minify: !dev, target: ['es2022'], logLevel: 'info', legalComments: 'eof' };
const builds = [
  { ...common, entryPoints: ['src/main.js'], outfile: 'dist/frutiger-fun.js', format: 'iife' },
  { ...common, entryPoints: ['src/style.css'], outfile: 'dist/frutiger-fun.css', loader: { '.woff2': 'dataurl', '.woff': 'empty' } },
];

if (dev) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(ctxs.map((c) => c.watch()));
  if (process.argv.includes('--serve')) {
    const { port } = await ctxs[0].serve({ servedir: '.', port: 8080 });
    console.log(`Frutiger Fun on http://localhost:${port}`);
  }
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
