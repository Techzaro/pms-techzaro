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
  const [users, setUsers] = useState(() => (Array.isArray(initialUsers) && initialUsers.length > 0 ? initialUsers : []));
  const [loading, setLoading] = useState(true);

  // Filter States
  const [dateFilter, setDateFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const fetchUnifiedActivity = React.useCallback(async () => {
    try {
      setLoading(true);
      const token = authToken();
      const params = new URLSearchParams();
      if (dateFilter) {
        let cleanDate = dateFilter.trim();
        if (/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.test(cleanDate)) {
          const parts = cleanDate.split(/[\/\-]/);
          const p1 = parseInt(parts[0], 10);
          const p2 = parseInt(parts[1], 10);
          const year = parts[2];
          if (p1 > 12) {
            cleanDate = `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
          } else {
            cleanDate = `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
          }
        }
        params.append("date", cleanDate);
      }
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
  }, [module, entityId, dateFilter, userFilter, typeFilter]);

  // Fetch activity data when filters or entity changes
  useEffect(() => {
    fetchUnifiedActivity();
  }, [fetchUnifiedActivity]);

  // Sync initialUsers if prop updates later
  useEffect(() => {
    if (Array.isArray(initialUsers) && initialUsers.length > 0) {
      setUsers((prev) => {
        const map = new Map();
        initialUsers.forEach((u) => {
          if (u && u.id) map.set(String(u.id), u);
        });
        prev.forEach((u) => {
          if (u && u.id && !map.has(String(u.id))) map.set(String(u.id), u);
        });
        return Array.from(map.values());
      });
    }
  }, [initialUsers]);

  // Fetch users on mount to ensure complete person dropdown list
  useEffect(() => {
    const token = authToken();
    if (!token) return;
    fetch(`${API_URL}/users?all=1`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const uList = Array.isArray(d?.data) ? d.data : Array.isArray(d?.users) ? d.users : Array.isArray(d) ? d : [];
        if (uList.length > 0) {
          setUsers((prev) => {
            const map = new Map();
            prev.forEach((u) => {
              if (u && u.id) map.set(String(u.id), u);
            });
            uList.forEach((u) => {
              if (u && u.id && !map.has(String(u.id))) map.set(String(u.id), u);
            });
            return Array.from(map.values());
          });
        }
      })
      .catch(() => {});
  }, []);

  const userOptions = useMemo(() => {
    const map = new Map();
    users.forEach((u) => {
      if (u && u.id) {
        const name = u.name || (u.first_name ? `${u.first_name} ${u.last_name || ""}`.trim() : null) || u.email || `User #${u.id}`;
        map.set(String(u.id), name);
      }
    });
    activities.forEach((act) => {
      if (act.user_id && !map.has(String(act.user_id))) {
        const name = act.user_name || act.user?.name || (act.user?.first_name ? `${act.user.first_name} ${act.user.last_name || ""}`.trim() : null) || `User #${act.user_id}`;
        map.set(String(act.user_id), name);
      }
    });

    const opts = [{ value: "", label: t("All Persons", { defaultValue: "All Persons" }) }];
    map.forEach((name, id) => {
      opts.push({ value: String(id), label: name });
    });
    return opts;
  }, [users, activities, t]);

  const typeOptions = useMemo(() => {
    switch (module) {
      case "knowledge_base":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "kb_created", label: t("Published / Created", { defaultValue: "Published / Created" }) },
          { value: "kb_updated", label: t("Edited / Updated", { defaultValue: "Edited / Updated" }) },
          { value: "kb_duplicated", label: t("Duplicated", { defaultValue: "Duplicated" }) },
          { value: "kb_archived", label: t("Archived", { defaultValue: "Archived" }) },
          { value: "kb_restored", label: t("Restored", { defaultValue: "Restored" }) },
          { value: "kb_favorited", label: t("Favorited", { defaultValue: "Favorited" }) },
          { value: "kb_shared", label: t("Shared", { defaultValue: "Shared" }) },
          { value: "kb_downloaded", label: t("Downloaded", { defaultValue: "Downloaded" }) },
        ];
      case "event":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "event_created", label: t("Created", { defaultValue: "Created" }) },
          { value: "event_updated", label: t("Updated", { defaultValue: "Updated" }) },
          { value: "rsvp", label: t("RSVP", { defaultValue: "RSVP" }) },
          { value: "rescheduled", label: t("Rescheduled", { defaultValue: "Rescheduled" }) },
        ];
      case "regional_settings":
      case "user_settings":
      case "settings":
        return [
          { value: "all", label: t("All Types", { defaultValue: "All Types" }) },
          { value: "timezone_updated", label: t("Timezone", { defaultValue: "Timezone" }) },
          { value: "language_updated", label: t("Language", { defaultValue: "Language" }) },
          { value: "date_format_updated", label: t("Date Format", { defaultValue: "Date Format" }) },
          { value: "time_format_updated", label: t("Time Format", { defaultValue: "Time Format" }) },
          { value: "working_hours_updated", label: t("Working Hours", { defaultValue: "Working Hours" }) },
          { value: "configuration_changed", label: t("Config Changed", { defaultValue: "Config Changed" }) },
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
          { value: "timezone_updated", label: t("Timezone", { defaultValue: "Timezone" }) },
          { value: "language_updated", label: t("Language", { defaultValue: "Language" }) },
          { value: "date_format_updated", label: t("Date Format", { defaultValue: "Date Format" }) },
          { value: "time_format_updated", label: t("Time Format", { defaultValue: "Time Format" }) },
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
      case "kb_created":
      case "created":
      case "published":
      case "event_created":
        return <CheckCircle2 size={15} color="#16a34a" />;
      case "kb_updated":
      case "updated":
      case "edited":
      case "event_updated":
        return <Sliders size={15} color="#0284c7" />;
      case "kb_duplicated":
      case "duplicated":
        return <RefreshCw size={15} color="#6366f1" />;
      case "kb_archived":
      case "archived":
        return <XCircle size={15} color="#d97706" />;
      case "kb_restored":
      case "restored":
      case "kb_version_restored":
        return <CheckCircle2 size={15} color="#16a34a" />;
      case "kb_favorited":
      case "favorite":
      case "favorited":
      case "kb_unfavorited":
      case "unfavorite":
        return <CheckCircle2 size={15} color="#f59e0b" />;
      case "kb_shared":
      case "shared":
        return <FileText size={15} color="#2563eb" />;
      case "kb_downloaded":
      case "download":
      case "downloaded":
        return <FileText size={15} color="#059669" />;
      case "rsvp":
        return <CheckCircle2 size={15} color="#2563eb" />;
      case "rescheduled":
        return <RefreshCw size={15} color="#ea580c" />;
      case "timezone_updated":
      case "timezone":
      case "language_updated":
      case "language":
      case "date_format_updated":
      case "date_format":
      case "time_format_updated":
      case "time_format":
      case "working_hours_updated":
      case "working_hours":
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
      case "kb_created":
      case "created":
      case "published":
      case "event_created":
        return { bg: "#f0fdf4", color: "#16a34a", label: t("Published", { defaultValue: "Published" }) };
      case "kb_updated":
      case "updated":
      case "edited":
      case "event_updated":
        return { bg: "#f0f9ff", color: "#0284c7", label: t("Edited", { defaultValue: "Edited" }) };
      case "kb_duplicated":
      case "duplicated":
        return { bg: "#eef2ff", color: "#6366f1", label: t("Duplicated", { defaultValue: "Duplicated" }) };
      case "kb_archived":
      case "archived":
        return { bg: "#fef3c7", color: "#d97706", label: t("Archived", { defaultValue: "Archived" }) };
      case "kb_restored":
      case "restored":
      case "kb_version_restored":
        return { bg: "#f0fdf4", color: "#16a34a", label: t("Restored", { defaultValue: "Restored" }) };
      case "kb_favorited":
      case "favorite":
      case "favorited":
        return { bg: "#fef3c7", color: "#b45309", label: t("Favorited", { defaultValue: "Favorited" }) };
      case "kb_unfavorited":
      case "unfavorite":
        return { bg: "#f3f4f6", color: "#6b7280", label: t("Unfavorited", { defaultValue: "Unfavorited" }) };
      case "kb_shared":
      case "shared":
        return { bg: "#eff6ff", color: "#2563eb", label: t("Shared", { defaultValue: "Shared" }) };
      case "kb_downloaded":
      case "download":
      case "downloaded":
        return { bg: "#ecfdf5", color: "#059669", label: t("Downloaded", { defaultValue: "Downloaded" }) };
      case "rsvp":
        return { bg: "#eff6ff", color: "#2563eb", label: t("RSVP", { defaultValue: "RSVP" }) };
      case "rescheduled":
        return { bg: "#fff7ed", color: "#ea580c", label: t("Rescheduled", { defaultValue: "Rescheduled" }) };
      case "timezone_updated":
      case "timezone":
        return { bg: "#faf5ff", color: "#8b5cf6", label: t("Timezone", { defaultValue: "Timezone" }) };
      case "language_updated":
      case "language":
        return { bg: "#f0fdf4", color: "#16a34a", label: t("Language", { defaultValue: "Language" }) };
      case "date_format_updated":
      case "date_format":
        return { bg: "#eff6ff", color: "#2563eb", label: t("Date Format", { defaultValue: "Date Format" }) };
      case "time_format_updated":
      case "time_format":
        return { bg: "#fff7ed", color: "#ea580c", label: t("Time Format", { defaultValue: "Time Format" }) };
      case "working_hours_updated":
      case "working_hours":
        return { bg: "#fef3c7", color: "#d97706", label: t("Working Hours", { defaultValue: "Working Hours" }) };
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

  const getActivityTitle = (item, type) => {
    const rawAction = (item?.action || "").toLowerCase().trim();
    const rawType = (type || item?.type || item?.activity_type || "").toLowerCase().trim();
    const key = rawType || rawAction;

    switch (key) {
      case "language_updated":
      case "language":
        return t("Language Updated", { defaultValue: "Language Updated" });
      case "timezone_updated":
      case "timezone":
        return t("Timezone Updated", { defaultValue: "Timezone Updated" });
      case "date_format_updated":
      case "date_format":
        return t("Date Format Updated", { defaultValue: "Date Format Updated" });
      case "time_format_updated":
      case "time_format":
        return t("Time Format Updated", { defaultValue: "Time Format Updated" });
      case "working_hours_updated":
      case "working_hours":
        return t("Working Hours Updated", { defaultValue: "Working Hours Updated" });
      case "kb_created":
        return t("Article Published", { defaultValue: "Article Published" });
      case "kb_updated":
        return t("Article Updated", { defaultValue: "Article Updated" });
      case "kb_duplicated":
        return t("Article Duplicated", { defaultValue: "Article Duplicated" });
      case "kb_archived":
        return t("Article Archived", { defaultValue: "Article Archived" });
      case "kb_restored":
      case "kb_version_restored":
        return t("Article Restored", { defaultValue: "Article Restored" });
      case "kb_favorited":
        return t("Article Favorited", { defaultValue: "Article Favorited" });
      case "kb_unfavorited":
        return t("Article Unfavorited", { defaultValue: "Article Unfavorited" });
      case "kb_shared":
        return t("Article Shared", { defaultValue: "Article Shared" });
      case "kb_downloaded":
        return t("Attachment Downloaded", { defaultValue: "Attachment Downloaded" });
      case "event_created":
        return t("Event Created", { defaultValue: "Event Created" });
      case "event_updated":
        return t("Event Updated", { defaultValue: "Event Updated" });
      case "rsvp":
        return t("Event RSVP", { defaultValue: "Event RSVP" });
      case "rescheduled":
        return t("Event Rescheduled", { defaultValue: "Event Rescheduled" });
      case "update_regional_settings":
      case "configuration_changed":
        return t("Regional Settings Updated", { defaultValue: "Regional Settings Updated" });
      default:
        break;
    }

    if (item?.title && item.title !== "Activity Event" && !item.title.toLowerCase().includes("configuration changed")) {
      return item.title;
    }
    if (item?.action) {
      return item.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return item?.entity_name || (item?.description ? item.description.replace(/<[^>]*>?/gm, "").slice(0, 40) : null) || t("Activity Event", { defaultValue: "Activity Event" });
  };

  const isFiltered = Boolean(dateFilter || userFilter || (typeFilter && typeFilter !== "all"));

  return (
    <div
      className="td-card unified-activity-feed"
      style={{
        background: "var(--bg-card, #ffffff)",
        border: "1px solid var(--border-color, #e2e8f0)",
        borderRadius: "12px",
        padding: "18px 20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        boxSizing: "border-box",
        width: "100%",
        marginBottom: "20px",
        fontFamily: "inherit",
      }}
    >
      {/* HEADER BAR */}
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
        <div style={{ flex: "1 1 140px", minWidth: 130 }}>
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
            const itemTitle = getActivityTitle(item, itemType);

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
