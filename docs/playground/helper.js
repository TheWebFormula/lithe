export const messages = {
  configureProxy: 1,
  connectToProject: 2,
  connectToWorker: 3,
  ack: 4,
  missingFile: 5,
  workerUpdate: 6
};

export class Deferred {
  #promise;
  #resolve;
  #reject;
  settled = false;

  constructor() {
    this.#promise = new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }

  get promise() { return this.#promise; }

  resolve(value) {
    this.settled = true;
    this.#resolve(value);
  }

  reject(reason) {
    this.settled = true;
    this.#reject(reason);
  }
}
