import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  Building2,
  Calendar,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FolderOpen,
  ListChecks,
  Monitor,
  Pencil,
  Percent,
  Settings,
  Tag,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

import DashboardLayout from "../components/layout/DashboardLayout";
import "./ProjectDetails.css";

const API = "http://127.0.0.1:8000/api";

function statusSlug(status) {
  return (status || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function formatShortDate(value) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function taskStatusLabel(status) {
  const s = (status || "").toLowerCase();

  if (s === "completed" || s === "done") return "Completed";
  if (s === "in_progress") return "In Progress";
  if (s === "pending") return "Pending";

  return status || "Pending";
}

function initials(name) {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);

  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";

  return (a + b).toUpperCase();
}

function sanitizeHtml(html) {
  return String(html || "").replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    ""
  );
}

function ProjectDetails() {
  const { projectId } = useParams();

  const navigate = useNavigate();

  const [project, setProject] = useState(null);

  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState("overview");

  const memberCount = useMemo(() => {
    if (!project) return 0;

    const ids = new Set();

    if (project.creator?.id) ids.add(project.creator.id);

    (project.members || []).forEach((m) => ids.add(m.id));

    return ids.size;
  }, [project]);

  const loadProject = useCallback(async () => {
    const token = localStorage.getItem("token");

    const res = await fetch(`${API}/projects/${projectId}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    setProject(data.project);
  }, [projectId]);

  useEffect(() => {
    (async () => {
      try {
        await loadProject();
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadProject]);

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout hideRightSidebar={true}>
        <div className="pd-loading">Project not found.</div>
      </DashboardLayout>
    );
  }

  const tasks = project.tasks || [];
  const members = project.members || [];
  const milestones = project.milestones || [];
  const progress = project.progress_percent || 0;

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: ListChecks,
    },
    {
      id: "tasks",
      label: "Tasks",
      icon: Calendar,
    },
    {
      id: "team",
      label: "Team",
      icon: Users,
    },
    {
      id: "activity",
      label: "Activity",
      icon: Activity,
    },
    {
      id: "files",
      label: "Files",
      icon: FolderOpen,
    },
    {
      id: "settings",
      label: "Settings",
      icon: Settings,
    },
  ];

  return (
    <DashboardLayout hideRightSidebar={true}>
      <div className="pd-page--tx">

        <nav className="pd-breadcrumb">
          <Link to="/projects">Projects</Link>

          <ChevronRight size={14} />

          <span>{project.title}</span>
        </nav>

        {/* TOP */}

        <div className="main">

          {/* LEFT */}

          <div className="pd-content">

            <header className="pd-hero-tx">

              <div className="pd-title-row">

                <div className="pd-title-icon">
                  <Monitor size={28} />
                </div>

                <div>
                  <h1 className="pd-title-tx">
                    {project.title}
                  </h1>

                  <div
                    className="pd-desc-tx"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(project.description),
                    }}
                  />
                </div>

              </div>

              <div className="pd-hero-actions">

                <span className="pd-pill-status">
                  {project.status}
                </span>

                <button
                  className="pd-btn-tx"
                  onClick={() => navigate("/create-project")}
                >
                  <Pencil size={16} />
                  Edit Project
                </button>

                <button className="pd-btn-tx pd-btn-tx--danger">
                  <Trash2 size={16} />
                  Delete
                </button>

              </div>

            </header>

          </div>

          {/* RIGHT */}

          <div className="pd-rail">

            <section className="pd-rail-card">

              <h3 className="pd-rail-card__title">
                Deadlines
              </h3>

              <ul className="pd-milestones">

                {milestones.map((m) => (
                  <li
                    key={m.id}
                    className="pd-milestones__item"
                  >

                    <span
                      className={`pd-dot pd-dot--${statusSlug(m.status)}`}
                    />

                    <div>

                      <div className="pd-milestones__title">
                        {m.title}
                      </div>

                      <div className="pd-milestones__date">
                        {formatShortDate(m.due_date)}
                      </div>

                    </div>

                  </li>
                ))}

              </ul>

            </section>

          </div>

        </div>

        {/* STATS */}

        <div className="pd-stat-strip">

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic pd-mini-stat__ic--blue">
              <Percent size={20} />
            </div>

            <div className="pd-mini-stat__text">

              <span className="pd-mini-stat__label">
                Overall Progress
              </span>

              <div className="pd-mini-stat__bar">
                <span style={{ width: `${progress}%` }} />
              </div>

              <span className="pd-mini-stat__val">
                {progress}%
              </span>

            </div>

          </div>

          <div className="pd-mini-stat1">

            <div className="pd-mini-stat__ic pd-mini-stat__ic--orange">
              <ClipboardList size={20} />
            </div>

            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">
                Tasks
              </span>

              <span className="pd-mini-stat__num">
                {tasks.length}
              </span>
            </div>

            <div className="pd-mini-stat__ic pd-mini-stat__ic--indigo">
              <Users size={20} />
            </div>

            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">
                Members
              </span>

              <span className="pd-mini-stat__num">
                {memberCount}
              </span>
            </div>

            <div className="pd-mini-stat__ic pd-mini-stat__ic--green">
              <CalendarDays size={20} />
            </div>

            <div className="pd-mini-stat__text">
              <span className="pd-mini-stat__label">
                Deadline
              </span>

              <span className="pd-mini-stat__num">
                {formatShortDate(project.end_date)}
              </span>
            </div>

          </div>

        </div>

        {/* BODY */}

        <div className="pd-focus">

          <div className="pd-focus__main">

            <div className="pd-shell">

              <div className="pd-tabs-tx">

                {tabs.map(({ id, label, icon: Icon }) => (

                  <button
                    key={id}
                    className={`pd-tab-tx ${
                      tab === id ? "pd-tab-tx--on" : ""
                    }`}
                    onClick={() => setTab(id)}
                  >

                    <Icon size={17} />

                    {label}

                  </button>

                ))}

              </div>

              <div className="pd-shell-body">

                {/* OVERVIEW */}

                {tab === "overview" && (

                  <>
                    <div className="pd-shell-split">

                      <div>

                        <h2 className="pd-block-title">
                          Project Description
                        </h2>

                        <div
                          className="pd-desc-tx"
                          dangerouslySetInnerHTML={{
                            __html: sanitizeHtml(project.description),
                          }}
                        />

                      </div>

                      <div className="pd-card-flat">

                        <h2 className="pd-block-title">
                          Project Details
                        </h2>

                        <p>
                          <strong>Client:</strong>{" "}
                          {project.client_name || "N/A"}
                        </p>

                        <p>
                          <strong>Category:</strong>{" "}
                          {project.category || "N/A"}
                        </p>

                        <p>
                          <strong>Priority:</strong>{" "}
                          {project.priority || "N/A"}
                        </p>

                        <p>
                          <strong>Budget:</strong>{" "}
                          {project.budget || "N/A"}
                        </p>

                      </div>

                    </div>

                    <div className="pd-bottom-grid">

                      <section className="pd-card-flat">

                        <div className="pd-card-flat__head">

                          <h2 className="pd-block-title">
                            Recent Tasks
                          </h2>

                        </div>

                        <table className="pd-table">

                          <thead>
                            <tr>
                              <th>Task</th>
                              <th>Status</th>
                              <th>Priority</th>
                              <th>Due Date</th>
                            </tr>
                          </thead>

                          <tbody>

                            {tasks.map((t) => (

                              <tr key={t.id}>

                                <td>{t.title}</td>

                                <td>
                                  {taskStatusLabel(t.status)}
                                </td>

                                <td>{t.priority}</td>

                                <td>
                                  {formatShortDate(t.end_date)}
                                </td>

                              </tr>

                            ))}

                          </tbody>

                        </table>

                      </section>

                      <section className="pd-card-flat">

                        <div className="pd-card-flat__head">

                          <h2 className="pd-block-title">
                            Team Members
                          </h2>

                        </div>

                        <div className="pd-member-list">

                          {members.map((m) => (

                            <div
                              key={m.id}
                              className="pd-member"
                            >

                              <div
                                style={{
                                  display: "flex",
                                  gap: "12px",
                                  alignItems: "center",
                                }}
                              >

                                <div className="pd-avatar">
                                  {initials(m.name)}
                                </div>

                                <div>

                                  <div className="pd-member-name">
                                    {m.name}
                                  </div>

                                  <div className="pd-member-role">
                                    {m.role}
                                  </div>

                                </div>

                              </div>

                              <span className="pd-badge-member">
                                Member
                              </span>

                            </div>

                          ))}

                        </div>

                      </section>

                    </div>
                  </>

                )}

              </div>

            </div>

          </div>

        </div>

      </div>
    </DashboardLayout>
  );
}

export default ProjectDetails;