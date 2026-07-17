/**
 * Calender.jsx — Calendar Page Component
 *
 * Unified calendar view for the PMS that displays events, tasks, projects,
 * and subtasks in Month/Week/Day views. Features:
 * - Month/Week/Day view toggle with navigation (prev/next/today)
 * - Event creation/editing modal (admin/manager only)
 * - Day popup showing events for a specific date (supports deep-linking via ?date= param)
 * - Sidebar with today's events and upcoming events
 * - Event search and color-coded event type legend
 * - Auto-refreshes on event CRUD via event bus
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
import "../pages/Calender.css";
import "../components/Event.css";
import { ChevronLeft, ChevronRight, Search, Plus } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import Event from "../components/Event";
import EventInfoPopup from "../components/EventInfoPopup";
import ItemDetailPopup from "../components/ItemDetailPopup";
import DayPopup from "../components/DayPopup";
import { formatEventDateTime } from "../utils/formatDateTime";
import { authToken, getCurrentRole, getUser } from "../utils/auth";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
import { showSuccessMessage } from "../utils/notify";
import { DEFAULT_EVENT_COLOR, TYPE_COLORS, TYPE_LABELS } from "../utils/calendarConstants";

/** Formats a Date to YYYY-MM-DD for API parameters */
function formatDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/** Formats a Date to a display string like "June 29, 2026" */
function formatDisplayDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function getWeekEnd(date) {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

function isToday(d) {
  return isSameDay(d, new Date());
}

/**
 * Calender — Main calendar page component.
 * Manages view mode (Month/Week/Day), event fetching, date navigation,
 * and renders the calendar grid, sidebar, and modals.
 */
function Calender() {
  const [viewMode, setViewMode] = useState("Month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editEvent, setEditEvent] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayPopup, setShowDayPopup] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const [searchParams] = useSearchParams();
  const currentRole = getCurrentRole();
  const currentUser = getUser(currentRole);
  // Only admins and managers can create/edit/delete events
  const canManageEvents = ["admin", "manager"].includes(currentRole);

  // Compute the date range (from/to) based on current view mode and date
  const getDateRange = useCallback(() => {
    if (viewMode === "Month") {
      const start = getMonthStart(currentDate);
      const end = getMonthEnd(currentDate);
      return { from: formatDate(start), to: formatDate(end) };
    }
    if (viewMode === "Week") {
      const start = getWeekStart(currentDate);
      const end = getWeekEnd(currentDate);
      return { from: formatDate(start), to: formatDate(end) };
    }
    const d = formatDate(currentDate);
    return { from: d, to: d };
  }, [currentDate, viewMode]);

  // Fetch events from unified calendar API with date range and search params
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const token = authToken();
      const { from, to } = getDateRange();
      const params = new URLSearchParams();
      params.append("from", from);
      params.append("to", to);
      params.append("all", "1");
      if (search) params.append("search", search);

      const res = await fetch(`${API_URL}/unified-calendar?${params.toString()}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      const data = await res.json();
      setEvents(data?.data || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [getDateRange, search]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Deep linking: auto-open day popup when ?date=YYYY-MM-DD is in URL
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const parts = dateParam.split("-");
    if (parts.length !== 3) return;
    const parsed = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (isNaN(parsed.getTime())) return;
    setCurrentDate(parsed);
    setSelectedDay(parsed);
    setShowDayPopup(true);
  }, [searchParams]);
  // Re-fetch events when events are created, updated, or deleted
  useRefreshOnEvent(['event:created', 'event:updated', 'event:deleted'], fetchEvents);

  // Navigate to previous month/week/day
  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "Month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "Week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "Month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "Week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Callback after event creation/update — refresh list and publish change event
  const handleEventCreated = (event) => {
    fetchEvents();
    publish('data:changed', { type: 'event', action: event?.id ? 'updated' : 'created' });
  };

  // Delete an event after confirmation, then refresh and close popups
  const handleDelete = async (eventId) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    setDeleteLoading(eventId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        publish('event:deleted', { id: eventId });
        publish('data:changed', { type: 'event', action: 'deleted' });
        showSuccessMessage("Event", "deleted");
        setShowDayPopup(false);
        setSelectedDay(null);
      }
    } catch {
      // silent
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleEdit = (event) => {
    setEditEvent(event);
    setShowDayPopup(false);
    setShowEventModal(true);
  };

  // Filter events that fall within a given date (handles multi-day events)
  const getEventsForDate = (date) => {
    const dateStr = formatDate(date);
    return events.filter((ev) => {
      const start = ev.start_date?.split("T")[0];
      const end = ev.end_date?.split("T")[0] || start;
      return dateStr >= start && dateStr <= end;
    });
  };

  const getHeaderTitle = () => {
    if (viewMode === "Month") {
      return currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    if (viewMode === "Week") {
      const start = getWeekStart(currentDate);
      const end = getWeekEnd(currentDate);
      return `${formatDisplayDate(start)} - ${formatDisplayDate(end)}`;
    }
    return formatDisplayDate(currentDate);
  };

  // Generate calendar grid cells based on view mode (Month: full month grid, Week: 7 days, Day: single date)
  const calendarDays = useMemo(() => {
    if (viewMode === "Month") {
      const start = getMonthStart(currentDate);
      const startDay = start.getDay();
      const totalDays = getMonthEnd(currentDate).getDate();
      const cells = [];
      for (let i = 0; i < startDay; i++) cells.push(null);
      for (let d = 1; d <= totalDays; d++) {
        cells.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), d));
      }
      while (cells.length % 7 !== 0) cells.push(null);
      return cells;
    }
    if (viewMode === "Week") {
      const start = getWeekStart(currentDate);
      const cells = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        cells.push(d);
      }
      return cells;
    }
    return [new Date(currentDate)];
  }, [currentDate, viewMode]);

  const { today: unifiedToday, upcoming: unifiedUpcoming } = useUnifiedSummary();
  const todayEvents = unifiedToday;
  const upcomingEvents = useMemo(() => {
    return unifiedUpcoming.slice(0, 5);
  }, [unifiedUpcoming]);

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: "Calendar" }]} />
      <div className="calender-layout">

        <div className="calendar-main">

          <div className="calendar-header">
            <div>
              <h1>Calendar</h1>
              <p>Manage schedules, deadlines and upcoming tasks.</p>
            </div>
            <div className="calendar-header-actions">
              <button className="today-btn" onClick={handleToday}>Today</button>
              {canManageEvents && (
                <button className="add-event-btn" onClick={() => { setEditEvent(null); setShowEventModal(true); }}>
                  <Plus size={18} />
                  Add Event
                </button>
              )}
            </div>
          </div>

          <div className="calendar-card">

            <div className="calendar-topbar">
              <div className="calendar-month">
                <button onClick={handlePrev} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
                  <ChevronLeft size={20} color="#6B7280" />
                </button>
                <h2>{getHeaderTitle()}</h2>
                <button onClick={handleNext} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
                  <ChevronRight size={20} color="#6B7280" />
                </button>
              </div>
              <div className="calendar-top-actions">
                <div className="calendar-tabs">
                  {["Month", "Week", "Day"].map((item) => (
                    <button
                      key={item}
                      className={item === viewMode ? "active-tab" : ""}
                      onClick={() => setViewMode(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="calendar-search">
                  <Search size={18} color="#9CA3AF" />
                  <input
                    type="text"
                    placeholder="Search events..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#9ca3af" }}>
                Loading events...
              </div>
            ) : (
              <div className="calendar-grid">
                {days.map((day) => (
                  <div key={day} className="calendar-day-name">{day}</div>
                ))}

                {calendarDays.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="calendar-date-box" style={{ background: "#fafafa" }} />;

                  const dayEvents = getEventsForDate(date);
                  const today = isToday(date);

                  return (
                    <div
                      key={index}
                      className={`calendar-date-box ${today ? "today-box" : ""}`}
                      onClick={() => {
                        setSelectedDay(date);
                        setShowDayPopup(true);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <p className={`date-number ${today ? "today-number" : ""}`}>
                        {date.getDate()}
                      </p>
                      {dayEvents.slice(0, 2).map((ev) => {
                        const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                        const sourceIcon = ev.source === "task" ? "📋" : ev.source === "deliverable" ? "📦" : ev.source === "project" ? "🚀" : "📅";
                        return (
                          <div
                            key={ev.id}
                            className="calendar-event"
                            style={{ background: colors.bg, marginBottom: 4, cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(ev);
                            }}
                          >
                            <p style={{ color: colors.text, fontSize: 11, margin: 0 }}>
                              {sourceIcon} {ev.title}
                            </p>
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <p style={{ margin: 0, fontSize: 11, color: "#6B7280" }}>
                          +{dayEvents.length - 2} more
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="calendar-footer">
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <div key={key}>
                  <span className="dot" style={{ background: TYPE_COLORS[key]?.dot || "#9ca3af" }} />
                  {label}
                </div>
              ))}
            </div>

          </div>
        </div>

        <div className="calender-sidebar">
          <div className="task-card">
            <h3>
              Today <span className="today-date">• {formatDisplayDate(new Date())}</span>
            </h3>
             <div className="agenda-list">
              {todayEvents.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No events scheduled for today.
                </p>
              ) : (
                todayEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                  return (
                    <div className="agenda-item" key={ev.id}>
                      <span className="agenda-dot" style={{ background: colors.dot }} />
                      <div className="agenda-content">
                        <p
                          onClick={() => setSelectedEvent(ev)}
                          style={{ margin: 0, fontWeight: 600, fontSize: "14px", color: "#111827", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.target.style.color = "#6366f1"; }}
                          onMouseLeave={(e) => { e.target.style.color = "#111827"; }}
                        >
                          {ev.title}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#6b7280" }}>
                          {formatEventDateTime(ev)}
                        </p>
                        <span style={{ fontSize: "11px", color: colors.text, fontWeight: 600 }}>
                          {TYPE_LABELS[ev.type] || ev.type}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

                  <br />
 
           <div className="task-card">
            <p style={{ fontWeight: "bold", fontSize: "20px", margin: 0 }}>Upcoming Events</p>
            <div className="deadline-list">
              {upcomingEvents.length === 0 ? (
                <p style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No upcoming events found.
                </p>
              ) : (
                upcomingEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                  return (
                    <div className="deadline-item" key={ev.id}>
                      <div style={{ flex: 1 }}>
                        <p
                          onClick={() => setSelectedEvent(ev)}
                          style={{ margin: 0, fontWeight: 600, fontSize: "14px", color: "#111827", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.target.style.color = "#6366f1"; }}
                          onMouseLeave={(e) => { e.target.style.color = "#111827"; }}
                        >
                          {ev.title}
                        </p>
                        <div className="dealine-date" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span className="deadline-date" style={{ color: colors.dot, fontSize: "13px" }}>{formatEventDateTime(ev)}</span>
                          <span style={{ fontSize: "12px", color: "#9ca3af" }}>{TYPE_LABELS[ev.type] || ev.type}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <DayPopup
        date={selectedDay}
        events={selectedDay ? getEventsForDate(selectedDay) : []}
        onClose={() => { setShowDayPopup(false); setSelectedDay(null); }}
        onEdit={handleEdit}
        onDelete={handleDelete}
        canManageEvents={canManageEvents}
        onItemClick={(ev) => setSelectedItem(ev)}
        deleteLoading={deleteLoading}
        onAddEvent={() => { setShowDayPopup(false); setSelectedDay(null); setEditEvent(null); setShowEventModal(true); }}
      />

      <Event
        isOpen={showEventModal}
        onClose={() => { setShowEventModal(false); setEditEvent(null); }}
        onEventCreated={handleEventCreated}
        editEvent={editEvent}
      />

      <EventInfoPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      {selectedItem && <ItemDetailPopup item={selectedItem} role={currentRole} onClose={() => setSelectedItem(null)} onEdit={handleEdit} />}
    </DashboardLayout>
  );
}

export default Calender;
