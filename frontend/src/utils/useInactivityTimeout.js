import { useEffect, useRef, useCallback } from "react";
import { getCurrentRole, logoutUser } from "./auth";

const INACTIVITY_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

export function useInactivityTimeout() {
  const timerRef = useRef(null);

  const logout = useCallback(() => {
    logoutUser("inactivity");
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
