/**
 * Projects page component.
 *
 * Lists all projects accessible to the current user in a card-based layout.
 * Supports searching by name, filtering by status (pending, submitted,
 * approved, rejected, due-today, active), time-range filtering, visibility
 * management (admin/manager only).  Each card shows progress, deadline and
 * quick actions.  Projects are paginated and can be reordered via
 * drag-and-drop.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CreateProjectModal from "../components/CreateProjectModal";
import EditProjectModal from "../components/EditProjectModal";

import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { StickyNote } from "lucide-react";
import ActionPopover from "../components/ActionPopover";
import AddNoteModal from "../components/AddNoteModal";

import { GoDotFill } from "react-icons/go";
import API_URL from "../config/api";
import { authToken, getCurrentRole, rolePath, getUser } from "../utils/auth";
import "./Projects.css";
import "../components/ActionPopover.css";
import { formatDateTime, formatDateTimeInline } from "../utils/formatDateTime";
import Pagination from "../components/Pagination";
import "../pages/Task.css";

const PRIORITY_COLORS = {
  High: "var(--color-danger-bg)",
  Medium: "var(--color-warning-bg)",
  Low: "var(--color-success-bg)",
};

const PRIORITY_TEXT_COLORS = {
  High: "var(--color-danger)",
  Medium: "var(--color-warning)",
  Low: "var(--color-success)",
};

const STATUS_COLORS = {
  pending: "var(--color-warning-bg)",
  in_progress: "var(--color-blue-bg)",
  paused: "var(--color-warning-bg)",
  submitted: "var(--color-blue-bg)",
  reopened: "var(--color-primary-bg)",
  approved: "var(--color-success-bg)",
  rejected: "var(--color-danger-bg)",
  Planning: "var(--color-blue-bg)",
  "In-progress": "var(--color-warning-bg)",
  Pause: "var(--color-danger-bg)",
  Completed: "var(--color-success-bg)",
};

const STATUS_TEXT_COLORS = {
  pending: "var(--color-warning)",
  in_progress: "var(--color-blue)",
  paused: "var(--color-warning)",
  submitted: "var(--color-blue)",
  reopened: "var(--color-primary)",
  approved: "var(--color-success)",
  rejected: "var(--color-danger)",
  Planning: "var(--color-blue)",
  "In-progress": "var(--color-warning)",
  Pause: "var(--color-danger)",
  Completed: "var(--color-success)",
};

/** Main Projects page — renders project cards with search, filters and pagination. */
function Projects() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get("filter") === "active" ? "active" : "");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [expandedDesc, setExpandedDesc] = useState({});
  const [overflowDetected, setOverflowDetected] = useState({});
  const descEls = useRef({});
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [viewMode, setViewMode] = useState("card");
  const [orderedProjects, setOrderedProjects] = useState([]);
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setOrderedProjects(projects);
  }, [projects]);

  const handleProjectReorder = useCallback((reordered) => {
    setOrderedProjects(reordered);
    const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
    const token = authToken();
    fetch(`${API_URL}/projects/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: payload }),
      _notifHandled: true,
    }).catch((err) => console.error('Project reorder failed:', err));
  }, []);

  const toggleDescription = (id) => {
    setExpandedDesc((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const measureRef = (id) => (el) => {
    if (el && overflowDetected[id] === undefined) {
      descEls.current[id] = el;
      // Need to wait for content to render before measuring
      requestAnimationFrame(() => {
        if (el.scrollHeight > el.clientHeight) {
          setOverflowDetected((prev) => ({ ...prev, [id]: true }));
        } else {
          setOverflowDetected((prev) => ({ ...prev, [id]: false }));
        }
      });
    }
  };

  const currentUser = getUser();
  const currentRole = getCurrentRole();
  const isAdminOrManager = ["admin", "manager"].includes(String(currentRole || "").toLowerCase());

  /** Fetch all projects from the API, applying the current status filter. */
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const token = authToken();
      const query = statusFilter === "active" ? "?filter=active" : "";

      const response = await fetch(
        `${API_URL}/projects${query}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          skipLoader: true,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      const data = await response.json();

      setProjects(Array.isArray(data) ? data : data.projects || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [statusFilter]);

  // Handle draft restoration from DraftCenter
  useEffect(() => {
    const draftId = location.state?.openDraft;
    if (!draftId) return;
    window.history.replaceState({}, document.title);
    setRestoreDraftId(draftId);
    setShowModal(true);
  }, [location.state]);

  useAutoRefresh(fetchProjects, {
    events: ['project:created', 'project:updated', 'project:deleted', 'data:changed'],
  });

  useEffect(() => {
    const nextFilter = searchParams.get("filter") === "active" ? "active" : "";
    setStatusFilter((current) => {
      if (nextFilter === "active" || current === "active") {
        return current === nextFilter ? current : nextFilter;
      }
      return current;
    });
  }, [searchParams]);

  const selectStatusFilter = (filter) => {
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
      if (filter === "active") {
        setSearchParams({ filter: "active" });
      } else {
        setSearchParams({});
      }
    }
  };

  /** Derive the display status (Completed / Failed / In Progress) from progress and dates. */
  const calculateStatus = (project) => {
    const progress = calculateProgress(project);
    const endDate = project.active_deadline ? new Date(project.active_deadline) : null;
    const now = new Date();

    if (progress === 100) {
      if (endDate && now <= endDate) {
        return "Completed";
      }
      return "Completed";
    }

    if (endDate && now > endDate) {
      return "Failed";
    }

    return "In Progress";
  };

  const getProgressColor = (percent) => {
    const grey = [107, 114, 128];
    const blue = [79, 70, 229];
    const t = Math.min(percent, 100) / 100;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const r = Math.round(grey[0] + (blue[0] - grey[0]) * eased);
    const g = Math.round(grey[1] + (blue[1] - grey[1]) * eased);
    const b = Math.round(grey[2] + (blue[2] - grey[2]) * eased);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "var(--color-success-bg)";
      case "in_progress":
      case "in progress":
        return "var(--color-primary-bg)";
      case "failed":
        return "var(--color-danger-bg)";
      case "on_hold":
      case "on hold":
        return "var(--color-danger-bg)";
      default:
        return "var(--color-primary-bg-hover)";
    }
  };

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Declined",
    };
    return map[status] || status;
  };

  /** Compute project completion percentage from total/completed task counts. */
  const calculateProgress = (project) => {
    const total = Number(project.total_tasks ?? project.total_deliverables ?? 0) || 0;
    const completed = Number(project.completed_tasks ?? project.completed_deliverables ?? 0) || 0;
    if (!total) return 0;
    return Math.round((completed / total) * 100) || 0;
  };

  const hasPendingSubtasks = (project) => {
    return (project.pending_deliverables_count || 0) > 0;
  };


  const filteredProjects = orderedProjects.filter((project) => {
    if (searchQuery && !project.title?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (statusFilter === "due_today") {
      if (!project.active_deadline) return false;
      const today = new Date();
      const end = new Date(project.active_deadline);
      return end.getFullYear() === today.getFullYear() &&
        end.getMonth() === today.getMonth() &&
        end.getDate() === today.getDate();
    }
    if (statusFilter) {
      if (statusFilter === "active") return true;
      if (statusFilter === "pending" && project.status !== "pending" && project.status !== "Planned" && project.status !== "in_progress" && project.status !== "Planning" && project.status !== "In-progress") return false;
      if (statusFilter === "submitted" && project.status !== "submitted") return false;
      if (statusFilter === "reopened" && project.status !== "reopened") return false;
      if (statusFilter === "approved" && project.status !== "approved" && project.status !== "Completed") return false;
      if (statusFilter === "rejected" && project.status !== "rejected" && project.status !== "Pause") return false;
    }
    return true;
  });

  const allCount = orderedProjects.length;
  const dueTodayCount = orderedProjects.filter((p) => { if (!p.active_deadline) return false; const d = new Date(p.active_deadline); const t = new Date(); return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate(); }).length;
  const activeCount = orderedProjects.filter((p) => p.status === "In-progress" || p.status === "in_progress" || p.status === "Planning" || p.status === "planned").length;
  const pendingCount = orderedProjects.filter((p) => p.status === "pending" || p.status === "submitted").length;
  const submittedCount = orderedProjects.filter((p) => p.status === "submitted").length;
  const reopenedCount = orderedProjects.filter((p) => p.status === "reopened").length;
  const approvedCount = orderedProjects.filter((p) => p.status === "Completed" || p.status === "approved").length;
  const rejectedCount = orderedProjects.filter((p) => p.status === "rejected" || p.status === "Pause").length;

  const totalPages = showAll ? 1 : Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = showAll ? filteredProjects : filteredProjects.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Projects" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="projects-page">

        {/* HEADER */}
        <div className="projects-header">
          <div>
            <h1>Projects</h1>
            <p>Manage and track your projects</p>
        </div>

          <div className="header-actions">
            <div className="all-time">
              <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
                <option value="">All Time</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="180">Last 6 Months</option>
              </select>
            </div>

            {isAdminOrManager && (
              <button
                className="create-btn"
                onClick={() => setShowModal(true)}
              >
                + Create Project
              </button>
            )}
          </div>
        </div>

        <div className="projects-toolbar">
          <div className="projects-search-bar">
            <IoSearchOutline fontSize={"20px"} />
            <input
              type="text"
              placeholder="Search by project name"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>

          <div className="view-toggle">
            <button className={viewMode === "card" ? "active-tab" : ""} onClick={() => setViewMode("card")}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/></svg>
              Cards
            </button>
            <button className={viewMode === "list" ? "active-tab" : ""} onClick={() => setViewMode("list")}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="6.75" width="14" height="2.5" rx="1" fill="currentColor"/><rect x="1" y="11.5" width="14" height="2.5" rx="1" fill="currentColor"/></svg>
              List
            </button>
          </div>
        </div>

        {/* STATUS FILTERS */}
        <div className="task-progress">
          <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
          <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
            <GoDotFill color="#EF4444" /> Due Today ({dueTodayCount})
          </p>
          <p className={`Active ${statusFilter === "active" ? "active" : ""}`} onClick={() => selectStatusFilter("active")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Active Projects ({activeCount})
          </p>
          <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Pending ({pendingCount})
          </p>
          <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => selectStatusFilter("submitted")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Submitted ({submittedCount})
          </p>
          <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => selectStatusFilter("reopened")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Reopened ({reopenedCount})
          </p>
          <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Approved ({approvedCount})
          </p>
          <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => selectStatusFilter("rejected")} style={{ cursor: "pointer" }}>
            <GoDotFill /> Declined ({rejectedCount})
          </p>
        </div>

        {/* PROJECTS */}
        {viewMode === "card" ? (
          <div className="projects-container">
            {loading ? (
              <div className="loading-text">Loading projects...</div>
            ) : filteredProjects.length === 0 ? (
              <div className="loading-text">No projects found</div>
            ) : (
              <SortableTableWrapper
                items={paginatedProjects.map((p, i) => ({ ...p, sortableId: `project-${p.id}-${i}` }))}
                onReorder={handleProjectReorder}
                idKey="sortableId"
                as="div"
              >
                {(project, idx, dndProps) => {
                  const progress = calculateProgress(project);

                  return (
                    <div className="projects-card" key={project.id}>
                      {/* DRAG HANDLE */}
                      <div className="project-card-drag-handle">
                          <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={project.business_id} />
                      </div>
                      {/* HEADER */}
                      <div className="project-card-header">
                        <h3>{project.title}</h3>

                        {/* OWNERSHIP INFO */}
                        <div className="ownership-info" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px", marginBottom: "4px" }}>
                          {project.creator && (
                            <span className="ownership-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--color-primary-bg)", color: "var(--color-primary)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 500 }}>
                              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--color-primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 600 }}>
                                {project.creator.name?.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                              </span>
                              Created: {project.creator.name}
                              <span style={{ background: project.creator.role === "admin" ? "var(--color-primary-dark)" : "var(--color-success)", color: "#fff", padding: "0 4px", borderRadius: "4px", fontSize: "9px", marginLeft: "2px" }}>
                                {project.creator.role === "admin" ? "Admin" : "Manager"}
                              </span>
                            </span>
                          )}
                          {project.updatedBy && project.updated_by !== project.created_by && (
                            <span className="ownership-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--color-warning-bg)", color: "var(--color-warning)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 500 }}>
                              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--color-warning)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 600 }}>
                                {project.updatedBy.name?.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                              </span>
                              Updated: {project.updatedBy.name}
                              <span style={{ background: project.updatedBy.role === "admin" ? "var(--color-primary-dark)" : "var(--color-success)", color: "#fff", padding: "0 4px", borderRadius: "4px", fontSize: "9px", marginLeft: "2px" }}>
                                {project.updatedBy.role === "admin" ? "Admin" : "Manager"}
                              </span>
                            </span>
                          )}
                          {project.approvedBy && (
                            <span className="ownership-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--color-success-bg)", color: "var(--color-success)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 500 }}>
                              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--color-success)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 600 }}>
                                {project.approvedBy.name?.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                              </span>
                              Approved: {project.approvedBy.name}
                            </span>
                          )}
                          {project.rejectedBy && (
                            <span className="ownership-badge" style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--color-danger-bg)", color: "var(--color-danger)", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 500 }}>
                              <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "var(--color-danger)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9px", fontWeight: 600 }}>
                                {project.rejectedBy.name?.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}
                              </span>
                              Declined: {project.rejectedBy.name}
                            </span>
                          )}
                        </div>
                      <div
                        className={`card-subtitle${!expandedDesc[project.id] ? " clamped" : ""}`}
                        ref={!expandedDesc[project.id] ? measureRef(project.id) : null}
                      >
                        <div
                          dangerouslySetInnerHTML={{
                            __html: project.description || "No description available",
                          }}
                        />
                        {overflowDetected[project.id] && !expandedDesc[project.id] && (
                          <button className="read-more-btn" style={{fontSize: "18px"}} onClick={() => toggleDescription(project.id)}>
                            Read more
                          </button>
                        )}
                      </div>
                      {expandedDesc[project.id] && (
                        <button className="show-less-btn" style={{fontSize: "18px"}} onClick={() => toggleDescription(project.id)}>
                          Show less
                        </button>
                      )}
                    </div>

                    {/* PROGRESS */}
                    <div className="progress-section">
                      <div className="progress-top">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${progress}%`,
                            minWidth: progress === 0 ? "100%" : "0",
                            background: progress === 0 ? "var(--bg-hover)" : getProgressColor(progress),
                          }}
                        ></div>
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="project-card-actions">
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: STATUS_COLORS[project.status] || "var(--color-primary-bg-hover)",
                            color: STATUS_TEXT_COLORS[project.status] || "var(--text-dark)",
                          }}
                        >
                          {project.status || "Planning"}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <span style={{ fontSize: "13px", color: "var(--text-dark)", fontWeight: 500 }}>
                            📅 {project.start_date ? formatDateTime(project.start_date).replace("\n", " ") : "-"}
                          </span>
                          <span style={{ fontSize: "13px", color: "var(--text-dark)", fontWeight: 500 }}>
                            📅 {project.end_date ? formatDateTime(project.end_date).replace("\n", " ") : "No deadline"}
                          </span>
                        </div>
                      </div>

                      <div className="project-card-actions-right">
                        <button
                          className="action-icon-btn action-view"
                          title="View Project"
                          style={{ width: 38, height: 38 }}
                          onClick={() => { sessionStorage.setItem('projectIds', JSON.stringify(filteredProjects.map(p => p.id))); navigate(rolePath(`projects/project-details/${project.id}`)); }}
                        >
                          <IoEyeOutline size={26} />
                        </button>
                        {isAdminOrManager && (
                          <button
                            className="action-icon-btn action-view"
                            title="Edit Project"
                            style={{ width: 38, height: 38 }}
                            onClick={async () => {
                              try {
                                const token = authToken();
                                const res = await fetch(`${API_URL}/projects/${project.id}`, {
                                  headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  setEditingProject(data.project || project);
                                } else {
                                  setEditingProject(project);
                                }
                              } catch {
                                setEditingProject(project);
                              }
                              setShowEditModal(true);
                            }}
                          >
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                        )}
                       </div>
                    </div>
                  </div>
                );
              }}
              </SortableTableWrapper>
            )}
          </div>
        ) : (
          <div className="project-list-container">
            <div className="project-table-header">
              <div>Project Name</div>
              <div>Status</div>
              <div>Progress</div>
              <div>Priority</div>
              <div>Start & Due Date</div>
              <div>Action</div>
            </div>

            {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>Loading...</div>
            ) : filteredProjects.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>No projects found</div>
            ) : (
              <SortableTableWrapper
                items={paginatedProjects.map((p, i) => ({ ...p, sortableId: `project-${p.id}-${i}` }))}
                onReorder={handleProjectReorder}
                idKey="sortableId"
                as="div"
              >
                {(project, idx, dndProps) => {
                  const progress = calculateProgress(project);
                  const projectStatus = project.status || "Planning";

                  return (
                    <div className="project-list-row" key={project.id}>
                      <div className="col-project-name">
                        <div className="project-name-drag-handle">
                        <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={project.business_id} />
                        </div>
                        <div className="project-name-text">{project.title}</div>
                      </div>

                    <div className="col-status">
                      <span className="badge" style={{ background: STATUS_COLORS[projectStatus] || "var(--bg-hover)", color: STATUS_TEXT_COLORS[projectStatus] || "var(--text-dark)" }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[projectStatus] || "var(--text-dark)" }}></span>
                        {projectStatus}
                      </span>
                    </div>

                    <div className="col-progress">
                      <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-dark)" }}>
                          {progress}%
                        </span>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
                      </div>
                      <div className="subtasks-approved-text">
                        {project.completed_tasks || 0}/{project.total_tasks || 0} tasks
                      </div>
                    </div>

                    <div className="col-priority">
                      <span className="badge" style={{ background: PRIORITY_COLORS[project.priority] || "var(--bg-hover)", color: PRIORITY_TEXT_COLORS[project.priority] || "var(--text-dark)" }}>
                        <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[project.priority] || "var(--text-dark)" }}></span>
                        {project.priority || "Medium"}
                      </span>
                    </div>

                    <div className="col-due-date">
                      <div className="date-box">
                        <div style={{ whiteSpace: "pre-line" }}>
                          {formatDateTimeInline(project.start_date)}
                          {"\n"}
                          {formatDateTimeInline(project.end_date)}
                        </div>
                      </div>
                    </div>

                    <div className="col-action">
                      <ActionPopover
                        trigger={
                          <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                            <IoEyeOutline size={20} />
                          </button>
                        }
                      >
                        <button className="action-icon-btn action-view" title="View Project" onClick={() => { sessionStorage.setItem('projectIds', JSON.stringify(filteredProjects.map(p => p.id))); navigate(rolePath(`projects/project-details/${project.id}`)); }}>
                          <IoEyeOutline size={16} />
                        </button>
                        {isAdminOrManager && (
                          <button className="action-icon-btn action-edit" title="Edit Project" onClick={async () => {
                            try {
                              const token = authToken();
                              const res = await fetch(`${API_URL}/projects/${project.id}`, {
                                headers: { Accept: "application/json", Authorization: token ? `Bearer ${token}` : "" },
                              });
                              if (res.ok) {
                                const data = await res.json();
                                setEditingProject(data.project || project);
                              } else {
                                setEditingProject(project);
                              }
                            } catch {
                              setEditingProject(project);
                            }
                            setShowEditModal(true);
                          }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                          </button>
                        )}
                        <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: project.id })}>
                          <StickyNote size={16} />
                        </button>
                      </ActionPopover>
                    </div>
                  </div>
                );
              }}
              </SortableTableWrapper>
            )}
          </div>
        )}

        {!showAll && totalPages > 1 && (
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <CreateProjectModal
            restoreDraftId={restoreDraftId}
            onClose={(created) => {
              setShowModal(false);
              setRestoreDraftId(null);
              if (created) fetchProjects();
            }}
          />
        </div>
      )}

      {showEditModal && editingProject && (
        <EditProjectModal
          project={editingProject}
          onClose={(refresh) => {
            setShowEditModal(false);
            setEditingProject(null);
            if (refresh) fetchProjects();
          }}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchProjects}
      />
    </DashboardLayout>
  );
}

export default Projects;
