/**
 * Member page component.
 * Rendered when the user navigates to /member/dashboard.
 */

import Admin from "./Admin";

/**
 * Member dashboard page.
 *
 * Members should see the same dashboard experience as admins.
 */
function Member() {
  return <Admin />;
}

export default Member;