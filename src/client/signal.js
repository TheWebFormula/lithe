const SIGNAL = Symbol('SIGNAL');
const COMPUTE = Symbol('COMPUTE');
const ERRORED = Symbol('ERRORED');
const queue = new Set();
const signalChangeIds = new Set();
let queueRunning = false;
let epoch = 0;
let idCounter = 0;
let activeConsumer;



// Proxies the .value property to return the source signal or a compute for object properties
let handleHTML = false;
export function beginHTMLHandler() {
  handleHTML = true;
}
export function endHTMLHandler() {
  handleHTML = false;
}


class Base {
  #id = idCounter++;
  #dirty = false;
  #version = 0;
  #lastCleanEpoch = 0;
  #value;
  #error;
  #consumers = [];
  #producers = [];
  #producerVersions = [];
  #watchers = new Set();
  #notifyWatchers_bound = this.#notifyWatchers.bind(this);


  // get value is a chain of callbacks because we need to trigger the original signal to subscribe to the consumer
  createProxy(value, getValue) {
    const that = this;
    return new Proxy(value, {
      get: function (_target, prop) {
        // recursive proxies for nested objects
        if (value[prop] !== null && typeof value[prop] === 'object' && !Array.isArray(value[prop])) {
          return that.createProxy(value[prop], () => getValue()[prop]);
        }

        // return value if is array. Arrays need to be wrapped in computes already
        if (Array.isArray(value[prop])) return value[prop];
        return new Compute(() => {
          // handles case where nested object does not exist
          try {
            return getValue()[prop];
          } catch (e) {
            return undefined;
          }
        });
      },
      set: function (target, prop, value) {
        return Reflect.set(...arguments);
      }
    });
  }

  get id() {
    return this.#id;
  }
  
  get value() {
    if (activeConsumer) this.subscribe(activeConsumer);
    if (this.#value === ERRORED) throw this.#error;

    // Used when rendering html templates
    // Proxies the .value property to return the source signal or a compute for object properties
    if (handleHTML) {
      // create proxy for objects
      if (this.#value !== null && typeof this.#value === 'object' && !Array.isArray(this.#value)) {
        return this.createProxy(this.#value, () => this.valueProxy);

        // return array so methods like .map() can be used. Arrays need to be wrapped in computes already
      } else if (Array.isArray(this.#value)) {
        return this.#value;
      
      // return the signal for everything else
      } else {
        return this;
      }
    }

    return this.#value;
  }

  // used in html handler proxy. We cannot capture the active consumer in value with the proxy
  get valueProxy() {
    if (activeConsumer) this.subscribe(activeConsumer);
    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }

  set value(value) {
    this.#value = value;
    this.#version++;
    epoch++;
    this.notify();
    signalChangeIds.add(this.id);
  }

  get untrackValue() {
    if (this.#value === ERRORED) throw this.#error;
    return this.#value;
  }

  get version() {
    return this.#version;
  }

  get dirty() {
    return this.#dirty;
  }

  set dirty(value) {
    this.#dirty = value;
  }

  get lastCleanEpoch() {
    return this.#lastCleanEpoch;
  }

  set lastCleanEpoch(value) {
    this.#lastCleanEpoch = value;
  }

  get error() {
    return this.#error;
  }

  set error(value) {
    this.#error = value;
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

  #notifyWatchers() {
    for (const watcher of this.#watchers) {
      watcher(this);
    }
  }


  dispose() {
    let i;
    for (i = 0; i < this.#producers.length; i++) {
      this.#producers[i].unsubscribe(this);
    }

    for (i = 0; i < this.#consumers.length; i++) {
      this.#consumers[i].unsubscribe(this);
    }

    this.#watchers.clear();
  }

  updateDirty() {
    if (this[SIGNAL] || (!this.#dirty && this.#lastCleanEpoch === epoch)) return;

    for (let i = 0; i < this.#producers.length; i++) {
      if (this.#producers[i].version !== this.#producerVersions[i]) {
        this.#dirty = true;
        this.#producerVersions[i] = this.#producers[i].version;
      }
    }
  }

  watch(callback) {
    this.#watchers.add(callback);
  }

  unwatch(callback) {
    this.#watchers.delete(callback);
  }
}


export class Signal extends Base {
  constructor(value) {
    super();
    this[SIGNAL] = true;
    super.value = value;
  }

  // block
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get value() {
    return super.value;
  }
  set value(value) {
    if (super.value === value) return;
    super.value = value;
  }
}

export class Compute extends Base {
  #callback;

  constructor(callback) {
    super();

    this[COMPUTE] = true;
    this.#callback = callback;
    this.#recompute();
    if (super.error) throw super.error;
  }

  // block
  set value(_) { }
  set error(_) { }
  set dirty(_) { }
  set lastCleanEpoch(_) { }

  get value() {
    return super.value;
  }

  get dirty() {
    return super.dirty;
  }

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

export function effect(callback) {
  const instance = new Effect(callback);
  return function dispose() {
    instance.dispose();
  };
}

export function isSignal(node) {
  return node instanceof Base;
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

    if (signalChangeIds.size > 0) {
      signalChangeIds.clear();
    }

    queueRunning = false;
  });
}
