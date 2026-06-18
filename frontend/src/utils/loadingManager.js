let count = 0;
let listener = null;

export function setLoadingManager(cb) {
  listener = cb;
  // Sync current count to newly registered listener so UI reflects current loading state
  if (listener) {
    try {
      listener(count > 0);
    } catch (e) {
      // ignore listener errors
    }
  }
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
