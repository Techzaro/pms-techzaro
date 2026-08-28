/**
 * CalendarEventsWidget.jsx
 * Exporting separate CalendarWidget, EventsWidget, KnowledgeBaseWidget, and combined widget.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Clock,
  Plus,
  Users,
  CalendarDays,
  BookOpen,
  Eye,
  Megaphone,
  User,
} from "lucide-react";
import { rolePath, authToken } from "../utils/auth";
import API_URL from "../config/api";
import "./CalendarEventsWidget.css";

/** 1. Standalone Calendar Widget (Mini Monthly Grid) */
export function CalendarWidget() {
  const { t } = useTranslation();
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
    <div className="calendar-widget-container">
      <div className="cew-header-row">
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <CalendarDays size={18} style={{ color: "#2563eb" }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>{monthName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button onClick={handlePrevMonth} style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}><ChevronLeft size={14} /></button>
          <button onClick={handleNextMonth} style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}><ChevronRight size={14} /></button>
          <button onClick={() => navigate(rolePath("calendar"))} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", marginLeft: "4px" }}>
            {t("Full", { defaultValue: "Full" })} <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      <div className="cew-weekdays">
        <span>{t("S")}</span><span>{t("M")}</span><span>{t("T")}</span><span>{t("W")}</span><span>{t("T")}</span><span>{t("F")}</span><span>{t("S")}</span>
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
  );
}

