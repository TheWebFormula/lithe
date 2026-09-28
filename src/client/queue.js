let isScheduled = false;
let queuePriorities = new Map();
let queue = [];


export function addToQueue(callback, priority = 0) {
  // only allow one instance of callback per priority
  if (!queuePriorities.has(callback)) queuePriorities.set(callback, new Set());
  let item = queuePriorities.get(callback);
  if (!item.has(priority)) {
    item.add(priority);
    queue.push([callback, priority]);
    // console.log(callback, priority)
  }
  if (stackSize > 10) return;
  if (!isScheduled) {
    isScheduled = true;
    queueMicrotask(() => flush());
  }
}

let stackSize = 0;
function flush() {
  isScheduled = false;
  let items = [...queue.sort((a, b) => b[1] - a[1])];
  queuePriorities.clear();
  queue.length = 0;
  while (items.length > 0) {
    try {
      items.pop()[0]();
    } catch (error) {
      stackSize++;
      console.error("Error in priority queue task:", error);
    }
  }
}
