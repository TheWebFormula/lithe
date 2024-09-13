import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

export default class extends Component {
  static title = 'View transitions';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
