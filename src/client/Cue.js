import { addToQueue } from './queue.js';


const CUE_NODE = Symbol('CUE_NODE');
const CUE = Symbol('CUE');
const CUE_OBJECT = Symbol('CUE_OBJECT');
const CUE_ARRAY = Symbol('CUE_ARRAY');
const CUE_COMPUTE = Symbol('CUE_COMPUTE');
const CUE_EFFECT = Symbol('CUE_EFFECT');
const CUE_HTML = Symbol('CUE_HTML');
const CUE_ERRORED = Symbol('CUE_ERRORED');
const CUE_UNSET = Symbol('CUE_UNSET');
let epoch = 0;
let activeConsumer;
let isTemplating = false;


export function beginTemplating() {
  isTemplating = true;
}

export function endTemplating() {
  isTemplating = false;
}

function isCue(node) {
  return node?.[CUE_NODE] === true;
}

function isCueObject(node) {
  return node?.[CUE_OBJECT] === true;
}

function isCueArray(node) {
  return node?.[CUE_ARRAY] === true;
}

function isCueCompute(node) {
  return node?.[CUE_COMPUTE] === true;
}

function isCueEffect(node) {
  return node?.[CUE_EFFECT] === true;
}

function isCueHtml(node) {
  return node?.[CUE_HTML] === true;
}

function isErrored(node) {
  return node?.[CUE_ERRORED] === true;
}

function isUnset(node) {
  return node?.[CUE_UNSET] === true;
}



class CueNode {
  [CUE_NODE] = true;

  #producers = [];
  #producerVersions = [];
  #consumers = [];
  #dirty = false;
  #version = 0;
  #lastCleanEpoch = -1;
  #value = CUE_UNSET;
  #error;
  #watchers = new Set();


