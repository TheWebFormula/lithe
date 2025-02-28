const SIGNAL_NODE = Symbol('SIGNAL_NODE');
const SIGNAL = Symbol('SIGNAL');
const SIGNAL_OBJECT = Symbol('SIGNAL_OBJECT');
const COMPUTE = Symbol('COMPUTE');
const ERRORED = Symbol('ERRORED');

let epoch = 0;
let idCounter = 0;
let queue = new Set();
let queueRunning = false;
let isTemplating = false;
let activeConsumer;


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


  __makeDirty() {
    this.#version++;
    epoch++;
    this.notify();
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

  notify() {
    for (const consumer of this.#consumers) {
      consumer.updateValueVersion();
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



export function beginTemplating() {
  isTemplating = true;
}

export function endTemplating() {
  isTemplating = false;
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

  constructor(value) {
    super();
    super.value = value;
    this.#valueProxy = this.#createProxy(value);
  }

  // block
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }


  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);
    return this.#valueProxy;
  }
  set value(value) {
    if (super.value === value) return;
    super.value = value;
  }

  #makeDirty() {
    super.__makeDirty();
  }

  // get value is a chain of callbacks because we need to trigger the original signal to subscribe to the consumer
  // path = array of properties for nested object access
  #createProxy(value, path = []) {
    const self = this;
    
    return new Proxy(value, {
      get(target, prop) {
        if (prop === SIGNAL_NODE) return true;

        let val = target[prop];
        if (typeof val === 'object' && val !== null) return self.#createProxy(target[prop], [...path, prop]);
        else if (Array.isArray(value[prop])) return value[prop];
        else if (isTemplating) return new Compute(() => {
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
        return val;
      },
      set(target, prop, value, receiver) {
        const result = Reflect.set(target, prop, value, receiver);
        self.#makeDirty();
        return result;
      },
      deleteProperty(target, prop) {
        const result = Reflect.deleteProperty(target, prop);
        return result;
      }
    });
  }
}


export class Compute extends SignalNode {
  [COMPUTE] = true;
  #callback;

  constructor(callback) {
    super();
    this.#callback = callback;
    this.#recompute();
    if (super.error) throw super.error;
  }

  // block
  set value(_) { }
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get value() { return super.value; }
  get dirty() { return super.dirty; }

  updateValueVersion(force = false) {
    if (force) super.dirty = true;
    this.updateDirty();
    if (super.dirty) {
      // TODO can i move the recompute to the read?
      this.#recompute();
      super.dirty = false;
      super.lastCleanEpoch = epoch;
    }
  }

  #recompute() {
    const previousConsumer = beginConsumerCompute(this);

    let newValue;
    let changed = false;
    try {
      newValue = this.#callback();
      changed = super.value !== newValue;
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
  updateValueVersion() {
    this.updateDirty();
    if (super.dirty) addToQueue(this.#execute_bound);
  }

  #execute() {
    super.updateValueVersion();
  }
}
export function effect(callback) {
  const instance = new Effect(callback);
  return function dispose() {
    instance.dispose();
  };
}


export function isSignal(node) {
  return node[SIGNAL_NODE] === true;
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

function addToQueue(callback) {
  queue.add(callback);
  runQueue();
}

function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  queueMicrotask(() => {
    for (const callback of queue) {
      callback();
    }
    queue.clear();
    queueRunning = false;
  });
}
