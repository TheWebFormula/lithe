import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';
// import '../../play-ground.js';


class PlaygroundPage extends Component {
  static title = 'Home';
  static htmlTemplate = htmlTemplate;

  files = {
    'package.json': {
      language: 'json',
      code: JSON.stringify({
        main: "app.js",
        dependencies: { "@thewebformula/lithe": "latest" },
      }, null, 2)
    },
    'app.js': {
      language: 'javascript',
      code: `import '@thewebformula/lithe';
import '/routes/index/index.js';
console.log('hello');
setTimeout(() => {
  console.log(customElements.get('home-page2'));
}, 2000);
`
    },
    'index.html': {
      language: 'html',
      code: `<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta http-equiv="cache-control" content="no-cache, no-store, must-revalidate">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Lithe</title>

  <script type="module" src="/app.js" defer></script>
</head>

<body>
  <li-route path="/" component="home-page"></li-route>

  <main id="page-content" role="main"></main>
</body>

</html>`
    },
    'routes/index/index.js': {
      language: 'javascript',
      code: `import { Component, html, Cue } from '@thewebformula/lithe';

class HomePage extends Component {
  static title = 'Home';

  counter = new Cue.State(1);

  constructor() {
    super();
    console.log('homepage');
  }

  template() {
    return html\`
      <div>
      <h2>Counter</h2>

      <button onclick=\${() => this.counter.set(this.counter.get() + 1)}>Increase</button>
      <button onclick=\${() => this.counter.set(this.counter.get() - 1)}>Decrease</button>
      <div><span>Value:</span> \${this.counter}</div>
      </div>
    \`;
  }
}
customElements.define('home-page', HomePage);

/* FYI
  *
  * This playground is running with NO biuild step
  * Normally the local dev will be running with a build process
  *
  * You will notice all the binding is handled via the html template  tag and Signals
  *
  */`
    }
  };

  connectedCallback() {
    super.connectedCallback();
    document.body.classList.add('no-padding');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.updateSandpack.destroy();
    document.body.classList.remove('no-padding');
  }
}
customElements.define('playground-page', PlaygroundPage);


//     'routes/index/index.js': {
//       language: 'javascript',
//       code: `import { Component, html, Signal } from '@thewebformula/lithe';
//
// class HomePage extends Component {
//   static title = 'Home';
//
//   static getInfo() {
//     console.log(import.meta)
//   }
//
//   counter = new Signal(1)
//
//   constructor() {
//     super();
//   }
//
//   template() {
//     return html\`
//       <div>
//       <h2>Counter</h2>
//
//       <button onclick=\${() => this.counter.value += 1}>Increase</button>
//       <button onclick=\${() => this.counter.value -= 1}>Decrease</button>
//       <div><span>Value:</span> \${this.counter}</div>
//       </div>
//     \`;
//   }
// }
// customElements.define('home-page', HomePage);
// console.log(import.meta)
//
// /* FYI
//   *
//   * This playground is running with NO biuild step
//   * Normally the local dev will be running with a build process
//   *
//   * You will notice all the binding is handled via the html template  tag and Signals
//   *
//   */`
//



// 'routes/index/index.js': {
//   language: 'javascript',
//   code: `import { Component, html, Cue } from '@thewebformula/lithe';
// console.log(window)
// class HomePage2 extends Component {
// static title = 'Home';
//
// counter = new Cue.State(1);
//
// template() {
// return html\`
//   <div>
//   <h2>Counter</h2>
//
//   <button onclick=\${() => this.counter.value += 1}>Increase</button>
//   <button onclick=\${() => this.counter.value -= 1}>Decrease</button>
//   <div><span>Value:</span> \${this.counter}</div>
//   </div>
// \`;
// }
// }`
// }
