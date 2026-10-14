import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';
import { value } from './data.js';
import './component.js';


class SharingDataPage extends Component {
  static title = 'Sharing data';
  static htmlTemplate = htmlTemplate;

  pageValue = value;

  constructor() {
    super();
  }
}
customElements.define('sharing-data-page', SharingDataPage);
