import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import API_URL from "../config/api";
import { authToken, getTenantSlug } from "../utils/auth";

const BRANDING_QUERY_KEY = ["organization-branding"];

async function fetchBranding() {
  try {
    const data = await api.get("/organization-settings/branding", null, { skipNotify: true });
    if (data?.success && data?.branding) return data.branding;
  } catch {}
  return { logo_url: null, subtitle: "PMS Portal", org_name: "" };
}

export function useOrgBranding() {
  const hasTenant = !!getTenantSlug();

  return useQuery({
    queryKey: BRANDING_QUERY_KEY,
    queryFn: fetchBranding,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: hasTenant,
  });
}

export function useUpdateBranding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData) => {
      formData.append("_method", "PUT");
      const token = authToken();
      const res = await fetch(`${API_URL}/organization-settings/branding`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to update branding");
      }

      return data;
    },
    onSuccess: (data) => {
      if (data?.success && data?.branding) {
        queryClient.setQueryData(BRANDING_QUERY_KEY, data.branding);
      }
    },
  });
}
