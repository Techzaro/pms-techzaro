let notifyRef = { success: null, error: null, warning: null, info: null };

export function registerNotificationFns(fns) {
  notifyRef.success = fns.success;
  notifyRef.error = fns.error;
  notifyRef.warning = fns.warning;
  notifyRef.info = fns.info;
}

export const notify = {
  success: (msg, dur) => notifyRef.success?.(msg, dur),
  error: (msg, dur) => notifyRef.error?.(msg, dur),
  warning: (msg, dur) => notifyRef.warning?.(msg, dur),
  info: (msg, dur) => notifyRef.info?.(msg, dur),
};
