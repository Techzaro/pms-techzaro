import { useEffect, useRef, useCallback } from "react";
import { getCurrentRole, logoutUser, superAdminAuthToken, logoutSuperAdmin } from "./auth";
import { isAdminDomain } from "./domain";

const INACTIVITY_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours

export function useInactivityTimeout() {
  const timerRef = useRef(null);

  const logout = useCallback(() => {
    if (isAdminDomain()) {
      logoutSuperAdmin();
    } else {
      logoutUser("inactivity");
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(logout, INACTIVITY_TIMEOUT);
  }, [logout]);

  useEffect(() => {
    // On admin domain, check super admin auth; on org domain, check regular role
    if (isAdminDomain()) {
      if (!superAdminAuthToken()) return;
    } else {
      const role = getCurrentRole();
      if (!role) return;
    }

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
