/**
 * DraftCenter.jsx
 * Centralized Draft Management page for all PMS modules.
 * Lists, filters, and manages drafts across projects, tasks, subtasks, and events.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { getUser, rolePath } from "../utils/auth";
import API_URL from "../config/api";
import draftService from "../services/draftService";
import { notify } from "../utils/notify";
import { publish, subscribe } from "../utils/eventBus";
import {
  MdEditNote,
  MdSearch,
  MdEdit,
  MdDelete,
  MdClose,
  MdPersonAdd,
} from "react-icons/md";
import "./DraftCenter.css";

const MODULE_TYPES = [
  { value: "", labelKey: "All Modules", defaultLabel: "All Modules" },
  { value: "project", labelKey: "Project", defaultLabel: "Project" },
  { value: "task", labelKey: "Task", defaultLabel: "Task" },
  { value: "deliverable", labelKey: "Subtask", defaultLabel: "Subtask" },
  { value: "event", labelKey: "Calendar Event", defaultLabel: "Calendar Event" },
  { value: "user", labelKey: "User", defaultLabel: "User" },
  { value: "team", labelKey: "Team", defaultLabel: "Team" },
];

const STATUS_OPTIONS = [
  { value: "", labelKey: "All Statuses", defaultLabel: "All Statuses" },
  { value: "draft", labelKey: "Draft", defaultLabel: "Draft" },
  { value: "auto_saved", labelKey: "Auto Saved", defaultLabel: "Auto Saved" },
  { value: "ready_to_publish", labelKey: "Ready to Publish", defaultLabel: "Ready to Publish" },
  { value: "published", labelKey: "Published", defaultLabel: "Published" },
  { value: "archived", labelKey: "Archived", defaultLabel: "Archived" },
];

const SORT_OPTIONS = [
  { value: "updated_at_desc", labelKey: "Recently Edited", defaultLabel: "Recently Edited" },
  { value: "updated_at_asc", labelKey: "Oldest Edited", defaultLabel: "Oldest Edited" },
  { value: "created_at_desc", labelKey: "Newest", defaultLabel: "Newest" },
  { value: "created_at_asc", labelKey: "Oldest", defaultLabel: "Oldest" },
  { value: "title_asc", labelKey: "Alphabetical (A-Z)", defaultLabel: "Alphabetical (A-Z)" },
  { value: "title_desc", labelKey: "Alphabetical (Z-A)", defaultLabel: "Alphabetical (Z-A)" },
];

const MODULE_BADGE_COLORS = {
  project: "#4f46e5",
  task: "#0891b2",
  deliverable: "#7c3aed",
  event: "#059669",
  user: "#d97706",
  team: "#dc2626",
};

const MODULE_EDIT_LABELS = {
  project: "Edit Project",
  task: "Edit Task",
  deliverable: "Edit Subtask",
  event: "Edit Event",
};

const MODULE_CREATE_LABELS = {
  project: "Create New Project",
  task: "Create New Task",
  deliverable: "Create New Subtask",
  event: "Create New Event",
};

const STATUS_BADGE_CLASSES = {
  draft: "dc-status-draft",
  auto_saved: "dc-status-auto",
  ready_to_publish: "dc-status-ready",
  published: "dc-status-published",
  archived: "dc-status-archived",
};

function DraftCenter() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = getUser();

  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState("desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createdBy, setCreatedBy] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [returnedCount, setReturnedCount] = useState(0);
  const searchTimerRef = useRef(null);

  const fetchDrafts = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const params = {
          page: p,
          per_page: 25,
          sort_field: sortBy,
          sort_order: sortOrder,
        };
        if (search) params.search = search;
        if (moduleFilter) params.module_type = moduleFilter;
        if (statusFilter) params.status = statusFilter;
        if (dateFrom) params.date_from = dateFrom;
        if (dateTo) params.date_to = dateTo;
        if (createdBy) params.created_by = createdBy;
        if (activeTab === "returned") params.is_returned = "true";

        const data = await draftService.list(params);
        setDrafts(data.data || []);
        setPage(data.current_page || 1);
        setLastPage(data.last_page || 1);
        setTotal(data.total || 0);
      } catch (err) {
        notify.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    [search, moduleFilter, statusFilter, sortBy, sortOrder, dateFrom, dateTo, createdBy, activeTab]
  );

  useEffect(() => {
    fetchDrafts(1);
  }, [fetchDrafts]);

  useEffect(() => {
    const unsub = subscribe("drafts:changed", () => fetchDrafts(page));
    return unsub;
  }, [fetchDrafts, page]);

  useEffect(() => {
    const fetchReturnedCount = async () => {
      try {
        const data = await draftService.list({ is_returned: "true", per_page: 1 });
        setReturnedCount(data.total || 0);
      } catch {}
    };
    fetchReturnedCount();
  }, []);

  const handleSearchChange = (val) => {
    setSearchInput(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setSearch(val), 400);
  };

  const handleSortChange = (val) => {
    const sortField = val.replace(/_(asc|desc)$/, "");
    const order = val.endsWith("_asc") ? "asc" : "desc";
    setSortBy(sortField);
    setSortOrder(order);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await draftService.delete(deleteConfirm.id);
      notify.success(t("Draft deleted successfully", { defaultValue: "Draft deleted successfully" }));
      setDeleteConfirm(null);
      fetchDrafts(page);
      publish("drafts:changed");
    } catch (err) {
      notify.error(err.message);
    }
  };

  const handleEdit = (draft) => {
    const routeMap = {
      project: rolePath("projects"),
      task: rolePath("tasks"),
      deliverable: rolePath("deliveries"),
      event: rolePath("calender"),
    };
    navigate(routeMap[draft.module_type] || rolePath("dashboard"), {
      state: { openDraft: draft.id, draftCode: draft.draft_code },
    });
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return t("just now", { defaultValue: "just now" });
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <DashboardLayout hideRightSidebar={true}>
      <Breadcrumb items={[{ label: t("Drafts", { defaultValue: "Drafts" }) }]} />

      <div className="dc-layout">
        <div className="dc-header">
          <div className="dc-header-left">
            <div className="dc-header-icon">
              <MdEditNote size={22} />
            </div>
            <div>
              <h1 className="dc-title">{t("Drafts", { defaultValue: "Drafts" })}</h1>
              <p className="dc-subtitle">{t("{{count}} draft(s) in total", { count: total, defaultValue: `${total} draft(s) in total` })}</p>
            </div>
          </div>
        </div>

        <div className="dc-tabs">
          <button
            className={`dc-tab ${activeTab === "all" ? "dc-tab-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            {t("All Drafts", { defaultValue: "All Drafts" })}
          </button>
          <button
            className={`dc-tab ${activeTab === "returned" ? "dc-tab-active" : ""}`}
            onClick={() => setActiveTab("returned")}
          >
            {t("Returned from Resignation", { defaultValue: "Returned from Resignation" })}
            {returnedCount > 0 && <span className="dc-tab-badge">{returnedCount}</span>}
          </button>
        </div>

        <div className="dc-filters">
          <div className="dc-filter-row">
            <div className="dc-search">
              <MdSearch className="dc-search-icon" size={18} />
              <input
                type="text"
                placeholder={t("Search drafts by title or code...", { defaultValue: "Search drafts by title or code..." })}
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchInput && (
                <button
                  className="dc-search-clear"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                  }}
                >
                  <MdClose size={16} />
                </button>
              )}
            </div>

            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="dc-select"
            >
              {MODULE_TYPES.map((m) => (
                <option key={m.value} value={m.value}>
                  {t(m.labelKey, { defaultValue: m.defaultLabel })}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="dc-select"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey, { defaultValue: s.defaultLabel })}
                </option>
              ))}
            </select>

            <select
              value={`${sortBy}_${sortOrder}`}
              onChange={(e) => handleSortChange(e.target.value)}
              className="dc-select"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.labelKey, { defaultValue: s.defaultLabel })}
                </option>
              ))}
            </select>

            <div className="dc-date-range">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title={t("From date", { defaultValue: "From date" })}
              />
              <span className="dc-date-sep">{t("to", { defaultValue: "to" })}</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title={t("To date", { defaultValue: "To date" })}
              />
            </div>
          </div>
        </div>

        <div className="dc-page">
          {loading ? (
            <div className="dc-empty">
              <div className="dc-spinner"></div>
              <p>{t("Loading drafts...", { defaultValue: "Loading drafts..." })}</p>
            </div>
          ) : drafts.length === 0 ? (
            <div className="dc-empty">
              <MdEditNote size={48} className="dc-empty-icon" />
              <h3>{t("No drafts found", { defaultValue: "No drafts found" })}</h3>
              <p>
                {t("Drafts are automatically saved when you create or edit items.", { defaultValue: "Drafts are automatically saved when you create or edit items." })}
                <br />
                {t("Start creating a project, task, or event and save it as a draft.", { defaultValue: "Start creating a project, task, or event and save it as a draft." })}
              </p>
            </div>
          ) : (
            <>
              <div className="dc-table-wrap">
                <table className="dc-table">
                  <thead>
                    <tr>
                      <th>{t("Draft Title", { defaultValue: "Draft Title" })}</th>
                      <th>{t("Module", { defaultValue: "Module" })}</th>
                      <th>{t("Project", { defaultValue: "Project" })}</th>
                      <th>{t("Status", { defaultValue: "Status" })}</th>
                      <th>{t("Created By", { defaultValue: "Created By" })}</th>
                      <th>{t("Last Edited By", { defaultValue: "Last Edited By" })}</th>
                      <th>{t("Last Saved", { defaultValue: "Last Saved" })}</th>
                      <th>{t("Version", { defaultValue: "Version" })}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft) => (
                      <tr key={draft.id} className={draft.is_returned ? "dc-row-returned" : ""}>
                        <td>
                          <div className="dc-draft-title">
                            <span className="dc-draft-name">{draft.title || t("Untitled Draft", { defaultValue: "Untitled Draft" })}</span>
                            <span className="dc-draft-code">{draft.draft_code}</span>
                            <span
                              className="dc-action-type-badge"
                              style={{
                                background: draft.original_record_id ? "#dcfce7" : "#dbeafe",
                                color: draft.original_record_id ? "#166534" : "#1e40af",
                              }}
                            >
                              {draft.original_record_id
                                ? t(MODULE_EDIT_LABELS[draft.module_type] || "Edit", { defaultValue: MODULE_EDIT_LABELS[draft.module_type] || "Edit" })
                                : t(MODULE_CREATE_LABELS[draft.module_type] || "Create New", { defaultValue: MODULE_CREATE_LABELS[draft.module_type] || "Create New" })}
                            </span>
                            {draft.is_returned && (
                              <div className="dc-returned-info" style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                                <span className="dc-returned-badge">{t("Returned from Resignation", { defaultValue: "Returned from Resignation" })}</span>
                                <span className="dc-assignee-required-badge" style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #F87171", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <MdPersonAdd size={13} /> {t("Assignee Required", { defaultValue: "Assignee Required" })}
                                </span>
                                {draft.returned_from_user && (
                                  <span className="dc-returned-user">{t("Former assignee: {{name}}", { name: draft.returned_from_user.name, defaultValue: `Former assignee: ${draft.returned_from_user.name}` })}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <span
                            className="dc-module-badge"
                            style={{
                              background: (MODULE_BADGE_COLORS[draft.module_type] || "#6b7280") + "15",
                              color: MODULE_BADGE_COLORS[draft.module_type] || "#6b7280",
                            }}
                          >
                            {t(draft.module_label || draft.module_type, { defaultValue: draft.module_label || draft.module_type })}
                          </span>
                        </td>
                        <td>
                          {draft.project ? (
                            <span className="dc-project-link">
                              {draft.project.business_id} - {draft.project.title}
                            </span>
                          ) : (
                            <span className="dc-text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`dc-status-badge ${STATUS_BADGE_CLASSES[draft.status] || ""}`}
                          >
                            {t(draft.status_label || draft.status, { defaultValue: draft.status_label || draft.status })}
                          </span>
                        </td>
                        <td>
                          <div className="dc-user-cell">
                            {draft.creator?.avatar ? (
                              <img
                                src={`${API_URL.replace("/api", "")}/storage/${draft.creator.avatar}`}
                                alt=""
                                className="dc-user-avatar"
                              />
                            ) : (
                              <div className="dc-user-avatar dc-avatar-placeholder">
                                {(draft.creator?.name || "U").charAt(0)}
                              </div>
                            )}
                            <span>{draft.creator?.name || "-"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="dc-user-cell">
                            {draft.last_editor?.avatar ? (
                              <img
                                src={`${API_URL.replace("/api", "")}/storage/${draft.last_editor.avatar}`}
                                alt=""
                                className="dc-user-avatar"
                              />
                            ) : (
                              <div className="dc-user-avatar dc-avatar-placeholder">
                                {(draft.last_editor?.name || "U").charAt(0)}
                              </div>
                            )}
                            <span>{draft.last_editor?.name || "-"}</span>
                          </div>
                        </td>
                        <td className="dc-cell-time">
                          {formatRelativeTime(draft.last_auto_saved_at || draft.updated_at)}
                        </td>
                        <td>
                          <span className="dc-version-badge">v{draft.version}</span>
                        </td>
                        <td>
                          <div className="action-btns">
                            <button
                              className="action-icon-btn action-edit"
                              title={draft.original_record_id ? t(MODULE_EDIT_LABELS[draft.module_type] || "Edit", { defaultValue: MODULE_EDIT_LABELS[draft.module_type] || "Edit" }) : t(MODULE_CREATE_LABELS[draft.module_type] || "Create New", { defaultValue: MODULE_CREATE_LABELS[draft.module_type] || "Create New" })}
                              onClick={() => handleEdit(draft)}
                            >
                              <MdEdit size={16} />
                            </button>
                            <button
                              className="action-icon-btn action-delete"
                              title={t("Delete Draft", { defaultValue: "Delete Draft" })}
                              onClick={() => setDeleteConfirm(draft)}
                            >
                              <MdDelete size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lastPage > 1 && (
                <Pagination
                  currentPage={page}
                  totalPages={lastPage}
                  onPageChange={(p) => {
                    setPage(p);
                    fetchDrafts(p);
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <ConfirmModal
          isOpen={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={handleDelete}
          title={t("Delete Draft", { defaultValue: "Delete Draft" })}
          message={t("Are you sure you want to delete \"{{title}}\"? This action cannot be undone.", { title: deleteConfirm.title || deleteConfirm.draft_code, defaultValue: `Are you sure you want to delete "${deleteConfirm.title || deleteConfirm.draft_code}"? This action cannot be undone.` })}
          confirmText={t("Delete", { defaultValue: "Delete" })}
          cancelText={t("Cancel", { defaultValue: "Cancel" })}
          danger
        />
      )}
    </DashboardLayout>
  );
}

export default DraftCenter;
