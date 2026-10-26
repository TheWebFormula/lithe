import { addToQueue } from './queue.js';
import debug from './debug.js';

// TODO error states


const CUE_NODE = Symbol('CUE_NODE');
const CUE = Symbol('CUE');
const CUE_OBJECT = Symbol('CUE_OBJECT');
const CUE_ARRAY = Symbol('CUE_ARRAY');
const CUE_COMPUTE = Symbol('CUE_COMPUTE');
const CUE_EFFECT = Symbol('CUE_EFFECT');
const CUE_HTML = Symbol('CUE_HTML');
const CUE_ERRORED = Symbol('CUE_ERRORED');
const CUE_UNSET = Symbol('CUE_UNSET');
const ARRAY_MUTATION_METHODS = new Set([
  'pop', 'push', 'reverse',
  'shift', 'splice', 'unshift'
]);
const ARRAY_GETTER_METHODS = new Set([
  Symbol.iterator, 'concat', 'entries', 'every',
  'filter', 'find', 'findIndex', 'flat',
  'flatMap', 'forEach', 'includes', 'indexOf',
  'join', 'keys', 'lastIndexOf', 'map',
  'reduce', 'reduceRight', 'slice', 'some', 'values'
]);
let activeConsumer;
let isTemplating = false;

function isCue(node) { return node?.[CUE_NODE] === true; }
function isCueObject(node) { return node?.[CUE_OBJECT] === true; }
function isCueArray(node) { return node?.[CUE_ARRAY] === true; }
function isCueCompute(node) { return node?.[CUE_COMPUTE] === true; }
function isCueEffect(node) { return node?.[CUE_EFFECT] === true; }
function isCueHtml(node) { return node?.[CUE_HTML] === true; }
function isCueComputable(node) { return isCueCompute(node) || isCueEffect(node) || isCueHtml(node); }
function isErrored(node) { return node?.[CUE_ERRORED] === true; }
function isUnset(node) { return node?.[CUE_UNSET] === true; }

function setActiveConsumer(consumer) {
  const previous = activeConsumer;
  activeConsumer = consumer;
  return previous;
}


class CueNode {
  [CUE_NODE] = true;

