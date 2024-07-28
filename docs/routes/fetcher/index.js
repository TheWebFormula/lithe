import { Component } from '@thewebformula/lithe';
import htmlTemplate from './page.html';

export default class extends Component {
  static title = 'Fetcher';
  static htmlTemplate = htmlTemplate;

  constructor() {
    super();
  }
}
