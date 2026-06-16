/**
 * DashboardLayout component.
 */

import { useState, useEffect } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";

import "./DashboardLayout.css";

function DashboardLayout({ children, hideRightSidebar = false }) {
  const [rightOpen, setRightOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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