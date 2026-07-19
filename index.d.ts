export class Route extends HTMLElement {
  constructor();
  path: string | null;
  component: string | null;
  notFound: boolean;
  readonly pageContainer: Element | null;
}

export class Component extends HTMLElement {
  constructor();

  static _isPage: boolean;
  static _html: any;
  static useShadowRoot: boolean;
  static shadowRootDelegateFocus: boolean;
  static htmlTemplate: string | ((instance: any) => string);
  static styleSheets: CSSStyleSheet[];
  static title?: string;
  static get observedAttributesExtended(): Array<[string, 'string' | 'number' | 'int' | 'boolean' | 'event' | ''> | []>;
  static get observedAttributes(): string[];

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void;
  attributeChangedCallbackExtended(name: string, oldValue: any, newValue: any): void;

  get searchParameters(): Record<string, string>;
  get urlParameters(): Record<string, string>;

  urlChange(): void;
  connectedCallback(): void;
  disconnectedCallback(): void;

  beforeRender(): void;
  afterRender(): void;

  template(): string | Node | DocumentFragment;
  render(): void;
}

export class Signal<T = any> {
  constructor(value: T);
  value: T;
  valueUntracked: T;
  valueNonTemplating: T;
  watch(cb: (sig: Signal<T>) => void): void;
  unwatch(cb: (sig: Signal<T>) => void): void;
  dispose(): void;
}

export class SignalObject<T = any> {
  constructor(value: T, track?: boolean);
  value: T;
  valueUntracked: T;
  // internal access to underlying Signal instance
  __signal?: Signal<T>;
  watch(cb: (sig: SignalObject<T>) => void): void;
  unwatch(cb: (sig: SignalObject<T>) => void): void;
  dispose(): void;
}

export class Compute<T = any> {
  constructor(callback: (path?: any) => T, htmlCompute?: boolean);
  readonly value: T;
  readonly dirty: boolean;
  readonly error: any;
  updateValueVersion(path?: any): void;
  updateValueVersionForce(): void;
  dispose(): void;
}

export function effect(callback: () => void): () => void;

export function html(strings: TemplateStringsArray | ((...args: any[]) => any), ...values: any[]): DocumentFragment | Compute<any>;

export function setSecurityLevel(level?: number): void;

export type TranslationData = Record<string, any>;

export type I18nFunction = {
  (key: string, ...variables: any[]): Compute<string>;
  setLocale(locale: string): void;
  cache(): void;
  format(formatterName: string, value: any): Compute<string>;
  addTranslation(locale: string, data: TranslationData): void;
};

export const i18n: I18nFunction;

export class Fetcher {
  constructor(baseUrl?: string, headers?: HeadersInit | Record<string, string>, credentials?: string);
  readonly baseUrl: string;
  readonly headers: Headers;
  readonly credentials: string;

  fetch(url: string, config?: RequestInit): Promise<Response>;

  addResponseInterceptor(
    callback?: (response: Response, fetcher?: Fetcher) => boolean | Promise<boolean> | void,
    filter?: (response: Response) => boolean
  ): void;
}

export const policyHTML: {
  createHTML(input: string): string;
};

export { Route, Component, html, Signal, SignalObject, Compute, effect, setSecurityLevel, i18n, Fetcher, policyHTML };
