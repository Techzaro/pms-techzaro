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
import { useSearchParams, useLocation } from "react-router-dom";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";
import "../pages/Calender.css";
import "../components/Event.css";
import { ChevronLeft, ChevronRight, Search, Plus, Calendar as CalendarIcon, Clock, Globe } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import Event from "../components/Event";
import EventInfoPopup from "../components/EventInfoPopup";
import ItemDetailPopup from "../components/ItemDetailPopup";
import DayPopup from "../components/DayPopup";
import { formatLocalDate, convertToLocal, getUserTimezone, getTimezoneOffsetDisplay } from "../utils/timezoneUtils";
import { authToken, getCurrentRole, getUser } from "../utils/auth";
import API_URL from "../config/api";
import { publish } from "../utils/eventBus";
import { showSuccessMessage } from "../utils/notify";
import { DEFAULT_EVENT_COLOR, TYPE_COLORS, TYPE_LABELS } from "../utils/calendarConstants";

const CALENDAR_VIEWS = [
  { key: "Day", label: "Daily" },
  { key: "Week", label: "Weekly" },
  { key: "Month", label: "Monthly" },
  { key: "Upcoming", label: "Upcoming" },
];

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
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const [searchParams] = useSearchParams();
  const location = useLocation();
  const currentRole = getCurrentRole();
  const currentUser = getUser(currentRole);
  const userTimezone = getUserTimezone() || "UTC";

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
    if (viewMode === "Upcoming") {
      const start = new Date();
      const end = new Date();
      end.setMonth(end.getMonth() + 3);
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
  useAutoRefresh(fetchEvents, { events: ['event:created', 'event:updated', 'event:deleted', 'data:changed'] });

  // Handle draft restoration from DraftCenter
  useEffect(() => {
    const draftId = location.state?.openDraft;
    if (!draftId) return;

    // Clear the state to prevent re-triggering
    window.history.replaceState({}, document.title);

    setRestoreDraftId(draftId);
    setEditEvent(null);
    setShowEventModal(true);
  }, [location.state]);

  // Navigate to previous month/week/day
  const handlePrev = () => {
    if (viewMode === "Upcoming") return;
    const d = new Date(currentDate);
    if (viewMode === "Month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "Week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    if (viewMode === "Upcoming") return;
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

  // Filter events that fall within a given date using user local timezone (SRS Sec 20)
  const getEventsForDate = (date) => {
    const dateStr = formatDate(date);
    return events.filter((ev) => {
      const start = formatLocalDate(ev.start_date, userTimezone, "YYYY-MM-DD");
      const end = ev.end_date ? formatLocalDate(ev.end_date, userTimezone, "YYYY-MM-DD") : start;
      return dateStr >= start && dateStr <= end;
    });
  };

  const getHeaderTitle = () => {
    if (viewMode === "Upcoming") {
      return "Upcoming Agenda & Deadlines";
    }
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

  // Group events for Upcoming View (SRS Sec 20)
  const upcomingGrouped = useMemo(() => {
    if (viewMode !== "Upcoming") return [];
    const sorted = [...events].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    const groups = {};
    sorted.forEach((ev) => {
      const dayKey = formatLocalDate(ev.start_date, userTimezone, "YYYY-MM-DD");
      if (!groups[dayKey]) {
        groups[dayKey] = {
          dateStr: dayKey,
          displayDate: formatLocalDate(ev.start_date, userTimezone, "dddd, MMMM DD, YYYY"),
          items: [],
        };
      }
      groups[dayKey].items.push(ev);
    });
    return Object.values(groups);
  }, [events, viewMode, userTimezone]);

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
              <p>Manage schedules, deadlines and upcoming tasks in your local timezone ({userTimezone}).</p>
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
                {viewMode !== "Upcoming" && (
                  <button onClick={handlePrev} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
                    <ChevronLeft size={20} color="var(--text-secondary)" />
                  </button>
                )}
                <h2>{getHeaderTitle()}</h2>
                {viewMode !== "Upcoming" && (
                  <button onClick={handleNext} style={{ border: "none", background: "none", cursor: "pointer", padding: 4 }}>
                    <ChevronRight size={20} color="var(--text-secondary)" />
                  </button>
                )}
              </div>
              <div className="calendar-top-actions">
                {/* Active Timezone Indicator (SRS Sec 20) */}
                <div
                  className="calendar-tz-indicator"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "7px 12px",
                    borderRadius: "12px",
                    background: "var(--bg-hover, #f1f5f9)",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--color-primary, #4f46e5)",
                    whiteSpace: "nowrap",
                  }}
                  title={`Active timezone: ${userTimezone} ${getTimezoneOffsetDisplay(userTimezone)}. All schedule times are rendered in your local time.`}
                >
                  <Globe size={14} style={{ color: "var(--color-primary, #4f46e5)", flexShrink: 0 }} />
                  <span>Timezone: <strong>{userTimezone}</strong> {getTimezoneOffsetDisplay(userTimezone)}</span>
                </div>

                <div className="calendar-tabs">
                  {CALENDAR_VIEWS.map((item) => (
                    <button
                      key={item.key}
                      className={item.key === viewMode ? "active-tab" : ""}
                      onClick={() => setViewMode(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="calendar-search">
                  <Search size={18} color="var(--text-muted)" />
                  <input
                    type="text"
                    placeholder="Search by event title or description..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                Loading events...
              </div>
            ) : viewMode === "Upcoming" ? (
              /* Dedicated Upcoming View (SRS Sec 20) */
              <div className="calendar-upcoming-view" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", minHeight: 400 }}>
                {upcomingGrouped.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                    No upcoming events or task deadlines in the next 3 months.
                  </div>
                ) : (
                  upcomingGrouped.map((group) => (
                    <div key={group.dateStr} style={{ background: "var(--bg-card)", borderRadius: "10px", border: "1px solid var(--border-light, #e2e8f0)", overflow: "hidden" }}>
                      <div style={{ padding: "10px 16px", background: "var(--bg-hover, #f8fafc)", borderBottom: "1px solid var(--border-light, #e2e8f0)", fontWeight: 700, fontSize: "14px", color: "var(--text-heading)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <CalendarIcon size={15} style={{ color: "var(--color-primary, #4f46e5)" }} />
                        {group.displayDate}
                      </div>
                      <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {group.items.map((ev) => {
                          const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                          const sourceIcon = ev.source === "task" ? "📋" : ev.source === "deliverable" ? "📦" : ev.source === "project" ? "🚀" : "📅";
                          const timeStr = ev.all_day ? "All Day" : convertToLocal(ev.start_date, userTimezone, "hh:mm A");
                          return (
                            <div
                              key={ev.id}
                              onClick={() => setSelectedItem(ev)}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                borderRadius: "8px",
                                background: colors.bg || "var(--bg-hover)",
                                border: `1px solid ${colors.border || "var(--border-light)"}`,
                                cursor: "pointer",
                                gap: "12px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontSize: "16px" }}>{sourceIcon}</span>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: "13px", color: colors.text || "var(--text-primary)" }}>
                                    {ev.title}
                                  </div>
                                  {ev.project_title && (
                                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                      Project: {ev.project_title}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                                  <Clock size={12} /> {timeStr}
                                </span>
                                <span style={{ fontSize: "11px", fontWeight: 600, background: colors.dot || "var(--color-primary)", color: "#fff", padding: "2px 8px", borderRadius: "10px" }}>
                                  {TYPE_LABELS[ev.type] || ev.type || "Event"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="calendar-grid">
                {days.map((day) => (
                  <div key={day} className="calendar-day-name">{day}</div>
                ))}

                {calendarDays.map((date, index) => {
                  if (!date) return <div key={`empty-${index}`} className="calendar-date-box" style={{ background: "var(--color-calendar-cell)" }} />;

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
                        <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>
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
                  <span className="dot" style={{ background: TYPE_COLORS[key]?.dot || "var(--text-muted)" }} />
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
                <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No events scheduled for today.
                </p>
              ) : (
                todayEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                  const timeFormatted = ev.all_day ? "All Day" : convertToLocal(ev.start_date, userTimezone, "hh:mm A");
                  return (
                    <div className="agenda-item" key={ev.id}>
                      <span className="agenda-dot" style={{ background: colors.dot }} />
                      <div className="agenda-content">
                        <p
                          onClick={() => setSelectedEvent(ev)}
                          style={{ margin: 0, fontWeight: 600, fontSize: "14px", color: "var(--text-heading)", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.target.style.color = "var(--color-primary)"; }}
                          onMouseLeave={(e) => { e.target.style.color = "var(--text-heading)"; }}
                        >
                          {ev.title}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>
                          {timeFormatted}
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
                <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "16px 0" }}>
                  No upcoming events found.
                </p>
              ) : (
                upcomingEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                  const timeFormatted = ev.all_day ? "All Day" : convertToLocal(ev.start_date, userTimezone, "DD MMM, hh:mm A");
                  return (
                    <div className="deadline-item" key={ev.id}>
                      <div style={{ flex: 1 }}>
                        <p
                          onClick={() => setSelectedEvent(ev)}
                          style={{ margin: 0, fontWeight: 600, fontSize: "14px", color: "var(--text-heading)", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.target.style.color = "var(--color-primary)"; }}
                          onMouseLeave={(e) => { e.target.style.color = "var(--text-heading)"; }}
                        >
                          {ev.title}
                        </p>
                        <div className="dealine-date" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span className="deadline-date" style={{ color: colors.dot, fontSize: "13px" }}>{timeFormatted}</span>
                          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{TYPE_LABELS[ev.type] || ev.type}</span>
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
        onClose={() => { setShowEventModal(false); setEditEvent(null); setRestoreDraftId(null); }}
        onEventCreated={handleEventCreated}
        editEvent={editEvent}
        restoreDraftId={restoreDraftId}
      />

      <EventInfoPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      {selectedItem && <ItemDetailPopup item={selectedItem} role={currentRole} onClose={() => setSelectedItem(null)} onEdit={handleEdit} />}
    </DashboardLayout>
  );
}

export default Calender;
