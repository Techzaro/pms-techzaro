/**
 * History.jsx — Activity History Page
 *
 * Placeholder page for displaying activity logs and audit trails.
 * Currently renders a simple heading and description.
 * May be expanded to show detailed activity history in the future.
 */

import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * History — Activity history page component.
 * Renders within DashboardLayout with a static message.
 */
function History() {
  return (
    <DashboardLayout>
      <div>
        <h1>History</h1>
        <p>See activity logs and audit trails for your projects and tasks.</p>
      </div>
    </DashboardLayout>
  );
}

export default History;
