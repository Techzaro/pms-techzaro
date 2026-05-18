import DashboardLayout from "../components/layout/DashboardLayout";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Monitor,
  Percent,
  Tag,
  UserRound,
} from "lucide-react";

import "./TaskDetails.css";

function TaskDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();

  // Dummy Task Data
  const task = {
    id: taskId,
    title: "Ecommerce Homepage Design",
    description:
      "Design and implement the new ecommerce homepage with responsive layout and modern UI.",
    status: "In Progress",
    priority: "High",
    start_date: "22 Apr 2026",
    end_date: "28 Apr 2026",
    assigned_by: "Muhammad Sufyan",
    assigned_to: "Ali Hamza",
    progress: 70,
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="pd-page pd-page--tx">

        {/* BREADCRUMB */}

        <nav className="pd-breadcrumb">
          <Link to="/tasks">Tasks</Link>

          <ChevronRight size={14} />

          <span>{task.title}</span>
        </nav>

        {/* HERO SECTION */}

        <div className="main">

          <header className="pd-hero-tx">

            <div className="pd-hero-tx__main">

              <div className="pd-title-CCrow">

                <div className="pd-title-icon">
                  <Monitor size={28} strokeWidth={1.75} />
                </div>

                <h1 className="pd-title-tx">{task.title}</h1>

              </div>

              <div className="pd-desc-tx">
                {task.description}
              </div>

              <div className="pd-hero-actions">

                <span className="pd-pill-status">
                  {task.status}
                </span>

                <button
                  type="button"
                  className="pd-btn-tx pd-btn-tx--outline"
                  onClick={() => navigate("/tasks")}
                >
                  Back
                </button>

              </div>

            </div>

          </header>

          {/* DEADLINE CARD */}

          <section className="pd-rail-card">

            <h3 className="pd-rail-card__title">
              Deadline
            </h3>

            <ul className="pd-milestones">

              <li className="pd-milestones__item">

                <div>

                  <div className="pd-milestones__title">
                    Task Deadline
                  </div>

                  <div className="pd-milestones__date">
                    {task.end_date}
                  </div>

                </div>

              </li>

            </ul>

          </section>

        </div>

        {/* STATS */}

        <div className="pd-stat-strip">

          {/* Progress */}

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic pd-mini-stat__ic--blue">
              <Percent size={20} />
            </div>

            <div className="pd-mini-stat__text">

              <span className="pd-mini-stat__label">
                Progress
              </span>

              <div className="pd-mini-stat__bar">
                <span style={{ width: `${task.progress}%` }} />
              </div>

              <span className="pd-mini-stat__val">
                {task.progress}%
              </span>

            </div>

          </div>

          {/* Details */}

          <div className="pd-mini-stat1">

            <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
              <ClipboardList size={20} />
            </div>

            <div className="pd-mini-stat__text">

              <span className="pd-mini-stat__label">
                Status
              </span>

              <span className="pd-mini-stat__num">
                {task.status}
              </span>

            </div>

            <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
              <UserRound size={20} />
            </div>

            <div className="pd-mini-stat__text">

              <span className="pd-mini-stat__label">
                Assigned To
              </span>

              <span className="pd-mini-stat__num">
                {task.assigned_to}
              </span>

            </div>

            <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
              <CalendarDays size={20} />
            </div>

            <div className="pd-mini-stat__text">

              <span className="pd-mini-stat__label">
                Deadline
              </span>

              <span className="pd-mini-stat__num pd-mini-stat__num--sm">
                {task.end_date}
              </span>

            </div>

          </div>

        </div>

        {/* MAIN CONTENT */}

        <div className="pd-focus">

          <div className="pd-focus__main">

            <div className="pd-shell">

              <div className="pd-tab-panel">

                {/* DESCRIPTION */}

                <section className="pd-card-flat">

                  <h2 className="pd-block-title">
                    Task Description
                  </h2>

                  <p className="pd-desc-tx">
                    {task.description}
                  </p>

                </section>

                {/* TASK INFO */}

                <section className="pd-card-flat">

                  <h2 className="pd-block-title">
                    Task Information
                  </h2>

                  <div className="pd-meta-rows">

                    <li>

                      <span className="pd-meta-rows__ic">
                        <UserRound size={18} />
                      </span>

                      <div>

                        <span className="pd-meta-rows__label">
                          Assigned By
                        </span>

                        <span className="pd-meta-rows__value">
                          {task.assigned_by}
                        </span>

                      </div>

                    </li>

                    <li>

                      <span className="pd-meta-rows__ic">
                        <Tag size={18} />
                      </span>

                      <div>

                        <span className="pd-meta-rows__label">
                          Priority
                        </span>

                        <span className="pd-meta-rows__value">
                          {task.priority}
                        </span>

                      </div>

                    </li>

                    <li>

                      <span className="pd-meta-rows__ic">
                        <CalendarDays size={18} />
                      </span>

                      <div>

                        <span className="pd-meta-rows__label">
                          Start Date
                        </span>

                        <span className="pd-meta-rows__value">
                          {task.start_date}
                        </span>

                      </div>

                    </li>

                    <li>

                      <span className="pd-meta-rows__ic">
                        <CalendarDays size={18} />
                      </span>

                      <div>

                        <span className="pd-meta-rows__label">
                          End Date
                        </span>

                        <span className="pd-meta-rows__value">
                          {task.end_date}
                        </span>

                      </div>

                    </li>

                  </div>

                </section>

              </div>

            </div>

          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}

export default TaskDetails;