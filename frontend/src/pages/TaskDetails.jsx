import DashboardLayout from "../components/layout/DashboardLayout";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Monitor,
  Percent,
  UserRound,
} from "lucide-react";
import "./TaskDetails.css";

const assignedToTasks = [
  {
    id: "101",
    title: "Ecommerce homepage design",
    description: "Design and implement the new ecommerce homepage with responsive layout and modern UI.",
    status: "In Progress",
    priority: "High",
    start_date: "22 Apr 2026",
    end_date: "28 Apr 2026",
    assigned_by: "Muhammad Sufyan",
    assigned_to: "You",
    progress: 70,
    note: "This task is assigned to you. Keep the homepage UI polished and responsive.",
  },
  {
    id: "102",
    title: "Dashboard performance audit",
    description: "Review current dashboard performance and propose improvements to reduce load time.",
    status: "Pending",
    priority: "Medium",
    start_date: "24 Apr 2026",
    end_date: "30 Apr 2026",
    assigned_by: "Leyla Nazir",
    assigned_to: "You",
    progress: 42,
    note: "This task is assigned to you and should be completed before month end.",
  },
];

const assignedByTasks = [
  {
    id: "201",
    title: "Landing page redesign",
    description: "Refresh the landing page with improved visual hierarchy and modern branding.",
    status: "In Progress",
    priority: "High",
    start_date: "20 Apr 2026",
    end_date: "26 Apr 2026",
    assigned_by: "You",
    assigned_to: "Sara Yousaf",
    progress: 55,
    note: "This task is assigned by you. Coordinate with design for review checkpoints.",
  },
  {
    id: "202",
    title: "API integration task",
    description: "Connect the payment API and verify checkout flow end-to-end.",
    status: "Pending",
    priority: "Medium",
    start_date: "25 Apr 2026",
    end_date: "03 May 2026",
    assigned_by: "You",
    assigned_to: "Ali Hamza",
    progress: 24,
    note: "This task is assigned by you and requires backend coordination.",
  },
];

function statusSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function TaskDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();

  const task =
    assignedToTasks.find((item) => item.id === taskId) ||
    assignedByTasks.find((item) => item.id === taskId);

  const fromAssignedByYou = assignedByTasks.some((item) => item.id === taskId);
  const taskListPath = fromAssignedByYou ? "/taskby" : "/tasks";

  if (!task) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-page pd-page--tx">
          <div className="pd-empty-state">
            <h1>Task not found</h1>
            <p>The selected task could not be found. Please return to the task list.</p>
            <button
              className="pd-btn pd-btn--primary"
              onClick={() => navigate(taskListPath)}
            >
              Back to tasks
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="pd-page pd-page--tx">
        <nav className="pd-breadcrumb" aria-label="Breadcrumb">
          <Link to={taskListPath}>Tasks</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{task.title}</span>
        </nav>

        <div className="main">
          <header className="pd-hero-tx">
            <div className="pd-hero-tx__main">
              <div className="pd-title-CCrow">
                <div className="pd-title-icon" aria-hidden>
                  <Monitor size={28} strokeWidth={1.75} />
                </div>
                <h1 className="pd-title-tx">{task.title}</h1>
              </div>

              <div className="pd-desc-tx pd-rich">{task.description}</div>

              <div className="pd-hero-actions">
                <span className={`pd-pill-status pd-pill-status--${statusSlug(task.status)}`}>
                  {task.status}
                </span>
                <button
                  type="button"
                  className="pd-btn-tx pd-btn-tx--outline"
                  onClick={() => navigate(taskListPath)}
                >
                  Back to list
                </button>
              </div>
            </div>
          </header>

          <section className="pd-rail-card">
            <h3 className="pd-rail-card__title">Task information</h3>
            <div className="pd-grid-2">
              <div className="pd-detail-block">
                <span className="pd-detail-label">Assigned by</span>
                <strong>{task.assigned_by}</strong>
              </div>
              <div className="pd-detail-block">
                <span className="pd-detail-label">Assigned to</span>
                <strong>{task.assigned_to}</strong>
              </div>
              <div className="pd-detail-block">
                <span className="pd-detail-label">Priority</span>
                <strong>{task.priority}</strong>
              </div>
              <div className="pd-detail-block">
                <span className="pd-detail-label">Task type</span>
                <strong>{fromAssignedByYou ? "Assigned by you" : "Assigned to you"}</strong>
              </div>
            </div>
          </section>

          <section className="pd-rail-card">
            <h3 className="pd-rail-card__title">Notes</h3>
            <p className="pd-rich">{task.note}</p>
          </section>

          <div className="pd-stat-strip">
            <div className="pd-mini-stat">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--blue">
                <Percent size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Progress</span>
                <div className="pd-mini-stat__bar">
                  <span style={{ width: `${task.progress}%` }} />
                </div>
                <span className="pd-mini-stat__val">{task.progress}%</span>
              </div>
            </div>

            <div className="pd-mini-stat1">
              <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
                <ClipboardList size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Status</span>
                <span className="pd-mini-stat__num">{task.status}</span>
              </div>

              <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
                <UserRound size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Assigned To</span>
                <span className="pd-mini-stat__num">{task.assigned_to}</span>
              </div>

              <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
                <CalendarDays size={20} />
              </div>
              <div className="pd-mini-stat__text">
                <span className="pd-mini-stat__label">Deadline</span>
                <span className="pd-mini-stat__num pd-mini-stat__num--sm">{task.end_date}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default TaskDetails;
