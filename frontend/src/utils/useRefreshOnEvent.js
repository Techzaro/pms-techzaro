/**
 * @file useRefreshOnEvent.js
 * @description Hook to automatically refresh data when specific events are published.
 * Subscribes to the event bus and calls the refresh function when events occur.
 */

import { useEffect, useRef } from 'react';
import { subscribe } from './eventBus';

/**
 * Hook that triggers a refresh function when specified events are published.
 * Uses refs to avoid re-subscribing when props change.
 * @param {string[]} events - Array of event names to listen for
 * @param {Function} refreshFn - Function to call when any of the events are published
 */
export function useRefreshOnEvent(events, refreshFn) {
  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    // Subscribe to all events and unsubscribe on cleanup
    const unsubs = eventsRef.current.map((event) => subscribe(event, () => refreshRef.current()));
    return () => unsubs.forEach((fn) => fn());
  }, []);
}
