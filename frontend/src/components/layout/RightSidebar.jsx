import "./RightSidebar.css";

function RightSidebar() {
  return (
    <aside className="right-sidebar">
      <div className="right-card calendar-card">
        <div className="right-card-header">
          <div>
            <span className="calendar-label">October 2026</span>
            <h3>Calendar</h3>
          </div>
          <button className="calendar-action">View</button>
        </div>

        <div className="calendar-grid">
          <div className="calendar-day-label">S</div>
          <div className="calendar-day-label">M</div>
          <div className="calendar-day-label">T</div>
          <div className="calendar-day-label">W</div>
          <div className="calendar-day-label">T</div>
          <div className="calendar-day-label">F</div>
          <div className="calendar-day-label">S</div>

          <div className="calendar-cell empty" />
          <div className="calendar-cell empty" />
          <div className="calendar-cell empty" />
          <div className="calendar-cell">1</div>
          <div className="calendar-cell">2</div>
          <div className="calendar-cell">3</div>
          <div className="calendar-cell">4</div>

          <div className="calendar-cell">5</div>
          <div className="calendar-cell">6</div>
          <div className="calendar-cell">7</div>
          <div className="calendar-cell">8</div>
          <div className="calendar-cell">9</div>
          <div className="calendar-cell">10</div>
          <div className="calendar-cell">11</div>

          <div className="calendar-cell">12</div>
          <div className="calendar-cell">13</div>
          <div className="calendar-cell today">14</div>
          <div className="calendar-cell">15</div>
          <div className="calendar-cell">16</div>
          <div className="calendar-cell">17</div>
          <div className="calendar-cell">18</div>

          <div className="calendar-cell">19</div>
          <div className="calendar-cell">20</div>
          <div className="calendar-cell">21</div>
          <div className="calendar-cell">22</div>
          <div className="calendar-cell">23</div>
          <div className="calendar-cell">24</div>
          <div className="calendar-cell">25</div>

          <div className="calendar-cell">26</div>
          <div className="calendar-cell">27</div>
          <div className="calendar-cell">28</div>
          <div className="calendar-cell">29</div>
          <div className="calendar-cell">30</div>
          <div className="calendar-cell">31</div>
          <div className="calendar-cell empty" />
        </div>
      </div>

      <div className="right-card event-card">
        <div className="right-card-header">
          <div>
            <span className="event-count">2 Events</span>
            <h3>Team Events</h3>
          </div>
          <button className="event-btn">Create Event</button>
        </div>

        <div className="event-item">
          <div>
            <h4>Team Meeting!</h4>
            <p>Job related meeting for the whole team.</p>
          </div>
          <span className="event-time">10:00 AM</span>
        </div>

        <div className="event-item">
          <div>
            <h4>New Job!</h4>
            <p>Job related discussion with team members.</p>
          </div>
          <span className="event-time">02:30 PM</span>
        </div>
      </div>

      <div className="right-card tasks-card">
        <div className="right-card-header">
          <div>
            <span className="event-count">Tasks for Today</span>
            <h3>Today</h3>
          </div>
          <button className="event-btn">View all</button>
        </div>

        <div className="task-item">
          <h4>Upload Linkedin Post!</h4>
          <p>Lorem ipsum passages...</p>
        </div>

        <div className="task-item">
          <h4>Search Tags!</h4>
          <p>Lorem ipsum passages...</p>
        </div>
      </div>
    </aside>
  );
}

export default RightSidebar;
