import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "../pages/Calender.css";
import "../components/Event.css";
import { ChevronLeft, ChevronRight, Search, Plus, Trash2, Edit3 } from "lucide-react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Event from "../components/Event";
import { authToken, getCurrentRole, getUser } from "../utils/auth";
import API_URL from "../config/api";
import { useUnifiedSummary } from "../hooks/useUnifiedSummary";

export const TYPE_COLORS = {
  meeting: { bg: "#eef2ff", text: "#6366f1", dot: "#6366f1" },
  task: { bg: "#eff6ff", text: "#3b82f6", dot: "#3b82f6" },
  other: { bg: "#fff7ed", text: "#f59e0b", dot: "#f59e0b" },
  deadline: { bg: "#fef2f2", text: "#ef4444", dot: "#ef4444" },
  personal: { bg: "#ecfdf5", text: "#22c55e", dot: "#22c55e" },
  project: { bg: "#f5f3ff", text: "#8b5cf6", dot: "#8b5cf6" },
  deliverable: { bg: "#f0fdf4", text: "#16a34a", dot: "#16a34a" },
};

export const TYPE_LABELS = {
  meeting: "Meeting",
  task: "Task",
  other: "Review",
  deadline: "Deadline",
  personal: "Personal",
  project: "Project",
  deliverable: "Deliverable",
};

function formatDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

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
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const [searchParams] = useSearchParams();
  const currentRole = getCurrentRole();
  const currentUser = getUser(currentRole);
  const canManageEvents = ["admin", "manager"].includes(currentRole);

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

  const handleEventCreated = () => {
    fetchEvents();
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    setDeleteLoading(eventId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${eventId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
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
                        const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
                        return (
                          <div
                            key={ev.id}
                            className="calendar-event"
                            style={{ background: colors.bg, marginBottom: 4, cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (ev.source === "manual" && canManageEvents) {
                                handleEdit(ev);
                              } else {
                                setSelectedDay(date);
                                setShowDayPopup(true);
                              }
                            }}
                          >
                            <p style={{ color: colors.text, fontSize: 11, margin: 0 }}>
                              {ev.title}
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
                  No events today
                </p>
              ) : (
                todayEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
                  const dateTimeStr = ev.start_date || ev.date || "";
                  const time = ev.all_day ? "All Day" : new Date(dateTimeStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  return (
                    <div className="agenda-item" key={ev.id}>
                      <span className="agenda-dot" style={{ background: colors.dot }} />
                      <div className="agenda-content">
                        <div className="agenda-top">
                          <h4>{time}</h4>
                          <span>{TYPE_LABELS[ev.type] || ev.type}</span>
                        </div>
                        <p>{ev.title}</p>
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
                  No upcoming events
                </p>
              ) : (
                upcomingEvents.map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
                  const dateStr = (ev.start_date || ev.date || "").split("T")[0].split(" ")[0];
                  const [year, month, day] = dateStr.split("-").map(Number);
                  const evDate = new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  return (
                    <div className="deadline-item" key={ev.id}>
                      <div>
                        <h4>{ev.title}</h4>
                        <div className="dealine-date" style={{ display: "flex", alignItems: "center", gap: 40 }}>
                          <p>{TYPE_LABELS[ev.type] || ev.type}</p>
                          <span className="deadline-date" style={{ color: colors.dot }}>{evDate}</span>
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

      {showDayPopup && selectedDay && (
        <div
          className="event-overlay"
          onClick={() => { setShowDayPopup(false); setSelectedDay(null); }}
          style={{ zIndex: 10001 }}
        >
          <div
            className="event-modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="event-header">
              <div>
                <p className="event-label" style={{ marginBottom: 8 }}>
                  {selectedDay.toLocaleDateString("en-US", { weekday: "long" })}
                </p>
                <h2 style={{ margin: 0, fontSize: 24 }}>
                  {selectedDay.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </h2>
              </div>
              <button className="event-close" onClick={() => { setShowDayPopup(false); setSelectedDay(null); }}>×</button>
            </div>

            <div className="event-step">
              {(() => {
                const dayEvents = getEventsForDate(selectedDay);
                if (dayEvents.length === 0) {
                  return (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <p style={{ color: "#9ca3af", marginBottom: 16 }}>No events for this day</p>
                      <button
                        className="btn-primary"
                        onClick={() => { setShowDayPopup(false); setSelectedDay(null); setEditEvent(null); setShowEventModal(true); }}
                      >
                        Create Event
                      </button>
                    </div>
                  );
                }
                return (
                  <>
                    {dayEvents.map((ev) => {
                      const colors = TYPE_COLORS[ev.type] || TYPE_COLORS.meeting;
                      const time = ev.all_day ? "All Day" :
                        `${new Date(ev.start_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} - ${ev.end_date ? new Date(ev.end_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}`;
                      return (
                        <div key={ev.id} style={{
                          padding: "14px 16px",
                          borderRadius: 12,
                          background: colors.bg,
                          marginBottom: 10,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: colors.text }}>
                                {ev.title}
                              </p>
                              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
                                {time} • {TYPE_LABELS[ev.type] || ev.type}
                              </p>
                              {ev.description && (
                                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#4b5563", lineHeight: 1.5 }}>
                                  {ev.description}
                                </p>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                              {canManageEvents && ev.source === "manual" && (
                                <button
                                  onClick={() => handleEdit(ev)}
                                  style={{
                                    border: "none", background: "white", borderRadius: 8,
                                    padding: "6px 8px", cursor: "pointer", color: colors.text,
                                    display: "flex", alignItems: "center",
                                  }}
                                  title="Edit"
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}
                              {canManageEvents && ev.source === "manual" && (
                                <button
                                  onClick={() => handleDelete(ev.id)}
                                  disabled={deleteLoading === ev.id}
                                  style={{
                                    border: "none", background: "white", borderRadius: 8,
                                    padding: "6px 8px", cursor: "pointer", color: "#ef4444",
                                    display: "flex", alignItems: "center", opacity: deleteLoading === ev.id ? 0.5 : 1,
                                  }}
                                  title="Delete"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {canManageEvents && (
                      <div style={{ marginTop: 12, textAlign: "center" }}>
                        <button
                          className="btn-primary"
                          onClick={() => { setShowDayPopup(false); setSelectedDay(null); setEditEvent(null); setShowEventModal(true); }}
                          style={{ padding: "8px 20px", fontSize: 13 }}
                        >
                          Add Another Event
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <Event
        isOpen={showEventModal}
        onClose={() => { setShowEventModal(false); setEditEvent(null); }}
        onEventCreated={handleEventCreated}
        editEvent={editEvent}
      />
    </DashboardLayout>
  );
}

export default Calender;
