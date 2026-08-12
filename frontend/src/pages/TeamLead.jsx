/**
 * TeamLead page component.
 * Rendered when the user navigates to /org/{slug}/dashboard.
 */

import Admin from "./Admin";

/**
 * Team lead dashboard page.
 *
 * Team leads should see the same dashboard experience as admins.
 */
function TeamLead() {
  return <Admin />;
}

export default TeamLead;