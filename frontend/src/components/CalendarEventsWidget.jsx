/**
 * CalendarEventsWidget.jsx
 * Exporting separate CalendarWidget and EventsWidget components along with the combined widget.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ArrowUpRight, Clock, Plus, Users, CalendarDays } from "lucide-react";
import { rolePath, authToken } from "../utils/auth";
import API_URL from "../config/api";
import "./CalendarEventsWidget.css";

/** 1. Standalone Calendar Widget (Mini Monthly Grid) */
export function CalendarWidget() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDayOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  const todayDateNum = new Date().getDate();
  const isCurrentMonth = new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <div className="calendar-widget-container" style={{ padding: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CalendarDays size={18} style={{ color: "#2563eb" }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>{monthName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={handlePrevMonth} style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}><ChevronLeft size={14} /></button>
          <button onClick={handleNextMonth} style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}><ChevronRight size={14} /></button>
          <button onClick={() => navigate(rolePath("calendar"))} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
            Full <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      <div className="cew-weekdays" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", fontWeight: 600, fontSize: "11px", color: "var(--text-secondary)", marginBottom: "6px" }}>
        <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
      </div>

      <div className="cew-days-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center" }}>
        {Array.from({ length: startDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="cew-day-cell empty"></div>
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const dayNum = i + 1;
          const isToday = isCurrentMonth && dayNum === todayDateNum;
          return (
            <div
              key={`day-${dayNum}`}
              className={`cew-day-cell ${isToday ? "today" : ""}`}
              onClick={() => navigate(rolePath("calendar"))}
              style={{ padding: "6px 0", borderRadius: "6px", fontSize: "12px", cursor: "pointer", background: isToday ? "#2563eb" : "var(--bg-card-subtle)", color: isToday ? "#fff" : "var(--text-dark)", fontWeight: isToday ? 700 : 500 }}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 2. Standalone Events Widget (Upcoming Schedule & Assignments) */
export function EventsWidget() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        setLoading(true);
        const token = authToken();
        const start = new Date().toISOString().split("T")[0];
        const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const res = await fetch(`${API_URL}/events?start=${start}&end=${end}`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (res.ok) {
          const data = await res.json();
          setEvents(Array.isArray(data) ? data.slice(0, 5) : (data.events || []).slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to fetch events widget data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUpcomingEvents();
  }, []);

  return (
    <div className="events-widget-container" style={{ padding: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CalendarIcon size={18} style={{ color: "#2563eb" }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>Upcoming Events</span>
        </div>
        <button
          onClick={() => navigate(rolePath("events"))}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
        >
          View All <ArrowUpRight size={12} />
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "center", padding: "20px 0" }}>Loading events...</p>
      ) : events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", background: "var(--bg-card-subtle)", borderRadius: "8px" }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--text-secondary)" }}>No upcoming events scheduled.</p>
          <button
            onClick={() => navigate(rolePath("events"))}
            style={{ background: "transparent", border: "1px solid #2563eb", color: "#2563eb", borderRadius: "6px", padding: "4px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            + Assign Event
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {events.map((ev) => (
            <div
              key={ev.id || ev.title}
              onClick={() => navigate(rolePath("events"))}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", background: "var(--bg-card-subtle)", border: "1px solid var(--border-color)", cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: ev.color || "#2563eb" }}></div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>{ev.title}</div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Clock size={11} /> {ev.start_date || "Today"}
                  </div>
                </div>
              </div>
              <ArrowUpRight size={14} style={{ color: "#94a3b8" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 3. Combined Calendar & Events Widget */
export default function CalendarEventsWidget() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        setLoading(true);
        const token = authToken();
        const start = new Date().toISOString().split("T")[0];
        const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const res = await fetch(`${API_URL}/events?start=${start}&end=${end}`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (res.ok) {
          const data = await res.json();
          setEvents(Array.isArray(data) ? data.slice(0, 5) : (data.events || []).slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to fetch calendar events widget data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchUpcomingEvents();
  }, []);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const startDayOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthName = currentDate.toLocaleString("default", { month: "long", year: "numeric" });
  const todayDateNum = new Date().getDate();
  const isCurrentMonth = new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <div className="calendar-events-widget">
      <div className="cew-header">
        <div className="cew-title">
          <CalendarIcon size={20} className="cew-icon" />
          <h3>Calendar & Upcoming Events</h3>
        </div>
        <button
          className="cew-view-full-btn"
          onClick={() => navigate(rolePath("calendar"))}
        >
          Full Calendar <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="cew-body">
        <div className="cew-mini-calendar">
          <div className="cew-cal-nav">
            <span className="cew-month-label">{monthName}</span>
            <div className="cew-nav-arrows">
              <button onClick={handlePrevMonth} title="Previous Month"><ChevronLeft size={16} /></button>
              <button onClick={handleNextMonth} title="Next Month"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="cew-weekdays">
            <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
          </div>
          <div className="cew-days-grid">
            {Array.from({ length: startDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="cew-day-cell empty"></div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const isToday = isCurrentMonth && dayNum === todayDateNum;
              return (
                <div
                  key={`day-${dayNum}`}
                  className={`cew-day-cell ${isToday ? "today" : ""}`}
                  onClick={() => navigate(rolePath("calendar"))}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cew-events-list">
          <h4>Upcoming Schedule</h4>
          {loading ? (
            <p className="cew-empty-msg">Loading upcoming schedule...</p>
          ) : events.length === 0 ? (
            <div className="cew-no-events">
              <p>No upcoming events scheduled.</p>
              <button onClick={() => navigate(rolePath("events"))}>+ Add Event</button>
            </div>
          ) : (
            <div className="cew-events-items">
              {events.map((ev) => (
                <div key={ev.id} className="cew-event-item" onClick={() => navigate(rolePath("events"))}>
                  <div className="cew-event-dot" style={{ background: ev.color || "#4f46e5" }}></div>
                  <div className="cew-event-details">
                    <div className="cew-event-title">{ev.title}</div>
                    <div className="cew-event-time">
                      <Clock size={12} /> {ev.start_date || "Today"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
