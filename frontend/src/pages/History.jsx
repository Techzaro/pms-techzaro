/**
 * History page component.
 * Rendered when the user navigates to /history or related route.
 */

import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * Perform the history.
 */

/**
 * Page showing recent activity history.
 */
function History() {
  return (
    <DashboardLayout>
      <div style={{ padding: 24 }}>
        <h1>History</h1>
        <p>See activity logs and audit trails for your projects and tasks.</p>
      </div>
    </DashboardLayout>
  );
}

export default History;
