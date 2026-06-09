let count = 0;
let listener = null;

export function setLoadingManager(cb) {
  listener = cb;
}

export function showGlobalLoading() {
  count++;
  if (listener) listener(true);
}

export function hideGlobalLoading() {
  count--;
  if (count <= 0) {
    count = 0;
    if (listener) listener(false);
  }
}
