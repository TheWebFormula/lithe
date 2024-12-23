import { register } from './router.js';

export default class Route extends HTMLElement {
  constructor() {
    super();
    register(this.path, this.component, this.notFound);
  }

  get path() {
    return this.getAttribute('path');
  }
  set path(value) {
    this.setAttribute('path', value);
  }

  get component() {
    return this.getAttribute('component');
  }
  set component(value) {
    this.setAttribute('component', value);
  }

  get notFound() {
    return this.hasAttribute('notFound');
  }
  set notFound(value) {
    this.toggleAttribute('notFound', !!value);
  }

  get pageContainer() {
    return document.querySelector('#page-content');
  }
}
customElements.define('li-route', Route);
