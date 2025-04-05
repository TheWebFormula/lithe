const exampleConfig = {
  method: 'GET',
  mode: 'cors',
  cache: 'no-cache',
  credentials: 'same-origin',
  redirect: 'follow',
  referrerPolicy: 'no-referrer',
  headers: {},
  body: {}
};

/** Fetcher instance class. Allows you to set defaults and add interceptors */
export class Fetcher {
  #baseUrl;
  #headers;
  #credentials;
  #responseInterceptors = [];

  /**
   * Fetches a resource from the network and returns a Promise. Same interface as Fetch
   * @param {string} url - The URL string
   * @param {Object} [config] - Optional configuration options for the request.
   * @param {string} [config.method='GET'] - HTTP method (GET, POST, PUT, DELETE, etc.).
   * @param {Headers|Object} [config.headers] - Request headers.
   * @param {string|Blob|ArrayBuffer|FormData|URLSearchParams} [config.body] - Request body.
   * @param {string} [config.mode='cors'] - Request mode (cors, no-cors, same-origin).
   * @param {string} [config.credentials='same-origin'] - Credentials mode (omit, same-origin, include).
   * @param {string} [config.cache='default'] - Cache mode (default, no-store, reload, no-cache, force-cache, only-if-cached).
   * @param {string} [config.redirect='follow'] - Redirect mode (follow, error, manual).
   * @param {string} [config.referrer='client'] - Referrer policy.
   * @param {string} [config.integrity] - Subresource integrity value.
   * @param {boolean} [config.keepalive] - Allows request to outlive page.
   * @param {AbortSignal} [config.signal] - AbortSignal to abort request.
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @throws {TypeError} If the input is invalid.
   */
  fetch = this.#fetch.bind(this);

  /**
   * @param {Object} instanceConfig Instance configuration.
   * @param {String} [instanceConfig.baseUrl] Base url for all requests.
   * @param {String} [instanceConfig.headers] Headers for all requests.
   * @param {String} [instanceConfig.credentials='same-origin'] - Credentials mode (omit, same-origin, include).
   */
  constructor(
    baseUrl = '',
    headers = {},
    credentials = 'same-origin'
  ) {
    this.#baseUrl = baseUrl || '';
    this.#headers = new Headers(headers || {});
    this.#credentials = credentials || 'same-origin';
  }

  get baseUrl() {
    return this.#baseUrl;
  }

  /**
   * Gets default HTTP headers for Fetcher instance.
   * 
   * @returns {Headers} A Headers object containing instance headers.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/Headers|MDN Headers Documentation}
   */
  get headers() {
    return this.#headers;
  }

  get credentials() {
    return this.#credentials;
  }

  /**
   * Adds a response interceptor to handle API responses.
   * 
   * @param {Function} [callback] - A callback function to process the response.
   * @param {Function} [filter] - A filter function to determine if the response should be intercepted.
   * @callback callback
   * @param {Response} response - The HTTP Response object to be processed.
   * @returns {boolean} Returns true if the response should be re-run, false otherwise.
   * 
   * @callback filter
   * @param {Response} response - The HTTP Response object to be filtered.
   * @returns {boolean} Returns true if the response should be intercepted, false otherwise.
   */
  addResponseInterceptor(callback = (response) => { }, filter = (response) => { return true }) {
    this.#responseInterceptors.push([callback, filter]);
  }

  async #fetch(
    url,
    config = exampleConfig
  ) {
    if (config === exampleConfig) config = {};

    const combinedURL = `${(this.baseUrl || '')}${url}`;
    const originalHeaders = config.headers || {};
    // merge headers
    config.headers = new Headers(originalHeaders);
    for (const header of this.headers.entries()) {
      config.headers.set(header[0], header[1]);
    }

    if (!config.credentials) config.credentials = this.credentials;

    const isJson = (!config.headers?.['Content-Type'] && config?.body?.constructor === Object);
    if (isJson) {
      config.headers.set('Content-Type', 'application/json');
      config.body = JSON.stringify(config.body);
    }

    let response = await fetch(combinedURL, config);

    for (const interceptor of this.#responseInterceptors) {
      if (interceptor[1] && interceptor[1](response)) {
        const resend = await interceptor[0](response, this);

        if (resend) {
          config.headers = new Headers(originalHeaders);
          for (const header of this.headers.entries()) {
            config.headers.set(header[0], header[1]);
          }
          if (isJson) {
            config.headers.set('Content-Type', 'application/json');
          }
          response = await fetch(combinedURL, config);
        }
      }
    }

    return response;
  }
}
