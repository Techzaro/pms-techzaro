/**
 * @file queryClient.js
 * @description React Query client configuration.
 * Defines default options for all queries in the application.
 */

import { QueryClient } from "@tanstack/react-query";

/**
 * Configured React Query client instance.
 * @type {QueryClient}
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 60000, // Keep unused cache for 60 seconds
      refetchOnWindowFocus: false, // Do NOT refetch on tab focus — prevents losing form data
      retry: 1, // Retry failed requests once
    },
  },
});
