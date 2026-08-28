import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  Lock,
  Building,
  ShieldCheck,
  CalendarDays,
  List,
  Filter,
  ChevronDown,
  User,
} from "lucide-react";

export default function EventsList() {
  const { t } = useTranslation();
  const user = getUser();
  const notify = useNotification();
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── View ──────────────────────────────────────────────
  const [viewMode, setViewMode] = useState("list");

  // ── Filter State (Task 7) ─────────────────────────────
  const [search, setSearch]                   = useState("");          // Name
  const [typeFilter, setTypeFilter]           = useState("all");       // Type
  const [categoryFilter, setCategoryFilter]   = useState("all");       // Category
  const [timeFilter, setTimeFilter]           = useState("all");       // Time
  const [dayFilter, setDayFilter]             = useState("");           // Day (specific date)
  const [personFilter, setPersonFilter]       = useState("all");       // Person (organizer)
  const [locationFilter, setLocationFilter]   = useState("");          // Location
  const [customFrom, setCustomFrom]           = useState("");           // Custom range from
  const [customTo, setCustomTo]               = useState("");           // Custom range to

  // Show/hide advanced filter panel
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Modals
  const [deletingEvent, setDeletingEvent] = useState(null);

  // Fetch categories
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

  // Fetch events
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
      notify.error(t("Failed to load events.", { defaultValue: "Failed to load events." }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchEvents();
  }, []);

  // Delete handler
  const handleDeleteConfirm = async () => {
    if (!deletingEvent?.id) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${deletingEvent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        notify.success(t("Event deleted successfully.", { defaultValue: "Event deleted successfully." }));
        fetchEvents();
      } else {
        notify.error(t("Failed to delete event.", { defaultValue: "Failed to delete event." }));
      }
    } catch (e) {
      notify.error(t("An error occurred while deleting event.", { defaultValue: "An error occurred while deleting event." }));
    } finally {
      setDeletingEvent(null);
    }
  };

  // ── Unique organizers from events for Person filter ───
  const organizerOptions = useMemo(() => {
    const seen = new Set();
    const opts = [];
    events.forEach((ev) => {
      const name = ev.organizer_name || ev.creator_name;
      const id   = ev.organizer_id  || ev.user_id;
      if (id && name && !seen.has(id)) {
        seen.add(id);
        opts.push({ id, name });
      }
    });
    return opts;
  }, [events]);

  // ── Filtered Events (Task 7: all 8 filter dimensions) ─
  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events)) return [];

    const now = new Date();

    return events.filter((ev) => {
      if (!ev) return false;

      // 1. Name / search
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        ev.title?.toLowerCase().includes(q) ||
        ev.description?.toLowerCase().includes(q) ||
        ev.location?.toLowerCase().includes(q) ||
        ev.category?.name?.toLowerCase().includes(q);

      // 2. Type
      const isAnnounce =
        ev.type === "announcement" ||
        ev.type === "Company Announcement" ||
        ev.is_announcement ||
        ev.is_global;
      let matchesType = true;
      if (typeFilter === "announcement") matchesType = isAnnounce;
      if (typeFilter === "event")        matchesType = !isAnnounce;

      // 3. Category
      const matchesCat =
        categoryFilter === "all" ||
        ev.category_id === Number(categoryFilter) ||
        ev.category?.id === Number(categoryFilter) ||
        ev.category?.name === categoryFilter;

      // 4. Time (relative range)
      let matchesTime = true;
      const startD = ev.start_date ? new Date(ev.start_date) : null;
      if (timeFilter !== "all" && startD) {
        const today      = new Date(now); today.setHours(0, 0, 0, 0);
        const tomorrow   = new Date(today); tomorrow.setDate(today.getDate() + 1);
        const weekEnd    = new Date(today); weekEnd.setDate(today.getDate() + 7);
        const monthEnd   = new Date(today); monthEnd.setMonth(today.getMonth() + 1);
        switch (timeFilter) {
          case "today":     matchesTime = startD >= today && startD < tomorrow;       break;
          case "this_week": matchesTime = startD >= today && startD < weekEnd;        break;
          case "this_month":matchesTime = startD >= today && startD < monthEnd;       break;
          case "upcoming":  matchesTime = startD >= today;                            break;
          case "past":      matchesTime = startD < today;                             break;
          default:          matchesTime = true;
        }
      }

      // 5. Day (specific date)
      let matchesDay = true;
      if (dayFilter && startD) {
        const dayStr = startD.toISOString().split("T")[0];
        matchesDay = dayStr === dayFilter;
      }

      // 6. Person (organizer)
      let matchesPerson = true;
      if (personFilter !== "all") {
        const orgId = ev.organizer_id || ev.user_id;
        matchesPerson = String(orgId) === String(personFilter);
      }

      // 7. Location
      const matchesLocation =
        !locationFilter.trim() ||
        (ev.location && ev.location.toLowerCase().includes(locationFilter.toLowerCase()));

      // 8. Custom date range
      let matchesCustom = true;
      if (customFrom || customTo) {
        if (startD) {
          const fromD = customFrom ? new Date(customFrom) : null;
          const toD   = customTo   ? new Date(customTo + "T23:59:59")   : null;
          if (fromD && startD < fromD) matchesCustom = false;
          if (toD   && startD > toD)   matchesCustom = false;
        } else {
          matchesCustom = false;
        }
      }

      return (
        matchesSearch &&
        matchesType &&
        matchesCat &&
        matchesTime &&
        matchesDay &&
        matchesPerson &&
        matchesLocation &&
        matchesCustom
      );
    });
  }, [events, search, typeFilter, categoryFilter, timeFilter, dayFilter, personFilter, locationFilter, customFrom, customTo]);

  // Group by month
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

  // Count active advanced filters
  const activeAdvancedCount = [
    categoryFilter !== "all",
    timeFilter !== "all",
    !!dayFilter,
    personFilter !== "all",
    !!locationFilter,
    !!customFrom || !!customTo,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("all");
    setTimeFilter("all");
    setDayFilter("");
    setPersonFilter("all");
    setLocationFilter("");
    setCustomFrom("");
    setCustomTo("");
  };

  const visibilityBadge = (level, isGlobal) => {
    if (isGlobal || level === "organization") {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fef3c7", color: "#b45309" }}>
          <ShieldCheck size={12} /> {t("Organization", { defaultValue: "Organization" })}
        </span>
      );
    }
    switch (level) {
      case "private":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f3f4f6", color: "#4b5563" }}><Lock size={12} /> {t("Private", { defaultValue: "Private" })}</span>;
      case "project_team":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#eff6ff", color: "#1d4ed8" }}><Users size={12} /> {t("Project Team", { defaultValue: "Project Team" })}</span>;
      case "team":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#ede9fe", color: "#6d28d9" }}><Users size={12} /> {t("Team", { defaultValue: "Team" })}</span>;
      case "department_team":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#f0fdf4", color: "#15803d" }}><Building size={12} /> {t("Department", { defaultValue: "Department" })}</span>;
      case "custom":
        return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "#fdf2f8", color: "#be185d" }}><Users size={12} /> {t("Custom", { defaultValue: "Custom" })}</span>;
      default:
        return null;
    }
  };

  const breadcrumbs = [{ label: t("Events & Announcements", { defaultValue: "Events & Announcements" }) }];

  // ── Shared select style helper ────────────────────────
  const selStyle = {
    padding: "7px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border-color)",
    background: "var(--bg-card)",
    fontSize: "12px",
    color: "var(--text-primary)",
    cursor: "pointer",
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ padding: "0 4px" }}>
        {/* ── HEADER ──────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Calendar size={24} color="#2563eb" /> {t("Events & Announcements", { defaultValue: "Events & Announcements" })}
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
              {t("Stay updated on company announcements, workshops, meetings, and project milestones.", { defaultValue: "Stay updated on company announcements, workshops, meetings, and project milestones." })}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {/* View mode toggle */}
            <div style={{ display: "flex", background: "var(--bg-hover)", padding: "3px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "6px", border: "none", background: viewMode === "list" ? "var(--bg-card)" : "transparent", color: viewMode === "list" ? "#2563eb" : "var(--text-secondary)", fontWeight: viewMode === "list" ? 600 : 500, fontSize: "12px", cursor: "pointer", boxShadow: viewMode === "list" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
              >
                <List size={14} /> {t("Cards", { defaultValue: "Cards" })}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 10px", borderRadius: "6px", border: "none", background: viewMode === "grouped" ? "var(--bg-card)" : "transparent", color: viewMode === "grouped" ? "#2563eb" : "var(--text-secondary)", fontWeight: viewMode === "grouped" ? 600 : 500, fontSize: "12px", cursor: "pointer", boxShadow: viewMode === "grouped" ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}
              >
                <CalendarDays size={14} /> {t("Grouped by Month", { defaultValue: "Grouped by Month" })}
              </button>
            </div>

            <button
              onClick={() => navigate(rolePath("events/create"))}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#ffffff", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
            >
              <Plus size={16} /> {t("New Event / Announcement", { defaultValue: "New Event / Announcement" })}
            </button>
          </div>
        </div>

        {/* ── FILTER BAR (Task 7) ──────────────────────── */}
        <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Row 1: Primary filters */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            {/* Name / Search */}
            <div style={{ position: "relative", flex: "1 1 220px", minWidth: "180px" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} size={15} />
              <input
                type="text"
                placeholder={t("Search by name, description, location…", { defaultValue: "Search by name, description, location…" })}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", padding: "7px 30px 7px 32px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 0 }}>
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Type toggle */}
            <div style={{ display: "flex", background: "var(--bg-hover)", padding: "3px", borderRadius: "6px", border: "1px solid var(--border-color)", flexShrink: 0 }}>
              {[
                { key: "all",          label: t("All", { defaultValue: "All" }) },
                { key: "event",        label: "📅 " + t("Events", { defaultValue: "Events" }) },
                { key: "announcement", label: "📢 " + t("Announcements", { defaultValue: "Announcements" }) },
              ].map((tItem) => (
                <button
                  key={tItem.key}
                  type="button"
                  onClick={() => setTypeFilter(tItem.key)}
                  style={{ padding: "5px 11px", borderRadius: "5px", border: "none", fontSize: "12px", fontWeight: typeFilter === tItem.key ? 600 : 500, background: typeFilter === tItem.key ? "#2563eb" : "transparent", color: typeFilter === tItem.key ? "#fff" : "var(--text-secondary)", cursor: "pointer", transition: "all 0.15s ease" }}
                >
                  {tItem.label}
                </button>
              ))}
            </div>

            {/* Advanced Filters toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 12px", borderRadius: "6px", border: `1px solid ${activeAdvancedCount > 0 ? "#2563eb" : "var(--border-color)"}`, background: activeAdvancedCount > 0 ? "#eff6ff" : "var(--bg-card)", color: activeAdvancedCount > 0 ? "#2563eb" : "var(--text-secondary)", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
            >
              <Filter size={13} />
              {t("Filters", { defaultValue: "Filters" })}
              {activeAdvancedCount > 0 && (
                <span style={{ background: "#2563eb", color: "#fff", borderRadius: "10px", padding: "0 6px", fontSize: "10px", fontWeight: 700 }}>
                  {activeAdvancedCount}
                </span>
              )}
              <ChevronDown size={13} style={{ transform: showAdvanced ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
            </button>

            {(activeAdvancedCount > 0 || search || typeFilter !== "all") && (
              <button
                type="button"
                onClick={clearAllFilters}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 10px", borderRadius: "6px", border: "1px solid #fca5a5", background: "#fef2f2", color: "#ef4444", fontSize: "12px", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                <X size={12} /> {t("Clear All", { defaultValue: "Clear All" })}
              </button>
            )}
          </div>

          {/* Row 2: Advanced filter panel */}
          {showAdvanced && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", padding: "14px 16px", background: "var(--bg-hover)", borderRadius: "8px", border: "1px solid var(--border-color)", alignItems: "flex-end" }}>
              {/* Category */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Category", { defaultValue: "Category" })}</label>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selStyle}>
                  <option value="all">{t("All Categories", { defaultValue: "All Categories" })}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Time */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Time", { defaultValue: "Time" })}</label>
                <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} style={selStyle}>
                  <option value="all">{t("Any Time", { defaultValue: "Any Time" })}</option>
                  <option value="upcoming">{t("Upcoming", { defaultValue: "Upcoming" })}</option>
                  <option value="today">{t("Today", { defaultValue: "Today" })}</option>
                  <option value="this_week">{t("This Week", { defaultValue: "This Week" })}</option>
                  <option value="this_month">{t("This Month", { defaultValue: "This Month" })}</option>
                  <option value="past">{t("Past", { defaultValue: "Past" })}</option>
                </select>
              </div>

              {/* Day */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "150px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Specific Day", { defaultValue: "Specific Day" })}</label>
                <input
                  type="date"
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  style={{ ...selStyle }}
                />
              </div>

              {/* Person (organizer) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Organizer / Person", { defaultValue: "Organizer / Person" })}</label>
                <select value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} style={selStyle}>
                  <option value="all">{t("All People", { defaultValue: "All People" })}</option>
                  {organizerOptions.map((op) => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                </select>
              </div>

              {/* Location */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "160px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Location", { defaultValue: "Location" })}</label>
                <div style={{ position: "relative" }}>
                  <MapPin size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    type="text"
                    placeholder={t("e.g. Room A", { defaultValue: "e.g. Room A" })}
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    style={{ ...selStyle, paddingLeft: "24px", width: "100%", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* Custom date range */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "280px" }}>
                <label style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Custom Range", { defaultValue: "Custom Range" })}</label>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{ ...selStyle, flex: 1 }}
                    placeholder={t("From", { defaultValue: "From" })}
                  />
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{ ...selStyle, flex: 1 }}
                    placeholder={t("To", { defaultValue: "To" })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Active filter summary */}
          {filteredEvents.length !== events.length && (
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {t("Showing {{shown}} of {{total}} events", {
                shown: filteredEvents.length,
                total: events.length,
                defaultValue: `Showing ${filteredEvents.length} of ${events.length} events`,
              })}
            </div>
          )}
        </div>

        {/* ── EVENT LIST ───────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-secondary)" }}>
            <Loader2 className="animate-spin" size={36} style={{ margin: "0 auto 12px", color: "#2563eb" }} />
            {t("Loading events and announcements...", { defaultValue: "Loading events and announcements..." })}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={{ textAlign: "center", padding: "70px 20px", background: "var(--bg-card)", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
            <Calendar size={48} style={{ color: "#9ca3af", margin: "0 auto 12px" }} />
            <h3 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: 600 }}>{t("No events or announcements found", { defaultValue: "No events or announcements found" })}</h3>
            <p style={{ margin: "0 0 16px", fontSize: "13px", color: "var(--text-secondary)" }}>
              {t("Create an event or company announcement to notify team members.", { defaultValue: "Create an event or company announcement to notify team members." })}
            </p>
            <button
              onClick={() => navigate(rolePath("events/create"))}
              style={{ padding: "8px 18px", borderRadius: "6px", background: "#2563eb", color: "#ffffff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }} /> {t("Create Event", { defaultValue: "Create Event" })}
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

      {/* ── DELETE MODAL ─────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deletingEvent}
        onClose={() => setDeletingEvent(null)}
        onConfirm={handleDeleteConfirm}
        title={t("Delete Event / Announcement", { defaultValue: "Delete Event / Announcement" })}
        message={t('Are you sure you want to delete "{{title}}"? This will cancel notifications and delete all attendee records.', { title: deletingEvent?.title, defaultValue: `Are you sure you want to delete "${deletingEvent?.title}"? This will cancel notifications and delete all attendee records.` })}
        confirmText={t("Delete", { defaultValue: "Delete" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
    </DashboardLayout>
  );

  // ── Event Card (Task 1: clicking navigates to dedicated page) ──
  function renderEventCard(ev) {
    if (!ev) return null;
    const canEditDelete =
      ev.user_id === user?.id ||
      ev.organizer_id === user?.id ||
      ["admin", "manager"].includes(user?.role);
    const isAnnounce =
      ev.is_announcement ||
      ev.type === "announcement" ||
      ev.type === "Company Announcement" ||
      ev.is_global;

    const startDateObj = ev.start_date ? new Date(ev.start_date) : null;
    const monthStr     = startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.toLocaleString("default", { month: "short" }).toUpperCase() : "DATE";
    const dayStr       = startDateObj && !isNaN(startDateObj.getTime()) ? startDateObj.getDate() : "--";
    const timeStr      =
      startDateObj && !isNaN(startDateObj.getTime()) && !ev.all_day
        ? startDateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : ev.all_day
        ? t("All Day", { defaultValue: "All Day" })
        : "";

    return (
      <div
        key={ev.id}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "18px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.15s ease" }}
      >
        <div>
          {/* Header row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", gap: "8px" }}>
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              {isAnnounce ? (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "2px 8px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <Megaphone size={12} /> {t("Announcement", { defaultValue: "Announcement" })}
                </span>
              ) : (
                <span style={{ fontSize: "11px", fontWeight: 700, color: ev.category?.color || "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "4px" }}>
                  {ev.category?.name || t(ev.type || "Event", { defaultValue: ev.type || "Event" })}
                </span>
              )}
              {visibilityBadge(ev.visibility_level, ev.is_global)}
            </div>

            {canEditDelete && (
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  onClick={() => navigate(rolePath(`events/edit/${ev.id}`))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                  title={t("Edit Event", { defaultValue: "Edit Event" })}
                >
                  <Edit size={15} />
                </button>
                <button
                  onClick={() => setDeletingEvent(ev)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px" }}
                  title={t("Delete Event", { defaultValue: "Delete Event" })}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Date tile & title */}
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start", marginBottom: "12px" }}>
            <div style={{ width: "46px", height: "50px", borderRadius: "8px", background: isAnnounce ? "#fef3c7" : "#eff6ff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, border: isAnnounce ? "1px solid #fde68a" : "1px solid #bfdbfe" }}>
              <span style={{ fontSize: "10px", fontWeight: 700, color: isAnnounce ? "#b45309" : "#1d4ed8" }}>{monthStr}</span>
              <span style={{ fontSize: "18px", fontWeight: 800, lineHeight: 1, color: isAnnounce ? "#92400e" : "#1e40af" }}>{dayStr}</span>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Task 1: title click → navigate to event page */}
              <h3
                onClick={() => navigate(rolePath(`events/${ev.id}`))}
                style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.3 }}
              >
                {ev.title || t("Untitled Event", { defaultValue: "Untitled Event" })}
              </h3>
              {timeStr && (
                <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} /> {timeStr}
                </div>
              )}
            </div>
          </div>

          {/* Description snippet */}
          {ev.description && (
            <p style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--text-secondary)", minHeight: "36px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: "1.4" }}>
              {ev.description?.replace(/<[^>]*>/g, "") || ""}
            </p>
          )}

          {/* Location / meeting link */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px", fontSize: "12px" }}>
            {ev.location && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" }}>
                <MapPin size={13} color="#ef4444" /> {ev.location}
              </span>
            )}
            {ev.meeting_link && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#2563eb", fontWeight: 500 }}>
                <Video size={13} color="#10b981" /> {t("Virtual Meeting", { defaultValue: "Virtual Meeting" })}
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {Array.isArray(ev.assigned_users) && ev.assigned_users.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <div style={{ display: "flex", marginLeft: "4px" }}>
                  {ev.assigned_users.slice(0, 3).map((u, i) => (
                    <div key={u?.id || i} title={u?.name} style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#2563eb", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: 700, marginLeft: i > 0 ? "-6px" : 0, border: "2px solid var(--bg-card)" }}>
                      {u?.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "4px" }}>
                  {t("{{count}} attendees", { count: ev.assigned_users.length, defaultValue: `${ev.assigned_users.length} attendees` })}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <User size={12} /> {ev.organizer_name || ev.creator_name || t("System", { defaultValue: "System" })}
              </span>
            )}
          </div>

          {/* Task 1: "Details" navigates to /events/:id page */}
          <button
            onClick={() => navigate(rolePath(`events/${ev.id}`))}
            style={{ padding: "5px 12px", borderRadius: "6px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            {t("Details", { defaultValue: "Details" })}
          </button>
        </div>
      </div>
    );
  }
}

