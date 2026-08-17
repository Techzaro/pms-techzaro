import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { subscribe } from "../utils/eventBus";

const SUBSCRIPTION_QUERY_KEY = ["organization-subscription"];

async function fetchSubscription() {
  try {
    const data = await api.get("/organization-settings/subscription");
    if (data?.success) return data;
  } catch {}
  return { success: false, subscription: null, plan: null, usage: { users: 0, projects: 0 }, modules: { enabled: [], disabled: [] }, organization: null };
}

function isSubscriptionExpired(endsAt) {
  if (!endsAt) return false;
  return new Date(endsAt) < new Date();
}

export function useOrgSubscription() {
  const queryClient = useQueryClient();
  const lastSubIdRef = useRef(null);
  const pollIntervalRef = useRef(null);

  const query = useQuery({
    queryKey: SUBSCRIPTION_QUERY_KEY,
    queryFn: fetchSubscription,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Detect subscription renewal (new subscription_id = auto-renew happened)
  useEffect(() => {
    if (query.data?.subscription?.id) {
      const currentId = query.data.subscription.id;
      if (lastSubIdRef.current !== null && lastSubIdRef.current !== currentId) {
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      }
      lastSubIdRef.current = currentId;
    }
  }, [query.data?.subscription?.id, queryClient]);

  // When subscription is expired, poll every 10s until renewed
  useEffect(() => {
    const endsAt = query.data?.subscription?.ends_at;
    if (isSubscriptionExpired(endsAt) && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      }, 10000);
    } else if (!isSubscriptionExpired(endsAt) && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [query.data?.subscription?.ends_at, queryClient]);

  return query;
}

export function usePlanLimits() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useOrgSubscription();

  useEffect(() => {
    const unsub = subscribe("data:changed", (payload) => {
      if (["user", "guest", "project"].includes(payload?.type)) {
        queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_QUERY_KEY });
      }
    });
    return unsub;
  }, [queryClient]);

  const plan = data?.plan;
  const usage = data?.usage || { users: 0, projects: 0 };
  const organization = data?.organization;
  const isOwner = organization?.is_owner ?? false;

  const maxUsers = plan?.max_users ?? 9999;
  const maxProjects = plan?.max_projects ?? 9999;
  const currentUsers = usage.users ?? 0;
  const currentProjects = usage.projects ?? 0;

  const isUnlimited = (val) => val >= 9999;

  const usersRemaining = isUnlimited(maxUsers) ? Infinity : Math.max(0, maxUsers - currentUsers);
  const projectsRemaining = isUnlimited(maxProjects) ? Infinity : Math.max(0, maxProjects - currentProjects);

  const canCreateUser = isOwner || isUnlimited(maxUsers) || currentUsers < maxUsers;
  const canCreateProject = isOwner || isUnlimited(maxProjects) || currentProjects < maxProjects;

  const usersPercent = isUnlimited(maxUsers) ? 0 : Math.min(100, Math.round((currentUsers / maxUsers) * 100));
  const projectsPercent = isUnlimited(maxProjects) ? 0 : Math.min(100, Math.round((currentProjects / maxProjects) * 100));

  const getLimitMessage = (type) => {
    if (isOwner) return null;
    if (type === 'user' && !canCreateUser) {
      return `User limit reached (${currentUsers}/${maxUsers}). Upgrade your plan to add more users.`;
    }
    if (type === 'project' && !canCreateProject) {
      return `Project limit reached (${currentProjects}/${maxProjects}). Upgrade your plan to add more projects.`;
    }
    return null;
  };

  return {
    plan,
    usage,
    isOwner,
    maxUsers: isUnlimited(maxUsers) ? null : maxUsers,
    maxProjects: isUnlimited(maxProjects) ? null : maxProjects,
    currentUsers,
    currentProjects,
    usersRemaining: isUnlimited(maxUsers) ? null : usersRemaining,
    projectsRemaining: isUnlimited(maxProjects) ? null : projectsRemaining,
    canCreateUser,
    canCreateProject,
    usersPercent,
    projectsPercent,
    getLimitMessage,
    isLoading,
    refetch,
  };
}
