import DashboardLayout from "../components/layout/DashboardLayout";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, ChevronRight, ClipboardList, Monitor, Percent, UserRound } from "lucide-react";
import "./DeliverableDetails.css";

const deliverables = [
  {
    id: "101",
    title: "Ecommerce homepage design",
    description: "Design and implement the new ecommerce homepage with responsive layout and modern UI.",
    status: "In Progress",
    priority: "High",
    assigned_by: "Muhammad Sufyan",
    assigned_to: "You",
    start_date: "22 Apr 2026",
    end_date: "28 Apr 2026",
    progress: 70,
    note: "This deliverable is on track. Coordinate with the design team for final approval.",
  },
  {
    id: "102",
    title: "Dashboard performance audit",
    description: "Review current dashboard performance and propose improvements to reduce load time.",
    status: "Pending",
    priority: "Medium",
    assigned_by: "Leyla Nazir",
    assigned_to: "You",
    start_date: "24 Apr 2026",
    end_date: "30 Apr 2026",
    progress: 42,
    note: "Awaiting input from engineering. Ensure the performance report is ready by the end of the month.",
  },
];

function statusSlug(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function DeliverableDetails() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const deliverable = deliverables.find((item) => String(item.id) === taskId);

  if (!deliverable) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-page pd-page--tx">
          <div className="pd-empty-state">
            <h1>Deliverable not found</h1>
            <p>The selected deliverable could not be found. Please return to the deliverables list.</p>
            <button className="pd-btn pd-btn--primary" onClick={() => navigate("/deliveries")}>Back to deliverables</button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="pd-page pd-page--tx">
        <nav className="pd-breadcrumb" aria-label="Breadcrumb">
          <Link to="/deliveries">Deliverables</Link>
          <ChevronRight size={14} aria-hidden />
          <span>{deliverable.title}</span>
        </nav>

        <header className="pd-hero-tx">
          <div className="pd-hero-tx__main">
            <div className="pd-title-row">
              <div className="pd-title-icon" aria-hidden>
                <Monitor size={28} strokeWidth={1.75} />
              </div>
              <h1 className="pd-title-tx">{deliverable.title}</h1>
            </div>
            <div className="pd-desc-tx pd-rich">{deliverable.description}</div>
            <div className="pd-hero-actions">
              <span className={`pd-pill-status pd-pill-status--${statusSlug(deliverable.status)}`}>
                {deliverable.status}
              </span>
              <button type="button" className="pd-btn-tx pd-btn-tx--outline" onClick={() => navigate("/deliveries")}>
                Back to list
              </button>
            </div>
          </div>
        </header>

        <div className="pd-stat-strip">
          <div className="pd-mini-stat">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--blue">
              <Percent size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Progress</span>
              <div className="pd-mini-stat__bar">
                <span style={{ width: `${deliverable.progress}%` }} />
              </div>
              <span className="pd-mini-stat__val">{deliverable.progress}%</span>
            </div>
          </div>
          <div className="pd-mini-stat">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
              <ClipboardList size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Status</span>
              <span className="pd-mini-stat__num">{deliverable.status}</span>
            </div>
          </div>
          <div className="pd-mini-stat">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
              <UserRound size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Assigned by</span>
              <span className="pd-mini-stat__num">{deliverable.assigned_by}</span>
            </div>
          </div>
          <div className="pd-mini-stat">
            <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
              <CalendarDays size={20} />
            </div>
            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">Deadline</span>
              <span className="pd-mini-stat__num pd-mini-stat__num--sm">{deliverable.end_date}</span>
            </div>
          </div>
        </div>

        <section className="pd-rail-card">
          <h3 className="pd-rail-card__title">Deliverable details</h3>
          <div className="pd-grid-2">
            <div className="pd-detail-block">
              <span className="pd-detail-label">Assigned by</span>
              <strong>{deliverable.assigned_by}</strong>
            </div>
            <div className="pd-detail-block">
              <span className="pd-detail-label">Assigned to</span>
              <strong>{deliverable.assigned_to}</strong>
            </div>
            <div className="pd-detail-block">
              <span className="pd-detail-label">Priority</span>
              <strong>{deliverable.priority}</strong>
            </div>
            <div className="pd-detail-block">
              <span className="pd-detail-label">Duration</span>
              <strong>{deliverable.start_date} - {deliverable.end_date}</strong>
            </div>
          </div>
        </section>

        <section className="pd-rail-card">
          <h3 className="pd-rail-card__title">Notes</h3>
          <p className="pd-rich">{deliverable.note}</p>
        </section>
      </div>
    </DashboardLayout>
  );
}

export default DeliverableDetails;
