import React, { useState } from "react";
import "../pages/Calender.css";
import "../components/Event.css";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
} from "lucide-react";

import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import Breadcrumb from "../components/Breadcrumb";
import "../components/layout/DashboardLayout.css";
import Event from "../components/Event";

const calendarData = [
  {
    day: 1,
    events: [
      {
  
        title: "Design Review",
        time: "9:30 AM",
        className: "event-purple",
         
      },
    ],
  },
  {
    day: 2,
    events: [
      {
      
        title: "Client Call",
        time: "9:30 AM",
        className: "event-green",
      },
    ],
  },
  {
    day: 3,
    events: [
      {
        
        title: "Project Sync",
        time: "9:30 AM",
        className: "event-purple",
      },
    ],
  },
  {
    day: 5,
    events: [
      {
        
        title: "UI Workshop",
        time: "9:30 AM",
        className: "event-orange",
      },
    ],
  },
];

const Calender = () => {
  const [viewMode, setViewMode] = useState("Month");
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showDayPopup, setShowDayPopup] = useState(false);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getTotalBoxes = () => {
    if (viewMode === "Day") return 1;
    if (viewMode === "Week") return 7;
    return 35;
  };

  const totalBoxes = getTotalBoxes();

  return (
    <div className="dashboard-page">
      <Header />

      <div className="main-layout">
        <Sidebar />

        <div className="dashboard-content">
          <Breadcrumb items={[{ label: "Calendar" }]} />
          <div className="calender-layout">

            {/* LEFT SIDE */}
            <div className="calendar-main">

          {/* HEADER */}
          <div className="calendar-header">

            <div>
              <h1>Calendar</h1>

              <p>
                Manage schedules, deadlines and upcoming tasks.
              </p>
            </div>

            <div className="calendar-header-actions">

              <button className="today-btn">
                Today
              </button>

              <button className="add-event-btn" onClick={() => setShowEventModal(true)}>
                <Plus size={18} />
                Add Event
              </button>

            </div>

          </div>

          {/* CARD */}
          <div className="calendar-card">

            {/* TOPBAR */}
            <div className="calendar-topbar">

              {/* MONTH */}
              <div className="calendar-month">

                <ChevronLeft size={20} color="#6B7280" />

                <h2>May 2026</h2>

                <ChevronRight size={20} color="#6B7280" />

              </div>

              {/* ACTIONS */}
              <div className="calendar-top-actions">

                {/* TABS */}
                <div className="calendar-tabs">

                  {["Month", "Week", "Day"].map((item, index) => (
                    <button
                      key={index}
                      className={item === viewMode ? "active-tab" : ""}
                      onClick={() => setViewMode(item)}
                    >
                      {item}
                    </button>
                  ))}

                </div>

                {/* SEARCH */}
                <div className="calendar-search">

                  <Search size={18} color="#9CA3AF" />

                  <input
                    type="text"
                    placeholder="Search events..."
                  />

                </div>

              </div>

            </div>

            {/* GRID */}
            <div className="calendar-grid">

              {/* DAYS */}
              {days.map((day, index) => (
                <div
                  key={index}
                  className="calendar-day-name"
                >
                  {day}
                </div>
              ))}

              {/* DATES */}
              {Array.from({ length: totalBoxes }).map((_, index) => {

                const currentDay = index + 1;

                const dayData = calendarData.find(
                  (item) => item.day === currentDay
                );

                return (
                  <div
                    key={index}
                    className="calendar-date-box"
                    onClick={() => {
                      if (currentDay <= 31) {
                        setSelectedDay(currentDay);
                        setShowDayPopup(true);
                      }
                    }}
                    style={{ cursor: currentDay <= 31 ? "pointer" : "default" }}
                  >

                    <p className="date-number">
                      {currentDay <= 31 ? currentDay : ""}
                    </p>

                    {dayData?.events.map((event, i) => (
                      <div
                        key={i}
                        className={`calendar-event ${event.className}`}
                      >

                        <p>{event.title}</p>

                        <span>{event.time}</span>

                      </div>
                    ))}

                    {dayData && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          color: "#6B7280",
                        }}
                      >
                        +1 more
                      </p>
                    )}

                  </div>
                );
              })}

            </div>

            {/* FOOTER */}
            <div className="calendar-footer">

              <div>
                <span className="dot purple-dot"></span>
                Meeting
              </div>

              <div>
                <span className="dot red-dot"></span>
                Deadline
              </div>

              <div>
                <span className="dot blue-dot"></span>
                Task
              </div>

              <div>
                <span className="dot green-dot"></span>
                Personal
              </div>

              <div>
                <span className="dot orange-dot"></span>
                Other
              </div>

            </div>

          </div>

        </div>

        </div>

        </div>

        {/* RIGHT SIDEBAR */}
        <div className="calender-sidebar">

          {/* TODAY AGENDA */}
          <div className="task-card">
            <h3>
              Today <span className="today-date">• June 17, 2026</span>
            </h3>

            <div className="agenda-list">
              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>10:00 AM</h4>
                    <span>30 min</span>
                  </div>
                  <p>Design Sync</p>
                </div>
              </div>

              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>01:00 PM</h4>
                    <span>1 hr</span>
                  </div>
                  <p>Client Meeting</p>
                </div>
              </div>

              <div className="agenda-item">
                <span className="agenda-dot" />
                <div className="agenda-content">
                  <div className="agenda-top">
                    <h4>03:30 PM</h4>
                    <span>1 hr</span>
                  </div>
                  <p>Project Review</p>
                </div>
              </div>
            </div>

            <div className="card-link">View Today’s Agenda</div>
          </div>
