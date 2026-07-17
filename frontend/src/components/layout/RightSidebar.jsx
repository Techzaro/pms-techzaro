/**
 * RightSidebar - Collapsible right-side panel showing a mini calendar and
 * an events widget. Provides month navigation, day hover previews (via a
 * portal), and quick access to event details. Syncs with external calendar
 * updates through a "calendar-sync" custom event.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useCalendarData } from "../../hooks/useCalendarData";
import { useUnifiedSummary } from "../../hooks/useUnifiedSummary";
import { TYPE_COLORS, TYPE_LABELS, DEFAULT_EVENT_COLOR } from "../../utils/calendarConstants";
import EventsWidget from "../EventsWidget";
import EventInfoPopup from "../EventInfoPopup";
import ItemDetailPopup from "../ItemDetailPopup";
import DayPopup from "../DayPopup";
import { formatEventTime } from "../../utils/formatDateTime";
import { getCurrentRole } from "../../utils/auth";
import "./RightSidebar.css";


/** Abbreviated day-of-week labels for the calendar grid header. */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOVER_DELAY = 200; // ms before hover tooltip appears
const LEAVE_DELAY = 150; // ms before hover tooltip disappears

/**
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
function RightSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [hoverDate, setHoverDate] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ top: 0, left: 0 });
  const hoverTimeoutRef = useRef(null);
  const calendarRef = useRef(null);

  // ── Calendar hook – provides month data, events, and navigation ──
  const {
    monthName,
    calendarDays,
    navigateMonth,
    goToToday,
    getEventsForDate,
    isToday,
    refetch,
  } = useCalendarData();

  // Re-fetch calendar data when other components dispatch a "calendar-sync" event
  useEffect(() => {
    const handleSync = () => refetch();
    window.addEventListener("calendar-sync", handleSync);
    return () => window.removeEventListener("calendar-sync", handleSync);
  }, [refetch]);

  /** Calculate tooltip position to keep it within the viewport. */
  const getTooltipPosition = useCallback((cellRect) => {
    const tooltipWidth = 260;
    let left = cellRect.left - tooltipWidth - 8;
    if (left < 8) left = 8;
    const top = Math.min(Math.max(cellRect.top, 8), window.innerHeight - 96);
    return { top, left };
  }, []);

  /** Show hover tooltip after a short delay. */
  const handleCellHover = useCallback((e, date) => {
    if (!date) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverPosition(getTooltipPosition(rect));
      setHoverDate(date);
    }, HOVER_DELAY);
  }, [getTooltipPosition]);

  /** Hide hover tooltip after a short delay. */
  const handleCellLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverDate(null);
    }, LEAVE_DELAY);
  }, []);

  /** Open the day popup when a calendar cell is clicked. */
  const handleCellClick = useCallback((date) => {
    if (!date) return;
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoverDate(null);
    setSelectedPopupDay(date);
  }, []);

  /** Navigate to the full calendar page and close the sidebar. */
  const handleViewAllClick = () => {
    const role = getCurrentRole() || "admin";
    onClose?.();
    navigate(`/${role}/calender`);
  };

  const currentRole = getCurrentRole() || "admin";
  const { today: widgetToday, upcoming: widgetUpcoming } = useUnifiedSummary();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedPopupDay, setSelectedPopupDay] = useState(null);
  const [selectedPopupItem, setSelectedPopupItem] = useState(null);

  /** Map event type keys to human-readable labels. */
  const getTypeLabel = (type) => TYPE_LABELS[type] || type;

  return (
    <>
      {/* Backdrop overlay when sidebar is open on mobile */}
      {isOpen && <div className="right-backdrop" onClick={onClose} />}
      <aside className={`right-sidebar ${isOpen ? "right-sidebar--open" : ""}`} ref={calendarRef}>
        {/* ── Calendar card ── */}
        <div className="right-card calendar-card">
          <div className="right-card-header">
            <div>
              <span className="calendar-label">{monthName}</span>
              <h3>Calendar</h3>
            </div>
            <div className="calendar-header-actions">
              <div className="calendar-nav-group">
                <button className="calendar-nav-btn" onClick={() => navigateMonth(-1)} aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <button className="calendar-nav-btn" onClick={goToToday} aria-label="Go to today">
                  <Calendar size={16} />
                </button>
                <button className="calendar-nav-btn" onClick={() => navigateMonth(1)} aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>
              <button className="calendar-action" onClick={handleViewAllClick}>View All</button>
            </div>
          </div>

          {/* Calendar grid – 7 column layout with day labels + date cells */}
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
              const isHovered = hoverDate && date.getTime() === hoverDate.getTime();

              return (
                <div
                  key={index}
                  className={`calendar-cell ${today ? "today" : ""} ${hasEvents ? "has-events" : ""} ${isHovered ? "hovered" : ""}`}
                  onClick={() => handleCellClick(date)}
                  onMouseEnter={(e) => handleCellHover(e, date)}
                  onMouseLeave={handleCellLeave}
                  style={{ cursor: hasEvents ? "pointer" : "default" }}
                >
                  <span className="calendar-day-number">{date.getDate()}</span>
                  {hasEvents && <span className="calendar-cell-dot" />}
                </div>
              );
            })}
          </div>

        </div>
        {/* Hover tooltip – rendered via portal so it can overflow the sidebar */}
        {hoverDate && createPortal(
          (() => {
            const dayEvents = getEventsForDate(hoverDate);
            return (
              <div
                className="hover-popup"
                style={{
                  position: 'fixed',
                  top: Math.min(Math.max(8, hoverPosition.top), window.innerHeight - 96),
                  left: Math.min(Math.max(8, hoverPosition.left), window.innerWidth - 260),
                }}
                onMouseEnter={() => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current); }}
                onMouseLeave={handleCellLeave}
              >
                <div className="hover-popup-header">
                  <span className="hover-popup-date">
                    {hoverDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </span>
                  <span className="hover-popup-count">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="hover-popup-events">
                  {dayEvents.slice(0, 5).map((ev) => {
                    const colors = TYPE_COLORS[ev.type] || DEFAULT_EVENT_COLOR;
                    return (
                      <div
                        key={ev.id}
                        className="event-summary-item"
                        onClick={(e) => { e.stopPropagation(); setSelectedPopupItem(ev); setHoverDate(null); }}
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
                  {dayEvents.length > 5 && (
                    <div className="hover-popup-more">+{dayEvents.length - 5} more</div>
                  )}
                </div>
                <button className="hover-popup-view-all" onClick={() => { setSelectedPopupDay(hoverDate); setHoverDate(null); }}>
                  View All
                </button>
              </div>
            );
          })(),
          document.body
        )}

        {/* Events widget – shows today's and upcoming events */}
        <EventsWidget
          todayEvents={widgetToday}
          upcomingEvents={widgetUpcoming}
          onEventClick={(ev) => setSelectedEvent(ev)}
          currentRole={currentRole}
        />
      </aside>
      {/* Event info popup – shown when clicking an event in the widget */}
      {selectedEvent && <EventInfoPopup event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
      {/* Day popup – shows all events for a specific date */}
      {selectedPopupDay && (
        <DayPopup
          date={selectedPopupDay}
          events={getEventsForDate(selectedPopupDay)}
          onClose={() => setSelectedPopupDay(null)}
          canManageEvents={["admin", "manager"].includes(currentRole)}
          onItemClick={(ev) => setSelectedPopupItem(ev)}
        />
      )}
      {/* Item detail popup – shows full details for a hovered/clicked event */}
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
