import { Component, Cue } from '@thewebformula/lithe';
import htmlTemplate from './page.html';


class TemplateConditionalPage extends Component {
  static title = 'Templating conditionals';
  static htmlTemplate = htmlTemplate;

  shouldShow = new Cue.State(true);
  switchOneTwo = new Cue.State(true);

  toggleShow() {
    this.shouldShow.set(!this.shouldShow.get());
  }

  switch() {
    this.switchOneTwo.set(!this.switchOneTwo.get());
  }
}
customElements.define('template-conditional-page', TemplateConditionalPage);
