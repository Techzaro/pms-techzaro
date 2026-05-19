/**
 * DeliverableDetails page component.
 */

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

  return (a + b).toUpperCase() || a.toUpperCase();
}

function DeliverableDetails() {
  const { id } = useParams();

  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const memberCount = useMemo(() => {
    if (!project) return 0;

    const ids = new Set();

    if (project.creator?.id) ids.add(project.creator.id);

    (project.members || []).forEach((m) => ids.add(m.id));

    return ids.size;
  }, [project]);

  const showMessage = useCallback((text) => {
    setMessage(text);

    setTimeout(() => {
      setMessage("");
    }, 3000);
  }, []);

  const loadProject = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${API}/projects/${id}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load project");
      }

      const data = await res.json();

      setProject(data.project);
    } catch (error) {
      console.error(error);
      showMessage("Unable to load project");

      setTimeout(() => {
        navigate("/projects");
      }, 1500);
    } finally {
      setLoading(false);
    }
  }, [id, navigate, showMessage]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleDeleteProject = async () => {
    const confirmDelete = window.confirm(
      "Delete this project permanently?"
    );

    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem("token");

      const res = await fetch(`${API}/projects/${id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Delete failed");
      }

      showMessage("Project deleted");

      setTimeout(() => {
        navigate("/projects");
      }, 1000);
    } catch (error) {
      console.error(error);
      showMessage("Could not delete project");
    }
  };

  if (loading) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="pd-loading">Loading...</div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout hideRightSidebar>
        <div className="pd-loading">Project not found</div>
      </DashboardLayout>
    );
  }

  const tasks = project.tasks || [];
  const members = project.members || [];
  const progress =
    typeof project.progress_percent === "number"
      ? project.progress_percent
      : 0;

  return (
    <DashboardLayout hideRightSidebar>
      <div className="pd-page">

        {message && (
          <div className="pd-toast">
            {message}
          </div>
        )}

        <nav className="pd-breadcrumb">
          <Link to="/projects">Projects</Link>

          <ChevronRight size={14} />

          <span>{project.title}</span>
        </nav>

        <header className="pd-hero-tx">

          <div className="pd-title-row">

            <div className="pd-title-icon">
              <Monitor size={28} />
            </div>

            <h1 className="pd-title-tx">
              {project.title}
            </h1>

          </div>

          <div className="pd-hero-actions">

            <span
              className={`pd-pill-status pd-pill-status--${statusSlug(
                project.status
              )}`}
            >
              {project.status}
            </span>

            <button
              type="button"
              className="pd-btn-tx pd-btn-tx--outline"
              onClick={() => navigate("/create-project")}
            >
              <Pencil size={16} />
              Edit Project
            </button>

            <button
              type="button"
              className="pd-btn-tx pd-btn-tx--danger"
              onClick={handleDeleteProject}
            >
              <Trash2 size={16} />
              Delete
            </button>

          </div>
        </header>

        <div className="pd-stat-strip">

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic">
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

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic">
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

          </div>

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic">
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

          </div>

          <div className="pd-mini-stat">

            <div className="pd-mini-stat__ic">
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

        <div className="pd-shell-split">

          <div className="pd-shell-left">

            <h2 className="pd-block-title">
              Project Description
            </h2>

            <p>
              {project.description || "No description"}
            </p>

            <h2 className="pd-block-title">
              Tasks
            </h2>

            <div className="pd-table-wrap">

              <table className="pd-table">

                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Due</th>
                  </tr>
                </thead>

                <tbody>

                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        No tasks found
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id}>

                        <td>{task.title}</td>

                        <td>
                          <span
                            className={`pd-pill pd-pill--task-${statusSlug(
                              taskStatusLabel(task.status)
                            )}`}
                          >
                            {taskStatusLabel(task.status)}
                          </span>
                        </td>

                        <td>{task.priority}</td>

                        <td>
                          {formatShortDate(task.end_date)}
                        </td>

                      </tr>
                    ))
                  )}

                </tbody>

              </table>

            </div>

          </div>

          <aside className="pd-shell-right">

            <h2 className="pd-block-title">
              Project Details
            </h2>

            <ul className="pd-meta-rows">

              <li>
                <span className="pd-meta-rows__ic">
                  <UserRound size={18} />
                </span>

                <div>
                  <span className="pd-meta-rows__label">
                    Owner
                  </span>

                  <span className="pd-meta-rows__value">
                    {project.creator?.name || "—"}
                  </span>
                </div>
              </li>

              <li>
                <span className="pd-meta-rows__ic">
                  <Building2 size={18} />
                </span>

                <div>
                  <span className="pd-meta-rows__label">
                    Client
                  </span>

                  <span className="pd-meta-rows__value">
                    {project.client_name || "—"}
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
                    {project.priority || "—"}
                  </span>
                </div>
              </li>

              <li>
                <span className="pd-meta-rows__ic">
                  <FolderOpen size={18} />
                </span>

                <div>
                  <span className="pd-meta-rows__label">
                    Category
                  </span>

                  <span className="pd-meta-rows__value">
                    {project.category || "—"}
                  </span>
                </div>
              </li>

              <li>
                <span className="pd-meta-rows__ic">
                  <DollarSign size={18} />
                </span>

                <div>
                  <span className="pd-meta-rows__label">
                    Budget
                  </span>

                  <span className="pd-meta-rows__value">
                    {project.budget || "—"}
                  </span>
                </div>
              </li>

            </ul>

            <h2 className="pd-block-title">
              Team Members
            </h2>

            <ul className="pd-member-list">

              {members.map((member) => (
                <li
                  key={member.id}
                  className="pd-member"
                >

                  <div className="pd-avatar">
                    {initials(member.name)}
                  </div>

                  <div>
                    <div className="pd-member-name">
                      {member.name}
                    </div>

                    <div className="pd-member-role">
                      {member.role || "Member"}
                    </div>
                  </div>

                </li>
              ))}

            </ul>

          </aside>

        </div>

      </div>
    </DashboardLayout>
  );
}

export default DeliverableDetails;