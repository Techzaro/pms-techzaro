/**
 * @file LoadingContext.jsx
 * @description React context for global loading state management.
 * Provides a loading state that is updated by the loadingManager utility.
 */

import { createContext, useContext, useState, useEffect } from "react";
import { setLoadingManager } from "../utils/loadingManager";

/** @type {React.Context<Object>} Loading context with loading state */
const LoadingContext = createContext();

/**
 * Provider component for global loading state.
 * Connects the loadingManager utility to React state.
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false);

  // Connect React state to the loading manager
  useEffect(() => {
    setLoadingManager(setLoading);
  }, []);

  return (
    <LoadingContext.Provider value={{ loading }}>
      {children}
    </LoadingContext.Provider>
  );
}

/**
 * Hook to access the global loading state.
 * @returns {Object} Object with loading boolean
 * @throws {Error} If used outside LoadingProvider
 */
export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
}
