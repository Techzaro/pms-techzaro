/**
 * pinnedTasks.js
 * Centralized utility and custom hook for managing pinned dashboard tasks.
 * Persists pinned tasks in localStorage and notifies components in real-time.
 */

import { useState, useEffect } from "react";

const STORAGE_KEY = "pms_pinned_tasks";

/** Retrieve all pinned tasks from localStorage */
export function getPinnedTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error reading pinned tasks:", err);
    return [];
  }
}

/** Save pinned tasks list to localStorage and trigger event listeners */
export function savePinnedTasks(tasks) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent("pinned-tasks-changed", { detail: tasks }));
  } catch (err) {
    console.error("Error saving pinned tasks:", err);
  }
}

/** Check whether a specific task ID is currently pinned */
export function isTaskPinned(taskId) {
  if (!taskId) return false;
  const current = getPinnedTasks();
  return current.some((t) => String(t.id) === String(taskId));
}

/** Toggle pin status for a given task object. Returns boolean (true if now pinned, false if unpinned) */
export function togglePinTask(task) {
  if (!task || !task.id) return false;
  const current = getPinnedTasks();
  const exists = current.some((t) => String(t.id) === String(task.id));
  let updated;

  if (exists) {
    updated = current.filter((t) => String(t.id) !== String(task.id));
  } else {
    const minTask = {
      id: task.id,
      title: task.title || task.name || "Untitled Task",
      status: task.status || "pending",
      priority: task.priority || "Medium",
      end_date: task.end_date || task.due_date || task.deadline || null,
      project_title: task.project?.title || task.project?.name || task.project_title || "",
      pinned_at: new Date().toISOString(),
    };
    updated = [minTask, ...current];
  }

  savePinnedTasks(updated);
  return !exists;
}

/** Custom React hook to subscribe to live updates of pinned tasks */
export function usePinnedTasks() {
  const [pinnedTasks, setPinnedTasks] = useState(getPinnedTasks());

  useEffect(() => {
    const handleUpdate = () => {
      setPinnedTasks(getPinnedTasks());
    };

    window.addEventListener("pinned-tasks-changed", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("pinned-tasks-changed", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  return [pinnedTasks, setPinnedTasks];
}
