import React, { useState } from "react";
import "../pages/Calender.css";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
} from "lucide-react";

import DashboardCalender from "../components/layout/DashboardCalender";
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
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getTotalBoxes = () => {
    if (viewMode === "Day") return 1;
    if (viewMode === "Week") return 7;
    return 35;
  };

  const totalBoxes = getTotalBoxes();

  return (
    <DashboardCalender>
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

      <Event isOpen={showEventModal} onClose={() => setShowEventModal(false)} />
    </DashboardCalender>
  );
};

export default Calender;