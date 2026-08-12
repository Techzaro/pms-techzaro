import React, { useState } from "react";
import Breadcrumb from "../../components/Breadcrumb";
import ApplicationHistoryTab from "./ApplicationHistoryTab";
import { rolePath, getCurrentRole } from "../../utils/auth";
import "./Attendance.css"; // Reuse page layout styles

export default function Applications() {
  const [resetKey] = useState(Date.now());
  const role = getCurrentRole();
  // Members visiting this page are here to approve — show only assigned-to-them apps
  const isMemberApprover = ["member", "team_lead", "guest"].includes(role);

  return (
    <main className="att-page" id="admin-applications-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: isMemberApprover ? "Application Approvals" : "Application Management" }]} />
      
      <header className="att-header" id="admin-applications-header" style={{ marginBottom: "20px" }}>
        <div>
          <div className="att-title-row">
            <h1>{isMemberApprover ? "Application Approvals" : "Application Request Management"}</h1>
          </div>
          <p>{isMemberApprover ? "Review and action applications that have been assigned to you for approval." : "Review, filter, and manage all employee leave, WFH, corrections, and custom HR requests."}</p>
        </div>
      </header>

      {/* excludeOwn=true ensures nobody sees their own submitted applications here.
          Own applications are accessible via the separate My Applications section. */}
      <ApplicationHistoryTab key={resetKey} approverMode={isMemberApprover} excludeOwn={true} />
    </main>
  );
}
