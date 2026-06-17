const listeners = {};

export function subscribe(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => {
    listeners[event] = listeners[event].filter((f) => f !== fn);
  };
}

export function publish(event, data) {
  (listeners[event] || []).forEach((fn) => {
    try { fn(data); } catch (e) { console.error(`EventBus[${event}]`, e); }
  });
}