/** 2. Standalone Events Widget (Upcoming Schedule & Announcements) */
export function EventsWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        setLoading(true);
        const token = authToken();
        const res = await fetch(`${API_URL}/events?all=true`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          setEvents(list.slice(0, 5));
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
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>{t("Upcoming Events", { defaultValue: "Upcoming Events" })}</span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => navigate(rolePath("events/create"))}
            style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "3px 8px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}
          >
            <Plus size={13} /> {t("Add", { defaultValue: "Add" })}
          </button>
          <button
            onClick={() => navigate(rolePath("events"))}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            {t("View All", { defaultValue: "View All" })} <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "center", padding: "20px 0" }}>{t("Loading events...", { defaultValue: "Loading events..." })}</p>
      ) : !Array.isArray(events) || events.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", background: "var(--bg-card-subtle)", borderRadius: "8px" }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--text-secondary)" }}>{t("No upcoming events scheduled.", { defaultValue: "No upcoming events scheduled." })}</p>
          <button
            onClick={() => navigate(rolePath("events/create"))}
            style={{ background: "transparent", border: "1px solid #2563eb", color: "#2563eb", borderRadius: "6px", padding: "4px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            {t("+ Create Event", { defaultValue: "+ Create Event" })}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {events.map((ev) => {
            if (!ev) return null;
            const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_announcement || ev.is_global;
            const dateStr = ev.start_date ? new Date(ev.start_date).toLocaleDateString([], { month: "short", day: "numeric" }) : t("Upcoming", { defaultValue: "Upcoming" });

            return (
              <div
                key={ev.id || ev.title}
                onClick={() => navigate(rolePath("events"))}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", background: "var(--bg-card-subtle)", border: "1px solid var(--border-color)", cursor: "pointer", transition: "background 0.15s ease" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isAnnounce ? "#f59e0b" : (ev.category?.color || ev.color || "#2563eb"), flexShrink: 0 }}></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span><Clock size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {dateStr}</span>
                      {isAnnounce ? (
                        <span style={{ color: "#d97706", fontWeight: 600 }}>{t("Announcement", { defaultValue: "Announcement" })}</span>
                      ) : (
                        <span>{t(ev.category?.name || ev.type || "Event")}</span>
                      )}
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 3. Standalone Knowledge Base Widget (Recently Added/Updated Docs) */
export function KnowledgeBaseWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        setLoading(true);
        const token = authToken();
        const res = await fetch(`${API_URL}/knowledge-base?all=1`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          setArticles(list.slice(0, 5));
        }
      } catch (err) {
        console.error("Failed to fetch KB widget data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);

  return (
    <div className="events-widget-container" style={{ padding: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <BookOpen size={18} style={{ color: "#2563eb" }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-heading)" }}>{t("Knowledge Base", { defaultValue: "Knowledge Base" })}</span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => navigate(rolePath("knowledge-base/create"))}
            style={{ background: "transparent", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "3px 8px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "2px" }}
          >
            <Plus size={13} /> {t("Add", { defaultValue: "Add" })}
          </button>
          <button
            onClick={() => navigate(rolePath("knowledge-base"))}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            {t("View All", { defaultValue: "View All" })} <ArrowUpRight size={12} />
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", textAlign: "center", padding: "20px 0" }}>{t("Loading articles...", { defaultValue: "Loading articles..." })}</p>
      ) : !Array.isArray(articles) || articles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", background: "var(--bg-card-subtle)", borderRadius: "8px" }}>
          <p style={{ margin: "0 0 8px 0", fontSize: "13px", color: "var(--text-secondary)" }}>{t("No documents published yet.", { defaultValue: "No documents published yet." })}</p>
          <button
            onClick={() => navigate(rolePath("knowledge-base/create"))}
            style={{ background: "transparent", border: "1px solid #2563eb", color: "#2563eb", borderRadius: "6px", padding: "4px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
          >
            {t("+ Create Document", { defaultValue: "+ Create Document" })}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {articles.map((item) => {
            if (!item) return null;
            const updatedDate = item.updated_at ? new Date(item.updated_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "";
            const catName = item.categoryRelation?.name || item.category || "";

            return (
              <div
                key={item.id}
                onClick={() => navigate(rolePath("knowledge-base"))}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "8px", background: "var(--bg-card-subtle)", border: "1px solid var(--border-color)", cursor: "pointer", transition: "background 0.15s ease" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                  <BookOpen size={16} style={{ color: "#2563eb", flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "#2563eb", fontWeight: 500 }}>{t(catName)}</span>
                      {updatedDate && <span>&bull; {updatedDate}</span>}
                      {item.views_count > 0 && <span>&bull; {t("{{count}} views", { defaultValue: `${item.views_count} views`, count: item.views_count })}</span>}
                    </div>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 4. Combined Calendar & Events Widget */
export default function CalendarEventsWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUpcomingEvents = async () => {
      try {
        setLoading(true);
        const token = authToken();
        const res = await fetch(`${API_URL}/events?all=true`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
          skipLoader: true,
        });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
          setEvents(list.slice(0, 5));
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
          <h3>{t("Calendar & Upcoming Events", { defaultValue: "Calendar & Upcoming Events" })}</h3>
        </div>
        <button
          className="cew-view-full-btn"
          onClick={() => navigate(rolePath("calendar"))}
        >
          {t("Full Calendar", { defaultValue: "Full Calendar" })} <ArrowUpRight size={14} />
        </button>
      </div>

      <div className="cew-body">
        <div className="cew-mini-calendar">
          <div className="cew-cal-nav">
            <span className="cew-month-label">{monthName}</span>
            <div className="cew-nav-arrows">
              <button onClick={handlePrevMonth} title={t("Previous Month", { defaultValue: "Previous Month" })}><ChevronLeft size={16} /></button>
              <button onClick={handleNextMonth} title={t("Next Month", { defaultValue: "Next Month" })}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="cew-weekdays">
            <span>{t("S")}</span><span>{t("M")}</span><span>{t("T")}</span><span>{t("W")}</span><span>{t("T")}</span><span>{t("F")}</span><span>{t("S")}</span>
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
          <h4>{t("Upcoming Schedule", { defaultValue: "Upcoming Schedule" })}</h4>
          {loading ? (
            <p className="cew-empty-msg">{t("Loading upcoming schedule...", { defaultValue: "Loading upcoming schedule..." })}</p>
          ) : !Array.isArray(events) || events.length === 0 ? (
            <div className="cew-no-events">
              <p>{t("No upcoming events scheduled.", { defaultValue: "No upcoming events scheduled." })}</p>
              <button onClick={() => navigate(rolePath("events/create"))}>{t("+ Add Event", { defaultValue: "+ Add Event" })}</button>
            </div>
          ) : (
            <div className="cew-events-items">
              {events.map((ev) => (
                <div key={ev?.id || ev?.title} className="cew-event-item" onClick={() => navigate(rolePath("events"))}>
                  <div className="cew-event-dot" style={{ background: ev?.color || "#4f46e5" }}></div>
                  <div className="cew-event-details">
                    <div className="cew-event-title">{ev?.title}</div>
                    <div className="cew-event-time">
                      <Clock size={12} /> {ev?.start_date ? new Date(ev.start_date).toLocaleDateString([], { month: "short", day: "numeric" }) : t("Today", { defaultValue: "Today" })}
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
