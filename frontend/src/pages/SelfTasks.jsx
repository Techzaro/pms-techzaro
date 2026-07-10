/**
 * SelfTasks page component.
 *
 * Displays tasks and projects that the current user assigned to themselves.
 * Includes search with debounce, status filtering, time-range filtering,
 * drag-and-drop reordering and pagination.  Modals are available for
 * creating new tasks, submitting deliverables and submitting projects.
 */

import { useState, useEffect, useCallback } from "react";
import { useRefreshOnEvent } from "../utils/useRefreshOnEvent";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu"; // Added missing import
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitProjectModal from "../components/SubmitProjectModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal"; // Added missing import
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal"; // Added missing import
import SortableTableWrapper, { DragHandle } from "../components/SortableTableWrapper";
import Pagination from "../components/Pagination";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { formatDateTime } from "../utils/formatDateTime";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  submitted: "#1E40AF",
  reopened: "#5B21B6",
  approved: "#166534",
  rejected: "#991B1B",
};

const PRIORITY_COLORS = {
  High: "#FEE2E2",
  Medium: "#FEF3C7",
  Low: "#DCFCE7",
};

const PRIORITY_TEXT_COLORS = {
  High: "#991B1B",
  Medium: "#92400E",
  Low: "#166534",
};

/** Main Self Tasks page — renders tasks and projects assigned by the current user to themselves. */
const SelfTasks = () => {
  const navigate = useNavigate();
  
  // State declarations
  const [showTaskModal, setShowTaskModal] = useState({ open: false, projectId: null, id: null }); // Fixed to object
  const [showProjectSubmitModal, setShowProjectSubmitModal] = useState({ open: false, project: null });
  const [showDeliverableSubmitModal, setShowDeliverableSubmitModal] = useState({ open: false, deliverable: null }); // Added missing state
  const [viewModal, setViewModal] = useState({ open: false, deliverable: null }); // Added missing state
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  const selectStatusFilter = (filter) => {
    setStatusFilter(filter);
    setShowAll(!filter);
    setPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch self-assigned tasks/projects from the API with current filters. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);
    if (timeFilter) params.append("time_filter", timeFilter);

    fetch(`${API_URL}/self-tasks?${params.toString()}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      skipLoader: true,
    })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => {
        setItems(data?.data || []);
        setTotalCount(data?.total ?? 0);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, [debouncedSearch, statusFilter, timeFilter]);

  useRefreshOnEvent(['task:created', 'task:updated', 'task:deleted'], fetchTasks);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    const taskItems = reordered.filter((i) => i.item_type !== 'project');
    if (taskItems.length) {
      const payload = taskItems.map((item, idx) => ({ id: item.id, sort_order: idx }));
      const token = authToken();
      fetch(`${API_URL}/tasks/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: payload }),
        _notifHandled: true,
      }).catch(() => {});
    }
  }, []);

  const handleModalClose = (refresh) => {
    setShowTaskModal({ open: false, projectId: null, id: null });
    if (refresh) fetchTasks();
  };

  const handleTaskCreated = () => {
    fetchTasks();
  };

  const handleDeliverableSubmitSuccess = () => {
    fetchTasks();
  };

  const handleDeliverableUpdate = () => {
    fetchTasks();
  };

  const formatDate = (dateStr) => {
    return formatDateTime(dateStr);
  };

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Rejected",
    };
    return map[status] || status;
  };

  const calculateProgress = (item) => {
    const total = Number(item.total_tasks ?? 0) || 0;
    const completed = Number(item.completed_tasks ?? 0) || 0;
    if (!total) return 0;
    return Math.round((completed / total) * 100) || 0;
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "in_progress", "In Progress", "In-progress", "planned", "Planning", "Planned", "submitted", "reopened", "rejected"];
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? baseItems.filter((item) => {
        if (item.item_type === "project") {
          if (statusFilter === "pending") {
            return pendingStatuses.includes(item.status);
          }
          const workflowStatuses = ["submitted","approved","rejected","reopened"];
          const displayStatus = workflowStatuses.includes(item.status) ? item.status : "pending";
          return displayStatus === statusFilter;
        }
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : baseItems;

  const taskIdList = filteredItems.filter((i) => i.item_type !== "project").map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Self Tasks" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Self Tasks</h3>
          <p>Tasks and projects you assigned to yourself</p>
          <div className="task-count-badge" style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span style={{ background: "#dedfe0", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Total: {totalCount} items
            </span>
            <span style={{ background: "#d6d6d6", color: "#166534", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Tasks: {filteredItems.filter(i => i.item_type !== "project").length}
            </span>
            <span style={{ background: "#d4d4d4", color: "#4338CA", padding: "4px 12px", borderRadius: "20px", fontSize: "15px", fontWeight: 600 }}>
              Projects: {filteredItems.filter(i => i.item_type === "project").length}
            </span>
          </div>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
              <option value="">All Time</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="180">Last 6 Months</option>
            </select>
          </div>

          <button
            className="export task-btn--mobile"
            onClick={() => setShowTaskModal({ open: true, projectId: null, id: Date.now() })}
            style={{ whiteSpace: "nowrap" }}
          >
            + Task
          </button>
        </div>
      </div>

      <div className="task-progress">
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All</p>
        <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
          <GoDotFill color="#EF4444" /> Due Today
        </p>
        <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Pending
        </p>
        <p className={`Submitted ${statusFilter === "submitted" ? "active" : ""}`} onClick={() => selectStatusFilter("submitted")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Submitted
        </p>
        <p className={`Reopened ${statusFilter === "reopened" ? "active" : ""}`} onClick={() => selectStatusFilter("reopened")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Reopened
        </p>
        <p className={`Approved ${statusFilter === "approved" ? "active" : ""}`} onClick={() => selectStatusFilter("approved")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Approved
        </p>
        <p className={`Rejected ${statusFilter === "rejected" ? "active" : ""}`} onClick={() => selectStatusFilter("rejected")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Rejected
        </p>
      </div>

      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task or project name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="container">
        <div className="table-header-compact">
          <div></div>
          <div>Task Name</div>
          <div>Type</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Priority</div>
          <div>Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <SortableTableWrapper 
            as="div" 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `${i.item_type}-${i.id}` }))} 
            onReorder={(reordered) => handleTaskReorder(reordered)} 
            idKey="sortableId"
            handleOnly
          >
            {(item, idx, dndProps) => {
              const isProject = item.item_type === "project";

              if (isProject) {
                return (
                  <div className="taskby-row-compact" key={item.sortableId}>
                    <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                    <div><div className="task-title">{item.title}</div></div>
                    <div><span className="badge" style={{ background: "#eef2ff", color: "#4f46e5" }}>Project</span></div>
                    <div>
                      <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                        <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                        {["submitted","approved","rejected","reopened"].includes(item.status) ? formatStatus(item.status) : "Pending"}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>{calculateProgress(item)}%</div>
                      <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${calculateProgress(item)}%` }}></div></div>
                      <div className="deliverables-approved-text">{item.completed_tasks || 0}/{item.total_tasks || 0} tasks</div>
                    </div>
                    <div>
                      <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                        <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                        {item.priority}
                      </span>
                    </div>
                    <div className="date-box">
                      <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                    </div>
                    <div className="action-btns">
                      <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`projects/project-details/${item.id}`), { state: { from: 'self-tasks' } })}><IoEyeOutline /></button>
                      {item.can_submit && (
                        <button 
                          className="action-icon-btn action-submit" 
                          title="Submit Project" 
                          onClick={() => setShowProjectSubmitModal({ open: true, project: item })}
                        >
                          <LuSend />
                        </button>
                      )}
                      {item.status === "submitted" && <span className="action-status-badge" style={{ color: "#1E40AF", fontWeight: 600, fontSize: "12px" }}>Submitted</span>}
                      {item.status === "approved" && <span className="action-status-badge" style={{ color: "#166534", fontWeight: 600, fontSize: "12px" }}>Approved</span>}
                      {item.status === "rejected" && <span className="action-status-badge" style={{ color: "#991B1B", fontWeight: 600, fontSize: "12px" }}>Rejected</span>}
                      {item.status === "reopened" && <span className="action-status-badge" style={{ color: "#92400E", fontWeight: 600, fontSize: "12px" }}>Reopened</span>}
                      {item.status === "completed" && <span className="action-status-badge" style={{ color: "#166534", fontWeight: 600, fontSize: "12px" }}>Completed</span>}
                    </div>
                  </div>
                );
              }

              return (
                <div className="taskby-row-compact" key={item.sortableId}>
                  <DragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} />
                  <div><div className="task-title">{item.title}</div></div>
                  <div><span className="badge" style={{ background: "#f0fdf4", color: "#16a34a" }}>Task</span></div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {formatStatus(item.status)}
                    </span>
                  </div>
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>{item.deliverables_progress || 0}%</div>
                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div></div>
                    <div className="deliverables-approved-text">{item.approved_deliverables || 0}/{item.total_deliverables || 0} Deliverables Approved</div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  <div className="date-box">
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.end_date)}</div>
                  </div>
                  <div className="action-btns">
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}><IoEyeOutline /></button>
                  </div>
                </div>
              );
            }}
          </SortableTableWrapper>
        )}
      </div>

      {!showAll && totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Modals */}
      {showProjectSubmitModal.open && (
        <SubmitProjectModal
          key={`project-submit-${showProjectSubmitModal.project?.id || "none"}`}
          isOpen={showProjectSubmitModal.open}
          onClose={() => setShowProjectSubmitModal({ open: false, project: null })}
          project={showProjectSubmitModal.project}
          onSubmitSuccess={fetchTasks}
        />
      )}

      {showTaskModal.open && (
        <CreateTaskModal
          key={`task-create-${showTaskModal.id}`}
          isOpen={showTaskModal.open}
          onClose={handleModalClose}
          onTaskCreated={handleTaskCreated}
          projectId={showTaskModal.projectId}
        />
      )}

      {showDeliverableSubmitModal.open && (
        <SubmitDeliverableModal
          key={`deliverable-submit-${showDeliverableSubmitModal.deliverable?.id || "none"}`}
          isOpen={showDeliverableSubmitModal.open}
          onClose={() => setShowDeliverableSubmitModal({ open: false, deliverable: null })}
          deliverable={showDeliverableSubmitModal.deliverable}
          onSubmitSuccess={handleDeliverableSubmitSuccess}
        />
      )}

      {viewModal.open && (
        <SelfDeliverableViewModal
          key={`view-${viewModal.deliverable?.id || "none"}`}
          isOpen={viewModal.open}
          onClose={() => setViewModal({ open: false, deliverable: null })}
          deliverable={viewModal.deliverable}
          onActionSuccess={handleDeliverableUpdate}
          onResubmit={(deliverable) => setShowDeliverableSubmitModal({ open: true, deliverable })}
        />
      )}
    </DashboardLayout>
  );
};

export default SelfTasks;