import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import "./EventsPage.css";
import {
  ArrowLeft,
  Calendar,
  Megaphone,
  Save,
  Plus,
  MapPin,
  Clock,
  Video,
  Users,
  Building,
  ShieldCheck,
  Lock,
  Loader2,
  Check,
} from "lucide-react";

export default function EventEditor() {
  const { id } = useParams();
  const locationState = useLocation();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const notify = useNotification();
  const user = getUser();

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);

  // Form Mode: 'event' vs 'announcement'
  const [formType, setFormType] = useState("event");

  // Core Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [color, setColor] = useState("#3b82f6");

  // Visibility & Audience State
  const [visibilityLevel, setVisibilityLevel] = useState("organization");
  const [projectId, setProjectId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  // Inline Category Creation State
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingNewCat, setSavingNewCat] = useState(false);

  // Dynamic Options from API
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Fetch dynamic dropdowns
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/event-categories`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        const catData = Array.isArray(d?.data) ? d.data : [];
        setCategories(catData);
        if (!isEditMode && catData.length > 0 && !categoryId) {
          setCategoryId(String(catData[0].id));
        }
      })
      .catch(() => {});

    fetch(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {});

    fetch(`${API_URL}/teams`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setTeams(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {});

    fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setUsersList(Array.isArray(d) ? d : d?.data || d?.users || []))
      .catch(() => {});

    if (!isEditMode && locationState.state?.projectId) {
      setProjectId(String(locationState.state.projectId));
      setVisibilityLevel("project_team");
    }
  }, [isEditMode, locationState.state]);

  // Load existing event if editing
  useEffect(() => {
    if (!isEditMode) return;

    const token = authToken();
    setLoading(true);

    fetch(`${API_URL}/events/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => r.json())
      .then((d) => {
        const ev = d?.data || d?.event;
        if (ev) {
          setTitle(ev.title || "");
          setDescription(ev.description || "");
          const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_announcement;
          setFormType(isAnnounce ? "announcement" : "event");
          setCategoryId(ev.category_id ? String(ev.category_id) : "");
          setVisibilityLevel(ev.visibility_level || "organization");
          setLocation(ev.location || "");
          setMeetingLink(ev.meeting_link || "");
          setColor(ev.color || "#3b82f6");
          setAllDay(Boolean(ev.all_day));

          if (ev.start_date) {
            const parts = ev.start_date.split("T");
            setStartDate(parts[0] || "");
            if (parts[1]) setStartTime(parts[1].substring(0, 5));
          }
          if (ev.end_date) {
            const parts = ev.end_date.split("T");
            setEndDate(parts[0] || "");
            if (parts[1]) setEndTime(parts[1].substring(0, 5));
          }

          if (Array.isArray(ev.assigned_users)) {
            setSelectedUserIds(ev.assigned_users.map((u) => u.id));
          }
        } else {
          notify.error("Event not found.");
          navigate(rolePath("events"));
        }
      })
      .catch(() => {
        notify.error("Failed to load event details.");
      })
      .finally(() => setLoading(false));
  }, [id, isEditMode]);

  // Inline Category Creation
  const handleCreateCategory = async (e) => {
    if (e) e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      setSavingNewCat(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/event-categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const data = await res.json();
      if (res.ok && (data?.data?.id || data?.category?.id)) {
        const newCat = data.data || data.category;
        setCategories((prev) => [...prev, newCat]);
        setCategoryId(String(newCat.id));
        setNewCatName("");
        setShowNewCatInput(false);
        notify.success("Event category created successfully");
      } else {
        notify.error(data?.message || "Failed to create category");
      }
    } catch (err) {
      console.error("Create category error:", err);
      notify.error("Network error while creating category");
    } finally {
      setSavingNewCat(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      notify.error("Title is required.");
      return;
    }
    if (!startDate) {
      notify.error("Date is required.");
      return;
    }

    setSubmitting(true);
    try {
      const token = authToken();
      const isAnnounce = formType === "announcement";

      const startDateTime = allDay || isAnnounce ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
      const endDateTime = isAnnounce ? startDateTime : (endDate ? (allDay ? `${endDate} 23:59:59` : `${endDate} ${endTime}:00`) : startDateTime);

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        type: isAnnounce ? "announcement" : "event",
        category_id: categoryId ? Number(categoryId) : null,
        start_date: startDateTime,
        end_date: endDateTime,
        all_day: isAnnounce ? true : allDay,
        is_global: isAnnounce || visibilityLevel === "organization",
        visibility_level: visibilityLevel,
        location: isAnnounce ? null : (location.trim() || null),
        meeting_link: isAnnounce ? null : (meetingLink.trim() || null),
        color: color,
        participant_user_ids: isAnnounce ? [] : selectedUserIds,
        assigned_user_ids: isAnnounce ? [] : selectedUserIds,
        team_ids: selectedTeamIds,
        user_ids: selectedUserIds,
        project_id: visibilityLevel === "project_team" ? projectId : null,
      };

      const url = isEditMode ? `${API_URL}/events/${id}` : `${API_URL}/events`;
      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        notify.success(isEditMode ? "Event updated successfully!" : (isAnnounce ? "Company Announcement published!" : "Event created successfully!"));
        navigate(rolePath("events"));
      } else {
        notify.error(data?.message || "Failed to save event.");
      }
    } catch (e) {
      notify.error("An error occurred while saving event.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserSelection = (uId) => {
    if (!uId) return;
    setSelectedUserIds((prev) =>
      prev.includes(uId) ? prev.filter((x) => x !== uId) : [...prev, uId]
    );
  };

  const filteredUsers = usersList.filter((u) => {
    if (!attendeeSearch.trim()) return true;
    const q = attendeeSearch.toLowerCase();
    return u?.name?.toLowerCase().includes(q) || u?.email?.toLowerCase().includes(q);
  });

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const visibilityOptions = [
    { value: "organization", label: "Organization (Everyone in Company)" },
    { value: "department_team", label: "Department Team (My Department)" },
    { value: "project_team", label: "Project Team (Target Project Members)" },
    { value: "team", label: "Team (Specific Team Members)" },
    { value: "custom", label: "Custom (Select Specific Users & Teams)" },
    { value: "private", label: "Private (Only Me)" },
  ];

  const projectOptions = [
    { value: "", label: "Select Target Project..." },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
          <Loader2 className="animate-spin" size={36} style={{ margin: "0 auto 12px", color: "#2563eb" }} />
          Loading event editor...
        </div>
      </DashboardLayout>
    );
  }

  const breadcrumbs = [
    { label: "Events & Announcements", path: rolePath("events") },
    { label: isEditMode ? "Edit Event" : "Create Event / Announcement" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 8px" }}>
        {/* HEADER BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => navigate(rolePath("events"))}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> Back to Events
          </button>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            {isEditMode ? "Edit Event / Announcement" : "New Event / Announcement"}
          </h3>
        </div>

        <div style={{ background: "var(--bg-card)", borderRadius: "14px", border: "1px solid var(--border-color)", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          {/* SEGMENTED FORM TYPE SELECTOR */}
          <div style={{ background: "var(--bg-hover)", padding: "4px", borderRadius: "10px", display: "flex", gap: "6px", marginBottom: "24px", border: "1px solid var(--border-color)" }}>
            <button
              type="button"
              onClick={() => setFormType("event")}
              style={{
                flex: 1,
                padding: "9px 16px",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "13px",
                border: "none",
                background: formType === "event" ? "#2563eb" : "transparent",
                color: formType === "event" ? "#ffffff" : "var(--text-secondary)",
                boxShadow: formType === "event" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Calendar size={16} /> 📅 Scheduled Event / Meeting
            </button>
            <button
              type="button"
              onClick={() => setFormType("announcement")}
              style={{
                flex: 1,
                padding: "9px 16px",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "13px",
                border: "none",
                background: formType === "announcement" ? "#f59e0b" : "transparent",
                color: formType === "announcement" ? "#ffffff" : "var(--text-secondary)",
                boxShadow: formType === "announcement" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Megaphone size={16} /> 📢 Company Announcement
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* TITLE */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {formType === "announcement" ? "Announcement Headline *" : "Event Title *"}
              </label>
              <input
                type="text"
                required
                placeholder={formType === "announcement" ? "e.g. Office Closure for National Holiday" : "e.g. Sprint Review & Architecture Planning"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%", height: "42px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "14px", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
            </div>

            {/* CATEGORY & THEME COLOR */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <label style={{ fontSize: "13px", fontWeight: 600, margin: 0 }}>
                    Category <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowNewCatInput((prev) => !prev)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563eb",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "2px",
                    }}
                  >
                    <Plus size={12} /> {showNewCatInput ? "Cancel" : "Add New"}
                  </button>
                </div>

                {showNewCatInput && (
                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                    <input
                      type="text"
                      placeholder="New category name..."
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: "1px solid var(--border-color)",
                        fontSize: "12px",
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateCategory(e);
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      disabled={savingNewCat || !newCatName.trim()}
                      style={{
                        padding: "6px 10px",
                        borderRadius: "6px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: savingNewCat || !newCatName.trim() ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {savingNewCat ? "..." : "Save"}
                    </button>
                  </div>
                )}

                <CustomSelect
                  name="category_id"
                  value={categoryId}
                  onChange={(val) => setCategoryId(val)}
                  options={categoryOptions}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Theme Color
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", height: "40px" }}>
                  {["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#ef4444"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: c,
                        border: color === c ? "2px solid #000000" : "2px solid transparent",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* DATE & TIME */}
            {formType === "announcement" ? (
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Announcement Date *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)", boxSizing: "border-box" }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-hover)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>Event Timing</span>
                  <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    All Day Event
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: allDay ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div style={{ gridColumn: allDay ? "span 1" : "span 1" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Start Date *</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                    />
                  </div>

                  {!allDay && (
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>Start Time</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                      />
                    </div>
                  )}

                  <div style={{ gridColumn: allDay ? "span 1" : "span 1" }}>
                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                    />
                  </div>

                  {!allDay && (
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>End Time</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* LOCATION & MEETING LINK */}
            {formType === "event" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Location (Physical)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Conference Room A or Main Hall"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    Meeting Link (Virtual)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://meet.google.com/xyz-abcd-efg"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            )}

            {/* DESCRIPTION */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {formType === "announcement" ? "Announcement Details & Message" : "Event Description"}
              </label>
              <textarea
                rows={4}
                placeholder="Provide detailed description, agenda, or important notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5, boxSizing: "border-box" }}
              />
            </div>

            {/* DYNAMIC AUDIENCE & VISIBILITY */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  Audience / Visibility Level <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <CustomSelect
                  name="visibility_level"
                  value={visibilityLevel}
                  onChange={(val) => setVisibilityLevel(val)}
                  options={visibilityOptions}
                />
              </div>

              {/* DYNAMIC TARGET PROJECT */}
              {visibilityLevel === "project_team" && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Target Project *
                  </label>
                  <CustomSelect
                    name="project_id"
                    value={projectId}
                    onChange={(val) => setProjectId(val)}
                    options={projectOptions}
                  />
                </div>
              )}

              {/* DYNAMIC TARGET TEAM */}
              {visibilityLevel === "team" && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    Target Team *
                  </label>
                  <select
                    value={selectedTeamIds[0] || ""}
                    onChange={(e) => setSelectedTeamIds(e.target.value ? [Number(e.target.value)] : [])}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
                  >
                    <option value="">Select Team...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* SPECIFIC ATTENDEES */}
              {formType === "event" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600 }}>
                      Specific Attendees / Invitees
                    </label>
                    <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>
                      {selectedUserIds.length} selected
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", marginBottom: "6px", boxSizing: "border-box" }}
                  />

                  <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "6px", background: "var(--bg-card)" }}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                        No users found
                      </div>
                    ) : (
                      filteredUsers.map((u) => {
                        if (!u?.id) return null;
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUserSelection(u.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              background: isSelected ? "#eff6ff" : "transparent",
                              fontSize: "13px",
                              margin: "2px 0",
                            }}
                          >
                            <span style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? "#1d4ed8" : "inherit" }}>
                              {u.name || "User"} {u.email ? `(${u.email})` : ""}
                            </span>
                            {isSelected && <Check size={14} color="#2563eb" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SUBMIT BUTTONS */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
              <button
                type="button"
                onClick={() => navigate(rolePath("events"))}
                style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 22px",
                  borderRadius: "8px",
                  border: "none",
                  background: formType === "announcement" ? "#f59e0b" : "#2563eb",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <Save size={15} />
                {submitting
                  ? "Saving..."
                  : isEditMode
                  ? "Save Changes"
                  : formType === "announcement"
                  ? "Publish Announcement"
                  : "Create Event"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
