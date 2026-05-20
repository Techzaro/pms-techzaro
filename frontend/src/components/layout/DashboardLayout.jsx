/**
 * DashboardLayout component.
 */

import { useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";

import "./DashboardLayout.css";

/**
 * Dashboard layout wrapper that renders navigation and main content areas.
 */
function DashboardLayout({ children, hideRightSidebar = false }) {
  const [rightOpen, setRightOpen] = useState(false);

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

      {!hideRightSidebar && (
        <button
          className="right-toggle"
          onClick={() => setRightOpen((prev) => !prev)}
          aria-label="Toggle right sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 4L13 10L7 16" />
          </svg>
        </button>
      )}

    </div>
  );
}

export default DashboardLayout;