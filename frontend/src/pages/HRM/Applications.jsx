import React, { useState } from "react";
import Breadcrumb from "../../components/Breadcrumb";
import ApplicationHistoryTab from "./ApplicationHistoryTab";
import { rolePath } from "../../utils/auth";
import "./Attendance.css"; // Reuse page layout styles

export default function Applications() {
  const [resetKey] = useState(Date.now());

  return (
    <main className="att-page" id="admin-applications-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: "Application Management" }]} />
      
      <header className="att-header" id="admin-applications-header" style={{ marginBottom: "20px" }}>
        <div>
          <div className="att-title-row">
            <h1>Application Request Management</h1>
          </div>
          <p>Review, filter, and manage all employee leave, WFH, corrections, and custom HR requests.</p>
        </div>
      </header>

      <ApplicationHistoryTab key={resetKey} />
    </main>
  );
}
