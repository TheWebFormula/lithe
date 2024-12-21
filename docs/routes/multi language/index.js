import { Component, Signal, i18n } from '@thewebformula/lithe';
import htmlTemplate from './page.html';
import en from '../../locales/en.json' assert { type: "json" };
import es from '../../locales/es.json' assert { type: "json" };

class MultiLanguagePage extends Component {
  static title = 'Multiple languages';
  static htmlTemplate = htmlTemplate;

  languagesChecked = false;
  time = 30
  date = new Date();
  currency = '123.45';
  days = new Signal(3);
  count = new Signal(1);

  constructor() {
    super();
    
    i18n.addTranslation('en', en);
    i18n.addTranslation('es', es);
  }

  changeLanguage(checked) {
    this.languagesChecked = checked;
    i18n.setLocale(checked ? 'es' : 'en');
  }

  disconnectedCallback() {
    i18n.setLocale(navigator.language);
  }
}
customElements.define('multi-language-page', MultiLanguagePage);
