const SIGNAL_NODE = Symbol('SIGNAL_NODE');
const SIGNAL = Symbol('SIGNAL');
const SIGNAL_OBJECT = Symbol('SIGNAL_OBJECT');
const COMPUTE = Symbol('COMPUTE');
const ERRORED = Symbol('ERRORED');
const HTMLCOMPUTE = Symbol('HTMLCOMPUTE');

let epoch = 0;
let idCounter = 0;
let queue = new Set();
let queueRunning = false;
let isTemplating = false;
let activeConsumer;



export {
  HTMLCOMPUTE
}

export function beginTemplating() {
  isTemplating = true;
}

export function endTemplating() {
  isTemplating = false;
}


class SignalNode {
  [SIGNAL_NODE] = true;
  #id = idCounter++;
  #dirty = false;
  #version = 0;
  #lastCleanEpoch = 0;
  #error;
  #value;

  #consumers = [];
  #producers = [];
  #producerVersions = [];
  #watchers = new Set();
  #notifyWatchers_bound = this.#notifyWatchers.bind(this);

  get id() { return this.#id; }
  get version() { return this.#version; }

  get dirty() { return this.#dirty; }
  set dirty(value) { this.#dirty = value; }

  get lastCleanEpoch() { return this.#lastCleanEpoch; }
  set lastCleanEpoch(value) { this.#lastCleanEpoch = value; }

  get error() { return this.#error; }
  set error(value) { this.#error = value; }

  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);

    // return the instance of the signal for templating. This is needed for the template tag function to recognize it as a signal
    if (isTemplating && !Array.isArray(this.valueUntracked)) return this;

    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }

  set value(value) {
    this.#value = value;
    this.#version++;
    epoch++;
    this.notify();
  }

  get valueUntracked() {
    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }

  get valueNonTemplating() {
    if (activeConsumer) this.subscribe(activeConsumer);
    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }


  __makeDirty(path) {
    this.#version++;
    epoch++;
    this.notify(path);
  }


  subscribe(node) {
    if (this.#producers.includes(node) || node === this) return;

    this.#producers.push(node);
    this.#producerVersions.push(node.version);

    if (node[COMPUTE]) {
      this.#consumers.push(node);
      node.subscribe(this);
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

  notify(path) {
    for (const consumer of this.#consumers) {
      consumer.updateValueVersion(path);
    }

    addToQueue(this.#notifyWatchers_bound);
  }

  updateDirty() {
    if (!this[COMPUTE] || (!this.#dirty && this.#lastCleanEpoch === epoch)) return;

    for (let i = 0; i < this.#producers.length; i++) {
      if (this.#producers[i].version !== this.#producerVersions[i]) {
        this.#dirty = true;
        this.#producerVersions[i] = this.#producers[i].version;
      }
    }
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


  #notifyWatchers() {
    for (const watcher of this.#watchers) {
      watcher(this);
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
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get value() { return super.value; }
  set value(value) {
    if (super.value === value) return;
    super.value = value;
  }
}


export class SignalObject extends SignalNode {
  [SIGNAL_OBJECT] = true;

  #valueProxy;
  #track = false;

  constructor(value, track = false) {
    super();
    super.value = value;
    this.#track = track;
    this.#valueProxy = this.#createProxy(value);
  }

  // block
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get error() { return super.error; }


  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);
    return this.#valueProxy;
  }
  set value(value) {
    if (super.value === value) return;
    this.#valueProxy = this.#createProxy(value);
    super.value = value;
  }

  #makeDirty(path) {
    super.__makeDirty(path);
  }

  // get value is a chain of callbacks because we need to trigger the original signal to subscribe to the consumer
  // path = array of properties for nested object access
  #createProxy(value, path = []) {
    const self = this;
    
    return new Proxy(value, {
      apply(target, thisArg, argumentsList) {
        return Reflect.apply(target, thisArg, argumentsList)
      },

      get(target, prop, receiver) {
        if (prop === SIGNAL_NODE) return true;
        if (prop === SIGNAL_OBJECT) return true;
        if (prop === '__signal') return self;
        if (prop === 'valueUntracked') return self.valueUntracked;

        let obj = path.reduce((acc, key) => {
          return acc && acc[key] ? acc[key] : null;
        }, self.valueUntracked);
        let val = obj[prop];

        // with array methods
        if (Array.isArray(obj) && typeof val === 'function') {
        // if (typeof target[prop] === 'function' && Array.prototype.hasOwnProperty(prop)) {
          return Reflect.get(target, prop, receiver);
          // if (prop === 'push') {
          //   console.log('push');
          //   // Return a custom function that wraps the original push method
          //   return function (...args) {
          //     console.log('Intercepted push operation:', args);
          //     // Call the original push method on the target array
          //     return Reflect.apply(target[prop], target, args);
          //   };
          // }
          // if (prop === 'find') {
          //   console.log(`Accessing property: ${prop}`);
          //   return Reflect.get(target, prop, receiver);
          // }
          // return target[prop].bind(target);
        } else if (typeof val === 'object' && val !== null) return self.#createProxy(obj[prop], [...path, prop]);
        else if (isTemplating) {
          return new Compute(() => {
            try {
              if (activeConsumer) self.subscribe(activeConsumer);
              // get target starting from root. This will allow for nested objects to be overwritten
              let obj = path.reduce((acc, key) => {
                return acc && acc[key] ? acc[key] : null;
              }, self.valueUntracked);
              return obj[prop];
            } catch (e) {
              return undefined;
            }
          });
        }

        return val;
      },
      set(target, prop, value, receiver) {
        let canTrack = self.#track ? !Array.prototype.hasOwnProperty(prop) : false;
        let op;
        let index;
        let isIndex;
        if (canTrack) {
          index = Number(prop);
          isIndex = Number.isInteger(index);
          if (isIndex) op = target.length <= index ? '__add' : '__replace';
        }

        const result = Reflect.set(target, prop, value, receiver);
        if (canTrack) {
          let changePath = [...path, prop];
          if (isIndex) {
            changePath.push(op);
          }
          self.#makeDirty(changePath);
        } else self.#makeDirty();
        return result;
      },
      deleteProperty(target, prop) {
        const result = Reflect.deleteProperty(target, prop);
        self.#makeDirty([...path, prop, '__remove']);
        return result;
      }
    });
  }
}


export class Compute extends SignalNode {
  [COMPUTE] = true;
  #callback;

  constructor(callback, htmlCompute = false) {
    super();
    if (htmlCompute) this[HTMLCOMPUTE] = true;
    this.#callback = callback;

    // we want to return the actual value instead of the signal when running an html compute
    const wasTemplating = isTemplating;
    if (htmlCompute) isTemplating = false;
    this.#recompute();
    if (wasTemplating) isTemplating = true;
    
    if (super.error) throw super.error;
  }

  // block
  set value(_) { }
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get error() { return super.error; }

  get value() { return super.value; }
  get dirty() { return super.dirty; }

  updateValueVersion(path) {
    this.updateDirty();
    if (super.dirty) {
      // TODO can i move the recompute to the read?
      this.#recompute(path);
      super.dirty = false;
      super.lastCleanEpoch = epoch;
    }
  }

  updateValueVersionForce() {
    super.dirty = true;
    this.updateValueVersion();
  }

  #recompute(path) {
    const previousConsumer = beginConsumerCompute(this);

    let newValue;
    let changed = false;
    try {
      super.error = undefined;
      newValue = this.#callback(path);
      changed = super.dirty || super.value !== newValue;
    } catch (e) {
      super.value = ERRORED;
      super.error = e;
    } finally {
      afterConsumerCompute(previousConsumer);
    }

    if (!changed) return;
    super.value = newValue;
  }
}


class Effect extends Compute {
  #execute_bound = this.#execute.bind(this);

  constructor(callback) {
    super(callback);
  }

  // interrupt running effect callback till microtask runs
  updateValueVersion(path) {
    this.updateDirty();
    if (super.dirty) addToQueue(this.#execute_bound, path);
  }

  #execute(path) {
    super.updateValueVersion(path);
  }
}
export function effect(callback) {
  const instance = new Effect(callback);
  return function dispose() {
    instance.dispose();
  };
}


export function isSignal(node) {
  return typeof node === 'object' && node !== null && node[SIGNAL_NODE] === true;
}

export function isSignalObject(node) {
  return typeof node === 'object' && node !== null && node[SIGNAL_OBJECT] === true;
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

let changes = new Map();
function addToQueue(callback, path) {
  if (path) {
    if (!changes.has(callback)) changes.set(callback, []);
    changes.get(callback).push(path);
  }
  
  queue.add(callback);
  runQueue();
}

function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  queueMicrotask(() => {
    for (const callback of queue) {
      let _changes = changes.get(callback);
      callback(_changes);
      if (_changes) changes.delete(callback);
    }
    queue.clear();
    queueRunning = false;
  });
}
