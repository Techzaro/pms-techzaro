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

      <Header />

      <div className={`main-layout${hideRightSidebar ? " main-layout--no-right" : ""}`}>

        <Sidebar />

        <div className="dashboard-content">
          <svg className="dashboard-wave-bg" viewBox="0 0 1200 500" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMin slice">
            <path d="M0 0H1200V180C1200 180 1050 120 900 160C750 200 680 300 500 280C320 260 250 140 100 180C-50 220 0 350 0 350V0Z" fill="url(#wave1)" />
            <path d="M0 0H1200V220C1200 220 1000 150 850 200C700 250 600 350 420 320C240 290 180 170 50 210C-80 250 0 400 0 400V0Z" fill="url(#wave2)" />
            <path d="M0 0H1200V260C1200 260 950 180 780 240C610 300 520 380 350 360C180 340 120 230 0 270V0Z" fill="url(#wave3)" />
            <defs>
              <linearGradient id="wave1" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#818cf8" stopOpacity="0.55" />
                <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#e0e7ff" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id="wave2" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ddd6fe" stopOpacity="0.08" />
              </linearGradient>
              <linearGradient id="wave3" x1="0" y1="0" x2="1200" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.45" />
                <stop offset="60%" stopColor="#c4b5fd" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#ede9fe" stopOpacity="0.05" />
              </linearGradient>
            </defs>
          </svg>
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

    </div>
  );
}

export default DashboardLayout;