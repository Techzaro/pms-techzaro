/**
 * EventsPage.jsx
 * Dedicated page for Event Assigning vs Announcing, Attendees, Event Filters, and Event CRUD operations.
 */

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { useApiQuery, useApiMutation } from "../hooks/useApi";
import { useNotification } from "../context/NotificationContext";
import { Calendar, Plus, Search, MapPin, Clock, Users, Megaphone, Loader2, Check } from "lucide-react";
import "./EventsPage.css";

const EVENT_TYPES = [
  { key: "meeting", label: "Meeting", class: "event-type-meeting" },
  { key: "milestone", label: "Milestone", class: "event-type-milestone" },
  { key: "review", label: "Review", class: "event-type-review" },
  { key: "workshop", label: "Workshop", class: "event-type-workshop" },
  { key: "release", label: "Release", class: "event-type-release" },
];

export default function EventsPage() {
  const notify = useNotification();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [eventCategory, setEventCategory] = useState("announce"); // "announce" | "assign"
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("meeting");
  const [customEventType, setCustomEventType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [assignedUserIds, setAssignedUserIds] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  // Fetch events & users
  const { data: eventsData, isLoading, refetch } = useApiQuery(["events", filter], "/events?all=true");
  const { data: usersData } = useApiQuery(["users-list"], "/users?all=true");

  const events = useMemo(() => {
    if (Array.isArray(eventsData?.data)) return eventsData.data;
    if (Array.isArray(eventsData)) return eventsData;
    return [];
  }, [eventsData]);

  const usersList = useMemo(() => {
    if (Array.isArray(usersData?.data)) return usersData.data;
    if (Array.isArray(usersData)) return usersData;
    if (Array.isArray(usersData?.users)) return usersData.users;
    return [];
  }, [usersData]);

  // Create event mutation
  const createEventMutation = useApiMutation("/events", "POST", {
    onSuccess: () => {
      notify.success(
        eventCategory === "announce"
          ? "Event announced company-wide!"
          : "Event created and assigned successfully!"
      );
      setShowCreateModal(false);
      setTitle("");
      setDescription("");
      setLocation("");
      setEventType("meeting");
      setCustomEventType("");
      setAssignedUserIds([]);
      setEventCategory("announce");
      refetch();
    },
    onError: (err) => {
      notify.error(err?.message || "Failed to create event");
    },
  });

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (!ev) return false;
      const matchSearch =
        !search ||
        ev.title?.toLowerCase().includes(search.toLowerCase()) ||
        ev.description?.toLowerCase().includes(search.toLowerCase());

      if (!matchSearch) return false;

      if (filter === "all") return true;
      if (filter === "announce") return ev.is_announcement || ev.is_global || (!ev.assignedUsers || ev.assignedUsers.length === 0);
      if (filter === "assign") return ev.assignedUsers && ev.assignedUsers.length > 0;
      if (filter === "meeting") return ev.event_type === "meeting";
      if (filter === "milestone") return ev.event_type === "milestone";
      return true;
    });
  }, [events, search, filter]);

  const filteredAttendees = useMemo(() => {
    if (!attendeeSearch.trim()) return usersList;
    const q = attendeeSearch.toLowerCase();
    return usersList.filter(
      (u) => u?.name?.toLowerCase().includes(q) || u?.email?.toLowerCase().includes(q)
    );
  }, [usersList, attendeeSearch]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !startDate) {
      notify.error("Title and start date are required!");
      return;
    }

    if (eventCategory === "assign" && assignedUserIds.length === 0) {
      notify.error("Please select at least one user for targeted assignment!");
      return;
    }

    const finalEventType = eventType === "custom" ? (customEventType.trim() || "custom") : eventType;

    createEventMutation.mutate({
      title,
      event_type: finalEventType,
      start_date: `${startDate} ${startTime}`,
      location,
      description,
      is_announcement: eventCategory === "announce",
      is_global: eventCategory === "announce",
      user_ids: eventCategory === "announce" ? [] : assignedUserIds,
    });
  };

  const toggleUserSelection = (userId) => {
    if (!userId) return;
    setAssignedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: "Events" }]} />

      <div className="events-page">
        {/* HEADER */}
        <div className="events-header">
          <div className="events-header-left">
            <h1>Events & Announcements</h1>
            <p>Announce company-wide holidays and milestones or assign targeted team events.</p>
          </div>
          <button className="events-create-btn" onClick={() => setShowCreateModal(true)}>
            <Plus size={18} />
            Create / Announce Event
          </button>
        </div>

        {/* TOOLBAR */}
        <div className="events-toolbar">
          <div className="events-search">
            <Search size={18} style={{ color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Search events by title or keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="events-filters">
            {[
              { key: "all", label: "All Events" },
              { key: "announce", label: "📢 Announcements" },
              { key: "assign", label: "👥 Assigned Events" },
              { key: "meeting", label: "Meetings" },
              { key: "milestone", label: "Milestones" },
            ].map((f) => (
              <button
                key={f.key}
                className={`events-filter-chip ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* CONTENT GRID */}
        {isLoading ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <Loader2 size={32} style={{ animation: "spin 1s linear infinite", color: "#2563eb", margin: "0 auto 12px" }} />
            <p style={{ fontSize: "14px", color: "#64748b" }}>Loading events...</p>
          </div>
        ) : (
          <div className="events-grid">
            {filteredEvents.length === 0 ? (
              <div className="event-empty-state">
                <Calendar size={48} style={{ color: "#cbd5e1", margin: "0 auto" }} />
                <h3>No Events Found</h3>
                <p>No events or announcements match your current filter criteria.</p>
              </div>
            ) : (
              filteredEvents.map((ev) => {
                const isAnnounce = ev?.is_announcement || ev?.is_global || (!ev?.assignedUsers || ev.assignedUsers.length === 0);
                const typeObj = EVENT_TYPES.find((t) => t.key === ev?.event_type) || { label: ev?.event_type || "Event", class: "event-type-meeting" };

                return (
                  <div key={ev?.id || ev?.title} className="event-card">
                    <div className="event-card-header">
                      {isAnnounce ? (
                        <span className="event-type-badge" style={{ background: "#fef3c7", color: "#d97706", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Megaphone size={12} /> Company Announcement
                        </span>
                      ) : (
                        <span className={`event-type-badge ${typeObj.class}`}>
                          👥 {typeObj.label} ({ev.assignedUsers?.length || 0} Attendees)
                        </span>
                      )}
                    </div>

                    <h3 className="event-title">{ev.title}</h3>

                    <div className="event-meta">
                      <div className="event-meta-item">
                        <Clock size={15} />
                        <span>{ev.start_date ? new Date(ev.start_date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Scheduled"}</span>
                      </div>
                      {ev.location && (
                        <div className="event-meta-item">
                          <MapPin size={15} />
                          <span>{ev.location}</span>
                        </div>
                      )}
                    </div>

                    {ev.description && <p className="event-description">{ev.description}</p>}

                    {!isAnnounce && ev.assignedUsers && ev.assignedUsers.length > 0 && (
                      <div className="event-assignees">
                        <Users size={14} style={{ color: "#64748b" }} />
                        <span style={{ fontSize: "12px", color: "#64748b", marginRight: "4px" }}>Attendees:</span>
                        {ev.assignedUsers.map((u) => (
                          <div key={u?.id || u?.name} className="event-assignee-avatar" title={u?.name}>
                            {u?.name ? u.name.charAt(0).toUpperCase() : "U"}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* CREATE / ANNOUNCE EVENT MODAL VIA REACT PORTAL */}
        {showCreateModal && createPortal(
          <div
            style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "rgba(15, 23, 42, 0.5)", zIndex: 999999,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
            }}
          >
            <div
              style={{
                background: "var(--bg-card, #ffffff)", borderRadius: "16px", width: "540px",
                maxWidth: "100%", padding: "24px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
            >
              <h2 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 16px 0", color: "var(--text-dark, #0f172a)" }}>
                Create / Announce Event
              </h2>

              {/* SEGMENTED TOGGLE: ANNOUNCE vs ASSIGN */}
              <div style={{ background: "#f1f5f9", padding: "4px", borderRadius: "10px", display: "flex", gap: "4px", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => setEventCategory("announce")}
                  style={{
                    flex: 1, padding: "8px 14px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", border: "none",
                    background: eventCategory === "announce" ? "#ffffff" : "transparent",
                    color: eventCategory === "announce" ? "#2563eb" : "#64748b",
                    boxShadow: eventCategory === "announce" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    cursor: "pointer", transition: "all 0.15s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <Megaphone size={15} /> Announce Event
                </button>
                <button
                  type="button"
                  onClick={() => setEventCategory("assign")}
                  style={{
                    flex: 1, padding: "8px 14px", borderRadius: "8px", fontWeight: 600, fontSize: "13px", border: "none",
                    background: eventCategory === "assign" ? "#ffffff" : "transparent",
                    color: eventCategory === "assign" ? "#2563eb" : "#64748b",
                    boxShadow: eventCategory === "assign" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                    cursor: "pointer", transition: "all 0.15s ease", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                  }}
                >
                  <Users size={15} /> Assign Event
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                    Event Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={eventCategory === "announce" ? "e.g. Independence Day Holiday" : "e.g. Q3 Sprint Planning Meeting"}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                      Event Type
                    </label>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box" }}
                    >
                      {EVENT_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
                      ))}
                      <option value="custom">Other / Custom...</option>
                    </select>
                    {eventType === "custom" && (
                      <input
                        type="text"
                        required
                        value={customEventType}
                        onChange={(e) => setCustomEventType(e.target.value)}
                        placeholder="Enter custom event type..."
                        style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box", marginTop: "8px" }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                    Location / Link
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Main Auditorium or Google Meet link"
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide event details..."
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", resize: "vertical", boxSizing: "border-box" }}
                  />
                </div>

                {/* TARGET USER SELECTION OR ANNOUNCEMENT INFO */}
                {eventCategory === "assign" ? (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <label style={{ fontSize: "13px", fontWeight: 600 }}>
                        Select Attendees (Target Users) *
                      </label>
                      <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>
                        {assignedUserIds.length} selected
                      </span>
                    </div>

                    <div style={{ position: "relative", marginBottom: "6px" }}>
                      <input
                        type="text"
                        placeholder="Filter attendees by name..."
                        value={attendeeSearch}
                        onChange={(e) => setAttendeeSearch(e.target.value)}
                        style={{ width: "100%", height: "34px", padding: "4px 10px", fontSize: "12px", borderRadius: "6px", border: "1px solid var(--border-color, #cbd5e1)", boxSizing: "border-box" }}
                      />
                    </div>

                    <div
                      style={{
                        minHeight: "60px",
                        maxHeight: "150px",
                        overflowY: "auto",
                        border: "1px solid var(--border-color, #cbd5e1)",
                        borderRadius: "8px",
                        padding: "6px",
                        background: "var(--bg-card, #ffffff)",
                        boxSizing: "border-box"
                      }}
                    >
                      {filteredAttendees.length === 0 ? (
                        <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "center", padding: "12px 0" }}>
                          No users available
                        </div>
                      ) : (
                        filteredAttendees.map((u) => {
                          if (!u || !u.id) return null;
                          const isSelected = assignedUserIds.includes(u.id);
                          return (
                            <div
                              key={u.id}
                              onClick={() => toggleUserSelection(u.id)}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "6px 10px", borderRadius: "6px", cursor: "pointer",
                                background: isSelected ? "#eff6ff" : "transparent",
                                fontSize: "13px", margin: "2px 0", transition: "background 0.15s ease"
                              }}
                            >
                              <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? "#1e40af" : "inherit" }}>
                                {u.name || "User"} {u.email ? `(${u.email})` : ""}
                              </span>
                              {isSelected && <Check size={14} style={{ color: "#2563eb" }} />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ background: "#fef3c7", border: "1px solid #fde68a", padding: "10px 12px", borderRadius: "8px", fontSize: "12px", color: "#92400e" }}>
                    📢 <strong>Company Announcement:</strong> This event will be broadcast company-wide to all team members and visible on all calendars.
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-color, #cbd5e1)", background: "transparent", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createEventMutation.isLoading}
                    style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "var(--color-primary, #2563eb)", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
                  >
                    {createEventMutation.isLoading
                      ? "Saving..."
                      : eventCategory === "announce" ? "Announce Company Event" : "Assign Event"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      </div>
    </DashboardLayout>
  );
}