<br/>

          {/* UPCOMING DEADLINES */}
          <div className="task-card">
            <p style={{fontWeight:"bold",fontSize:"20px"}}>Upcoming Deadlines</p>

            <div className="deadline-list">
              <div className="deadline-item">
                <div>
                  <h4>API Integration Review</h4>
                  <div className="dealine-date" style={{display:"flex",alignItems:"center",gap:"70px"}}>
                  <p>CRM System</p>
                <span className="deadline-date red-text">May 19, 2026</span>
                  </div>
                </div>
              </div>

              <div className="deadline-item">
                <div>
                  <h4>Homepage Final Design</h4>
                  <div  className="dealine-date" style={{display:"flex",alignItems:"center",gap:"40px"}}>
                  <p>Website Redesign</p>
                <span className="deadline-date orange-text">May 24, 2026</span>
                  </div>
                </div>
              </div>

              <div className="deadline-item">
                <div>
                  <h4>Mobile App Testing</h4>
                  <div  className="dealine-date" style={{display:"flex",alignItems:"center",gap:"80px"}}>
                  <p>Mobile App</p>
                <span className="deadline-date orange-text">May 18, 2026</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card-link">View All Deadlines</div>
          </div>

        </div>

      </div>

      {/* DAY POPUP */}
      {showDayPopup && selectedDay && (
        <div
          className="event-overlay"
          onClick={() => setShowDayPopup(false)}
          style={{ zIndex: 10001 }}
        >
          <div
            className="event-modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const dayData = calendarData.find((d) => d.day === selectedDay);
              const event = dayData?.events?.[0];
              return (
                <>
                  <div className="event-header">
                    <div>
                      <p className="event-label" style={{ marginBottom: 8 }}>
                        {event ? event.type || "Meeting" : "Daily event"}
                      </p>
                      <h2 style={{ margin: 0, fontSize: 24 }}>
                        {event ? event.title : `No event on May ${selectedDay}`}
                      </h2>
                      {event && (
                        <p className="event-subtitle" style={{ marginTop: 8, color: "#6b7280", fontSize: 14 }}>
                          Today • {event.time} • {event.type || "Meeting"}
                        </p>
                      )}
                    </div>
                    <button className="event-close" onClick={() => setShowDayPopup(false)}>
                      ×
                    </button>
                  </div>

                  <div className="event-step">
                    {event ? (
                      <>
                        <div className="popup-action-row" style={{ gap: 12, marginBottom: 20 }}>
                          <button className="btn-primary" style={{ flex: 1 }}>
                            Join Google Meet
                          </button>
                        </div>

                        <div className="popup-info-row" style={{ marginBottom: 20 }}>
                          <div>
                            <p className="event-label" style={{ marginBottom: 8 }}>Attendees</p>
                            <div className="attendee-list">
                              <span className="attendee-avatar">A</span>
                              <span className="attendee-avatar">B</span>
                              <span className="attendee-avatar">C</span>
                              <span className="attendee-more">+4</span>
                            </div>
                          </div>
                        </div>

                        <div className="popup-divider" />

                        <div className="popup-section">
                          <div className="popup-section-heading">Description</div>
                          <p style={{ color: "#4b5563", lineHeight: 1.7, marginTop: 8 }}>
                            Review sprint blockers and align priorities for deployment.
                          </p>
                        </div>

                        <div className="popup-section" style={{ marginTop: 16 }}>
                          <div className="popup-section-heading">Files</div>
                          <div className="popup-file-row">
                            <span>Meeting notes</span>
                            <span style={{ color: "#6366f1" }}>View</span>
                          </div>
                        </div>

                        <div className="event-footer" style={{ marginTop: 24 }}>
                          <button className="btn-cancel" onClick={() => setShowDayPopup(false)}>
                            Delete
                          </button>
                          <button className="btn-primary" onClick={() => setShowDayPopup(false)}>
                            Edit Event
                          </button>
                        </div>
                      </>
                    ) : (
                      <p style={{ color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>
                        No events for this day.
                      </p>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      <Event isOpen={showEventModal} onClose={() => setShowEventModal(false)} />
    </div>
  );
};

export default Calender;