import { useApiQuery } from "./useApi";

/**
 * Returns today's notifications (only OTHER users' actions affecting the logged-in user).
 * Data comes from the dashboard endpoint — no separate API call needed.
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
