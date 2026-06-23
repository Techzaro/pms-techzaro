import { useEffect, useRef } from 'react';
import { subscribe } from './eventBus';

export function useRefreshOnEvent(events, refreshFn) {
  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    const unsubs = eventsRef.current.map((event) => subscribe(event, () => refreshRef.current()));
    return () => unsubs.forEach((fn) => fn());
  }, []);
}
