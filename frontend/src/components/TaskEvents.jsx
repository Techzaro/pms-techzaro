import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Calendar, Clock, Plus, Search, Tag, Trash2, X, Check } from "lucide-react";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import ConfirmModal from "./ConfirmModal";

export default function TaskEvents({ task, taskId, initialEvents = [], readOnly = false, onUpdate }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [events, setEvents] = useState(initialEvents);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Link Modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [allEvents, setAllEvents] = useState([]);
  const [modalSearch, setModalSearch] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);

  useEffect(() => {
    if (initialEvents && initialEvents.length > 0) {
      setEvents(initialEvents);
    } else if (taskId) {
      fetchEvents();
    }
  }, [taskId, initialEvents]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.events) ? data.events : [];
        setEvents(list);
      }
    } catch (err) {
      console.error("Failed to load task events", err);
    } finally {
      setLoading(false);
    }
  };

  const openLinkModal = async () => {
    setShowLinkModal(true);
    setModalLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const evts = Array.isArray(data)
          ? data
          : data.data || data.events || [];
        setAllEvents(evts);
      }
    } catch (err) {
      console.error("Failed to load all events", err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleLink = async (eventId) => {
    setLinkingId(eventId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ event_id: eventId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.events) {
          setEvents(data.events);
        } else {
          fetchEvents();
        }
        setShowLinkModal(false);
        if (onUpdate) onUpdate(data?.task || data);
        publish("task:updated", { taskId, type: "event_linked" });
      }
    } catch (err) {
      console.error("Failed to link event", err);
    } finally {
      setLinkingId(null);
    }
  };

  // Unlink Modal state
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinkTargetId, setUnlinkTargetId] = useState(null);

  const confirmUnlink = async () => {
    if (!unlinkTargetId) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/events/${unlinkTargetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setEvents((prev) => (prev || []).filter((e) => e.id !== unlinkTargetId));
        if (onUpdate) onUpdate(data?.task || data);
        publish("task:updated", { taskId, type: "event_unlinked" });
      }
    } catch (err) {
      console.error("Failed to unlink event", err);
    } finally {
      setUnlinkConfirmOpen(false);
      setUnlinkTargetId(null);
    }
  };

  const filteredEvents = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.title || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q);
  });

  const modalFiltered = allEvents.filter((e) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return (e.title || "").toLowerCase().includes(q) || (e.description || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q);
  });

  const linkedIds = new Set(events.map((e) => e.id));

  return (
    <div className="td-overview" style={{ padding: "20px" }}>
      <div className="td-section-header" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <h2 className="td-section-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <Calendar size={18} color="#2563eb" />
          {t("Linked Events & Announcements", { defaultValue: "Linked Events & Announcements" })}
          <span className="td-section-count">({events.length})</span>
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="pd-files-search" style={{ margin: 0 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder={t("Search events...", { defaultValue: "Search events..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={openLinkModal}
                className="pd-btn-tx pd-btn-tx--outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  background: "var(--bg-card, #ffffff)",
                  color: "var(--text-primary, #1e293b)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Calendar size={15} />
                {t("Link Event", { defaultValue: "Link Event" })}
              </button>
              <button
                type="button"
                onClick={() => navigate(rolePath("events/create"), {
                  state: {
                    taskId: task?.id || taskId,
                    taskTitle: task?.title,
                    projectId: task?.project?.id || task?.project_id,
                    projectTitle: task?.project?.title,
                  }
                })}
                className="pd-btn-tx pd-btn-tx--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  background: "var(--color-primary, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={16} />
                {t("Add Event", { defaultValue: "Add Event" })}
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="td-muted">{t("Loading events...", { defaultValue: "Loading events..." })}</p>
      ) : filteredEvents.length === 0 ? (
        <div style={{ padding: "36px 16px", textAlign: "center", background: "var(--bg-card-alt, #f9fafb)", borderRadius: "8px", border: "1px dashed var(--border-color, #e5e7eb)" }}>
          <Calendar size={36} style={{ color: "#9ca3af", marginBottom: "10px" }} />
          <p style={{ margin: "0 0 14px", color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
            {search ? t("No events match your search.", { defaultValue: "No events match your search." }) : t("No events or announcements linked to this task yet.", { defaultValue: "No events or announcements linked to this task yet." })}
          </p>
          {!readOnly && !search && (
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              <button
                type="button"
                onClick={openLinkModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  borderRadius: "6px",
                  background: "var(--bg-card, #fff)",
                  color: "var(--color-primary, #2563eb)",
                  border: "1px solid var(--border-color, #d1d5db)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Calendar size={14} /> {t("Link Existing Event", { defaultValue: "Link Existing Event" })}
              </button>
              <button
                type="button"
                onClick={() => navigate(rolePath("events/create"), {
                  state: {
                    taskId: task?.id || taskId,
                    taskTitle: task?.title,
                    projectId: task?.project?.id || task?.project_id,
                    projectTitle: task?.project?.title,
                  }
                })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  borderRadius: "6px",
                  background: "var(--color-primary, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> {t("Add Event", { defaultValue: "Add Event" })}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {filteredEvents.map((evt) => (
            <div
              key={evt.id}
              style={{
                background: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: "8px",
                padding: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary, #111827)" }}>
                  {evt.title}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => {
                      setUnlinkTargetId(evt.id);
                      setUnlinkConfirmOpen(true);
                    }}
                    title={t("Unlink Event", { defaultValue: "Unlink Event" })}
                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "2px" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {evt.type && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: evt.color ? `${evt.color}20` : "#EEF2FF",
                      color: evt.color || "#4F46E5",
                      fontWeight: 600,
                      textTransform: "capitalize",
                    }}
                  >
                    {evt.type}
                  </span>
                </div>
              )}

              <div style={{ fontSize: "12px", color: "var(--text-secondary, #6b7280)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Clock size={13} />
                <span>
                  {new Date(evt.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Link Event Modal */}
      {showLinkModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLinkModal(false); }}
        >
          <div
            style={{
              background: "var(--bg-card, #ffffff)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color, #e5e7eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                <Calendar size={18} />
                {t("Link Event & Announcement", { defaultValue: "Link Event & Announcement" })}
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-color, #f3f4f6)" }}>
              <div className="pd-files-search" style={{ margin: 0, width: "100%" }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder={t("Search events by title, description or type...", { defaultValue: "Search events by title, description or type..." })}
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Modal List */}
            <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {modalLoading ? (
                <p className="td-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                  {t("Loading events...", { defaultValue: "Loading events..." })}
                </p>
              ) : modalFiltered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
                  {t("No calendar events found.", { defaultValue: "No calendar events found." })}
                </div>
              ) : (
                modalFiltered.map((evt) => {
                  const isAlreadyLinked = linkedIds.has(evt.id);
                  return (
                    <div
                      key={evt.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color, #e5e7eb)",
                        background: isAlreadyLinked ? "#F0FDF4" : "var(--bg-card, #ffffff)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary, #111827)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {evt.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted, #6b7280)", marginTop: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
                          {evt.type && (
                            <span style={{ textTransform: "capitalize", fontWeight: 500, color: evt.color || "#4F46E5" }}>
                              {evt.type}
                            </span>
                          )}
                          <span>
                            {evt.start_date ? new Date(evt.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                          </span>
                        </div>
                      </div>

                      <div>
                        {isAlreadyLinked ? (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#16A34A",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Check size={14} /> {t("Linked", { defaultValue: "Linked" })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLink(evt.id)}
                            disabled={linkingId === evt.id}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              background: "var(--color-primary, #2563eb)",
                              color: "#ffffff",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: linkingId === evt.id ? "not-allowed" : "pointer",
                              opacity: linkingId === evt.id ? 0.7 : 1,
                            }}
                          >
                            {linkingId === evt.id ? t("Linking...", { defaultValue: "Linking..." }) : t("Link", { defaultValue: "Link" })}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border-color, #e5e7eb)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-card-alt, #f9fafb)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  navigate(rolePath("events"));
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-primary, #2563eb)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Plus size={13} /> {t("View Events Calendar", { defaultValue: "View Events Calendar" })}
              </button>

              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "transparent",
                  color: "var(--text-primary, #374151)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("Close", { defaultValue: "Close" })}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Confirm Unlink Modal */}
      <ConfirmModal
        isOpen={unlinkConfirmOpen}
        onClose={() => {
          setUnlinkConfirmOpen(false);
          setUnlinkTargetId(null);
        }}
        onConfirm={confirmUnlink}
        title={t("Confirm Unlink", { defaultValue: "Confirm Unlink" })}
        message={t("Are you sure you want to unlink this event?", { defaultValue: "Are you sure you want to unlink this event?" })}
        confirmText={t("Unlink", { defaultValue: "Unlink" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
    </div>
  );
}
