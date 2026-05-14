/**
 * Deliveries page component.
 * Rendered when the user navigates to /deliveries or related route.
 */

import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * Perform the deliveries.
 */

/**
 * Page showing delivery status and milestones.
 */
function Deliveries() {
  return (
    <DashboardLayout>
      <div style={{ padding: 24 }}>
        <h1>Deliveries</h1>
        <p>View delivery status and shipment details here.</p>
      </div>
    </DashboardLayout>
  );
}

export default Deliveries;
