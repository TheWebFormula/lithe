import { Deferred } from './helper.js';


const errorNotFound = {
  status: 404,
  body: 'Playground file not found'
};

const errorCancelled = {
  status: 503,
  body: 'Playground build cancelled'
};


export class PlaygroundBuilder {
  #state = 'active';
  #stateChange = new Deferred();
  #files = new Map();
  #diagnosticsCallback;
  #diagnosticsDebounceId;

  constructor(diagnosticsCallback) {
    // this.#diagnosticsCallback = diagnosticsCallback;
  }

  get state() { return this.#state; }
  get stateChange() {
    return this.#stateChange.promise;
  }

  async getFile(name) {
    let deferred = this.#files.get(name);
    if (deferred === undefined) {
      if (this.#state === 'done') return errorNotFound;
      else if (this._state === 'cancelled') return errorCancelled;

      deferred = new Deferred();
      this.#files.set(name, deferred);
    }
    return deferred.promise;
  }

  onOutput(output) {
    if (this.#state !== 'active') return;

    switch (output.kind) {
      case 'file': return this.#onFile(output);
      case 'diagnostic': return this.#onDiagnostic(output);
      case 'done': return this.#onDone();
      default:
        console.log(output);
        throw new Error(`Unexpected BuildOutput kind: ${output.kind}`);
    }
  }

  cancel() {
    this.#errorPendingFileRequests(errorCancelled);
    this.#changeState('cancelled');
  }

  #changeState(state) {
    this.#state = state;
    this.#stateChange.resolve();
    this.#stateChange = new Deferred();
  }

  #onFile(output) {
    let deferred = this.#files.get(output.file.name);
    if (deferred === undefined) {
      deferred = new Deferred();
      this.#files.set(output.file.name, deferred);
    }
    deferred.resolve(output.file);
  }

  #onDone() {
    this.#errorPendingFileRequests(errorNotFound);
    this.#changeState('done');
  }

  #errorPendingFileRequests(error) {
    for (const file of this.#files.values()) {
      if (!file.settled) file.resolve(error);
    }
  }

  #onDiagnostic(output) {
    if (!this.#diagnosticsCallback) return;

    let arr = this.diagnostics.get(output.filename);
    if (arr === undefined) {
      arr = [];
      this.diagnostics.set(output.filename, arr);
    }
    arr.push(output.diagnostic);
    if (this.#diagnosticsDebounceId === undefined) {
      this.#diagnosticsDebounceId = requestAnimationFrame(() => {
        if (this.state !== 'cancelled') {
          this.#diagnosticsDebounceId = undefined;
          this.#diagnosticsCallback();
        }
      });
    }
  }
}
