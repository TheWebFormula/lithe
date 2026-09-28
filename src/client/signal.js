import { addToQueue } from './queue.js';
// import * as debugTool from './debuger.js';


const SIGNAL_NODE = Symbol('SIGNAL_NODE');
const SIGNAL = Symbol('SIGNAL');
const SIGNAL_OBJECT = Symbol('SIGNAL_OBJECT');
const SIGNAL_ARRAY = Symbol('SIGNAL_ARRAY');
const COMPUTE = Symbol('COMPUTE');
const EFFECT = Symbol('EFFECT');
const HTMLCOMPUTE = Symbol('HTMLCOMPUTE');
const ERRORED = Symbol('ERRORED');
const UNSET = Symbol('UNSET');
let epoch = 0;
let activeConsumer;
let isTemplating = false;


export function beginTemplating() {
  isTemplating = true;
}

export function endTemplating() {
  isTemplating = false;
}

export function isSignal(node) {
  return typeof node === 'object' && node !== null && node[SIGNAL_NODE] === true;
}

export function isSignalObject(node) {
  return typeof node === 'object' && node !== null && node[SIGNAL_OBJECT] === true;
}

export function isSignalArray(node) {
  return typeof node === 'object' && node !== null && node[SIGNAL_ARRAY] === true;
}

export function isHTMLCompute(node) {
  return typeof node === 'object' && node !== null && node[HTMLCOMPUTE] === true;
}

export function isCompute(node) {
  return typeof node === 'object' && node !== null && node[COMPUTE] === true;
}

class SignalNode {
  [SIGNAL_NODE] = true;

