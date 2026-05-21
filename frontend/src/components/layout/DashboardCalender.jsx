/**
 * DashboardLayout component.
 */

import Header from "./Header";
import Sidebar from "./Sidebar";

import "./DashboardLayout.css";

/**
 * Dashboard layout wrapper that renders navigation and main content areas.
 */
function DashboardCalender({ children }) {
  return (
    <div className="dashboard-page">

      <Header />

      <div className="main-layout">

        <Sidebar />

        <div className="dashboard-content">
          {children}
        </div>

      </div>

    </div>
  );
}

export default DashboardCalender;