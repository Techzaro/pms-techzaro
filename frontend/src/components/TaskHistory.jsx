import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { History as HistoryIcon, Clock, User, ArrowRight, Search, FileText } from "lucide-react";

export default function TaskHistory({ task, workflowEvents = [], changes = [] }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const combinedEvents = [
    ...(workflowEvents || task?.workflowEvents || []).map((e) => ({
      id: `we-${e.id}`,
      type: "workflow",
      event_type: e.event_type || e.action,
      user: e.user?.name || "System",
      created_at: e.created_at,
      details: e.details || e.note || "",
    })),
    ...(changes || task?.changes || []).map((c) => ({
      id: `ch-${c.id}`,
      type: "change",
      event_type: `Updated ${c.field_name || "Field"}`,
      user: c.modifiedBy?.name || c.modified_by || "User",
      created_at: c.created_at,
      details: `${c.old_value || "None"} → ${c.new_value || "None"}`,
    })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const filtered = combinedEvents.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (item.event_type || "").toLowerCase().includes(q) ||
      (item.user || "").toLowerCase().includes(q) ||
      (item.details || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="td-overview" style={{ padding: "20px" }}>
      <div className="td-section-header" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <h2 className="td-section-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <HistoryIcon size={18} />
          {t("Task History & Audit Trail", { defaultValue: "Task History & Audit Trail" })}
          <span className="td-section-count">({combinedEvents.length})</span>
        </h2>
        <div className="pd-files-search" style={{ margin: 0 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder={t("Search history...", { defaultValue: "Search history..." })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: "32px 16px", textAlign: "center", background: "var(--bg-card-alt, #f9fafb)", borderRadius: "8px", border: "1px dashed var(--border-color, #e5e7eb)" }}>
          <HistoryIcon size={32} style={{ color: "#9ca3af", marginBottom: "8px" }} />
          <p style={{ margin: 0, color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
            {search ? t("No history items match your search.", { defaultValue: "No history items match your search." }) : t("No history recorded for this task yet.", { defaultValue: "No history recorded for this task yet." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: "8px",
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--text-primary, #111827)",
                      textTransform: "capitalize",
                    }}
                  >
                    {item.event_type.replace(/_/g, " ")}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      background: item.type === "workflow" ? "#EEF2FF" : "#F3F4F6",
                      color: item.type === "workflow" ? "#4F46E5" : "#4B5563",
                    }}
                  >
                    {item.type}
                  </span>
                </div>
                {item.details && (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary, #4b5563)", marginTop: "2px" }}>
                    {item.details}
                  </div>
                )}
                <div style={{ fontSize: "11px", color: "var(--text-muted, #9ca3af)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <User size={11} />
                  <span>{item.user}</span>
                </div>
              </div>

              <div style={{ fontSize: "11px", color: "var(--text-muted, #9ca3af)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "4px" }}>
                <Clock size={12} />
                <span>{new Date(item.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
