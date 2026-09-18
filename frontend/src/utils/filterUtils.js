/**
 * filterUtils.js
 * Utilities for task and deliverable filter calculations.
 */

/**
 * Calculates the cutoff Date threshold object for the "Updated Since" filter.
 * Returns null if no filter is active.
 *
 * @param {string} preset - Preset key: "15m", "1h", "24h", "7d", "1mo", "custom"
 * @param {number|string} customVal - Numeric value when preset === "custom"
 * @param {string} customUnit - Unit: "minutes", "hours", "days", "months"
 * @returns {Date|null}
 */
export function getUpdatedSinceThreshold(preset, customVal, customUnit) {
  if (!preset || preset === "all" || preset === "") return null;
  const now = new Date();
  const p = String(preset).toLowerCase().trim();

  if (p === "15m" || p === "15_mins" || p === "15mins") {
    return new Date(now.getTime() - 15 * 60 * 1000);
  }
  if (p === "1h" || p === "1_hour" || p === "1hour") {
    return new Date(now.getTime() - 60 * 60 * 1000);
  }
  if (p === "24h" || p === "24_hours" || p === "24hours" || p === "1d") {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (p === "7d" || p === "7_days" || p === "7days") {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  if (p === "1mo" || p === "1m" || p === "1_month" || p === "30d") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d;
  }
  if (p === "custom" && customVal && Number(customVal) > 0) {
    const val = Number(customVal);
    const unit = String(customUnit || "hours").toLowerCase().trim();
    if (unit.startsWith("min")) {
      return new Date(now.getTime() - val * 60 * 1000);
    }
    if (unit.startsWith("hour")) {
      return new Date(now.getTime() - val * 60 * 60 * 1000);
    }
    if (unit.startsWith("day")) {
      return new Date(now.getTime() - val * 24 * 60 * 60 * 1000);
    }
    if (unit.startsWith("month")) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - val);
      return d;
    }
  }
  return null;
}

/**
 * Formats an ISO string, date string, or timestamp to "YYYY-MM-DDTHH:mm" format for <input type="datetime-local">.
 *
 * @param {string|Date} val
 * @returns {string}
 */
