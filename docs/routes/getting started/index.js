import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class GettingStartedPage extends Component {
  static title = 'Getting started';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
customElements.define('getting-started-page', GettingStartedPage);



// TODO
// <section id="splash" aria-label="Splash screen">
//   <mc-card>
//     <h2 slot="headline">Splash screen</h2>
//     <div slot="supporting-text">You can add a splash screen to your app</div>
//
//     <div class="mc-font-body-medium">
//       <ul>
//         <li>Only shows if load takes longer than 300 milliseconds</li>
//         <li>Splash screen will show for a minimum of 1.2 seconds</li>
//         <li>A default splash screen is provided using the PWA icon</li>
//         <li>You can override the default splash screen with custom HTML (example below)</li>
//       </ul>
//     </div>
//
//
//     <code-block language="html">
//       <pre>
// ${`<!doctype html>
// <html lang="en">
//
// <head>
// <meta charset="UTF-8">
// <meta http-equiv="Cache-Control" content="no-store" />
// <meta name="viewport" content="width=device-width, initial-scale=1.0">
//
//
// <!-- Add meta tag for splash screen -->
// <meta name="splash-screen" content="true">
// </head>
//
// <body>
// ...
// </body>
// </html>`}
//           </pre>
//     </code-block>
//
//     <code-block language="html">
//       <pre>
// ${`
// <!-- Add custom splash screen HTML -->
//
// <!doctype html>
// <html lang="en">
//
// <head>
// <meta charset="UTF-8">
// <meta http-equiv="Cache-Control" content="no-store" />
// <meta name="viewport" content="width=device-width, initial-scale=1.0">
//
//
// <!-- Add meta tag for splash screen -->
// <meta name="splash-screen" content="true">
// </head>
//
// <body>
//
// <!-- Overrides default splash screen -->
// <splash-screen>
// ...HTML
// </splash-screen>
//
// ...
// </body>
// </html>`}
//           </pre>
//     </code-block>
//   </mc-card>
// </section>
