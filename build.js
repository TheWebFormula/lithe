import build from './src/build/index.js';

build({
  entryPoint: 'docs/app.js',
  entryPointCSS: 'docs/app.css',
  copy: [
    { from: 'docs/_headers', to: 'dist/' },
    { from: 'docs/robots.txt', to: 'dist/' },
    { from: 'docs/sitemap.xml', to: 'dist/' },
    { from: 'docs/favicon.ico', to: 'dist/' },
    { from: 'docs/icons/*', to: 'dist/icons/' },
    { from: 'docs/manifest.json', to: 'dist/' },
    { from: 'docs/highlight-11.10.0.js', to: 'dist/' }
  ],
  securityLevel: 1
});
