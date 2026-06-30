/**
 * Manager.jsx — Manager Dashboard Page
 *
 * Thin wrapper around the Admin component. Managers see the same
 * dashboard experience as admins, so this component simply renders
 * the Admin page. This allows role-based routing to /manager/dashboard
 * while sharing the same UI.
 */

import Admin from "./Admin";

/**
 * Manager — Renders the Admin dashboard for manager role.
 * Delegates all functionality to the Admin component.
 */
function Manager() {
  return <Admin />;
}

export default Manager;