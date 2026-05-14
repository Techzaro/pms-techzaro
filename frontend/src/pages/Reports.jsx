/**
 * Reports page component.
 * Rendered when the user navigates to /reports or related route.
 */

import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * Perform the reports.
 */

/**
 * Page showing aggregated reports and statistics.
 */
function Reports() {
  return (
    <DashboardLayout>
      <div style={{ padding: 24 }}>
        <h1>Reports</h1>
        <p>Analyze performance, reports, and key metrics from this screen.</p>
      </div>
    </DashboardLayout>
  );
}

export default Reports;
