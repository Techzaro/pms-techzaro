import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 60000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});