  #producers = [];
  #producerVersions = [];
  #consumers = [];
  #dirty = false;
  #version = 0;
  #lastCleanEpoch = 0;
  #value = UNSET;
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

  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);

    // return the instance of the signal for templating. This is needed for the template tag function to recognize it as a signal
    // if (isTemplating && !isHTMLCompute(this) && !Array.isArray(this.valueUntracked)) return this;

    if (this.#value === ERRORED) throw this.#error;
    if (isTemplating && !isHTMLCompute(this) && !isHTMLCompute(activeConsumer)) return this;
    return this.#value;
  }

  set value(value) {
    if (this.#value === value) return;

    this.#value = value;
    epoch++;
    this.notify();
  }

  // this allows the "value" getter to return the signal object if ".value" is used in a template expression
  get valueTemplating() {
    if (activeConsumer) this.subscribe(activeConsumer);
    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }

  notify() {
    for (const consumer of this.#consumers) {
      if (!consumer.dirty) {
        consumer.markDirty();
      }
    }

    // computes are updated on read, so we do not want to trigger a notify on itself
    // if (this[COMPUTE]) return;
    addToQueue(this.#notifyWatchers);
  }

  subscribe(consumer) {
    if (this.#producers.includes(consumer) || consumer === this) return;

    this.#producers.push(consumer);
    this.#producerVersions.push(consumer.version);

    if (consumer[COMPUTE] || consumer[EFFECT]) {
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

    if (node[COMPUTE]) {
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


export class Signal extends SignalNode {
  [SIGNAL] = true;


  constructor(value) {
    super();
    super.value = value;
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }

  get value() { return super.value; }
  set value(value) {
    if (super.value === value) return;
    super.value = value;
  }
  get valueTemplating() { return super.valueTemplating; }
}


export class Compute extends SignalNode {
  [COMPUTE] = true;

  #callback;


  constructor(callback, htmlCompute = false) {
    super();

    if (htmlCompute) this[HTMLCOMPUTE] = true;
    this.#callback = callback;
    this.#compute();
    if (super.error) throw super.error;
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }
  set value(_) { }
  get value() {
    this.#compute();
    return super.value;
  }
  get valueTemplating() {
    this.#compute();
    return super.valueTemplating;
  }
  get error() { return super.error; }

  test() {
    epoch++;
    super.markDirty();
  }

  #compute() {
    if (!super.dirty && super.lastCleanEpoch === epoch) return;
    if (super.value === UNSET || super.dirty) {
      let nextValue;
      let changed = false;
      const lastValue = super.value;
      const previousConsumer = beginConsumerCompute(this);

      super.error = undefined;
      try {
        nextValue = this.#callback();
        changed = nextValue !== lastValue;
      } catch (e) {
        super.error = e;
        super.value = ERRORED;
      } finally {
        afterConsumerCompute(previousConsumer);
      }

      if (changed) {
        super.value = nextValue;
        super.version++;
      }
    }

    super.dirty = false;
    super.lastCleanEpoch = epoch;
  }
}


class Effect extends SignalNode {
  [EFFECT] = true;

  #callback;


  constructor(callback) {
    super();

    this.#callback = callback;
    this.#effect();
  }

  get value() {
    this.#effect();
    return super.value;
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

export function effect(callback) {
  const instance = new Effect(callback);
  return function dispose() {
    instance.dispose();
  };
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



export class SignalArray extends SignalNode {
  [SIGNAL_ARRAY] = true;

  #signals = new Map();
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

  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);
    return this.#rootProxy;
  }
  set value(value) {
    if (super.value === value) return;
    this.#rootProxy = this.#createProxy(value);
    super.value = value;
  }

  map(callback) {
    this.#compute = new Compute(() => {
      const result = [];
      const length = this.value.length;
      for (let i = 0; i < length; i++) {
        result[i] = callback(this.#rootProxy[i], i, this.#rootProxy);
      }

      return result;
    }, true);
    return this.#compute;
  }

  #createProxy(value) {
    let self = this;

    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === SIGNAL_NODE) return true;
        if (prop === SIGNAL_ARRAY) return true;
        if (prop === HTMLCOMPUTE) return false;
        if (prop === '__signal') return self;
        if (prop === '__raw') return target;
        if (prop === '__isProxy') return true;

        const val = target[prop];
        if (prop === 'fragment') return val;
        if (prop == 'length') return val


        if (ARRAY_MUTATION_METHODS.has(prop)) {
          // return Reflect.get(target, prop, receiver);
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

        // return target[prop];

        if (!self.#signals.has(target)) self.#signals.set(target, new Map());
        let targetSignals = self.#signals.get(target);
        if (!targetSignals.has(prop)) targetSignals.set(prop, new Signal(target[prop]));
        if (isTemplating || activeConsumer?.[HTMLCOMPUTE]) return targetSignals.get(prop);
        return targetSignals.get(prop).value;
      },

      set(target, prop, value, receiver) {
        let targetSignals = self.#signals.get(target);
        if (targetSignals?.has(prop)) {
          targetSignals.get(prop).value = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },

      getPrototypeOf() {
        return SignalArray.prototype;
      }
    });
  }
}


export class SignalObject extends SignalNode {
  [SIGNAL_OBJECT] = true;
  #signals = new Map();
  #proxies = new Map();
  #signalArrays = new Map();
  #methods = new Map();
  #rootProxy;
  templateSignal = new Signal([]);

  constructor(value, track = false) {
    super();
    super.value = value;
    this.#rootProxy = this.#createProxy(value);
  }

  // block
  set dirty(_) { }
  set lastCleanEpoch(_) { }
  set version(_) { }

  get value() {
    if (activeConsumer) {
      this.subscribe(activeConsumer);
      this.templateSignal.subscribe(activeConsumer);
    }
    return this.#rootProxy;
  }
  set value(value) {
    if (super.value === value) return;
    this.#rootProxy = this.#createProxy(value);
    super.value = value;
  }

  #createProxy(value, path = []) {
    if (value === null || typeof value !== 'object' || value.__isSignalProxy) return value;

    const self = this;

    return new Proxy(value, {
      get(target, prop, receiver) {
        if (prop === SIGNAL_NODE) return true;
        if (prop === SIGNAL_OBJECT) return true;
        if (prop === HTMLCOMPUTE) return false;
        if (prop === '__signal') return self;
        if (prop === 'valueOf' || prop === 'toJSON') return () => target;

        let val;

        if (Array.isArray(target[prop])) {
          if (!self.#signalArrays.has(prop)) self.#signalArrays.set(prop, new SignalArray(target[prop]));
          val = self.#signalArrays.get(prop);
        } else {
          if (!self.#signals.has(prop)) self.#signals.set(prop, new Signal(target[prop]));
          val = self.#signals.get(prop);
        }

        if (isTemplating) return val;
        return val.value;
      },

      set(target, prop, value, receiver) {
        if (Array.isArray(target[prop])) {
          if (self.#signalArrays.has(prop)) self.#signalArrays.get(prop).value = value;
          return true;
        }
        if (self.#signals.has(prop)) {
          self.#signals.get(prop).value = value;
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
        if (self.#signals.has(prop)) {
          self.#signals.get(prop).dispose();
          self.#signals.delete(prop);
        }
        const result = Reflect.deleteProperty(target, prop);
        return result;
      }
    });
  }
}



// export class SignalObject extends SignalNode {
//   [SIGNAL_OBJECT] = true;
//   #signals = new Map();
//   #proxies = new Map();
//   #methods = new Map();
//   #rootProxy;
//   templateSignal = new Signal([]);
//
//   constructor(value, track = false) {
//     super();
//     super.value = value;
//     this.#rootProxy = this.#createProxy(value);
//   }
//
//   // block
//   set dirty(_) { }
//   set lastCleanEpoch(_) { }
//   set version(_) { }
//
//   get value() {
//     if (activeConsumer) {
//       this.subscribe(activeConsumer);
//       this.templateSignal.subscribe(activeConsumer);
//     }
//     return this.#rootProxy;
//   }
//   set value(value) {
//     if (super.value === value) return;
//     this.#rootProxy = this.#createProxy(value);
//     super.value = value;
//   }
//
//   #createProxy(value, path = []) {
//     if (value === null || typeof value !== 'object' || value.__isSignalProxy) return value;
//
//     const self = this;
//
//     return new Proxy(value, {
//       get(target, prop, receiver) {
//         if (prop === SIGNAL_NODE) return true;
//         if (prop === SIGNAL_OBJECT) return true;
//         if (prop === HTMLCOMPUTE) return false;
//         if (prop === '__signal') return self;
//         if (prop === 'valueUntracked') return self.valueUntracked;
//         if (prop === 'valueOf' || prop === 'toJSON') return () => target;
//
//         const val = target[prop];
//         if (prop === 'fragment') return val;
//         if (prop == 'length') return val
//
//         if (Array.isArray(target) && typeof val === 'function') {
//           // if (isTemplating && path.length === 0 && prop === 'map') {
//           //   let fn = self.#methods.get(prop);
//           //   if (fn === undefined) {
//           //     fn = (...args) => {
//           //       if (!self.#methods.has('htmlMap')) self.#methods.set('htmlMap', args[0]);
//           //       let newArr = [];
//           //       for(let i = 0; i < self.#rootProxy.length; i++) {
//           //         newArr.push(args[0](self.#rootProxy[i]));
//           //       }
//           //       self.templateSignal.value = newArr;
//           //       return self.templateSignal;
//           //     }
//           //     self.#methods.set(prop, fn);
//           //   }
//           //   return fn;
//           // } else if (prop === 'push' && self.#methods.has('htmlMap')) {
//           //   let htmlMap = self.#methods.get('htmlMap');
//           //   let htmlPush = self.#methods.get('htmlPush');
//           //   if (htmlPush === undefined) {
//           //     htmlPush = (...args) => {
//           //       const index = Array.prototype.push.apply(target, args);
//           //       const ni = self.#rootProxy[index - 1];
//           //       isTemplating = true;
//           //       self.templateSignal.value = self.#rootProxy.map(htmlMap);
//           //       // self.templateSignal.value.push(htmlMap(ni))
//           //       isTemplating = false;
//           //       self.templateSignal.markDirty();
//           //       return index;
//           //     };
//           //     self.#methods.set('htmlPush', htmlPush);
//           //   }
//           //   return htmlPush;
//           // }
//
//           // const mutatingMethods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
//           // if (self.#methods.has('htmlMap') && mutatingMethods.includes(prop)) {
//           //   let htmlMap = self.#methods.get('htmlMap');
//           //   return (...args) => {
//           //     const result = target[prop].apply(target, args);
//           //     isTemplating = true;
//           //     self.templateSignal.value = self.#rootProxy.map(htmlMap);
//           //     isTemplating = false;
//           //     // self.templateSignal.markDirty();
//           //     return result;
//           //   };
//           // }
//
//
//
//           return Reflect.get(target, prop, receiver);
//         } else if (val !== null && typeof val === 'object') {
//           if (!self.#proxies.has(prop)) {
//             self.#proxies.set(prop, self.#createProxy(val, [...path, prop]));
//           }
//           return self.#proxies.get(prop);
//         }
//
//         let changePath = [...path, prop].join('');
//         if (!self.#signals.has(changePath)) {
//           const sig = new Signal(target[prop]);
//           self.#signals.set(changePath, sig);
//         }
//
//         const propSignal = self.#signals.get(changePath);
//         if (isTemplating) return propSignal;
//         return propSignal.value;
//       },
//
//       set(target, prop, value, receiver) {
//         let changePath = [...path, prop].join('');
//         if (self.#signals.has(changePath)) {
//           const sig = self.#signals.get(changePath);
//           sig.value = value;
//           return true;
//         }
//         return Reflect.set(target, prop, value, receiver);
//       },
//
//       deleteProperty(target, prop) {
//         let changePath = [...path, prop];
//         const result = Reflect.deleteProperty(target, prop);
//         return result;
//       }
//     });
//   }
// }


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
