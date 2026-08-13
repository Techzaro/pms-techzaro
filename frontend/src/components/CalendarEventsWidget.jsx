/**
 * CalendarEventsWidget.jsx
 * Dashboard widget component displaying a mini calendar and upcoming events summary.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ArrowUpRight, Clock, Plus } from "lucide-react";
import { rolePath, authToken } from "../utils/auth";
import API_URL from "../config/api";
import "./CalendarEventsWidget.css";

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
          onClick={() => navigate(rolePath("calender"))}
        >
          Full Calendar <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="cew-body">
        {/* Left: Mini Calendar Month View */}
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
                  onClick={() => navigate(rolePath("calender"))}
                >
                  {dayNum}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Upcoming Events List */}
        <div className="cew-events-list">
          <h4>Upcoming Schedule</h4>
          {loading ? (
            <p className="cew-empty-msg">Loading upcoming schedule...</p>
          ) : events.length === 0 ? (
            <div className="cew-no-events">
              <p>No upcoming events scheduled.</p>
              <button onClick={() => navigate(rolePath("calender"))}>+ Add Event</button>
            </div>
          ) : (
            <div className="cew-events-items">
              {events.map((ev) => (
                <div key={ev.id} className="cew-event-item" onClick={() => navigate(rolePath("calender"))}>
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
