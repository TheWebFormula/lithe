import build from './src/build/index.js';

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
  sitemap: {
    enable: true,
    host: 'https://lithe.dev'
  },
  secondaryEntryPoints: [
    { in: 'docs/playground/service-worker/webserver.js', out: 'webserver-service-worker', addEnvVar: true }
  ]
});
