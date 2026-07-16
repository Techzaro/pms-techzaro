/**
 * DashboardLayout - Top-level layout shell for the authenticated dashboard.
 * Composes Header, Sidebar, and an optional RightSidebar around main content.
 * Listens for custom "modal-state" events so the right-sidebar toggle is
 * hidden while any modal is open.
 */

import { useState, useEffect } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";
import ChatWidget from "./ChatWidget";

import "./DashboardLayout.css";

/**
 * @param {{ children: React.ReactNode, hideRightSidebar?: boolean }} props
 */
function DashboardLayout({ children, hideRightSidebar = false }) {
  const [rightOpen, setRightOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Sync modal-open state from child modals (e.g., CreateDeliverableTask)
  useEffect(() => {
    const handler = (e) => setModalOpen(e.detail.open);
    window.addEventListener("modal-state", handler);
    return () => window.removeEventListener("modal-state", handler);
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

      <div className={`main-layout${hideRightSidebar ? " main-layout--no-right" : ""}`}>

        <Sidebar />

        <div className="dashboard-content">
          {children}
        </div>

        {!hideRightSidebar && <RightSidebar isOpen={rightOpen} onClose={() => setRightOpen(false)} />}
      </div>

      {!hideRightSidebar && !modalOpen && (
        <button
          className={`right-toggle${rightOpen ? " right-toggle--open" : ""}`}
          onClick={() => setRightOpen((prev) => !prev)}
          aria-label="Toggle right sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {rightOpen ? (
              <path d="M7 4L13 10L7 16" />
            ) : (
              <path d="M13 4L7 10L13 16" />
            )}
          </svg>
        </button>
      )}

      <ChatWidget />

    </div>
  );
}

export default DashboardLayout;