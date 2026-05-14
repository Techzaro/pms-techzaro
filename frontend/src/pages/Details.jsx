/**
 * Details page component.
 * Rendered when the user navigates to /details or related route.
 */

import DashboardLayout from "../components/layout/DashboardLayout";

/**
 * Perform the details.
 */

/**
 * Generic details page for showing item-specific details.
 */
function Details() {
  return (
    <DashboardLayout>
      <div style={{ padding: 24 }}>
        <h1>Details</h1>
        <p>Review detailed project and task information from this page.</p>
      </div>
    </DashboardLayout>
  );
}

export default Details;
