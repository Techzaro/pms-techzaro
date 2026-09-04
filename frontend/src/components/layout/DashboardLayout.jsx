/**
 * DashboardLayout - Top-level layout shell for the authenticated dashboard.
 * Composes Header, Sidebar, and an optional RightSidebar around main content.
 * Listens for custom "modal-state" events so the right-sidebar toggle is
 * hidden while any modal is open.
 *
 * Runs a SINGLE global lightweight poll (unread-count) every 20s.
 * When count changes → publishes data:changed event → all pages refresh.
 * This replaces 20+ independent page polls with ONE app-level poll.
 */

import { useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import ChatWidget from "./ChatWidget";
import StorageNotificationBanner from "../StorageNotificationBanner";
import VerificationBanner from "../VerificationBanner";
import { authToken } from "../../utils/auth";
import { publish } from "../../utils/eventBus";
import API_URL from "../../config/api";
import { useOrgSubscription } from "../../hooks/useOrgSubscription";

import "./DashboardLayout.css";

const POLL_INTERVAL = 20000; // 20 seconds

function DashboardLayout({ children }) {
  const prevCountRef = useRef(null);
  const { data: subData } = useOrgSubscription();

  const enabledModules = useMemo(() => {
    const mods = subData?.modules?.enabled;
    if (!Array.isArray(mods) || mods.length === 0) return null;
    return new Set(mods.filter(m => m.is_enabled !== false).map(m => m.slug));
  }, [subData]);

  const hasModule = (slug) => enabledModules === null || enabledModules.has(slug);

  // Immediate layout check: if no token exists, immediately redirect to login & replace history
  useLayoutEffect(() => {
    if (!authToken()) {
      try {
        window.history.replaceState(null, "", "/login");
      } catch {}
      window.location.replace("/login?message=" + encodeURIComponent("Session expired. Please log in."));
    }
  }, []);

  // Single global lightweight poll: check unread-count every 20s
  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      if (document.hidden || stopped) return;
      try {
        const token = authToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/notifications/unread-count`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          _notifHandled: true,
        });
        if (!res.ok || stopped) return;
        const data = await res.json();
        const count = data.unread_count ?? 0;
        if (prevCountRef.current !== null && count !== prevCountRef.current) {
          publish("data:changed", { source: "global-poll", unreadCount: count });
        }
        prevCountRef.current = count;
      } catch (_) { /* ignore network errors */ }
    };

    // Initial check
    poll();

    const id = setInterval(poll, POLL_INTERVAL);
    return () => { stopped = true; clearInterval(id); };
  }, []);

  return (
    <div className="dashboard-page">
      <svg className="dashboard-wave-bg" viewBox="0 0 1440 500" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin slice">
        <path d="M0 0H1440V140C1440 140 1100 60 800 130C500 200 350 320 100 260C-50 220 0 340 0 340V0Z" fill="url(#wave1)" />
        <path d="M0 0H1440V180C1440 180 1000 90 720 170C440 250 280 360 50 290C-100 240 0 380 0 380V0Z" fill="url(#wave2)" />
        <path d="M0 0H1440V220C1440 220 900 120 600 220C300 320 150 400 0 340V0Z" fill="url(#wave3)" />
        <defs>
          <linearGradient id="wave1" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.3" />
            <stop offset="35%" stopColor="#c4b5fd" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#ddd6fe" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="wave2" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#bfdbfe" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#c4b5fd" stopOpacity="0.2" />
            <stop offset="80%" stopColor="#e9d5ff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#f3e8ff" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="wave3" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#ede9fe" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f5f3ff" stopOpacity="0.04" />
          </linearGradient>
        </defs>
      </svg>

      <Header />

      <div className="main-layout main-layout--no-right">
        <Sidebar />

        <div className="dashboard-content">
          <VerificationBanner />
          <StorageNotificationBanner />
          {children || <Outlet />}
        </div>
      </div>

      {hasModule("chat") && <ChatWidget />}
    </div>
  );
}

export default DashboardLayout;