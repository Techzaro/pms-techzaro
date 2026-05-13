import Header from "./Header";
import Sidebar from "./Sidebar";
import RightSidebar from "./RightSidebar";

import "./DashboardLayout.css";

function DashboardLayout({ children, hideRightSidebar = false }) {
  return (
    <div className="dashboard-page">

      <Header />

      <div className={`main-layout${hideRightSidebar ? " main-layout--no-right" : ""}`}>

        <Sidebar />

        <div className="dashboard-content">
          {children}
        </div>

        {!hideRightSidebar && <RightSidebar />}
      </div>

    </div>
  );
}

export default DashboardLayout;