  #dirty = false;
  get dirty() { return this.#dirty; }
  set dirty(value) { this.#dirty = value; }

  #consumers = new Set();
  #producers = new Set();
  #watchers = new Set();
  #value = CUE_UNSET;
  #isPending;
  #pendingCue;
  #valueLast;

  constructor() {
    DEBUG: {
      this.getProducers = () => this.#producers;
      this.getConsumers = () => this.#consumers;
      this.getGraph = () => {
        return {
          producer: debug.getCueGraph(this, true),
          consumer: debug.getCueGraph(this),
        };
      }
      debug.trackCue(this);
    }
  }


  get isPending() {
    this.#addConsumer();
    this.#setPending();
    if (!this.#pendingCue) this.#pendingCue = new CuePending(this.#isPending);

    return this.#pendingCue.get();
  }

  get isPendingRaw() {
    this.#setPending();
    return this.#isPending;
  }

  get() {
    this.#addConsumer();

    // return the instance of the Cue for templating. This is needed for the template tag function to recognize it as a Cue
    if (isTemplating && !isCueCompute(activeConsumer)) return this;

    if (this.#isPending) return this.#valueLast;
    return this.#value;
  }

  getRaw() {
    this.#addConsumer();
    this.#setPending();
    // if (this.#isPending) return this.#valueLast;
    return this.#value;
  }

  set(value) {
    if (this.#value === value) return;

    this.#valueLast = this.#value;
    this.#value = value;
    this.#setPending();

    if (this.#isPending && !isCueComputable(this)) {
      this.#value.then(v => {
        this.#value = v;
        this.#valueLast = undefined;
        this.#setPending();
        this.#notifyConsumers();
      });
    } else this.#valueLast = undefined;
    this.#notifyConsumers();
  }

  setNotify(value) {
    if (this.#value === value) return;
    this.#value = value;
    this.#notifyConsumers();
  }

  markDirty() {
    this.#dirty = true;
    this.#notifyConsumers();
  }

  subscribe(producer) {
    if (producer === this) return;
    this.#producers.add(producer);
  }

  // Currently works in both direction
  // subcribe is consumer -> producer
  // #addConsumer is how we register locally
  unsubscribe(node) {
    this.#producers.delete(node);
    this.#consumers.delete(node);
  }

  watch(callback) {
    this.#watchers.add(callback);
  }

  unwatch(callback) {
    this.#watchers.delete(callback);
    // TODO The garbage collector does clean these up, do i want to still call this? The issue is global Cue's;
    // if (this.#watchers.size === 0) this.dispose();
  }

  dispose() {
    for (const consumer of this.#consumers) {
      consumer.unsubscribe(this);
    }
    this.#consumers.clear();

    for (const producer of this.#producers) {
      producer.unsubscribe(this);
    }
    this.#producers.clear();
    if (this.#pendingCue) {
      this.#pendingCue.dispose();
      this.#pendingCue = undefined;
    }
    this.#value = undefined;
    this.#valueLast = undefined;
    DEBUG: debug.untrackCue(this);
  }

  #setPending() {
    if (isCueComputable(this)) {
      this.#isPending = false;
      for (let producer of this.#producers) {
        if (producer.isPendingRaw) {
          // this.#value = new Promise(resolve => setTimeout(resolve, 1000))
          // this.#value = producer.getRaw();
          this.#isPending = true;
          break;
        }
      }
    } else {
      this.#isPending = this.#value instanceof Promise;
    }

    if (!this.#pendingCue) return;
    this.#pendingCue.set(this.#isPending);
  }

  #addConsumer() {
    if (!activeConsumer) return;
    this.#consumers.add(activeConsumer);
    activeConsumer.subscribe(this);
  }


  #notifyConsumers() {
    for (const consumer of this.#consumers) {
      if (!consumer.dirty) {
        consumer.markDirty();
      }
    }

    addToQueue(this.#notifyWatchers);
  }

  #notifyWatchers = () => {
    for (const watcher of this.#watchers) {
      watcher(this);
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
  setNotify() { }
}

class CuePending extends CueNode {
  [CUE] = true;
  #value;


  constructor(value) {
    super();
    this.#value = value;
  }

  // block
  set dirty(_) { }
  set version(_) { }
  setNotify() { }

  get() {
    if (activeConsumer) this.subscribe(activeConsumer);
    // if (isTemplating && !isCueHtml(activeConsumer)) return this;
    return this.#value
  }

  set(value) {
    if (this.#value === value) return;

    this.#value = value;
    super.setNotify(value);
  }
}


class CueCompute extends CueNode {
  [CUE_COMPUTE] = true;
  #callback;

  constructor(callback) {
    super();

    if (arguments[1]) this[CUE_HTML] = true;
    this.#callback = callback;
    super.dirty = true;
  }

  // block
  set dirty(_) { }
  set() { throw Error('Cannot use set with compute') }
  setNotify() { }

  get() {
    this.#compute();
    return super.get();
  }

  getRaw() {
    this.#compute();
    return super.getRaw();
  }

  // dispose() {
  //   if (this.#onDisposeCallback) this.#onDisposeCallback();
  //   this.#onDisposeCallback = undefined;
  //   this.callback = undefined;
  //   super.dispose();
  // }

  // #onDisposeCallback;
  // onDispose(callback) {
  //   this.#onDisposeCallback = callback;
  // }

  #compute() {
    if (!super.dirty) return;

    let nextValue;
    let changed = false;
    const lastValue = super.get();
    const previousConsumer = setActiveConsumer(this);


    super.error = undefined;
    try {
      nextValue = this.#callback();
      changed = nextValue !== lastValue;
    } catch (e) {
      if (super.isPendingRaw === false) {
        console.error(e)
        super.error = e;
        super.set(CUE_ERRORED);
      }
    } finally {
      setActiveConsumer(previousConsumer);
    }

    if (changed) {
      // TODO verify this is correct
      if (this[CUE_HTML]) {
        lastValue?.elements?.forEach(el => el.remove());
      }

      super.set(nextValue);
    }

    super.dirty = false;
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
    super.dirty = true;
    this.#effect();
  }

  // Effects automatically run on dirty, unlike computes that only run on get()
  markDirty() {
    super.dirty = true;
    addToQueue(this.#effect, 1);
  }

  #effect = () => {
    if (super.dirty === false) return;

    const previousConsumer = setActiveConsumer(this);

    try {
      this.#callback();
    } catch (e) {
      console.error(e)
    } finally {
      setActiveConsumer(previousConsumer);
      super.dirty = false;
    }
  }
}



class CueArray extends CueNode {
  [CUE_ARRAY] = true;
  #compute;
  #target;
  #rootProxy;
  #methods = new Map();
  #proxies = new Map();
  #cues = new Map();

  constructor(value) {
    super();

    super.set(value);
    this.#target = super.isPendingRaw ? [] : value || [];
    this.#rootProxy = this.#createProxy(this.#target);
  }

  // block
  set dirty(_) { }
  set version(_) { }
  setNotify() { }

  get() {
    super.getRaw();
    return this.#rootProxy;
  }

  set(value) {
    if (super.getRaw() === value) return;

    super.set(value);
    if (super.isPendingRaw) {
      value.then((v) => {
        this.#rootProxy.length = 0;
        this.#rootProxy.push(...v)
      });
    } else {
      this.#rootProxy.length = 0;
      this.#rootProxy.push(...value)
    }
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
    // this.#compute.onDispose(() => this.dispose());
    return this.#compute;
  }

//   dispose() {
//     for (let cueMap of this.#cues.values()) {
//       for (let cue of cueMap.values()) {
//         cue.dispose();
//       }
//       cueMap.clear();
//     }
//     this.#cues.clear();
//
//     this.#compute = undefined;
//     this.#methods.clear();
//     this.#proxies.clear();
//     this.#target = undefined;
//     this.#rootProxy = undefined;
//     super.dispose();
//   }

  #createProxy(value) {
    let self = this;

    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === CUE_NODE) return true;
        if (prop === CUE_ARRAY) return true;
        if (prop === CUE_HTML) return false;

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
  #pendingComputes = new Map();
  #rootProxy;

  constructor(value) {
    super();
    super.set(value);
    this.#rootProxy = this.#createProxy(super.isPendingRaw ? {} : value || {});
  }

  // block
  set dirty(_) { }
  set version(_) { }
  setNotify() { }

  get() {
    super.getRaw();
    return this.#rootProxy;
  }

  set(value) {
    if (super.getRaw() === value) return;

    super.set(value);
    if (super.isPendingRaw) {
      value.then((v) => {
        for (const key of Reflect.ownKeys(this.#rootProxy)) {
          delete this.#rootProxy[key];
        }

        Object.assign(this.#rootProxy, v);
      });
    } else {
      for (const key of Reflect.ownKeys(this.#rootProxy)) {
        delete this.#rootProxy[key];
      }

      Object.assign(this.#rootProxy, value);
    }
  }

//   dispose() {
//     for (let cueArray of this.#cueArrays.values()) {
//       cueArray.dispose();
//     }
//     this.#cueArrays.clear();
//
//     for (let cueArray of this.#cueObjects.values()) {
//       cueArray.dispose();
//     }
//     this.#cueObjects.clear();
//
//     for (let cueArray of this.#cues.values()) {
//       cueArray.dispose();
//     }
//     this.#cues.clear();
//
//     for (let cueArray of this.#pendingComputes.values()) {
//       cueArray.dispose();
//     }
//     this.#pendingComputes.clear();
//     this.#rootProxy = undefined;
//     super.dispose();
//   }

  #createProxy(value, path = []) {
    if (value === undefined || value === null || typeof value !== 'object' || value.__isProxy) return value;

    const self = this;
    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === CUE_NODE) return true;
        if (prop === CUE_OBJECT) return true;
        if (prop === CUE_HTML) return false;
        if (prop === 'valueOf' || prop === 'toJSON') return () => target;

        // wrap in comput when dealing with a promise
        if (self.isPendingRaw) {
          if (!self.#pendingComputes.has(prop)) self.#pendingComputes.set(prop, new CueCompute(() => {
            self.get();
            if (self.isPendingRaw) return '';
            return self.#rootProxy[prop];
          }));
          return self.#pendingComputes.get(prop);
        }

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
        if (Array.isArray(target[prop]) || Array.isArray(value)) {
          if (self.#cueArrays.has(prop)) self.#cueArrays.get(prop).set(value);
        } else if ((typeof value === 'object' && value !== null) || (typeof target[prop] === 'object' && target[prop] !== null)) {
          if (self.#cueObjects.has(prop)) self.#cueObjects.get(prop).set(value);
        } else if (self.#cues.has(prop)) {
          self.#cues.get(prop).set(value);
        }

        return Reflect.set(target, prop, value, receiver);
      }
    });
  }
}


export function beginTemplating() { isTemplating = true; }
export function endTemplating() { isTemplating = false; }
export default Object.freeze({
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
