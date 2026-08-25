import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import "./EventsPage.css";
import {
  Calendar,
  Plus,
  Search,
  MapPin,
  Clock,
  Users,
  Megaphone,
  Loader2,
  Video,
  Edit,
  Trash2,
  X,
  ExternalLink,
  Lock,
  Building,
  ShieldCheck,
  CalendarDays,
  List,
} from "lucide-react";

export default function EventsList() {
  const user = getUser();
  const notify = useNotification();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [viewMode, setViewMode] = useState("list");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");

  // Modals
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [viewingEvent, setViewingEvent] = useState(null);

  // Fetch categories from API
  const fetchCategories = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/event-categories`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const d = await res.json();
        setCategories(Array.isArray(d?.data) ? d.data : []);
      }
    } catch (e) {
      console.error("Error loading event categories", e);
    }
  };

  // Fetch events from API
  const fetchEvents = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events?all=true`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      if (res.ok) {
        const d = await res.json();
        setEvents(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []);
      }
    } catch (e) {
      notify.error("Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchEvents();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingEvent?.id) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${deletingEvent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        notify.success("Event deleted successfully.");
        fetchEvents();
      } else {
        notify.error("Failed to delete event.");
      }
    } catch (e) {
      notify.error("An error occurred while deleting event.");
    } finally {
      setDeletingEvent(null);
    }
  };

  // Filtered Events with Safe Array Guards
  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events)) return [];

    return events.filter((ev) => {
      if (!ev) return false;

      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        ev.title?.toLowerCase().includes(q) ||
        ev.description?.toLowerCase().includes(q) ||
        ev.location?.toLowerCase().includes(q) ||
        ev.category?.name?.toLowerCase().includes(q);

      const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_announcement || ev.is_global;

      let matchesType = true;
      if (typeFilter === "announcement") matchesType = isAnnounce;
      if (typeFilter === "event") matchesType = !isAnnounce;

      const matchesCat =
        categoryFilter === "all" ||
        ev.category_id === Number(categoryFilter) ||
        ev.category?.id === Number(categoryFilter) ||
        ev.category?.name === categoryFilter;

      const matchesVis = visibilityFilter === "all" || ev.visibility_level === visibilityFilter;

      let matchesMonth = true;
      if (selectedMonth && ev.start_date) {
        matchesMonth = ev.start_date.startsWith(selectedMonth);
      }

      return matchesSearch && matchesType && matchesCat && matchesVis && matchesMonth;
    });
  }, [events, search, typeFilter, categoryFilter, visibilityFilter, selectedMonth]);

  // Group by Month for Month View
  const groupedEventsByMonth = useMemo(() => {
    if (!Array.isArray(filteredEvents)) return {};

    const groups = {};
    filteredEvents.forEach((ev) => {
      if (!ev) return;
      const dateStr = ev.start_date || ev.event_date || ev.created_at;
      let monthKey = "Upcoming / Unscheduled";
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          monthKey = d.toLocaleString("default", { month: "long", year: "numeric" });
        }
      }
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(ev);
    });
    return groups;
  }, [filteredEvents]);

  const visibilityBadge = (level, isGlobal) => {
    if (isGlobal || level === "organization") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fef3c7", color: "#b45309" }}>
          <ShieldCheck size={12} /> Organization
        </span>
      );
    }
    switch (level) {
      case "private":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563" }}>
            <Lock size={12} /> Private
          </span>
        );
      case "project_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#eff6ff", color: "#1d4ed8" }}>
            <Users size={12} /> Project Team
          </span>
        );
      case "team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#ede9fe", color: "#6d28d9" }}>
            <Users size={12} /> Team
          </span>
        );
      case "department_team":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f0fdf4", color: "#15803d" }}>
            <Building size={12} /> Department
          </span>
        );
      case "custom":
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fdf2f8", color: "#be185d" }}>
            <Users size={12} /> Custom
          </span>
        );
      default:
        return null;
    }
  };

  const breadcrumbs = [{ label: "Events & Announcements" }];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ padding: "0 4px" }}>
        {/* HEADER BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={24} color="#2563eb" /> Events & Announcements
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Stay updated on company announcements, workshops, meetings, and project milestones.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* VIEW MODE TOGGLE */}
            <div style={{ display: "flex", background: "var(--bg-hover)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: viewMode === "list" ? "var(--bg-card)" : "transparent",
                  color: viewMode === "list" ? "#2563eb" : "var(--text-secondary)",
                  fontWeight: viewMode === "list" ? 600 : 500,
                  fontSize: "12px",
                  cursor: "pointer",
                  boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <List size={14} /> Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "5px 10px",
                  borderRadius: "6px",
                  border: "none",
                  background: viewMode === "grouped" ? "var(--bg-card)" : "transparent",
                  color: viewMode === "grouped" ? "#2563eb" : "var(--text-secondary)",
                  fontWeight: viewMode === "grouped" ? 600 : 500,
                  fontSize: "12px",
                  cursor: "pointer",
                  boxShadow: viewMode === "grouped" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
              >
                <CalendarDays size={14} /> Grouped by Month
              </button>
            </div>

            <button
              onClick={() => navigate(rolePath("events/create"))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "#2563eb",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <Plus size={16} /> New Event / Announcement
            </button>
          </div>
        </div>

        {/* TOOLBAR & FILTERS */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
          {/* SEARCH */}
          <div style={{ position: "relative", flex: 1, minWidth: "220px" }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={16} />
            <input
              type="text"
              placeholder="Search by title, location, description, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* TYPE TOGGLE */}
          <div style={{ display: "flex", background: "var(--bg-hover)", padding: "3px", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
            {[
              { key: "all", label: "All" },
              { key: "event", label: "📅 Events" },
              { key: "announcement", label: "📢 Announcements" },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "5px",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: typeFilter === t.key ? 600 : 500,
                  background: typeFilter === t.key ? "#2563eb" : "transparent",
                  color: typeFilter === t.key ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* CATEGORY FILTER */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)" }}
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          {/* VISIBILITY FILTER */}
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)" }}
          >
            <option value="all">All Visibilities</option>
            <option value="organization">Organization</option>
            <option value="department_team">Department Team</option>
            <option value="project_team">Project Team</option>
            <option value="team">Team</option>
            <option value="custom">Custom</option>
            <option value="private">Private</option>
          </select>
        </div>

        {/* EVENTS LIST VIEW */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
            <Loader2 className="animate-spin" size={36} style={{ margin: "0 auto 12px", color: "#2563eb" }} />
            Loading events and announcements...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <Calendar size={48} style={{ color: "#9ca3af", margin: "0 auto 12px" }} />
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>No events or announcements found</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
              Create an event or company announcement to notify team members.
            </p>
            <button
              onClick={() => navigate(rolePath("events/create"))}
              style={{ padding: "8px 18px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> Create Event
            </button>
          </div>
        ) : viewMode === "list" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
            {filteredEvents.map((ev) => renderEventCard(ev))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            {Object.keys(groupedEventsByMonth).map((monthName) => (
              <div key={monthName}>
                <h3 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <CalendarDays size={18} color="#2563eb" /> {monthName} ({groupedEventsByMonth[monthName]?.length || 0})
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" }}>
                  {Array.isArray(groupedEventsByMonth[monthName])
                    ? groupedEventsByMonth[monthName].map((ev) => renderEventCard(ev))
                    : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* EVENT DETAILS / VIEW MODAL */}
      {viewingEvent && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "90vh", overflowY: "auto", border: "1px solid var(--border-color)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)", padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }}>
                  {viewingEvent.is_announcement ? (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Megaphone size={12} /> Company Announcement
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: viewingEvent.category?.color || "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                      {viewingEvent.category?.name || viewingEvent.type || "Event"}
                    </span>
                  )}
                  {visibilityBadge(viewingEvent.visibility_level, viewingEvent.is_global)}
                </div>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{viewingEvent.title}</h2>
              </div>
              <button onClick={() => setViewingEvent(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={20} />
              </button>
            </div>

            {/* DATE & LOCATION */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", marginBottom: "16px", fontSize: "13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                <Clock size={16} color="#2563eb" />
                <span>
                  {viewingEvent.start_date ? new Date(viewingEvent.start_date).toLocaleString([], { dateStyle: "full", timeStyle: viewingEvent.all_day ? undefined : "short" }) : "Date not set"}
                  {viewingEvent.end_date && viewingEvent.end_date !== viewingEvent.start_date && (
                    <span> &ndash; {new Date(viewingEvent.end_date).toLocaleString([], { dateStyle: "medium", timeStyle: viewingEvent.all_day ? undefined : "short" })}</span>
                  )}
                  {viewingEvent.all_day && <span style={{ marginLeft: "6px", fontWeight: 600, color: "#2563eb" }}>(All Day)</span>}
                </span>
              </div>

              {viewingEvent.location && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                  <MapPin size={16} color="#ef4444" />
                  <span>{viewingEvent.location}</span>
                </div>
              )}

              {viewingEvent.meeting_link && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Video size={16} color="#10b981" />
                  <a
                    href={viewingEvent.meeting_link.startsWith("http") ? viewingEvent.meeting_link : "https://" + viewingEvent.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    Join Video Meeting <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            {/* DESCRIPTION */}
            {viewingEvent.description && (
              <div style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-primary)", whiteSpace: "pre-wrap", marginBottom: "20px" }}>
                {viewingEvent.description}
              </div>
            )}

            {/* PARTICIPANTS */}
            {Array.isArray(viewingEvent.assigned_users) && viewingEvent.assigned_users.length > 0 && (
              <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "14px", marginBottom: "16px" }}>
                <h4 style={{ margin: "0 0 8px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                  Invited Attendees ({viewingEvent.assigned_users.length})
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {viewingEvent.assigned_users.map((u) => (
                    <span key={u?.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "var(--bg-hover)", padding: "4px 10px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
                      <span style={{ width: "18px", height: "18px", borderRadius: "50%", background: "#2563eb", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700 }}>
                        {u?.name?.charAt(0).toUpperCase() || "U"}
                      </span>
                      {u?.name || "User"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* FOOTER ACTIONS */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginTop: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Organized by <strong>{viewingEvent.organizer_name || viewingEvent.creator_name || "System"}</strong>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                {(viewingEvent.user_id === user.id || viewingEvent.organizer_id === user.id || ["admin", "manager"].includes(user.role)) && (
                  <button
                    onClick={() => {
                      const id = viewingEvent.id;
                      setViewingEvent(null);
                      navigate(rolePath(`events/edit/${id}`));
                    }}
                    style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <Edit size={14} /> Edit
                  </button>
                )}
                <button
                  onClick={() => setViewingEvent(null)}
                  style={{ padding: "6px 16px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      <ConfirmModal
        isOpen={!!deletingEvent}
        onClose={() => setDeletingEvent(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Event / Announcement"
        message={`Are you sure you want to delete "${deletingEvent?.title}"? This will cancel notifications and delete all attendee records.`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
      />
    </DashboardLayout>
  );

  function renderEventCard(ev) {
    if (!ev) return null;
    const canEditDelete = ev.user_id === user.id || ev.organizer_id === user.id || ["admin", "manager"].includes(user.role);
    const isAnnounce = ev.is_announcement || ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_global;

    const startDateObj = ev.start_date ? new Date(ev.start_date) : null;
    const monthStr = startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.toLocaleString("default", { month: "short" }).toUpperCase() : "DATE";
    const dayStr = startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.getDate() : "--";
    const timeStr = startDateObj && !isNaN(startDateObj.getTime()) && !ev.all_day ? startDateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (ev.all_day ? "All Day" : "");

    return (
      <div
        key={ev.id}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: "12px",
          padding: "18px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          transition: "all 0.15s ease",
        }}
      >
        <div>
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "8px" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              {isAnnounce ? (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Megaphone size={12} /> Announcement
                </span>
              ) : (
                <span style={{ fontSize: "11px", fontWeight: 700, color: ev.category?.color || "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                  {ev.category?.name || ev.type || "Event"}
                </span>
              )}
              {visibilityBadge(ev.visibility_level, ev.is_global)}
            </div>

            {canEditDelete && (
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  onClick={() => navigate(rolePath(`events/edit/${ev.id}`))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                  title="Edit Event"
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={() => setDeletingEvent(ev)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px" }}
                  title="Delete Event"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* DATE TILE & TITLE */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
            <div style={{ width: "46px", height: "50px", borderRadius: "8px", background: isAnnounce ? "#fef3c7" : "#eff6ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, border: isAnnounce ? "1px solid #fde68a" : "1px solid #bfdbfe" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: isAnnounce ? "#b45309" : "#1d4ed8" }}>{monthStr}</span>
              <span style={{ fontSize: "18px", fontWeight: 800, lineHeight: 1, color: isAnnounce ? "#92400e" : "#1e40af" }}>{dayStr}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <h3
                onClick={() => setViewingEvent(ev)}
                style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.3 }}
              >
                {ev.title || "Untitled Event"}
              </h3>
              {timeStr && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} /> {timeStr}
                </div>
              )}
            </div>
          </div>

          {/* DESCRIPTION */}
          {ev.description && (
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)", minHeight: "36px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.4" }}>
              {ev.description}
            </p>
          )}

          {/* LOCATION OR MEETING LINK */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px", fontSize: "12px" }}>
            {ev.location && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
                <MapPin size={13} color="#ef4444" /> {ev.location}
              </span>
            )}
            {ev.meeting_link && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#2563eb", fontWeight: 500 }}>
                <Video size={13} color="#10b981" /> Virtual Meeting
              </span>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {Array.isArray(ev.assigned_users) && ev.assigned_users.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ display: "flex", marginLeft: "4px" }}>
                  {ev.assigned_users.slice(0, 3).map((u, i) => (
                    <div
                      key={u?.id || i}
                      title={u?.name}
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "50%",
                        background: "#2563eb",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        fontWeight: 700,
                        marginLeft: i > 0 ? "-6px" : 0,
                        border: "2px solid var(--bg-card)",
                      }}
                    >
                      {u?.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>
                  {ev.assigned_users.length} {ev.assigned_users.length === 1 ? "attendee" : "attendees"}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                By: {ev.organizer_name || ev.creator_name || "System"}
              </span>
            )}
          </div>

          <button
            onClick={() => setViewingEvent(ev)}
            style={{
              padding: "5px 12px",
              borderRadius: "6px",
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Details
          </button>
        </div>
      </div>
    );
  }
}
