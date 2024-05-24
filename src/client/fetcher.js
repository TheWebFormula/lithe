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

/**
 * @typedef {String} Methods
 * @value 'GET'
 * @value 'POST'
 * @value 'PUT'
 * @value 'DELETE'
 * @value 'PATCH'
 */
/**
 * @typedef {Object} Config 
 * @property {Methods} method Request method
 * @property {String} [mode]
 * @property {String} [cache]
 * @property {String} [credentials]
 * @property {String} [redirect]
 * @property {String} [referrerPolicy]
 * @property {Object} [headers]
 * @property {any} [body]
 */
/**
 * Interceptor function
 * @callback Interceptor
 * @param {Config} config Fetch config
 * @returns {Config} Modified fetch config
 */
/**
 * Interceptor function
 * @callback Validate
 * @param {Config} config Fetch config
 * @returns {Boolean} Return true to invoke interceptor
 */
/**
 * @typedef {Object} ConditionalAfter 
 * @property {Validate} validate Validation function
 * @property {Interceptor} intercept Interceptor function
 */
/**
 * @typedef {Object} Interceptors 
 * @property {Interceptor} [before] Before interceptor
 * @property {Interceptor} [auth] Auth interceptor (401)
 * @property {ConditionalAfter} [conditionalAfter] Interceptor that first runs a validate function
 */
/**
 * Create instance of fetcher
 * @param {Object} instanceConfig Instance configuration
 * @param {String} [instanceConfig.baseUrl] Base url for all requests
 * @param {String} [instanceConfig.headers] Headers for all requests
 * @param {Interceptors} [instanceConfig.interceptors]
 * @returns {Object} fetch instance
 */
export function createFetcher(instanceConfig = {
  baseUrl: '',
  headers: {},
  interceptors: {
    async before(exampleConfig) { return exampleConfig; },
    async auth(exampleConfig) { return exampleConfig; },
    conditionalAfter: {
      validate(response = {}) { return true; },
      async intercept(exampleConfig) { return exampleConfig; }
    }
  }
}) {
  const instance = async (
    url,
    config = exampleConfig,
    interceptors = {
      async before(exampleConfig) { return exampleConfig; },
      async auth(exampleConfig) { return exampleConfig; },
      conditionalAfter: {
        validate(response = {}) { return true; },
        async intercept(exampleConfig) { return exampleConfig; }
      }
    }
  ) => {
    url = `${(instanceConfig.baseUrl || '')}${url}`;
    config.headers = {
      ...instanceConfig.headers,
      ...config.headers
    };
    const isJson = (!config.headers?.['Content-Type'] && typeof config?.body === 'object');
    if (isJson) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    if (interceptors?.before) config = await interceptors.before(config);
    if (instanceConfig.interceptors?.before) config = await instanceConfig.interceptors.before(config);
    let response = await fetch(url, config);
    if (interceptors?.conditionalAfter?.validate || instanceConfig?.interceptors?.conditionalAfter?.validate) {
      if ((interceptors?.conditionalAfter || instanceConfig?.interceptors?.conditionalAfter).validate(response)) {
        config = (interceptors?.conditionalAfter || instanceConfig?.interceptors?.conditionalAfter).intercept(config);
        response = await fetch(url, config);
      }
    } else if (response.status === 401) {
      if (interceptors?.auth) config = await interceptors.auth(config);
      if (instanceConfig.interceptors?.auth) config = await instanceConfig.interceptors.auth(config);
      if (interceptors?.auth || instanceConfig.interceptors?.auth) response = await fetch(url, config);
    }
    return response
  };

  return instance;
}

// Main instance
export const fetcher = createFetcher();
