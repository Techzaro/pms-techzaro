import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useCalendarData, triggerCalendarSync } from "../../hooks/useCalendarData";
import { TYPE_COLORS, TYPE_LABELS, DEFAULT_EVENT_COLOR } from "../../pages/Calender";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import "./RightSidebar.css";


const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function formatDisplayDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RightSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hoveredDate, setHoveredDate] = useState(null);
  const [hoverPopupPosition, setHoverPopupPosition] = useState({ top: 0, left: 0 });
  const calendarRef = useRef(null);
  const popupRef = useRef(null);

  const {
    events,
    loading,
    currentMonth,
    monthName,
    calendarDays,
    navigateMonth,
    goToToday,
    getEventsForDate,
    getEventIndicatorsForDate,
    isToday,
    refetch,
  } = useCalendarData();

  useEffect(() => {
    const handleSync = () => refetch();
    window.addEventListener("calendar-sync", handleSync);
    return () => window.removeEventListener("calendar-sync", handleSync);
  }, [refetch]);

  const handleDateClick = (date) => {
    if (!date) return;
    const dateStr = formatDate(date);
    const targetPath = `/${searchParams.get("role") || "admin"}/calender?date=${dateStr}`;
    onClose?.();
    navigate(targetPath);
  };

  const handleCellMouseEnter = (e, date) => {
    if (!date) return;
    const dayEvents = getEventsForDate(date);
    if (dayEvents.length > 0) {
      setHoveredDate({ date, events: dayEvents });
      const rect = e.currentTarget.getBoundingClientRect();
      const calendarRect = calendarRef.current?.getBoundingClientRect();
      if (calendarRect) {
        setHoverPopupPosition({
          top: rect.top - calendarRect.top - 10,
          left: rect.right - calendarRect.left + 10,
        });
      }
    }
  };

  const handleCellMouseLeave = () => {
    setHoveredDate(null);
  };

  const handleViewAllClick = () => {
    const role = searchParams.get("role") || "admin";
    onClose?.();
    navigate(`/${role}/calender`);
  };
  const handleTasksClick = () => {
    const role = searchParams.get("role") || "admin";
    onClose?.();
    navigate(`/${role}/tasks`);
  };
  const handleTodayClick = () => {
    goToToday();
    const today = new Date();
    const dateStr = formatDate(today);
    const targetPath = `/${searchParams.get("role") || "admin"}/calender?date=${dateStr}`;
    onClose?.();
    navigate(targetPath);
  };

  const getTypeColor = (type) => TYPE_COLORS[type]?.dot || "#9ca3af";
  const getTypeBg = (type) => TYPE_COLORS[type]?.bg || "#f3f4f6";
  const getTypeText = (type) => TYPE_COLORS[type]?.text || "#374151";
  const getTypeLabel = (type) => TYPE_LABELS[type] || type;
  const [tasks, setTasks] = useState([]);

  const fetchTodayTasks = useCallback(async () => {
    try {
      const token = authToken();
      const response = await fetch(`${API_URL}/my-tasks`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return;

      const data = await response.json();
      const today = new Date().toISOString().split("T")[0];
      const todayTasks = (data.data || []).filter(
        (task) => task.due_date?.split("T")[0] === today
      );

      setTasks(todayTasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    }
  }, []);

  useEffect(() => {
    fetchTodayTasks();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchTodayTasks();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Check every minute if the day changed and refetch if so
    let lastDate = new Date().toDateString();
    const interval = setInterval(() => {
      const currentDate = new Date().toDateString();
      if (currentDate !== lastDate) {
        lastDate = currentDate;
        fetchTodayTasks();
      }
    }, 60000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [fetchTodayTasks]);

  return (
    <>
      {isOpen && <div className="right-backdrop" onClick={onClose} />}
      <aside className={`right-sidebar ${isOpen ? "right-sidebar--open" : ""}`} ref={calendarRef}>
        <div className="right-card calendar-card">
          <div className="right-card-header">
            <div>
              <span className="calendar-label">{monthName}</span>
              <h3>Calendar</h3>
            </div>
            <div className="calendar-header-actions">
              <button className="calendar-nav-btn" onClick={() => navigateMonth(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <button className="calendar-nav-btn" onClick={goToToday} aria-label="Go to today">
                <Calendar size={16} />
              </button>
              <button className="calendar-nav-btn" onClick={() => navigateMonth(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </button>
              <button className="calendar-action" onClick={handleViewAllClick}>View All</button>
            </div>
          </div>

          <div className="calendar-grid">
            {DAYS.map((day) => (
              <div key={day} className="calendar-day-label">{day}</div>
            ))}

            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="calendar-cell empty" />;
              }

              const today = isToday(date);
              const dayEvents = getEventsForDate(date);
              const indicators = getEventIndicatorsForDate(date);
              const hasEvents = dayEvents.length > 0;

              return (
                <div
                  key={index}
                  className={`calendar-cell ${today ? "today" : ""} ${hasEvents ? "has-events" : ""}`}
                  onClick={() => handleDateClick(date)}
                  onMouseEnter={(e) => handleCellMouseEnter(e, date)}
                  onMouseLeave={handleCellMouseLeave}
                  style={{ cursor: hasEvents ? "pointer" : "default" }}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  {hasEvents && (
                    <div className="calendar-indicators">
                      {indicators.slice(0, 3).map((type) => (
                        <span
                          key={type}
                          className="calendar-indicator"
                          style={{ background: getTypeColor(type) }}
                          title={getTypeLabel(type)}
                        />
                      ))}
                      {indicators.length > 3 && (
                        <span className="calendar-indicator more" style={{ background: "#6b7280" }}>
                          +{indicators.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="right-card events-summary-card">
          <div className="right-card-header">
            <div>
              <span className="event-count">Upcoming</span>
              <h3>Events</h3>
            </div>
            <button className="event-btn" onClick={handleViewAllClick}>View All</button>
          </div>
          <div className="events-list">
            {loading ? (
              <div className="loading-state">Loading...</div>
            ) : events.length === 0 ? (
              <div className="empty-state">No upcoming events</div>
            ) : (
              events
                .filter((ev) => {
                  const start = ev.start_date?.split("T")[0];
                  const today = new Date().toISOString().split("T")[0];
                  return start && start >= today;
                })
                .slice(0, 5)
                .map((ev) => {
                  const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                  const dateParts = (ev.start_date || ev.date || "").split("T")[0].split(" ")[0].split("-");
                  const evDate = new Date(+dateParts[0], +dateParts[1] - 1, +dateParts[2]).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  const time = ev.all_day
                    ? "All Day"
                    : new Date(ev.start_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                  return (
                    <div
                      key={ev.id}
                      className="event-summary-item"
                      onClick={() => {
                        const targetPath = `/${searchParams.get("role") || "admin"}/calender?date=${dateStr}`;
                        onClose?.();
                        navigate(targetPath);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <span className="event-summary-dot" style={{ background: colors.dot }} />
                      <div className="event-summary-content">
                        <div className="event-summary-title">{ev.title}</div>
                        <div className="event-summary-meta">
                          <span className="event-summary-type" style={{ color: colors.dot }}>
                            {getTypeLabel(ev.type)}
                          </span>
                          <span className="event-summary-date">{evDate}</span>
                          {!ev.all_day && <span className="event-summary-time">{time}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
        {/* Tasks Card */}
        <div className="right-card tasks-card">
          <div className="right-card-header">
            <div>
              <span className="task-label">Tasks for Today</span>
              <h3>Today</h3>
            </div>

            <button className="task-btn" onClick={handleTasksClick}>
              View All
            </button>
          </div>

          <div className="tasks-list">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <div className="task-item" key={task.id}>
                  <h4>{task.title}</h4>
                  <p>{task.description}</p>
                </div>
              ))
            ) : (
              <p>No tasks assigned for today.</p>
            )}
          </div>
        </div>

        {hoveredDate && (
          <div
            className="hover-popup"
            style={{
              top: hoverPopupPosition.top,
              left: hoverPopupPosition.left,
            }}
            ref={popupRef}
          >
            <div className="hover-popup-arrow" />
            <div className="hover-popup-header">
              <span className="hover-popup-date">
                {hoveredDate.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </span>
              <span className="hover-popup-count">{hoveredDate.events.length} event{hoveredDate.events.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="hover-popup-events">
              {hoveredDate.events.slice(0, 5).map((ev) => {
                const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                const time = ev.all_day
                  ? "All Day"
                  : new Date(ev.start_date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
                return (
                  <div
                    key={ev.id}
                    className="event-summary-item"
                    onClick={() => {
                      const eventDate = ev.start_date?.split("T")[0];

                      const targetPath = `/${searchParams.get("role") || "admin"
                        }/calender?date=${eventDate}`;

                      onClose?.();
                      navigate(targetPath);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="hover-popup-event-title">{ev.title}</div>
                    <div className="hover-popup-event-meta">
                      <span className="hover-popup-event-type" style={{ color: colors.dot }}>
                        {getTypeLabel(ev.type)}
                      </span>
                      <span className="hover-popup-event-time">{time}</span>
                    </div>
                  </div>
                );
              })}
              {hoveredDate.events.length > 5 && (
                <div className="hover-popup-more">+{hoveredDate.events.length - 5} more</div>
              )}
            </div>
            <button className="hover-popup-view-all" onClick={() => handleDateClick(hoveredDate.date)}>
              View All Events
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

export default RightSidebar;