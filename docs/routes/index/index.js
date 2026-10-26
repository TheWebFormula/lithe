import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

class HomePage extends Component {
  static title = 'Home';
  static htmlTemplate = htmlTemplate;
}
customElements.define('home-page', HomePage);


// import { Component } from '@thewebformula/lithe';
// import htmlTemplate from './page.html';
//
// import Cue2 from '../../../src/client/CueAsync.js';
//
// class HomePage extends Component {
//   static title = 'Home';
//   static htmlTemplate = htmlTemplate;
//
//
//   one = new Cue2.State(1);
//   two = new Cue2.State(1);
//   compute = new Cue2.Compute(() => {
//     return this.one.get() + this.two.get();
//   });
//
//   compute2 = new Cue2.Compute(() => {
//     return this.compute.get() + this.one.get();
//   });
//
//   effect1Dispose;
//   effect2Dispose;
//   effect3Dispose;
//
//
//   oneAsync = new Cue2.State(new Promise(resolve => setTimeout(() => resolve(1), 3000)));
//
//   computeAsync = new Cue2.Compute(() => {
//     return this.oneAsync.get() + 1;
//   });
//
//   constructor() {
//     super();
//
//     this.effect1Dispose = Cue2.effect(() => {
//       console.log('--- Effect 1 ---')
//       console.log(this.compute.get());
//       console.log(this.compute2.get());
//       console.log(' ');
//     });
//
//
//     this.effect2Dispose = Cue2.effect(() => {
//       console.log('--- Effect 2 ---')
//       console.log(this.compute.get());
//       console.log(this.compute2.get());
//       console.log(' ');
//     });
//
//     // this.effec32Dispose = Cue2.effect(() => {
//     //   console.log('--- Effect 3 ---');
//     //   console.log(this.oneAsync.isPending);
//     //   console.log(this.oneAsync.get());
//     //   console.log(' ');
//     // });
//
//     Cue2.effect(() => {
//       console.log('--- Effect 4 ---');
//       console.log(this.computeAsync.isPending);
//       console.log(this.computeAsync.get());
//       console.log(this.oneAsync.isPending);
//       console.log(this.oneAsync.get());
//       console.log(' ');
//     });
//   }
//
//   run() {
//     this.one.set(2);
//     setTimeout(() => this.effect2Dispose(), 1000);
//     setTimeout(() => this.compute2.dispose(), 2000);
//     setTimeout(() => this.compute.get(), 3000);
//     setTimeout(() => this.one.set(3), 4000);
//   }
// }
// customElements.define('home-page', HomePage);
