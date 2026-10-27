import build from './src/build/index.js';
import { readFile, writeFile } from 'node:fs/promises';

build({
  writeMetaFile: true,
  entryPoint: 'docs/app.js',
  entryPointCSS: 'docs/app.css',
  copy: [
    { from: 'docs/_headers', to: 'dist/' },
    { from: 'docs/robots.txt', to: 'dist/' },
    { from: 'docs/favicon.ico', to: 'dist/' },
    { from: 'docs/icons/*', to: 'dist/icons/' },
    { from: 'docs/manifest.json', to: 'dist/' }
  ],
  esbuildPlugins: [
    {
      name: 'playground-service-worker',
      setup(build) {
        build.onEnd(async result => {
          let output = Object.entries(result.metafile.outputs).find(v => v[1].entryPoint === 'docs/playground/service-worker/index.js');
          const content = await readFile(output[0], 'utf8');
          await writeFile('dist/project-service-worker.html', `<!doctype html>\n<script type="module">${content}</script>`, 'utf8');
        });
      }
    }
  ],
  sitemap: {
    enable: true,
    host: 'https://lithe.dev'
  },
  secondaryEntryPoints: [
    { in: 'docs/playground/service-worker/webserver.js', out: 'webserver-service-worker' },
    { in: 'docs/playground/service-worker/index.js', out: 'project-service-worker' }
  ]
});
