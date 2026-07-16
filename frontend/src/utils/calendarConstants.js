/** Default color scheme for events without a specific type */
export const DEFAULT_EVENT_COLOR = { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" };

/** Color schemes for each event type, used for background, text, and dot indicators */
export const TYPE_COLORS = {
  Meeting: { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" },
  Training: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  Workshop: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  "Client Meeting": { bg: "#fffbeb", text: "#f59e0b", dot: "#f59e0b" },
  "Company Event": { bg: "#ecfdf5", text: "#22c55e", dot: "#22c55e" },
  Holiday: { bg: "#fef2f2", text: "#ef4444", dot: "#ef4444" },
  Interview: { bg: "#fdf2f8", text: "#ec4899", dot: "#ec4899" },
  "Project Milestone": { bg: "#f0fdfa", text: "#14b8a6", dot: "#14b8a6" },
  "Internship Activity": { bg: "#ecfeff", text: "#06b6d4", dot: "#06b6d4" },
  Other: { bg: "#f3f4f6", text: "#6b7280", dot: "#6b7280" },
  task: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  project: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  deliverable: { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

/** Display labels for event types, shown in the calendar footer legend */
export const TYPE_LABELS = {
  Meeting: "Meeting",
  Training: "Training",
  Workshop: "Workshop",
  "Client Meeting": "Client Meeting",
  "Company Event": "Company Event",
  Holiday: "Holiday",
  Interview: "Interview",
  "Project Milestone": "Project Milestone",
  "Internship Activity": "Internship Activity",
  Other: "Other",
  task: "Task",
  project: "Project",
  deliverable: "Subtask",
};
