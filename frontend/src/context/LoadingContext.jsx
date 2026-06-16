import { createContext, useContext, useState, useEffect } from "react";
import { setLoadingManager } from "../utils/loadingManager";

const LoadingContext = createContext();

export function LoadingProvider({ children }) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoadingManager(setLoading);
  }, []);

  return (
    <LoadingContext.Provider value={{ loading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error("useLoading must be used within LoadingProvider");
  return ctx;
}
