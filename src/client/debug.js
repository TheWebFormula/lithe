let exports = [];

DEBUG: {
  class IterableWeakSet {
    constructor() {
      this._set = new Set();

      // The FinalizationRegistry unlinks and deletes dead references
      // automatically after the target object is garbage collected.
      this._registry = new FinalizationRegistry((ref) => {
        this._set.delete(ref);
      });
    }

    add(obj) {
      if (!obj || (typeof obj !== 'object' && typeof obj !== 'symbol')) {
        throw new TypeError('WeakRef targets must be objects or non-registered symbols.');
      }

      // Check if the object is already tracked to avoid duplicate WeakRefs
      if (this.has(obj)) return this;

      const ref = new WeakRef(obj);
      this._set.add(ref);

      // Register the target object so we know when it is cleaned up
      this._registry.register(obj, ref, ref);
      return this;
    }

    has(obj) {
      for (const ref of this._set) {
        if (ref.deref() === obj) {
          return true;
        }
      }
      return false;
    }

    delete(obj) {
      for (const ref of this._set) {
        if (ref.deref() === obj) {
          this._registry.unregister(ref); // Stop listening to this object
          return this._set.delete(ref);
        }
      }
      return false;
    }

    // Use a generator to yield live targets smoothly during iteration
    *values() {
      for (const ref of this._set) {
        const obj = ref.deref();
        if (obj !== undefined) {
          yield obj;
        }
      }
    }

    // Make the class natively iterable using standard for...of syntax
    [Symbol.iterator]() {
      return this.values();
    }
  }




  function getCueGraph(cue, producer = false) {
    let graph = [];

    if (producer) {
      for (let producer of cue.getProducers()) {
        graph.push(getCueGraph(producer, true));
      }
    } else {
      for (let consumer of cue.getConsumers()) {
        graph.push(getCueGraph(consumer));
      }
    }

    return graph;
  }
  exports.getCueGraph = getCueGraph;


  let cueTracker = new IterableWeakSet();
  function trackCue(cue) {
    cueTracker.add(cue);
  }
  exports.trackCue = trackCue;

  function untrackCue(cue) {
    cueTracker.delete(cue);
  }
  exports.untrackCue = untrackCue;


  function getTrackedCues() {
    return cueTracker.values().toArray();
  }
  exports.getTrackedCues = getTrackedCues;
  window.getTrackedCues = getTrackedCues;
}

export default exports;
