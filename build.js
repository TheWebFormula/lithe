import build from './src/build/index.js';


build({
  devWarnings: false,
  spa: true,
  chunks: false,
  basedir: 'docs/',
  outdir: 'dist/',
  copyFiles: [
    { from: 'docs/favicon.ico', to: 'dist/' },
    { from: 'docs/highlight-11.8.0.js', to: 'dist/', gzip: true }
  ]
});
