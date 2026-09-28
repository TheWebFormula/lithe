import { Compute, beginTemplating, endTemplating } from './signal.js';
import { getTemplate } from './template.js';

export function activateComponent() {
  beginTemplating();
}

export function deactivateComponent() {
  endTemplating();
}

export function html(strings, ...values) {
  // if a function is used then handle under compute. <div>${html(() => this.isLoading.value ? 'Loading...' : '')}</div>
  if (typeof strings === 'function') return new Compute(strings, true);

  const t = getTemplate(strings, values);
  t.connect(values);
  return t;
}
globalThis.html = html;
