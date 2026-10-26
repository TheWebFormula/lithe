let isProcessing = false;
let queuePriorities = new Map();


export function addToQueue(callback, priority = 0) {
  if (!queuePriorities.has(priority)) queuePriorities.set(priority, []);

  let queue = queuePriorities.get(priority);
  if (!queue.includes(callback)) queue.push(callback);

  schedule();
}

export function addToNextQueue(callback, priority = 0) {
  queueMicrotask(() => {
    if (!queuePriorities.has(priority)) queuePriorities.set(priority, []);

    let queue = queuePriorities.get(priority);
    if (!queue.includes(callback)) queue.push(callback);

    schedule();
  });
}

function schedule() {
  if (isProcessing) return;
  isProcessing = true;

  queueMicrotask(() => processQueue());
}

function processQueue() {
  let priorities = queuePriorities.keys().toArray().sort((a, b) => a - b);
  for (let priority of priorities) {
    const queue = queuePriorities.get(priority).reverse();

    while (queue.length > 0) {
      try {
        queue.pop()();
      } catch (error) {
        console.error(`Error in priority ${priority} task:`, error);
      }
    }

    queuePriorities.delete(priority);
  }
  isProcessing = false;

  if (queuePriorities.size > 0) schedule();
}
