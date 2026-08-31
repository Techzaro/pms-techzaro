import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Share2, Copy, Check, Users, User, Send, Loader2 } from "lucide-react";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";

export default function ShareKnowledgeModal({ isOpen, onClose, article }) {
  const { t } = useTranslation();
  const notify = useNotification();

  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingOptions, setFetchingOptions] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const articleId = article?.id;
    if (!isOpen || !articleId) return;
    setSelectedUserIds([]);
    setSelectedTeamIds([]);
    setMessage("");
    setCopied(false);

    const token = authToken();
    if (!token) return;

    setFetchingOptions(true);
    Promise.all([
      fetch(`${API_URL}/users?all=1`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(`${API_URL}/teams`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      }).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([usersRes, teamsRes]) => {
        const uList = Array.isArray(usersRes?.data) ? usersRes.data : Array.isArray(usersRes?.users) ? usersRes.users : Array.isArray(usersRes) ? usersRes : [];
        const tList = Array.isArray(teamsRes?.data) ? teamsRes.data : Array.isArray(teamsRes) ? teamsRes : [];
        setUsers(uList);
        setTeams(tList);
      })
      .catch(() => {})
      .finally(() => setFetchingOptions(false));
  }, [isOpen, article?.id]);

  if (!isOpen || !article) return null;

  const articleUrl = `${window.location.origin}${rolePath(`knowledge-base/${article.id}`)}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(articleUrl);
    setCopied(true);
    notify.success(t("Article link copied to clipboard!", { defaultValue: "Article link copied to clipboard!" }));
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0 && selectedTeamIds.length === 0) {
      notify.error(t("Please select at least one teammate or team to share with.", { defaultValue: "Please select at least one teammate or team to share with." }));
      return;
    }

    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base/${article.id}/share`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          user_ids: selectedUserIds,
          team_ids: selectedTeamIds,
          message: message.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Article shared internally successfully!", { defaultValue: "Article shared internally successfully!" }));
        onClose();
      } else {
        notify.error(data.message || t("Failed to share article.", { defaultValue: "Failed to share article." }));
      }
    } catch (e) {
      notify.error(t("An error occurred while sharing article.", { defaultValue: "An error occurred while sharing article." }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "var(--bg-card)", borderRadius: "12px", width: "100%", maxWidth: "520px", border: "1px solid var(--border-color)", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.12)" }}>
        {/* MODAL HEADER */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Share2 size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
              {t("Share Article Internally", { defaultValue: "Share Article Internally" })}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* ARTICLE SUMMARY BADGE */}
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--bg-hover)", border: "1px solid var(--border-color)", marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb", textTransform: "uppercase" }}>
            {article.category || article.categoryRelation?.name || "Article"}
          </span>
          <h4 style={{ margin: "2px 0 0", fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {article.title}
          </h4>
        </div>

        {/* COPY DIRECT LINK ROW */}
        <div style={{ marginBottom: "18px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "var(--text-secondary)" }}>
            {t("Direct Link", { defaultValue: "Direct Link" })}
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              readOnly
              value={articleUrl}
              style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", color: "var(--text-secondary)" }}
            />
            <button
              type="button"
              onClick={handleCopyLink}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: copied ? "#dcfce7" : "var(--bg-hover)",
                color: copied ? "#15803d" : "var(--text-primary)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t("Copied", { defaultValue: "Copied" }) : t("Copy", { defaultValue: "Copy" })}
            </button>
          </div>
        </div>

        {/* SHARE FORM */}
        <form onSubmit={handleShare} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* USERS MULTI SELECT */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px", color: "var(--text-primary)" }}>
              <User size={13} /> {t("Select Teammates", { defaultValue: "Select Teammates" })}
            </label>
            <select
              multiple
              value={selectedUserIds.map(String)}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, (opt) => Number(opt.value));
                setSelectedUserIds(values);
              }}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                fontSize: "12px",
                color: "var(--text-primary)",
                minHeight: "80px",
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email || u.role})
                </option>
              ))}
            </select>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px", display: "block" }}>
              {t("Hold Ctrl (Windows) / Cmd (Mac) to select multiple people.", { defaultValue: "Hold Ctrl (Windows) / Cmd (Mac) to select multiple people." })}
            </span>
          </div>

          {/* TEAMS MULTI SELECT */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px", color: "var(--text-primary)" }}>
              <Users size={13} /> {t("Select Teams (Optional)", { defaultValue: "Select Teams (Optional)" })}
            </label>
            <select
              multiple
              value={selectedTeamIds.map(String)}
              onChange={(e) => {
                const values = Array.from(e.target.selectedOptions, (opt) => Number(opt.value));
                setSelectedTeamIds(values);
              }}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                fontSize: "12px",
                color: "var(--text-primary)",
                minHeight: "60px",
              }}
            >
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </div>

          {/* OPTIONAL MESSAGE */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px", color: "var(--text-primary)" }}>
              {t("Message (Optional)", { defaultValue: "Message (Optional)" })}
            </label>
            <textarea
              placeholder={t("Add a short note explaining what this document is...", { defaultValue: "Add a short note explaining what this document is..." })}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-card)",
                fontSize: "12px",
                color: "var(--text-primary)",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* FOOTER ACTIONS */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: "8px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </button>
            <button
              type="submit"
              disabled={loading || fetchingOptions}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "6px",
                border: "none",
                background: "#2563eb",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {loading ? t("Sharing...", { defaultValue: "Sharing..." }) : t("Share Internally", { defaultValue: "Share Internally" })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
