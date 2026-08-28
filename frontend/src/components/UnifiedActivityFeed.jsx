import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  FileText,
  RefreshCw,
  Sliders,
  Calendar,
  User,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import DOMPurify from "dompurify";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";
import CustomSelect from "./CustomSelect";

/**
 * UnifiedActivityFeed.jsx
 * Single, unified, and filterable Activity Feed component for Task and Project detail pages.
 * Replaces separate timeline, task info, and activity panels with a consolidated feed.
 *
 * @param {string} module - 'task' or 'project'
 * @param {number|string} entityId - ID of the task or project
 * @param {Array} initialUsers - Optional list of member users for the person filter
 */
export default function UnifiedActivityFeed({ module = "task", entityId, initialUsers = [] }) {
  const { t } = useTranslation();
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [dateFilter, setDateFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchUnifiedActivity = async () => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (dateFilter) params.append("date", dateFilter);
      if (userFilter) params.append("user_id", userFilter);
      if (typeFilter && typeFilter !== "all") params.append("type", typeFilter);

      let endpoint = "";
      if (module === "project" && entityId) {
        endpoint = `${API_URL}/projects/${entityId}/unified-activity?${params.toString()}`;
      } else if (module === "task" && entityId) {
        endpoint = `${API_URL}/tasks/${entityId}/unified-activity?${params.toString()}`;
      } else if (module === "knowledge_base" && entityId) {
        endpoint = `${API_URL}/knowledge-base/${entityId}/activities?${params.toString()}`;
      } else if (module === "event" && entityId) {
        endpoint = `${API_URL}/events/${entityId}/activities?${params.toString()}`;
      } else if (entityId) {
        endpoint = `${API_URL}/${module}/${entityId}/activities?${params.toString()}`;
      } else {
        endpoint = `${API_URL}/activity-logs?module=${module}&${params.toString()}`;
      }

      let res = await fetch(endpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });

      // Fallback if specific module activity route doesn't exist
      if (!res.ok && res.status === 404) {
        const fallbackUrl = `${API_URL}/activity-logs?${params.toString()}${entityId ? `&entity_id=${entityId}` : ""}${module ? `&module=${module}` : ""}`;
        res = await fetch(fallbackUrl, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          skipLoader: true,
        });
      }

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setActivities(list);
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
        }
      }
    } catch (err) {
      console.error("Failed to fetch unified activity feed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnifiedActivity();
  }, [module, entityId, dateFilter, userFilter, typeFilter]);

  const userOptions = [
    { value: "", label: t("All Persons", { defaultValue: "All Persons" }) },
    ...users.map((u) => ({ value: String(u.id), label: u.name })),
  ];

  const typeOptions = useMemo(() => {
    switch (module) {
      case "knowledge_base":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "published", label: t("Published", { defaultValue: "Published" }) },
          { value: "edited", label: t("Edited", { defaultValue: "Edited" }) },
          { value: "archived", label: t("Archived", { defaultValue: "Archived" }) },
        ];
      case "event":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "rsvp", label: t("RSVP", { defaultValue: "RSVP" }) },
          { value: "rescheduled", label: t("Rescheduled", { defaultValue: "Rescheduled" }) },
          { value: "updated", label: t("Updated", { defaultValue: "Updated" }) },
        ];
      case "regional_settings":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "configuration_changed", label: t("Configuration Changed", { defaultValue: "Configuration Changed" }) },
        ];
      case "task":
      case "project":
      default:
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "timelines", label: t("Timelines", { defaultValue: "Timelines" }) },
          { value: "submissions", label: t("Submissions", { defaultValue: "Submissions" }) },
          { value: "changes", label: t("Field Changes", { defaultValue: "Field Changes" }) },
          { value: "transfers", label: t("Transfers", { defaultValue: "Transfers" }) },
        ];
    }
  }, [module, t]);

  const resetFilters = () => {
    setDateFilter("");
    setUserFilter("");
    setTypeFilter("all");
  };

  const getActivityIcon = (type, action) => {
    switch (type) {
      case "published":
        return <CheckCircle2 size={15} color="#16a34a" />;
      case "edited":
      case "updated":
        return <Sliders size={15} color="#0284c7" />;
      case "archived":
        return <XCircle size={15} color="#64748b" />;
      case "rsvp":
        return <CheckCircle2 size={15} color="#2563eb" />;
      case "rescheduled":
        return <RefreshCw size={15} color="#ea580c" />;
      case "configuration_changed":
        return <Sliders size={15} color="#8b5cf6" />;
      case "submissions":
        return <FileText size={15} color="#16a34a" />;
      case "transfers":
        return <RefreshCw size={15} color="#ea580c" />;
      case "changes":
        return <Sliders size={15} color="#0284c7" />;
      case "timelines":
      default:
        if (action === "approved" || action === "completed") return <CheckCircle2 size={15} color="#16a34a" />;
        if (action === "rejected" || action === "abandoned") return <XCircle size={15} color="#dc2626" />;
        if (action === "paused" || action === "reopened") return <AlertCircle size={15} color="#ca8a04" />;
        return <Clock size={15} color="#2563eb" />;
    }
  };

  const getTypeBadgeStyle = (type) => {
    switch (type) {
      case "published":
        return { bg: "#f0fdf4", color: "#16a34a", label: t("Published", { defaultValue: "Published" }) };
      case "edited":
        return { bg: "#f0f9ff", color: "#0284c7", label: t("Edited", { defaultValue: "Edited" }) };
      case "archived":
        return { bg: "#f1f5f9", color: "#64748b", label: t("Archived", { defaultValue: "Archived" }) };
      case "rsvp":
        return { bg: "#eff6ff", color: "#2563eb", label: t("RSVP", { defaultValue: "RSVP" }) };
      case "rescheduled":
        return { bg: "#fff7ed", color: "#ea580c", label: t("Rescheduled", { defaultValue: "Rescheduled" }) };
      case "updated":
        return { bg: "#f0f9ff", color: "#0284c7", label: t("Updated", { defaultValue: "Updated" }) };
      case "configuration_changed":
        return { bg: "#faf5ff", color: "#8b5cf6", label: t("Config Changed", { defaultValue: "Config Changed" }) };
      case "submissions":
        return { bg: "#f0fdf4", color: "#16a34a", label: t("Submission", { defaultValue: "Submission" }) };
      case "transfers":
        return { bg: "#fff7ed", color: "#ea580c", label: t("Transfer", { defaultValue: "Transfer" }) };
      case "changes":
        return { bg: "#f0f9ff", color: "#0284c7", label: t("Change", { defaultValue: "Change" }) };
      case "timelines":
      default:
        return { bg: "#eff6ff", color: "#2563eb", label: t("Timeline", { defaultValue: "Timeline" }) };
    }
  };

  const isFiltered = Boolean(dateFilter || userFilter || (typeFilter && typeFilter !== "all"));

  return (
    <div
      className="td-card"
      style={{
        background: "var(--bg-card, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "12px",
        padding: "18px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
        width: "100%",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
          paddingBottom: "10px",
          borderBottom: "1px solid var(--border-color, #f1f5f9)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--text-primary, #0f172a)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Clock size={18} color="#2563eb" />
          {t("Unified Activity", { defaultValue: "Unified Activity" })}
        </h3>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#64748b",
            background: "#f1f5f9",
            padding: "2px 8px",
            borderRadius: "10px",
          }}
        >
          {t("{{count}} items", { defaultValue: `${activities.length} items`, count: activities.length })}
        </span>
      </div>

      {/* FILTER CONTROL BAR */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          alignItems: "center",
          marginBottom: "16px",
          padding: "10px 12px",
          background: "var(--bg-card-subtle, #f8fafc)",
          border: "1px solid var(--border-color, #e2e8f0)",
          borderRadius: "8px",
        }}
      >
        {/* Date Filter */}
        <div style={{ flex: "1 1 120px", minWidth: 110 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase" }}>
            {t("Date", { defaultValue: "Date" })}
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              width: "100%",
              height: "32px",
              padding: "2px 6px",
              borderRadius: "6px",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "#ffffff",
              color: "#0f172a",
              fontSize: "11px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Person Filter */}
        <div style={{ flex: "1 1 130px", minWidth: 120 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase" }}>
            {t("Person", { defaultValue: "Person" })}
          </label>
          <CustomSelect
            name="activity_user_id"
            value={userFilter}
            onChange={(val) => setUserFilter(val)}
            options={userOptions}
            style={{ height: "32px", fontSize: "11px" }}
          />
        </div>

        {/* Type Filter */}
        <div style={{ flex: "1 1 120px", minWidth: 110 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", display: "block", marginBottom: 3, textTransform: "uppercase" }}>
            {t("Type", { defaultValue: "Type" })}
          </label>
          <CustomSelect
            name="activity_type"
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
            options={typeOptions}
            style={{ height: "32px", fontSize: "11px" }}
          />
        </div>

        {/* Clear Filters */}
        {isFiltered && (
          <div style={{ display: "flex", alignItems: "flex-end", height: "32px", marginTop: "auto" }}>
            <button
              type="button"
              onClick={resetFilters}
              style={{
                height: "32px",
                padding: "0 10px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#dc2626",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t("Clear", { defaultValue: "Clear" })}
            </button>
          </div>
        )}
      </div>

      {/* UNIFIED ACTIVITY FEED STREAM */}
      {loading ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
          {t("Loading activity stream...", { defaultValue: "Loading activity stream..." })}
        </div>
      ) : activities.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
          {t("No activities found matching filters.", { defaultValue: "No activities found matching filters." })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxHeight: "540px", overflowY: "auto", paddingRight: 4 }}>
          {activities.map((item) => {
            const itemType = (item.type || item.action || "timeline").toLowerCase();
            const badgeStyle = getTypeBadgeStyle(itemType);
            const userName = item.user_name || item.user?.name || (item.user?.first_name ? `${item.user.first_name} ${item.user.last_name || ""}`.trim() : "System");
            const itemTitle = item.title || item.action || item.description || "Activity Event";

            return (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  background: "var(--bg-card-subtle, #f8fafc)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  transition: "background-color 0.15s ease",
                }}
              >
                {/* Icon Column */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                  }}
                >
                  {getActivityIcon(itemType, item.action)}
                </div>

                {/* Content Column */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "3px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary, #0f172a)", lineHeight: 1.3 }}>
                      {itemTitle}
                    </span>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        borderRadius: "10px",
                        backgroundColor: badgeStyle.bg,
                        color: badgeStyle.color,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {badgeStyle.label}
                    </span>
                  </div>

                  {/* Description */}
                  {item.description && item.description !== itemTitle && (
                    <div
                      className="activity-feed-description"
                      style={{
                        margin: "0 0 6px",
                        fontSize: "12px",
                        color: "var(--text-secondary, #334155)",
                        lineHeight: 1.6,
                        wordBreak: "break-word",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(item.description, {
                          ALLOWED_TAGS: ["p", "br", "b", "strong", "i", "em", "u", "s", "ul", "ol", "li", "span", "a"],
                          ALLOWED_ATTR: ["href", "target", "rel", "style"],
                        }),
                      }}
                    />
                  )}

                  {/* Meta: User & Date */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#64748b" }}>
                    <span style={{ fontWeight: 600, color: "#475569" }}>{t("By: {{name}}", { defaultValue: `By: ${userName}`, name: userName })}</span>
                    <span>•</span>
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
