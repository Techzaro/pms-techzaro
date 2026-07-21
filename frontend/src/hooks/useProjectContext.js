/**
 * useProjectContext - Centralized hook for project-aware data filtering.
 *
 * Provides cached project members and project tasks based on the selected project.
 * Falls back to all users / all tasks when no project is selected.
 * Shared across all Create/Edit Subtask popups for consistent behavior.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { authToken, getUser } from "../utils/auth";
import API_URL from "../config/api";

const memberCache = new Map();
const taskCache = new Map();
const allUsersCache = { data: null, promise: null };

function fetchJSON(url, token) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    skipLoader: true,
  }).then((r) => (r.ok ? r.json() : []));
}

export default function useProjectContext(selectedProjectId) {
  const [projects, setProjects] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Fetch all projects once
  useEffect(() => {
    const token = authToken();
    if (!token) return;
    fetchJSON(`${API_URL}/projects`, token).then((d) => {
      if (!mountedRef.current) return;
      setProjects(Array.isArray(d) ? d : (d.data || d.projects || []));
    }).catch(() => {});
  }, []);

  // Fetch all users once (with dedup)
  useEffect(() => {
    const token = authToken();
    if (!token) return;
    if (allUsersCache.data) {
      setAllUsers(allUsersCache.data);
      return;
    }
    if (!allUsersCache.promise) {
      allUsersCache.promise = fetchJSON(`${API_URL}/team-users`, token)
        .then((d) => {
          const u = Array.isArray(d) ? d : (d.users || d.data || []);
          allUsersCache.data = u;
          return u;
        })
        .catch(() => []);
    }
    allUsersCache.promise.then((u) => {
      if (mountedRef.current) setAllUsers(u);
    });
  }, []);

  // Fetch project members when project changes (with cache)
  useEffect(() => {
    const token = authToken();
    const currentUser = getUser();
    if (!selectedProjectId) {
      setProjectMembers([]);
      return;
    }
    const cacheKey = String(selectedProjectId);
    if (memberCache.has(cacheKey)) {
      let members = memberCache.get(cacheKey);
      if (currentUser && !members.some((u) => u.id === currentUser.id)) {
        members = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, department: currentUser.department }, ...members];
      }
      if (mountedRef.current) setProjectMembers(members);
      return;
    }
    fetchJSON(`${API_URL}/projects/${selectedProjectId}/members`, token).then((d) => {
      let members = Array.isArray(d) ? d : [];
      memberCache.set(cacheKey, members);
      if (currentUser && !members.some((u) => u.id === currentUser.id)) {
        members = [{ id: currentUser.id, name: currentUser.name, email: currentUser.email, role: currentUser.role, department: currentUser.department }, ...members];
      }
      if (mountedRef.current) setProjectMembers(members);
    }).catch(() => {
      if (mountedRef.current) setProjectMembers([]);
    });
  }, [selectedProjectId]);

  // Fetch project tasks when project changes (with cache)
  useEffect(() => {
    const token = authToken();
    if (!selectedProjectId) {
      setProjectTasks([]);
      return;
    }
    const cacheKey = String(selectedProjectId);
    if (taskCache.has(cacheKey)) {
      if (mountedRef.current) setProjectTasks(taskCache.get(cacheKey));
      return;
    }
    fetchJSON(`${API_URL}/projects/${selectedProjectId}/tasks`, token).then((d) => {
      const t = Array.isArray(d) ? d : [];
      taskCache.set(cacheKey, t);
      if (mountedRef.current) setProjectTasks(t);
    }).catch(() => {
      if (mountedRef.current) setProjectTasks([]);
    });
  }, [selectedProjectId]);

  // Clear cache (e.g., after creating a task/subtask)
  const clearCache = useCallback(() => {
    memberCache.clear();
    taskCache.clear();
    allUsersCache.data = null;
    allUsersCache.promise = null;
  }, []);

  return {
    projects,
    allUsers,
    projectMembers,
    projectTasks,
    clearCache,
  };
}
