/**
 * Tasks page component — "Tasks Assigned To You".
 *
 * Displays tasks that have been assigned to the current user
 * by others.  Provides search with debounce, status filtering, time-range
 * filtering, drag-and-drop reordering and pagination.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { GoDotFill } from "react-icons/go";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { IoSearchOutline, IoEyeOutline } from "react-icons/io5";
import { LuSend } from "react-icons/lu";
import { CheckCircle2, Lock, Pause, Play, StickyNote, Users } from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { publish } from "../utils/eventBus";
import CreateTaskModal from "../components/CreateTaskModal";
import SubmitTaskModal from "../components/SubmitTaskModal";
import SortableTableWrapper from "../components/SortableTableWrapper";
import SmartDragHandle from "../components/SmartDragHandle";
import Pagination from "../components/Pagination";
import ActionPopover from "../components/ActionPopover";
import TaskNotesPopover from "../components/TaskNotesPopover";
import AddNoteModal from "../components/AddNoteModal";
import TransferTaskDialog from "../components/TransferTaskDialog";
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

/** Main Tasks page — renders tasks assigned to the current user by others. */
function Tasks() {
  const navigate = useNavigate();
  const location = useLocation();
  const { notify } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [orderedItems, setOrderedItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const currentUser = getUser();
  const [statusFilter, setStatusFilter] = useState(() => {
    const status = searchParams.get("status");
    if (status) return status;
    return "";
  });
  const [timeFilter, setTimeFilter] = useState("");
  const [submitTaskModal, setSubmitTaskModal] = useState({ open: false, task: null });
  const [restoreDraftId, setRestoreDraftId] = useState(null);
  const [noteModal, setNoteModal] = useState({ open: false, itemId: null });
  const [transferDialog, setTransferDialog] = useState({ open: false, task: null });

  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /** Fetch tasks assigned to the current user from the API. */
  const fetchTasks = () => {
    setLoading(true);
    const token = authToken();
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_URL}/my-tasks?${params.toString()}`, {
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
  }, [debouncedSearch, statusFilter]);

  useAutoRefresh(fetchTasks, {
    events: ['task:created', 'task:updated', 'task:deleted', 'data:changed'],
  });

  // Handle draft restoration from DraftCenter
  useEffect(() => {
    const draftId = location.state?.openDraft;
    if (!draftId) return;
    window.history.replaceState({}, document.title);
    setRestoreDraftId(draftId);
    setShowTaskModal(true);
  }, [location.state]);

  useEffect(() => {
    setOrderedItems(items);
  }, [items]);

  const handleTaskListReorder = useCallback((reordered) => {
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

  useEffect(() => {
    const nextFilter = searchParams.get("status") || "";
    setStatusFilter((current) => {
      if (nextFilter === "due_today" || current === "due_today" || nextFilter !== current) {
        return nextFilter;
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
      if (filter) {
        setSearchParams({ status: filter });
      } else {
        setSearchParams({});
      }
    }
  };

  const handleModalClose = (refresh) => {
    setShowTaskModal(false);
    if (refresh) fetchTasks();
  };

  const getInitials = (name) => {
    if (!name) return "??";
    return name.split(" ").map((w) => w[0]).join("").substring(0, 2).toUpperCase();
  };

  const getRandomColors = (id) => {
    const colors = [
      { bg: "#E0E7FF", text: "#4338CA" },
      { bg: "#FEE2E2", text: "#B91C1C" },
      { bg: "#DCFCE7", text: "#22C55E" },
      { bg: "#FEF3C7", text: "#D97706" },
      { bg: "#EDE9FE", text: "#7C3AED" },
      { bg: "#FCE7F3", text: "#DB2777" },
    ];
    return colors[id % colors.length];
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

  const handleTaskSubmitSuccess = (updatedTask) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updatedTask.id
          ? { ...item, ...updatedTask }
          : item
      )
    );
  };

  const handleAcknowledge = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", ...data.task } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "acknowledged");
      } else {
        notify.error(data.message || "Failed to acknowledge task.");
      }
    } catch {
      notify.error("Failed to acknowledge task.");
    }
  };

  const handleContinue = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "in_progress", ...data.task } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'in_progress' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "resumed");
      } else {
        notify.error(data.message || "Failed to continue task.");
      }
    } catch {
      notify.error("Failed to continue task.");
    }
  };

  const handlePause = async (taskId) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "other" }),
        _notifHandled: true,
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === taskId ? { ...item, status: "paused", ...data.task } : item
          )
        );
        publish('task:updated', { id: taskId, status: 'paused' });
        publish('data:changed', { type: 'task', action: 'updated' });
        showSuccessMessage("Task", "paused");
      } else {
        notify.error(data.message || "Failed to pause task.");
      }
    } catch {
      notify.error("Failed to pause task.");
    }
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
  const filteredItems = statusFilter && statusFilter !== "due_today"
    ? items.filter((item) => {
        if (statusFilter === "pending") {
          return pendingStatuses.includes(item.status);
        }
        return item.status === statusFilter;
      })
    : baseItems;

  const taskIdList = filteredItems.map((i) => i.id);

  const totalPages = showAll ? 1 : Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = showAll ? filteredItems : filteredItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const breadcrumbs = [
    { label: "Tasks", path: rolePath("tasks") },
    { label: "Assigned To You" },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned To You</h3>
          <p>Manage and track your tasks and projects</p>
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
        </div>
      </div>

      {showTaskModal && (
        <CreateTaskModal
          restoreDraftId={restoreDraftId}
          onClose={(refresh) => {
            setShowTaskModal(false);
            setRestoreDraftId(null);
            if (refresh) fetchTasks();
          }}
        />
      )}

      {/* STATUS FILTERS */}
      <div className="task-progress">
        <p className={`All ${!statusFilter ? "active" : ""}`} onClick={() => selectStatusFilter("")} style={{ cursor: "pointer" }}>All ({allCount})</p>
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
      </div>

      {/* SEARCH BAR */}
      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input
          type="text"
          placeholder="Search by task name or user name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="container">
        <div className="table-header1">
          <div style={{ fontSize: 12, fontWeight: 600 }}>ID</div>
          <div>Assigned by</div>
          <div className="task-name-column">Task Name</div>
          <div className="status-column">Status</div>
          <div>Progress</div>
          <div className="priority-column">Priority</div>
          <div className="date-column">Start & Due Date</div>
          <div>Action</div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>No items found</div>
        ) : (
          <SortableTableWrapper 
            items={paginatedItems.map((i) => ({ ...i, sortableId: `task-${i.id}` }))} 
            onReorder={(reordered) => handleTaskListReorder(reordered)} 
            idKey="sortableId"
            as="div"
            handleOnly
          >
            {(item, idx, dndProps) => {
              const colors = getRandomColors(item.id);

              const assigner = item.assigner;
              return (
                <div className="taskby-row" key={item.sortableId}>
                  <SmartDragHandle listeners={dndProps?.listeners} attributes={dndProps?.attributes} businessId={item.business_id} />
                  <div className="col-assigned-to">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div className="avatar" style={{ background: colors.bg, color: colors.text }}>{getInitials(assigner?.name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="user-name">{assigner?.name || "System"}</div>
                        <div className="user-role">{assigner?.role || ""}</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-task-name">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div className="task-title">{item.title}</div>
                      <TaskNotesPopover taskId={item.id} itemType="task" />
                    </div>
                    {item.project && (
                      <Link to={rolePath(`projects/project-details/${item.project.id}`)} onClick={(e) => e.stopPropagation()} style={{ fontSize: "11px", color: "#6B7280", textDecoration: "none", marginTop: "2px", display: "inline-block" }}>
                        {item.project.title}
                      </Link>
                    )}
                  </div>
                  
                  <div className="col-status">
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
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${item.deliverables_progress || 0}%` }}></div>
                    </div>
                    <div style={{ fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.approved_deliverables || 0}/{item.total_deliverables || 0} subtasks
                    </div>
                  </div>
                  
                  <div className="col-priority">
                    <span className="badge" style={{ background: PRIORITY_COLORS[item.priority] || "#F3F4F6", color: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}>
                      <span className="dot" style={{ background: PRIORITY_TEXT_COLORS[item.priority] || "#374151" }}></span>
                      {item.priority}
                    </span>
                  </div>
                  
                  <div className="col-due-date">
                    <div className="date-box">
                      <div style={{ whiteSpace: "pre-line" }}>
                        {(() => {
                          const myPivotStart = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.start_date;
                          return formatDate(myPivotStart || item.start_date);
                        })()}
                        {"\n"}
                        {(() => {
                          const myPivot = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.due_date;
                          return formatDate(myPivot || item.end_date);
                        })()}
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
                      onTriggerClick={() => navigate(rolePath(`tasks/task-details/${item.id}`), { state: { taskIds: taskIdList, from: 'tasks' } })}
                    >
                      <button className="action-icon-btn action-note" title="Add Note" onClick={() => setNoteModal({ open: true, itemId: item.id })}><StickyNote size={14} /></button>
                      {(() => {
                        const myPivotStatus = item.assignees?.find(a => parseInt(a.id, 10) === parseInt(currentUser?.id, 10))?.pivot?.status;
                        if (item.assigner_paused) {
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 8px", borderRadius: "6px", backgroundColor: "#FEF3C7", color: "#92400E", fontSize: "11px", fontWeight: 600, border: "1px solid #F59E0B" }}>
                              <Lock size={12} />
                              On Hold
                            </span>
                          );
                        }
                        if (item.status === "pending") {
                          return (
                            <button className="action-icon-btn action-submit" title="Acknowledge Task" onClick={() => handleAcknowledge(item.id)}>
                              <CheckCircle2 size={16} />
                            </button>
                          );
                        }
                        if (item.status === "paused") {
                          return (
                            <button className="action-icon-btn action-submit" title="Continue Task" onClick={() => handleContinue(item.id)}>
                              <Play size={16} />
                            </button>
                          );
                        }
                        if (item.status === "in_progress" && !item.assigner_paused) {
                          return (
                            <button className="action-icon-btn action-submit" title="Pause Task" onClick={() => handlePause(item.id)} style={{ color: "#D97706" }}>
                              <Pause size={16} />
                            </button>
                          );
                        }
                        if ((item.status === "in_progress" || item.status === "reopened") && myPivotStatus !== "submitted") {
                          return (
                            <div style={{ position: "relative", display: "inline-flex" }}>
                              <button
                                className="action-icon-btn action-submit"
                                title={item.pending_deliverables_count > 0 ? "Submit all subtasks first" : item.status === "paused" || item.assigner_paused ? "Task is paused/on-hold. Resume first." : "Submit Task"}
                                disabled={item.pending_deliverables_count > 0 || item.status === "paused" || item.assigner_paused}
                                onClick={() => !item.pending_deliverables_count && item.status !== "paused" && !item.assigner_paused && setSubmitTaskModal({ open: true, task: item })}
                                style={item.pending_deliverables_count > 0 || item.status === "paused" || item.assigner_paused ? { opacity: 0.4, cursor: "not-allowed" } : {}}
                              >
                                <LuSend size={16} />
                              </button>
                            </div>
                          );
                        }
                        return null;
                      })()}
                      {!["approved", "rejected"].includes(item.status) && (
                        <button
                          className="action-icon-btn"
                          title="Transfer Task"
                          onClick={() => setTransferDialog({ open: true, task: item })}
                          style={{ color: "#2563EB", cursor: "pointer" }}
                        >
                          <Users size={16} />
                        </button>
                      )}
                    </ActionPopover>
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

      <SubmitTaskModal
        key={`tasks-submit-${submitTaskModal.task?.id || "none"}`}
        isOpen={submitTaskModal.open}
        onClose={() => setSubmitTaskModal({ open: false, task: null })}
        task={submitTaskModal.task}
        onSubmitSuccess={handleTaskSubmitSuccess}
      />

      <AddNoteModal
        isOpen={noteModal.open}
        onClose={() => setNoteModal({ open: false, itemId: null })}
        itemType="task"
        itemId={noteModal.itemId}
        onSaved={fetchTasks}
      />

      {transferDialog.open && (
        <TransferTaskDialog
          isOpen={transferDialog.open}
          onClose={() => setTransferDialog({ open: false, task: null })}
          task={transferDialog.task}
          onTransferSuccess={() => { setTransferDialog({ open: false, task: null }); fetchTasks(); }}
        />
      )}

    </DashboardLayout>
  );
}

export default Tasks;