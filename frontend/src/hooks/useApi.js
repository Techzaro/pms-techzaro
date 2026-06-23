import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

export function useApiQuery(key, path, params, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key, params],
    queryFn: () => api.get(path, params),
    ...options,
  });
}

export function useApiMutation(method, options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ path, body }) => api[method](path, body),
    ...options,
    onSuccess: (data, variables, context) => {
      options.onSuccess?.(data, variables, context);
    },
  });
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (key) => queryClient.invalidateQueries({ queryKey: [key] });
}