  get dirty() { return this.#dirty; }
  set dirty(value) { this.#dirty = value; }

  get version() { return this.#version; }
  set version(value) { this.#version = value; }

  get lastCleanEpoch() { return this.#lastCleanEpoch; }
  set lastCleanEpoch(value) { this.#lastCleanEpoch = value; }

  get producerVersions() { return this.#producerVersions; }
  get producers() { return this.#producers; }

  get error() { return this.#error; }
  set error(value) { this.#error = value; }

  get() {
    if (activeConsumer) this.subscribe(activeConsumer);

    if (this.#value === CUE_ERRORED) throw this.#error;

    // return the instance of the Cue for templating. This is needed for the template tag function to recognize it as a Cue
    if (isTemplating && !isCueHtml(this) && !isCueHtml(activeConsumer)) return this;

    return this.#value;
  }

  set(value) {
    if (this.#value === value) return;

    this.#value = value;
    epoch++;
    this.notify();
  }

  // this allows the "value" getter to return the signal object if ".value" is used in a template expression
  getForTemplate() {
    if (activeConsumer) this.subscribe(activeConsumer);
    if (this.#value === CUE_ERRORED) throw this.#error;
    return this.#value;
  }

  getRawValue() {
    return this.#value;
  }

  notify() {
    for (const consumer of this.#consumers) {
      if (!consumer.dirty) {
        consumer.markDirty();
      }
    }

    addToQueue(this.#notifyWatchers);
  }

  subscribe(consumer) {
    if (this.#producers.includes(consumer) || consumer === this) return;

    this.#producers.push(consumer);
    this.#producerVersions.push(consumer.version);

    if (isCueCompute(consumer) || isCueEffect(consumer)) {
      this.#consumers.push(consumer);
      consumer.subscribe(this);
    }
  }

  unsubscribe(node) {
    const index = this.#producers.indexOf(node);
    if (index > -1) {
      this.#producers[index] = this.#producers[this.#producers.length - 1];
      this.#producerVersions[index] = this.#producerVersions[this.#producerVersions.length - 1];
      this.#producers.length--;
      this.#producerVersions.length--;
    }

    if (isCueCompute(node)) {
      const index = this.#consumers.indexOf(node);
      if (index > -1) {
        this.#consumers[index] = this.#consumers[this.#consumers.length - 1];
        this.#consumers.length--;
        node.unsubscribe(this);
      }
    }
  }

  markDirty() {
    this.#dirty = true;
    this.notify();
  }

  dispose() {
    let i;
    for (i = 0; i < this.#producers.length; i++) {
      this.#producers[i].unsubscribe(this);
    }
    this.#producers.length = 0;

    for (i = 0; i < this.#consumers.length; i++) {
      this.#consumers[i].unsubscribe(this);
    }
    this.#consumers.length = 0;
    this.#watchers.clear();
  }

  watch(callback) {
    this.#watchers.add(callback);
  }

  unwatch(callback) {
    this.#watchers.delete(callback);
  }

  #notifyWatchers = () => {
    for (const watcher of this.#watchers) {
      watcher(this);
    }

    for (const consumer of this.#consumers) {
      if (consumer.dirty) consumer.notify();
    }
  }
}


class CueState extends CueNode {
  [CUE] = true;


  constructor(value) {
    super();
    super.set(value);
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }


  set(value) {
    if (super.getRawValue() === value) return;
    super.set(value);
  }
}



class CueCompute extends CueNode {
  [CUE_COMPUTE] = true;

  #callback;


  constructor(callback) {
    super();

    if (arguments[1]) this[CUE_HTML] = true;
    this.#callback = callback;
    this.#compute();
    if (super.error) throw super.error;
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }
  set value(_) { }
  get error() { return super.error; }

  get() {
    this.#compute();
    return super.get();
  }

  getForTemplate() {
    this.#compute();
    return super.getForTemplate();
  }

  #compute() {
    if (!super.dirty && super.lastCleanEpoch === epoch) return;

    if (super.getRawValue() === CUE_UNSET || super.dirty) {
      let nextValue;
      let changed = false;
      const lastValue = super.get();
      const previousConsumer = beginConsumerCompute(this);

      super.error = undefined;
      try {
        nextValue = this.#callback();
        changed = nextValue !== lastValue;
      } catch (e) {
        super.error = e;
        super.set(CUE_ERRORED);
      } finally {
        afterConsumerCompute(previousConsumer);
      }

      if (changed) {
        super.set(nextValue);
        super.version++;
      }
    }

    super.dirty = false;
    super.lastCleanEpoch = epoch;
  }
}

class CueHTML extends CueCompute {
  constructor(callback) {
    super(callback, true);
  }
}


class CueEffect extends CueNode {
  [CUE_EFFECT] = true;

  #callback;


  constructor(callback) {
    super();

    this.#callback = callback;
    this.#effect();
  }

  get() {
    this.#effect();
    return super.get();
  }


  markDirty() {
    addToQueue(this.#effect, 1);
  }

  #effect = () => {
    const previousConsumer = beginConsumerCompute(this);

    try {
      this.#callback();
    } catch (e) {
      console.error(e)
    } finally {
      afterConsumerCompute(previousConsumer);
    }
  }
}


const ARRAY_MUTATION_METHODS = new Set([
  'push',
  'unshift',
  'pop',
  'shift',
  'splice',
  'reverse'
]);

const ARRAY_GETTER_METHODS = new Set([
  Symbol.iterator,
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'slice',
  'some',
  'values'
]);



class CueArray extends CueNode {
  [CUE_ARRAY] = true;

  #cues = new Map();
  #proxies = new Map();
  #methods = new Map();
  #compute;
  #rootProxy;


  constructor(value) {
    super();

    super.value = value;
    this.#rootProxy = this.#createProxy(value);
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }

  get() {
    if (activeConsumer) this.subscribe(activeConsumer);
    return this.#rootProxy;
  }

  set(value) {
    if (super.getRawValue() === value) return;
    this.#rootProxy = this.#createProxy(value);
    super.set(value);
  }

  map(callback) {
    this.#compute = new CueHTML(() => {
      const result = [];
      const length = this.get().length;
      for (let i = 0; i < length; i++) {
        result[i] = callback(this.#rootProxy[i], i, this.#rootProxy);
      }

      return result;
    });
    return this.#compute;
  }

  #createProxy(value) {
    let self = this;

    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === CUE_NODE) return true;
        if (prop === CUE_ARRAY) return true;
        if (prop === CUE_HTML) return false;
        if (prop === '__cue') return self;
        if (prop === '__raw') return target;
        if (prop === '__isProxy') return true;

        const val = target[prop];
        if (prop === 'fragment') return val;
        if (prop == 'length') return val

        if (ARRAY_MUTATION_METHODS.has(prop)) {
          let fn = self.#methods.get(prop);

          if (fn === undefined) {
            fn = (...args) => {
              const v = target[prop](...args);
              self.markDirty();
              return v;
            };

            self.#methods.set(prop, fn);
          }

          return fn;
        } else  if (ARRAY_GETTER_METHODS.has(prop)) {
          return Reflect.get(target, prop, receiver);
        } else if (val !== null && typeof val === 'object') {
          if (!self.#proxies.has(val)) self.#proxies.set(val, self.#createProxy(val));
          return self.#proxies.get(val);
        }

        if (!self.#cues.has(target)) self.#cues.set(target, new Map());
        let targetCues = self.#cues.get(target);
        if (!targetCues.has(prop)) targetCues.set(prop, new CueState(target[prop]));
        if (isTemplating || activeConsumer?.[CUE_HTML]) return targetCues.get(prop);
        return targetCues.get(prop).get();
      },

      set(target, prop, value, receiver) {
        let targetCues = self.#cues.get(target);
        if (targetCues?.has(prop)) {
          targetCues.get(prop).set(value);
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },

      getPrototypeOf() {
        return CueArray.prototype;
      }
    });
  }
}


class CueObject extends CueNode {
  [CUE_OBJECT] = true;

  #cues = new Map();
  #cueArrays = new Map();
  #cueObjects = new Map();
  #rootProxy;

  constructor(value, track = false) {
    super();
    super.value = value;
    this.#rootProxy = this.#createProxy(value);
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }

  get() {
    if (activeConsumer) {
      this.subscribe(activeConsumer);
    }
    return this.#rootProxy;
  }

  set(value) {
    if (super.get() === value) return;
    this.#rootProxy = this.#createProxy(value);
    super.set(value);
  }

  #createProxy(value, path = []) {
    if (value === null || typeof value !== 'object' || value.__isProxy) return value;

    const self = this;

    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === CUE_NODE) return true;
        if (prop === CUE_OBJECT) return true;
        if (prop === CUE_HTML) return false;
        if (prop === '__cue') return self;
        if (prop === 'valueOf' || prop === 'toJSON') return () => target;

        let val;

        if (Array.isArray(target[prop])) {
          if (!self.#cueArrays.has(prop)) self.#cueArrays.set(prop, new CueArray(target[prop]));
          val = self.#cueArrays.get(prop);
        } else if (typeof target[prop] === 'object' && target[prop] !== null) {
          if (!self.#cueObjects.has(prop)) self.#cueObjects.set(prop, new CueObject(target[prop]));
          val = self.#cueObjects.get(prop);
        } else {
          if (!self.#cues.has(prop)) self.#cues.set(prop, new CueState(target[prop]));
          val = self.#cues.get(prop);
        }

        if (isTemplating) return val;
        return val.get();
      },

      set(target, prop, value, receiver) {
        if (Array.isArray(target[prop])) {
          if (self.#cueArrays.has(prop)) self.#cueArrays.get(prop).set(value);
          return true;
        } else if (typeof target[prop] === 'object' && target[prop] !== null) {
          if (self.#cueObjects.has(prop)) self.#cueObjects.get(prop).set(value);
          return true;
        } else if (self.#cues.has(prop)) {
          self.#cues.get(prop).set(value);
          return true;
        }

        return Reflect.set(target, prop, value, receiver);
      },

      has(target, prop) {
        return prop in target;
      },

      ownKeys(target) {
        return Reflect.ownKeys(target);
      },

      deleteProperty(target, prop) {
        if (self.#cues.has(prop)) {
          self.#cues.get(prop).dispose();
          self.#cues.delete(prop);
        }
        const result = Reflect.deleteProperty(target, prop);
        return result;
      }
    });
  }
}


function setActiveConsumer(consumer) {
  const previous = activeConsumer;
  activeConsumer = consumer;
  return previous;
}

function beginConsumerCompute(consumer) {
  return setActiveConsumer(consumer);
}

function afterConsumerCompute(previousConsumer) {
  setActiveConsumer(previousConsumer);
}


const Cue = Object.freeze({
  State: CueState,
  Array: CueArray,
  Object: CueObject,
  Compute: CueCompute,
  HTML: CueHTML,
  effect: callback => {
    const instance = new CueEffect(callback);
    return function dispose() {
      instance.dispose();
    };
  },
  isCue: isCue,
  isArray: isCueArray,
  isObject: isCueObject,
  isCompute: isCueCompute,
  isEffect: isCueEffect,
  isHtml: isCueHtml,
  isErrored: isErrored,
  isUnset: isUnset
});
export default Cue;