export function formatForDatetimeLocal(val) {
  if (!val) return "";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}`;
  }
  const str = String(val).trim();
  if (!str) return "";
  if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return `${str}T00:00`;
  }
  if (str.includes("T")) {
    return str.substring(0, 16);
  }
  if (str.includes(" ")) {
    return str.replace(" ", "T").substring(0, 16);
  }
  return str;
}

/**
 * Checks whether a user object is an active (non-resigned/terminated/disabled) employee.
 * @param {Object} u - User object
 * @returns {boolean}
 */
export function isUserActive(u) {
  if (!u) return false;
  if (u.active === false || u.active === 0 || u.active === "0") return false;
  if (u.is_active === false || u.is_active === 0 || u.is_active === "0") return false;
  if (u.deletion_requested === true || u.deletion_requested === 1 || u.deletion_requested === "1") return false;
  if (typeof u.status === "string") {
    const s = u.status.toLowerCase().trim();
    if (["inactive", "resigned", "terminated", "deleted", "disabled", "archived", "suspended"].includes(s)) return false;
  }
  return true;
}

export const STATUS_MAP = {
  pending: ["pending", "planned", "planning", "draft", "todo", "to_do", "to-do", "new", "not_started", "unassigned"],
  in_progress: ["in_progress", "in progress", "in-progress", "doing", "working", "underway", "under_way", "acknowledged", "started"],
  submitted: ["submitted", "review", "in_review", "under_review", "submitted_late", "awaiting_approval", "awaiting_checkpoint"],
  completed: ["completed", "approved", "done", "finished", "closed"],
  paused: ["paused", "pause", "hold", "on_hold", "on hold", "on-hold"],
  declined: ["declined", "rejected", "failed", "rework_required"],
  abandoned: ["abandoned", "abandon_requested", "cancelled", "canceled"],
};

/**
 * Checks if a task/deliverable matches the selected status multi-select filter array.
 * If selectedStatuses is empty or contains "all", returns true.
 * Strictly excludes any item whose status does not belong to any of the selected statuses.
 *
 * @param {string} itemStatus - The status of the task or deliverable
 * @param {Array<string>} selectedStatuses - Array of selected statuses from filter (e.g. ['Pending', 'In Progress'])
 * @returns {boolean}
 */
export function matchStatusFilter(itemStatus, selectedStatuses) {
  if (!selectedStatuses || !Array.isArray(selectedStatuses) || selectedStatuses.length === 0) {
    return true;
  }

  const rawStatus = String(itemStatus || "").toLowerCase().trim();

  return selectedStatuses.some((selected) => {
    const s = String(selected || "").toLowerCase().trim();
    if (!s || s === "all") return true;

    if (s === "pending" || s === "planned" || s === "draft" || s === "todo") {
      return (
        STATUS_MAP.pending.includes(rawStatus) ||
        rawStatus === "" ||
        rawStatus === "null" ||
        rawStatus === "undefined"
      );
    }
    if (s === "in_progress" || s === "in progress" || s === "in-progress") {
      return STATUS_MAP.in_progress.includes(rawStatus);
    }
    if (s === "submitted" || s === "review" || s === "in_review" || s === "under_review") {
      return STATUS_MAP.submitted.includes(rawStatus);
    }
    if (s === "completed" || s === "approved" || s === "done") {
      return STATUS_MAP.completed.includes(rawStatus);
    }
    if (s === "paused" || s === "pause" || s === "hold" || s === "on_hold") {
      return STATUS_MAP.paused.includes(rawStatus);
    }
    if (s === "declined" || s === "rejected" || s === "failed") {
      return STATUS_MAP.declined.includes(rawStatus);
    }
    if (s === "abandoned" || s === "cancelled" || s === "canceled" || s === "abandon_requested") {
      return STATUS_MAP.abandoned.includes(rawStatus);
    }
    if (s === "reopened") {
      return rawStatus === "reopened";
    }

    return rawStatus === s;
  });
}

/**
 * Resolves a raw status string into its canonical top badge key:
 * 'pending', 'in_progress', 'submitted', 'completed', 'paused', 'declined', 'abandoned', 'reopened'.
 *
 * @param {string} rawStatus
 * @returns {string}
 */
export function getCanonicalStatusKey(rawStatus) {
  const s = String(rawStatus || "").toLowerCase().trim();
  if (s === "reopened") return "reopened";
  if (!s || STATUS_MAP.pending.includes(s) || s === "null" || s === "undefined") return "pending";
  if (STATUS_MAP.in_progress.includes(s)) return "in_progress";
  if (STATUS_MAP.submitted.includes(s)) return "submitted";
  if (STATUS_MAP.completed.includes(s)) return "completed";
  if (STATUS_MAP.paused.includes(s)) return "paused";
  if (STATUS_MAP.declined.includes(s)) return "declined";
  if (STATUS_MAP.abandoned.includes(s)) return "abandoned";
  return s;
}

/**
 * Optimistically updates a status counts object when a task transitions from oldRawStatus to newRawStatus.
 *
 * @param {Object} prevCounts - The current counts object (e.g. apiCounts or counts state)
 * @param {string} oldRawStatus - The previous status of the item
 * @param {string} newRawStatus - The new status of the item
 * @returns {Object} Updated counts object
 */
export function mutateStatusCounts(prevCounts, oldRawStatus, newRawStatus) {
  if (!prevCounts || typeof prevCounts !== "object") return prevCounts;

  const oldKey = getCanonicalStatusKey(oldRawStatus);
  const newKey = getCanonicalStatusKey(newRawStatus);

  if (oldKey === newKey) return prevCounts;

  const next = { ...prevCounts };

  // Decrement old status count (handling alias keys)
  if (oldKey === "in_progress") {
    if (typeof next.in_progress === "number") next.in_progress = Math.max(0, next.in_progress - 1);
    if (typeof next.inProgress === "number") next.inProgress = Math.max(0, next.inProgress - 1);
  } else if (oldKey === "completed") {
    if (typeof next.completed === "number") next.completed = Math.max(0, next.completed - 1);
    if (typeof next.approved === "number") next.approved = Math.max(0, next.approved - 1);
  } else if (oldKey === "declined") {
    if (typeof next.declined === "number") next.declined = Math.max(0, next.declined - 1);
    if (typeof next.rejected === "number") next.rejected = Math.max(0, next.rejected - 1);
  } else {
    if (typeof next[oldKey] === "number") next[oldKey] = Math.max(0, next[oldKey] - 1);
  }

  // Increment new status count (handling alias keys)
  if (newKey === "in_progress") {
    next.in_progress = (typeof next.in_progress === "number" ? next.in_progress : 0) + 1;
    next.inProgress = (typeof next.inProgress === "number" ? next.inProgress : 0) + 1;
  } else if (newKey === "completed") {
    next.completed = (typeof next.completed === "number" ? next.completed : 0) + 1;
    next.approved = (typeof next.approved === "number" ? next.approved : 0) + 1;
  } else if (newKey === "declined") {
    next.declined = (typeof next.declined === "number" ? next.declined : 0) + 1;
    next.rejected = (typeof next.rejected === "number" ? next.rejected : 0) + 1;
  } else {
    next[newKey] = (typeof next[newKey] === "number" ? next[newKey] : 0) + 1;
  }

  return next;
}

/**
 * Optimistically decrements a status count when an item is deleted.
 *
 * @param {Object} prevCounts
 * @param {string} rawStatus
 * @returns {Object}
 */
export function decrementStatusCount(prevCounts, rawStatus) {
  if (!prevCounts || typeof prevCounts !== "object") return prevCounts;
  const key = getCanonicalStatusKey(rawStatus);
  const next = { ...prevCounts };
  if (typeof next.all === "number") next.all = Math.max(0, next.all - 1);

  if (key === "in_progress") {
    if (typeof next.in_progress === "number") next.in_progress = Math.max(0, next.in_progress - 1);
    if (typeof next.inProgress === "number") next.inProgress = Math.max(0, next.inProgress - 1);
  } else if (key === "completed") {
    if (typeof next.completed === "number") next.completed = Math.max(0, next.completed - 1);
    if (typeof next.approved === "number") next.approved = Math.max(0, next.approved - 1);
  } else if (key === "declined") {
    if (typeof next.declined === "number") next.declined = Math.max(0, next.declined - 1);
    if (typeof next.rejected === "number") next.rejected = Math.max(0, next.rejected - 1);
  } else {
    if (typeof next[key] === "number") next[key] = Math.max(0, next[key] - 1);
  }
  return next;
}

/**
 * Optimistically increments a status count when an item is created.
 *
 * @param {Object} prevCounts
 * @param {string} rawStatus
 * @returns {Object}
 */
export function incrementStatusCount(prevCounts, rawStatus = "pending") {
  if (!prevCounts || typeof prevCounts !== "object") return prevCounts;
  const key = getCanonicalStatusKey(rawStatus);
  const next = { ...prevCounts };
  if (typeof next.all === "number") next.all += 1;

  if (key === "in_progress") {
    next.in_progress = (typeof next.in_progress === "number" ? next.in_progress : 0) + 1;
    next.inProgress = (typeof next.inProgress === "number" ? next.inProgress : 0) + 1;
  } else if (key === "completed") {
    next.completed = (typeof next.completed === "number" ? next.completed : 0) + 1;
    next.approved = (typeof next.approved === "number" ? next.approved : 0) + 1;
  } else if (key === "declined") {
    next.declined = (typeof next.declined === "number" ? next.declined : 0) + 1;
    next.rejected = (typeof next.rejected === "number" ? next.rejected : 0) + 1;
  } else {
    next[key] = (typeof next[key] === "number" ? next[key] : 0) + 1;
  }
  return next;
}



