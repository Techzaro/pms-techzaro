import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useCalendarData } from "../../hooks/useCalendarData";
import { useUnifiedSummary } from "../../hooks/useUnifiedSummary";
import { TYPE_COLORS, TYPE_LABELS, DEFAULT_EVENT_COLOR } from "../../pages/Calender";
import EventsWidget from "../EventsWidget";
import EventInfoPopup from "../EventInfoPopup";
import ItemDetailPopup from "../ItemDetailPopup";
import DayPopup from "../DayPopup";
import { formatEventTime } from "../../utils/formatDateTime";
import { getCurrentRole } from "../../utils/auth";
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
  const [searchParams] = useSearchParams();
  // activeDate is the single global tooltip source. It holds the date and its events.
  const [activeDate, setActiveDate] = useState(null);
  const [hoverPopupPosition, setHoverPopupPosition] = useState({ top: 0, left: 0 });
  const calendarRef = useRef(null);


  const {
    currentMonth,
    monthName,
    calendarDays,
    navigateMonth,
    goToToday,
    getEventsForDate,
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
    setSelectedPopupDay(date);
  };

  // On click we set a single active date (global tooltip source) and position the tooltip to the LEFT
  // side of the sidebar calendar. Tooltip is rendered in document.body and uses fixed positioning.
  const handleCellClick = (e, date) => {
    if (!date) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const tooltipWidth = 260;
    // place tooltip to the left of the calendar cell
    let left = rect.left - tooltipWidth - 8;
    // ensure tooltip doesn't overflow on the left
    if (left < 8) left = 8;

    // compute top and clamp inside viewport. We don't know tooltip height exactly, so use a safe clamp.
    const top = Math.min(Math.max(rect.top, 8), window.innerHeight - 96);

    setHoverPopupPosition({ top, left });
    const dayEvents = getEventsForDate(date);
    setActiveDate({ date, events: dayEvents });
  };

  // Close tooltip when clicking outside the calendar card
  useEffect(() => {
    if (!activeDate) return;
    const handleClickOutside = (e) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setActiveDate(null);
      }
    };
    // Delay adding listener to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeDate]);

  const handleViewAllClick = () => {
    const role = getCurrentRole() || "admin";
    onClose?.();
    navigate(`/${role}/calender`);
  };
  const handleTodayClick = () => {
    goToToday();
    const today = new Date();
    const dateStr = formatDate(today);
    const role = getCurrentRole() || "admin";
    const targetPath = `/${role}/calender?date=${dateStr}`;
    onClose?.();
    navigate(targetPath);
  };

  const currentRole = getCurrentRole() || "admin";
  const { today: widgetToday, upcoming: widgetUpcoming } = useUnifiedSummary();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedPopupDay, setSelectedPopupDay] = useState(null);
  const [selectedPopupItem, setSelectedPopupItem] = useState(null);

  const getTypeLabel = (type) => TYPE_LABELS[type] || type;

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
              const hasEvents = dayEvents.length > 0;

              return (
                  <div
                       key={index}
                       className={`calendar-cell ${today ? "today" : ""} ${hasEvents ? "has-events" : ""}`}
                       onClick={(e) => handleCellClick(e, date)}
                       style={{ cursor: hasEvents ? "pointer" : "default" }}
                     >
                  <span className="calendar-day-number">{date.getDate()}</span>
                </div>
              );
            })}
          </div>

        </div>
        {activeDate && createPortal(
          <div
            className="hover-popup"
            role="dialog"
            aria-modal="false"
            style={{
              position: 'fixed',
              top: Math.min(Math.max(8, hoverPopupPosition.top), window.innerHeight - 96),
              left: Math.min(Math.max(8, hoverPopupPosition.left), window.innerWidth - 260),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setActiveDate(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16 }} title="Close">×</button>
            </div>
            <div className="hover-popup-header">
              <span className="hover-popup-date">
                {activeDate.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </span>
              <span className="hover-popup-count">{activeDate.events.length} event{activeDate.events.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="hover-popup-events">
              {activeDate.events.slice(0, 5).map((ev) => {
                const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                return (
                  <div
                    key={ev.id}
                    className="event-summary-item"
                    onClick={() => { setSelectedPopupItem(ev); setActiveDate(null); }}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="hover-popup-event-title">{ev.title}</div>
                    <div className="hover-popup-event-meta">
                      <span className="hover-popup-event-type" style={{ color: colors.dot }}>
                        {getTypeLabel(ev.type)}
                      </span>
                      <span className="hover-popup-event-time">{formatEventTime(ev)}</span>
                    </div>
                  </div>
                );
              })}
              {activeDate.events.length > 5 && (
                <div className="hover-popup-more">+{activeDate.events.length - 5} more</div>
              )}
            </div>
            <button className="hover-popup-view-all" onClick={() => { handleDateClick(activeDate.date); setActiveDate(null); }}>
              View All
            </button>
          </div>,
          document.body
        )}

        <EventsWidget
          todayEvents={widgetToday}
          upcomingEvents={widgetUpcoming}
          onEventClick={(ev) => setSelectedEvent(ev)}
          currentRole={currentRole}
        />
      </aside>
      {selectedEvent && <EventInfoPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {selectedPopupDay && (
        <DayPopup
          date={selectedPopupDay}
          events={getEventsForDate(selectedPopupDay)}
          onClose={() => setSelectedPopupDay(null)}
          canManageEvents={["admin", "manager"].includes(currentRole)}
          onItemClick={(ev) => setSelectedPopupItem(ev)}
        />
      )}
      {selectedPopupItem && (
        <ItemDetailPopup
          item={selectedPopupItem}
          role={currentRole}
          onClose={() => setSelectedPopupItem(null)}
        />
      )}
    </>
  );
}

export default RightSidebar;
