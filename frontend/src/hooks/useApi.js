/**
 * @file useApi.js
 * @description React Query hooks for API data fetching and mutations.
 * Provides useApiQuery for GET requests, useApiMutation for write operations,
 * and useInvalidate for manual cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";

/**
 * Hook to fetch data using React Query with automatic caching.
 * @param {string|string[]} key - Query cache key (array or single string)
 * @param {string} path - API endpoint path
 * @param {Object} [params] - Query parameters for the GET request
 * @param {Object} [options] - Additional React Query options
 * @returns {Object} React Query result with data, isLoading, error, etc.
 */
export function useApiQuery(key, path, params, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key, params],
    queryFn: () => api.get(path, params),
    ...options,
  });
}

/**
 * Hook to perform write operations (POST, PUT, PATCH, DELETE) with React Query.
 * @param {string} method - HTTP method to use (post, put, patch, delete)
 * @param {Object} [options] - Additional React Query mutation options
 * @param {Function} [options.onSuccess] - Callback on successful mutation
 * @returns {Object} Mutation object with mutate, isLoading, error, etc.
 */
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

/**
 * Hook to manually invalidate React Query cache entries.
 * @returns {Function} Function that takes a cache key to invalidate
 */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return (key) => queryClient.invalidateQueries({ queryKey: [key] });
}
