/**
 * @file useTodayNotifications.js
 * @description Hook for fetching today's notifications from the dashboard endpoint.
 * Reuses dashboard data instead of making a separate API call.
 */

import { useApiQuery } from "./useApi";

/**
 * Hook that returns today's notifications for the logged-in user.
 * Only includes notifications from other users' actions affecting this user.
 *
 * @returns {Object} Object with notifications array and loading state
 */
export function useTodayNotifications() {
  const { data: dashboard, isLoading } = useApiQuery(
    "dashboard",
    "/dashboard",
    null,
    { staleTime: 60000, refetchOnMount: true, refetchInterval: 120000 }
  );

  return {
    notifications: dashboard?.todayNotifications || [],
    isLoading,
  };
}
