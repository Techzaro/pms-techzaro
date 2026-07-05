import { useEffect, useRef, useCallback } from "react";
import { getCurrentRole, clearSession } from "./auth";

const INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 60 minutes

export function useInactivityTimeout() {
  const timerRef = useRef(null);

  const logout = useCallback(() => {
    const role = getCurrentRole();
    if (role) {
      clearSession(role);
    }
    window.location.href = "/logged-out?reason=inactivity";
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(logout, INACTIVITY_TIMEOUT);
  }, [logout]);

  useEffect(() => {
    const role = getCurrentRole();
    if (!role) return;

    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer, { passive: true });
    });

    resetTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [resetTimer]);
}
