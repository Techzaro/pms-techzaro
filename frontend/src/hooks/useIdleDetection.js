import { useEffect, useRef } from 'react';

export function useIdleDetection({ timeout = 600000, onIdle, onActivity }) {
  const onIdleRef = useRef(onIdle);
  const onActivityRef = useRef(onActivity);
  const timeoutRef = useRef(null);
  const isIdleRef = useRef(false);

  onIdleRef.current = onIdle;
  onActivityRef.current = onActivity;

  useEffect(() => {
    const handleActivity = () => {
      if (isIdleRef.current) {
        isIdleRef.current = false;
        onActivityRef.current?.();
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        isIdleRef.current = true;
        onIdleRef.current?.();
      }, timeout);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => document.addEventListener(e, handleActivity, { passive: true }));
    handleActivity();

    return () => {
      events.forEach(e => document.removeEventListener(e, handleActivity));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [timeout]);
}
