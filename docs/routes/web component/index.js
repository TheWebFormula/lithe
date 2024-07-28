import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

export default class extends Component {
  static title = 'Web component';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
