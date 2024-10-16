import build from './src/build/index.js';


build({
  devWarnings: false,
  chunks: false,
  gzip: false,
  basedir: 'docs/',
  outdir: 'dist/',
  keepHTMLComments: true,
  copyFiles: [
    { from: 'docs/_headers', to: 'dist/' },
    { from: 'docs/robots.txt', to: 'dist/' },
    { from: 'docs/sitemap.xml', to: 'dist/' },
    { from: 'docs/favicon.ico', to: 'dist/' },
    { from: 'docs/icons/*', to: 'dist/icons/' },
    { from: 'docs/manifest.json', to: 'dist/' },
    { from: 'docs/highlight-11.10.0.js', to: 'dist/' }
  ]
});
