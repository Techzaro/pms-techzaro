/**
 * DashboardLayout - Top-level layout shell for the authenticated dashboard.
 * Composes Header, Sidebar, and an optional RightSidebar around main content.
 * Listens for custom "modal-state" events so the right-sidebar toggle is
 * hidden while any modal is open.
 *
 * Runs a SINGLE global lightweight poll (unread-count) every 5s.
 * When count changes → publishes data:changed event → all pages refresh.
 * This replaces 20+ independent page polls with ONE app-level poll.
 */

import { useState, useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./layoutComponent/Header";
import Sidebar from "./layoutComponent/Sidebar";
import RightSidebar from "../RightSidebar";
// import ChatWidget from "../ChatWidget";
import { authToken } from "../../../utils/auth";
import { publish } from "../../../utils/eventBus";
import API_URL from "../../../config/api";
import { useOrgBranding } from "../../../hooks/useOrgBranding";

import "./DashboardLayout.css";

const POLL_INTERVAL = 5000;

/**
 * @param {{ hideRightSidebar?: boolean }} props
 */
function DashboardLayout({ hideRightSidebar = false }) {
  const [rightOpen, setRightOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const prevCountRef = useRef(null);
  const location = useLocation();
  const { data: branding } = useOrgBranding();

  useEffect(() => {
    const organizationName = branding?.org_name?.trim();
    document.title = organizationName ? `${organizationName} | HRM` : "HRM Portal";
  }, [branding?.org_name, location.pathname]);

  // Sync modal-open state from child modals (e.g., CreateSubtaskTask)
  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    return () => window.removeEventListener("modal-state", handler);
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
    const refreshOnFocus = () => poll();
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, []);

  return (
    <div className="dashboard-page hrm-layout">
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

      <div className={`main-layout${hideRightSidebar ? " main-layout--no-right" : ""}`}>

        <Sidebar />

        <div className="dashboard-content">
          <Outlet />
        </div>

      </div>

    

      {/* <ChatWidget /> */}

    </div>
  );
}

export default DashboardLayout;
