/**
 * Manager page component.
 * Rendered when the user navigates to /manager or related route.
 */

import Admin from "./Admin";

/**
 * Manager dashboard page.
 *
 * Managers should see the same dashboard experience as admins.
 */
function Manager() {
  return <Admin />;
}

export default Manager;