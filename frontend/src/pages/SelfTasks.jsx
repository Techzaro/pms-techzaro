/**
 * SelfTasks page component.
 *
 * Displays tasks that the current user assigned to themselves.
 * Includes search with debounce, status filtering, time-range filtering,
 * drag-and-drop reordering and pagination.  Modals are available for
 * creating new tasks and submitting subtasks.
 */

import { useState, useEffect, useCallback } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { StickyNote } from "lucide-react";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SubmitDeliverableModal from "../components/SubmitDeliverableModal"; // Added missing import
import SelfDeliverableViewModal from "../components/SelfDeliverableViewModal"; // Added missing import
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import API_URL from "../config/api";
import { authToken, getUser, rolePath } from "../utils/auth";
import { formatDateTimeInline } from "../utils/formatDateTime";
import "../components/ActionPopover.css";
import "../pages/Task.css";

const STATUS_COLORS = {
  pending: "#FEF3C7",
  in_progress: "#DBEAFE",
  paused: "#FEF3C7",
  submitted: "#DBEAFE",
  reopened: "#EDE9FE",
  approved: "#DCFCE7",
  rejected: "#FEE2E2",
};

const STATUS_TEXT_COLORS = {
  pending: "#92400E",
  in_progress: "#1E40AF",
  paused: "#92400E",
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

/** Main Self Tasks page — renders tasks assigned by the current user to themselves. */
const SelfTasks = () => {
  const navigate = useNavigate();
  const currentUser = getUser();
  
  // State declarations
  const [showTaskModal, setShowTaskModal] = useState({ open: false, projectId: null, id: null }); // Fixed to object
  const [showSubtaskSubmitModal, setShowSubtaskSubmitModal] = useState({ open: false, subtask: null }); // Added missing state
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [viewModal, setViewModal] = useState({ open: false, subtask: null }); // Added missing state
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
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
    if (filter === statusFilter && filter === "") {
      setShowAll(!showAll);
    } else {
      setStatusFilter(filter);
      setShowAll(false);
      setPage(1);
    }
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

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskReorder = useCallback((reordered) => {
    setOrderedItems(reordered);
    if (reordered.length) {
      const payload = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));
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

  const handleSubtaskSubmitSuccess = () => {
    fetchTasks();
  };

  const handleTaskSubmitSuccess = () => {
    fetchTasks();
  };

  const handleSubtaskUpdate = () => {
    fetchTasks();
  };

  const formatDate = (dateStr) => {
    return formatDateTimeInline(dateStr);
  };

  const formatStatus = (status) => {
    const map = {
      pending: "Pending",
      in_progress: "In Progress",
      paused: "Paused",
      submitted: "Submitted",
      reopened: "Reopened",
      approved: "Approved",
      rejected: "Declined",
    };
    return map[status] || status;
  };

  const baseItems = orderedItems.length ? orderedItems : items;
  const pendingStatuses = ["pending", "planned", "Planning", "Planned"];
  const inProgressStatuses = ["in_progress", "In Progress", "In-progress"];

  const allCount = baseItems.length;
  const dueTodayCount = baseItems.filter((i) => { const d = i.end_date ? new Date(i.end_date) : null; return d && d.toDateString() === new Date().toDateString(); }).length;
  const pendingCount = baseItems.filter((i) => pendingStatuses.includes(i.status)).length;
  const inProgressCount = baseItems.filter((i) => inProgressStatuses.includes(i.status)).length;
  const pausedCount = baseItems.filter((i) => i.status === "paused").length;
  const submittedCount = baseItems.filter((i) => i.status === "submitted").length;
  const reopenedCount = baseItems.filter((i) => i.status === "reopened").length;
  const approvedCount = baseItems.filter((i) => i.status === "approved").length;
  const rejectedCount = baseItems.filter((i) => i.status === "rejected").length;
  const searchFilteredItems = debouncedSearch
    ? baseItems.filter((item) => {
        const q = debouncedSearch.toLowerCase();
        const titleMatch = (item.title || "").toLowerCase().includes(q);
        const assigneeMatch = (item.assignees || []).some(a => (a.name || "").toLowerCase().includes(q));
        const assignerMatch = (item.assigner?.name || "").toLowerCase().includes(q);
        return titleMatch || assigneeMatch || assignerMatch;
      })
    : baseItems;
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? searchFilteredItems.filter((item) => {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : searchFilteredItems;

  const taskIdList = filteredItems.map((i) => i.id);

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
          <p>Tasks you assigned to yourself</p>
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
        <p className={`DueToday ${statusFilter === "due_today" ? "active" : ""}`} onClick={() => selectStatusFilter("due_today")} style={{ cursor: "pointer" }}>
          <GoDotFill color="#EF4444" /> Due Today ({dueTodayCount})
        </p>
        <p className={`Pending ${statusFilter === "pending" ? "active" : ""}`} onClick={() => selectStatusFilter("pending")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Pending ({pendingCount})
        </p>
        <p className={`InProgress ${statusFilter === "in_progress" ? "active" : ""}`} onClick={() => selectStatusFilter("in_progress")} style={{ cursor: "pointer" }}>
          <GoDotFill /> In Progress ({inProgressCount})
        </p>
        <p className={`Paused ${statusFilter === "paused" ? "active" : ""}`} onClick={() => selectStatusFilter("paused")} style={{ cursor: "pointer" }}>
          <GoDotFill /> Paused ({pausedCount})
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
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
      </div>

      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task name or user name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="container">
        <div className="table-header-compact">
          <div style={{ fontSize: 12, fontWeight: 600 }}>ID</div>
          <div>Task Name</div>
          <div>Status</div>
          <div>Progress</div>
          <div>Priority</div>
          <div>Start & Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <SortableTableWrapper 
            as="div" 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))} 
            onReorder={(reordered) => handleTaskReorder(reordered)} 
            idKey="sortableId"
            handleOnly
          >
            {(item, idx, dndProps) => {
              return (
                <div className="taskby-row-compact" key={item.sortableId}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={item.business_id} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#2563eb", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>
                  <div>
                    <span className="badge" style={{ background: STATUS_COLORS[item.status] || "#F3F4F6", color: STATUS_TEXT_COLORS[item.status] || "#374151" }}>
                      <span className="dot" style={{ background: STATUS_TEXT_COLORS[item.status] || "#374151" }}></span>
                      {formatStatus(item.status)}
                    </span>
                    {item.status === "approved" && item.approvedBy && (
                      <div style={{ fontSize: "10px", color: "#166534", marginTop: "2px" }}>by {item.approvedBy.name}</div>
                    )}
                    {item.status === "rejected" && item.rejectedBy && (
                      <div style={{ fontSize: "10px", color: "#991B1B", marginTop: "2px" }}>by {item.rejectedBy.name}</div>
                    )}
                    {item.status === "reopened" && item.reopenedBy && (
                      <div style={{ fontSize: "10px", color: "#92400E", marginTop: "2px" }}>by {item.reopenedBy.name}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#374151" }}>
                      {item.deliverables_progress || 0}%
                    </div>
                    <div className="progress-bar-track"><div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div></div>
                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                    </div>
                  </div>
                  <div>
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  <div className="date-box">
                    <div style={{ whiteSpace: "pre-line" }}>{formatDate(item.start_date)}{"\n"}{formatDate(item.end_date)}</div>
                  </div>
                  <ActionPopover
                    trigger={
                      <button className="action-icon-btn action-view action-trigger-lg" title="Actions">
                        <IoEyeOutline size={20} />
                      </button>
                    }
                  >
                    <button className="action-icon-btn action-view" title="View" onClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'self-tasks' } })}><IoEyeOutline size={16} /></button>
                    <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                    {(() => {
                      const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                      const canSubmit = (item.status === "in_progress" || item.status === "reopened" || item.status === "paused") && myPivotStatus !== "submitted";
                      return canSubmit && (
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        <button 
                          className="action-icon-btn action-submit" 
                          title={item.pending_deliverables_count > 0 ? "Submit all subtasks first" : "Submit Task"} 
                          disabled={item.pending_deliverables_count > 0} 
                          onClick={() => !item.pending_deliverables_count && setSubmitTaskModal({ open: true, task: item })} 
                          style={item.pending_deliverables_count > 0 ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                        >
                          <LuSend size={16} />
                        </button>
                      </div>
                      );
                    })()}
                  </ActionPopover>
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
      {showTaskModal.open && (
        <CreateTaskModal
          key={`task-create-${showTaskModal.id}`}
          isOpen={showTaskModal.open}
          onClose={handleModalClose}
          onTaskCreated={handleTaskCreated}
          projectId={showTaskModal.projectId}
        />
      )}

      {submitTaskModal.open && (
        <SubmitTaskModal
          key={`task-submit-${submitTaskModal.task?.id || "none"}`}
          isOpen={submitTaskModal.open}
          onClose={() => setSubmitTaskModal({ open: false, task: null })}
          task={submitTaskModal.task}
          onSubmitSuccess={handleTaskSubmitSuccess}
        />
      )}

      {showSubtaskSubmitModal.open && (
        <SubmitDeliverableModal
          key={`subtask-submit-${showSubtaskSubmitModal.subtask?.id || "none"}`}
          isOpen={showSubtaskSubmitModal.open}
          onClose={() => setShowSubtaskSubmitModal({ open: false, subtask: null })}
          deliverable={showSubtaskSubmitModal.subtask}
          onSubmitSuccess={handleSubtaskSubmitSuccess}
        />
      )}

      {viewModal.open && (
        <SelfDeliverableViewModal
          key={`view-${viewModal.subtask?.id || "none"}`}
          isOpen={viewModal.open}
          onClose={() => setViewModal({ open: false, subtask: null })}
          deliverable={viewModal.subtask}
          onActionSuccess={handleSubtaskUpdate}
          onResubmit={(subtask) => setShowSubtaskSubmitModal({ open: true, subtask })}
        />
      )}

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />
    </DashboardLayout>
  );
};

export default SelfTasks;