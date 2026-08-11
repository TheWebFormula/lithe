import build from './src/build/index.js';
import { prismjsPlugin } from 'esbuild-plugin-prismjs';

build({
  writeMetaFile: true,
  entryPoint: 'docs/app.js',
  entryPointCSS: 'docs/app.css',
  copy: [
    { from: 'docs/_headers', to: 'dist/' },
    { from: 'docs/robots.txt', to: 'dist/' },
    { from: 'docs/sitemap.xml', to: 'dist/' },
    { from: 'docs/favicon.ico', to: 'dist/' },
    { from: 'docs/icons/*', to: 'dist/icons/' },
    { from: 'docs/manifest.json', to: 'dist/' }
  ],
  esbuildPlugins: [
    prismjsPlugin({
      inline: true,
      languages: ['javascript', 'css', 'bash', 'html', 'yaml', 'json']
    })
  ]
  // csp: {
  //   enable: true,
  //   requireTrustedTypes: true,
  //   requireTrustedTypes: [],
  //   styleSrc: ['self', "https://fonts.googleapis.com"],
  //   fontSrc: ['self', "https://fonts.gstatic.com"],
  // },
  // securityLevel: 1
});
