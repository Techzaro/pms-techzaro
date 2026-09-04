import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Users, Search, Crown, UserCheck, Eye, Shield, Mail } from "lucide-react";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

export default function TaskMembers({ task, assignees = [], followers = [], assigner = null }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  // Build unified unique members list with their relation to this task
  const memberMap = new Map();

  if (assigner) {
    memberMap.set(String(assigner.id), {
      ...assigner,
      relationship: t("Assigner / Creator", { defaultValue: "Assigner / Creator" }),
      isPrimary: true,
      badgeColor: "#F59E0B",
      badgeBg: "#FEF3C7",
    });
  }

  (assignees || []).forEach((u) => {
    const key = String(u.id);
    if (memberMap.has(key)) {
      const existing = memberMap.get(key);
      existing.relationship += `, ${t("Assignee", { defaultValue: "Assignee" })}`;
    } else {
      memberMap.set(key, {
        ...u,
        relationship: t("Assignee", { defaultValue: "Assignee" }),
        badgeColor: "#2563EB",
        badgeBg: "#EFF6FF",
      });
    }
  });

  if (task?.currentOwner && !memberMap.has(String(task.currentOwner.id))) {
    memberMap.set(String(task.currentOwner.id), {
      ...task.currentOwner,
      relationship: t("Current Owner", { defaultValue: "Current Owner" }),
      badgeColor: "#7C3AED",
      badgeBg: "#EDE9FE",
    });
  }

  (followers || []).forEach((u) => {
    const key = String(u.id);
    if (memberMap.has(key)) {
      const existing = memberMap.get(key);
      existing.relationship += `, ${t("Follower", { defaultValue: "Follower" })}`;
    } else {
      memberMap.set(key, {
        ...u,
        relationship: t("Follower", { defaultValue: "Follower" }),
        badgeColor: "#8B5CF6",
        badgeBg: "#F5F3FF",
      });
    }
  });

  // Include project team members if available and not already added
  if (task?.project?.team?.members) {
    task.project.team.members.forEach((u) => {
      const key = String(u.id);
      if (!memberMap.has(key)) {
        memberMap.set(key, {
          ...u,
          relationship: t("Team Member", { defaultValue: "Team Member" }),
          badgeColor: "#6B7280",
          badgeBg: "#F3F4F6",
        });
      }
    });
  }

  const allMembers = Array.from(memberMap.values());

  const filtered = allMembers.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.role || "").toLowerCase().includes(q) ||
      (m.relationship || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="td-overview" style={{ padding: "20px" }}>
      <div
        className="td-section-header"
        style={{
          marginBottom: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <h2 className="td-section-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <Users size={18} />
          {t("Task Members & Collaborators", { defaultValue: "Task Members & Collaborators" })}
          <span className="td-section-count">({allMembers.length})</span>
        </h2>
        <div className="pd-files-search" style={{ margin: 0 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder={t("Search by member name, role, email...", { defaultValue: "Search by member name, role, email..." })}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            background: "var(--bg-card-alt, #f9fafb)",
            borderRadius: "8px",
            border: "1px dashed var(--border-color, #e5e7eb)",
          }}
        >
          <Users size={32} style={{ color: "#9ca3af", marginBottom: "8px" }} />
          <p style={{ margin: 0, color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
            {search
              ? t("No members match your search.", { defaultValue: "No members match your search." })
              : t("No members assigned to this task.", { defaultValue: "No members assigned to this task." })}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
          {filtered.map((m) => (
            <div
              key={m.id}
              style={{
                background: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: "8px",
                padding: "14px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <div
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  backgroundColor: m.badgeColor ? `${m.badgeColor}20` : "#EEF2FF",
                  color: m.badgeColor || "#4F46E5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "14px",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {m.avatar ? (
                  <img src={m.avatar} alt={m.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  initials(m.name)
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary, #111827)" }}>
                    {m.name}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary, #6b7280)", marginTop: "2px", textTransform: "capitalize" }}>
                  {m.role ? m.role.replace(/_/g, " ") : "Member"}
                </div>
                {m.email && (
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #9ca3af)", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                    <Mail size={11} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</span>
                  </div>
                )}
              </div>

              <div style={{ flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: "11px",
                    padding: "3px 8px",
                    borderRadius: "12px",
                    background: m.badgeBg || "#F3F4F6",
                    color: m.badgeColor || "#374151",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {m.relationship}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
