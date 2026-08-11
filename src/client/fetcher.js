/**
 * @typedef {Object} FetcherOptions
 * @property {string} [baseURL=''] - The root URL applied to all relative fetch requests.
 * @property {Headers|Record<string, string>} [headers={}] - Default headers sent with every request.
 * @property {'omit'|'same-origin'|'include'} [credentials='omit'] - Default credentials mode.
 * @property {Interceptor[]} [interceptors=[]] - An array of request/response lifecycle hooks.
 */

/**
 * A wrapper class around the native Fetch API supporting base URLs, default headers, and interceptors.
 */
export class Fetcher {
  #baseURL;
  #headers;
  #credentials;
  #interceptors;
  #pausePromise;
  #paused = false;


  /**
    * Creates an instance of Fetcher.
    * @param {FetcherOptions} [options={}] - Configuration options for the fetcher instance.
    */
  constructor(options = {
    baseURL: '',
    headers: {},
    credentials: 'omit',
    interceptors: []
  }) {
    this.#baseURL = options.baseURL || '';
    this.#headers = options.headers || {};
    this.#credentials = options.credentials || 'omit';
    this.#interceptors = options.interceptors || [];
  }


  /**
    * Fetches a resource from the network and returns a Promise. Same interface as Fetch
    * @param {string|Object} resource - The URL string or Request object to fetch
    * @param {Object} [options] - Optional Request object
    * @param {string} [options.method='GET'] - HTTP method (GET, POST, PUT, DELETE, etc.).
    * @param {Headers|Object} [options.headers] - Request headers
    * @param {string|Blob|ArrayBuffer|FormData|URLSearchParams} [options.body] - Request body.
    * @param {string} [options.mode='cors'] - Request mode (cors, no-cors, same-origin).
    * @param {string} [options.credentials='same-origin'] - Credentials mode (omit, same-origin, include).
    * @param {string} [options.cache='default'] - Cache mode (default, no-store, reload, no-cache, force-cache, only-if-cached).
    * @param {string} [options.redirect='follow'] - Redirect mode (follow, error, manual).
    * @param {string} [options.referrer='client'] - Referrer policy.
    * @param {string} [options.integrity] - Subresource integrity value.
    * @param {boolean} [options.keepalive] - Allows request to outlive page.
    * @param {AbortSignal} [options.signal] - AbortSignal to abort request.
    * @returns {Promise<Response>} A Promise that resolves to a Response object.
    * @throws {TypeError} If the input is invalid.
    */
  async fetch(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options));
  }

  /**
   * Convenience method for HTTP GET requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async get(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'GET'));
  }

  /**
   * Convenience method for HTTP POST requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async post(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'POST'));
  }

  /**
   * Convenience method for HTTP PUT requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async put(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'PUT'));
  }

  /**
   * Convenience method for HTTP PATCH requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async patch(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'PATCH'));
  }

  /**
   * Convenience method for HTTP DELETE requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async delete(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'DELETE'));
  }

  /**
   * Convenience method for HTTP HEAD requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async head(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'HEAD'));
  }

  /**
   * Convenience method for HTTP OPTIONS requests.
   * Identical to {@link fetch}, but the HTTP method is hardcoded to 'GET'.
   *
   * @param {string|Object} resource - The URL string or Request object to fetch
   * @param {Omit<Object, 'method'>} [options] - Optional Request object (excluding the 'method' property)
   * @returns {Promise<Response>} A Promise that resolves to a Response object.
   * @see Fetcher#fetch
   */
  async options(resource, options) {
    return this.#fetch(this.#buildRequest(resource, options, 'OPTIONS'));
  }

  /**
   * Returns the current headers object.
   *
   * @returns {Headers} The current headers object.
   */
  get headers() {
    return this.#headers;
  }


  #pause() {
    if (this.#paused) return;
    this.#paused = true;
    this.#pausePromise = Promise.withResolvers();
  }

  #resume() {
    if (!this.#paused) return;
    this.#paused = false;
    this.#pausePromise.resolve();
  }

  // TODO do i need to handle pusing downloads and uploads?
  async #fetch(request) {
    if (this.#paused) await this.#pausePromise.promise;

    for (let interceptor of this.#interceptors) {
      let result = await interceptor._runBefore(request);
      if (result instanceof Request) request = result;
    }
    let response = await fetch(request);
    for (let interceptor of this.#interceptors) {
      if (interceptor.waitForResoltuion) this.#pause();
      let result = await interceptor._runAfter(request, response);
      if (result instanceof Request) {
        response = await fetch(result);
      }
      this.#resume();
    }
    return response;
  }

  #buildRequest(resource, options, overrideMethod) {
    if (typeof resource === 'string') {
      options = options || {};
      options.url = resource;
    } else if (typeof resource === 'object') options = resource;
    else throw Error('Incorrect parameters');

    let headers = new Headers(Object.assign(this.#headers, options.headers || {}));
    if (options?.body?.constructor === Object && !Object.hasOwn(options.body, 'Content-Type')) {
      headers.set('Content-Type', 'application/json');
      options.body = JSON.stringify(options.body);
    }

    return new Request(`${this.#baseURL}${options.url}`, {
      method: overrideMethod || options.method || 'GET',
      headers,
      credentials: options.credentials || this.#credentials,
      body: options.body
    });
  }
}



/**
 * @typedef {Object} Interceptor
 * @property {Array<number>} [statusCodes] - Valid status codes to intercept after request.
 * @property {function(Request): Request|Undefined} [before] - Intercept before request.
 * @property {function(Request,Response): Request|Undefined} [after] - Intercept after request.
 */

/**
 * Interceptor class for request/response lifecycle hooks.
 */
export class Interceptor {
  #statusCodes;
  #waitForResoltuion;
  #before;
  #after;


  /**
    * Creates an instance of Fetcher.
    * @param {FetcherOptions} [options={}] - Configuration options for the fetcher instance.
    */
  constructor({
    statusCodes = [],
    waitForResoltuion = false,
    before = null,
    after = null
  }) {
    this.#statusCodes = statusCodes;
    this.#waitForResoltuion = waitForResoltuion;
    this.#before = before;
    this.#after = after;
  }

  get waitForResoltuion() {
    return this.#waitForResoltuion;
  }

  async _runBefore(request) {
    if (typeof this.#before !== 'function') return;
    return this.#before(request);
  }

  async _runAfter(request, response, ) {
    if (this.#statusCodes.length === 0 || !this.#statusCodes.includes(response.status) || typeof this.#after !== 'function') return;
    return this.#after(request, response);
  }
}
