export const messages = {
  connectPort: 1,
  ack: 2,
  missingFile: 3
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
