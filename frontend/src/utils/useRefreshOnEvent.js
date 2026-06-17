import { useEffect, useRef } from 'react';
import { subscribe } from './eventBus';

export function useRefreshOnEvent(events, refreshFn) {
  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;

  useEffect(() => {
    const unsubs = events.map((event) => subscribe(event, () => refreshRef.current()));
    return () => unsubs.forEach((fn) => fn());
  }, [events]);
}
