/**
 * ReassignMemberModal.jsx
 * 
 * Centralized, reusable modal for removing a project member and reassigning
 * their active tasks and deliverables (subtasks) to another user.
 * 
 * Features:
 * 1. Searchable grouped dropdown:
 *    - "Members in Project" (Existing members in project)
 *    - "Add & Assign" (Organization users not yet in project; auto-attached)
 * 2. Granular Task & Subtask Checklist with "Select All" / "Deselect All"
 * 3. Self-fetching active tasks / org users fallback when not provided via props
 * 4. Automatic API execution with success/error callbacks or custom onConfirm
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  X,
  UserCheck,
  ArrowRight,
  ListTodo,
  Search,
  Check,
  ChevronDown,
  Layers,
  UserPlus,
  Users,
} from "lucide-react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { authToken } from "../utils/auth";
import { notify } from "../utils/notify";
import API_URL from "../config/api";
import "./ReassignMemberModal.css";

export default function ReassignMemberModal({
  isOpen,
  onClose,
  projectId: propProjectId,
  project,
  userToRemove: propUserToRemove,
  memberToRemove: propMemberToRemove,
  availableMembers: propAvailableMembers,
  allUsers: propAllUsers,
  activeTasks: propActiveTasks,
  activeDeliverables: propActiveDeliverables,
  totalActiveCount: propTotalActiveCount,
  onSuccess,
  onConfirm,
  loading: propLoading = false,
}) {
  const { t } = useTranslation();

  const userToRemove = propUserToRemove || propMemberToRemove;
  const resolvedUserId = userToRemove?._originalId || userToRemove?.id;
  const resolvedProjectId = propProjectId || project?.id;

  // Local state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [selectedDeliverableIds, setSelectedDeliverableIds] = useState(new Set());
  const [tasks, setTasks] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  const [fetchingTasks, setFetchingTasks] = useState(false);

  const [orgUsers, setOrgUsers] = useState([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState("");

  // Dropdown combobox state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const loading = propLoading || internalLoading;

  useEscapeKey(isOpen, () => {
    if (!loading) {
      if (dropdownOpen) {
        setDropdownOpen(false);
      } else {
        onClose();
      }
    }
  });

  // Fetch active tasks if not provided
  useEffect(() => {
    if (!isOpen || !resolvedProjectId || !resolvedUserId) return;

    if (propActiveTasks !== undefined && propActiveDeliverables !== undefined) {
      setTasks(propActiveTasks || []);
      setDeliverables(propActiveDeliverables || []);
      setSelectedTaskIds(new Set((propActiveTasks || []).map((t) => t.id)));
      setSelectedDeliverableIds(new Set((propActiveDeliverables || []).map((d) => d.id)));
      return;
    }

    let isMounted = true;
    setFetchingTasks(true);
    const token = authToken();

    fetch(`${API_URL}/projects/${resolvedProjectId}/members/${resolvedUserId}/check-active-tasks`, {
      headers: {
        Accept: "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        const fetchedTasks = data.tasks || [];
        const fetchedDelivs = data.deliverables || [];
        setTasks(fetchedTasks);
        setDeliverables(fetchedDelivs);
        setSelectedTaskIds(new Set(fetchedTasks.map((t) => t.id)));
        setSelectedDeliverableIds(new Set(fetchedDelivs.map((d) => d.id)));
      })
      .catch((err) => {
        console.error("Failed to check active tasks in ReassignMemberModal:", err);
      })
      .finally(() => {
        if (isMounted) setFetchingTasks(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, resolvedProjectId, resolvedUserId, propActiveTasks, propActiveDeliverables]);

  // Fetch organization users for "Add & Assign" if not provided
  useEffect(() => {
    if (!isOpen) return;

    if (Array.isArray(propAllUsers) && propAllUsers.length > 0) {
      setOrgUsers(propAllUsers);
      return;
    }

    let isMounted = true;
    const token = authToken();
    fetch(`${API_URL}/team-users`, {
      headers: {
        Accept: "application/json",
        Authorization: token ? `Bearer ${token}` : "",
      },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : data.users || data.data || [];
        setOrgUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isOpen, propAllUsers]);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelectedUserId("");
      setError("");
      setSearchQuery("");
      setDropdownOpen(false);
    }
  }, [isOpen, resolvedUserId]);

  // Calculate dropdown positioning
  const updateDropdownPos = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const minW = Math.max(rect.width, 320);
      let left = rect.left;
      if (left + minW > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - minW - 12);
      }
      setDropdownPos({
        top: rect.bottom + 6,
        left: Math.max(12, left),
        width: minW,
      });
    }
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      updateDropdownPos();
      window.addEventListener("scroll", updateDropdownPos, true);
      window.addEventListener("resize", updateDropdownPos);
      setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => {
        window.removeEventListener("scroll", updateDropdownPos, true);
        window.removeEventListener("resize", updateDropdownPos);
      };
    }
  }, [dropdownOpen, updateDropdownPos]);

  // Click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target)
      ) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  // Separate users into:
  // 1. "Members in Project"
  // 2. "Add & Assign" (Org users not in project)
  const { projectMembers, nonProjectMembers } = useMemo(() => {
    const currentMemberMap = new Map();

    // Source 1: explicit propAvailableMembers
    if (Array.isArray(propAvailableMembers) && propAvailableMembers.length > 0) {
      propAvailableMembers.forEach((m) => {
        if (m && m.id) currentMemberMap.set(Number(m.id), m);
      });
    }

    // Source 2: project.members or project.assigned_users
    if (project) {
      const pMembers = Array.isArray(project.members) ? project.members : [];
      pMembers.forEach((m) => {
        if (m && m.id) currentMemberMap.set(Number(m.id), m);
      });

      const pAssigned = Array.isArray(project.assigned_users) ? project.assigned_users : [];
      pAssigned.forEach((u) => {
        const uid = typeof u === "object" ? u?.id : u;
        if (uid && !currentMemberMap.has(Number(uid))) {
          const found = orgUsers.find((ou) => Number(ou.id) === Number(uid));
          if (found) currentMemberMap.set(Number(uid), found);
        }
      });
    }

    const removedId = Number(resolvedUserId);

    // Group 1: Members in Project (excluding userToRemove)
    const inProject = Array.from(currentMemberMap.values()).filter(
      (u) => Number(u.id || u._originalId) !== removedId
    );

    const inProjectIds = new Set(inProject.map((u) => Number(u.id || u._originalId)));
    inProjectIds.add(removedId);

    // Group 2: Add & Assign (all other org users not in project)
    const outOfProject = (orgUsers || []).filter(
      (u) => !inProjectIds.has(Number(u.id || u._originalId))
    );

    return {
      projectMembers: inProject,
      nonProjectMembers: outOfProject,
    };
  }, [propAvailableMembers, project, orgUsers, resolvedUserId]);

  // Filtered dropdown options based on search query
  const q = searchQuery.toLowerCase().trim();
  const filteredProjectMembers = useMemo(() => {
    if (!q) return projectMembers;
    return projectMembers.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const role = String(u.role || "").toLowerCase();
      const dept = String(u.department || "").toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q) || dept.includes(q);
    });
  }, [projectMembers, q]);

  const filteredNonProjectMembers = useMemo(() => {
    if (!q) return nonProjectMembers;
    return nonProjectMembers.filter((u) => {
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      const role = String(u.role || "").toLowerCase();
      const dept = String(u.department || "").toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q) || dept.includes(q);
    });
  }, [nonProjectMembers, q]);

  // Selected user lookup
  const selectedUserObj = useMemo(() => {
    if (!selectedUserId) return null;
    const sId = Number(selectedUserId);
    const inP = projectMembers.find((u) => Number(u.id || u._originalId) === sId);
    if (inP) return { ...inP, isInProject: true };
    const nonP = nonProjectMembers.find((u) => Number(u.id || u._originalId) === sId);
    if (nonP) return { ...nonP, isInProject: false };
    return null;
  }, [selectedUserId, projectMembers, nonProjectMembers]);

  // Checklist selection handlers
  const totalTasks = tasks.length;
  const totalDeliverables = deliverables.length;
  const totalActiveItems = totalTasks + totalDeliverables;
  const totalSelectedCount = selectedTaskIds.size + selectedDeliverableIds.size;
  const isAllSelected = totalActiveItems > 0 && totalSelectedCount === totalActiveItems;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTaskIds(new Set());
      setSelectedDeliverableIds(new Set());
    } else {
      setSelectedTaskIds(new Set(tasks.map((t) => t.id)));
      setSelectedDeliverableIds(new Set(deliverables.map((d) => d.id)));
    }
  };

  const handleToggleTask = (taskId) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleToggleDeliverable = (delivId) => {
    setSelectedDeliverableIds((prev) => {
      const next = new Set(prev);
      if (next.has(delivId)) {
        next.delete(delivId);
      } else {
        next.add(delivId);
      }
      return next;
    });
  };

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (totalActiveItems > 0 && !selectedUserId) {
      setError(
        t("Please select a team member to receive the reassigned tasks.", {
          defaultValue: "Please select a team member to receive the reassigned tasks.",
        })
      );
      return;
    }

    setError("");

    const targetUserId = selectedUserId ? Number(selectedUserId) : null;
    const taskIdsArr = Array.from(selectedTaskIds);
    const delivIdsArr = Array.from(selectedDeliverableIds);

    // If custom onConfirm is provided, invoke it
    if (typeof onConfirm === "function") {
      onConfirm(targetUserId, {
        selectedTaskIds: taskIdsArr,
        selectedDeliverableIds: delivIdsArr,
      });
      return;
    }

    // Default: execute remove and reassign API call directly
    setInternalLoading(true);
    try {
      const token = authToken();
      const res = await fetch(
        `${API_URL}/projects/${resolvedProjectId}/members/${resolvedUserId}/remove-and-reassign`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify({
            reassign_to_user_id: targetUserId,
            replacement_user_id: targetUserId,
            selected_task_ids: taskIdsArr,
            selected_deliverable_ids: delivIdsArr,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.message ||
            t("Failed to reassign tasks and remove member", {
              defaultValue: "Failed to reassign tasks and remove member",
            })
        );
      }

      notify.success(
        data.message ||
          t("Tasks reassigned and member removed successfully", {
            defaultValue: "Tasks reassigned and member removed successfully",
          })
      );

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message || t("Error reassigning tasks and removing member"));
      notify.error(err.message || t("Error reassigning tasks and removing member"));
    } finally {
      setInternalLoading(false);
    }
  };

  if (!isOpen || !userToRemove) return null;

  const totalCandidateUsers = projectMembers.length + nonProjectMembers.length;

  return createPortal(
    <div
      className="rmm-overlay"
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div className="rmm-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="rmm-header">
          <div className="rmm-header-left">
            <div className="rmm-icon-badge">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="rmm-title">
                {t("Reassign Tasks & Remove Member", {
                  defaultValue: "Reassign Tasks & Remove Member",
                })}
              </h3>
              <p className="rmm-subtitle">
                {t("Mandatory task transfer before removing project member", {
                  defaultValue: "Mandatory task transfer before removing project member",
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rmm-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="rmm-body">
            {error && (
              <div className="rmm-error-banner">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Outgoing Member Summary Card */}
            <div className="rmm-user-card">
              <div className="rmm-user-info">
                <div className="rmm-avatar">
                  {userToRemove.avatar ? (
                    <img src={userToRemove.avatar} alt={userToRemove.name} />
                  ) : (
                    <span>{(userToRemove.name || "U").charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="rmm-user-meta">
                  <div className="rmm-user-label">
                    {t("Member Being Removed", { defaultValue: "Member Being Removed" })}
                  </div>
                  <div className="rmm-user-name">{userToRemove.name}</div>
                  <div className="rmm-user-sub">
                    {userToRemove.email || userToRemove.role || ""}
                  </div>
                </div>
              </div>

              <div className="rmm-badge-pill">
                <ListTodo size={14} />
                <span>
                  {fetchingTasks
                    ? t("Checking...", { defaultValue: "Checking..." })
                    : `${totalActiveItems} ${t("Active Items", { defaultValue: "Active Items" })}`}
                </span>
              </div>
            </div>

            {/* Explanatory Info */}
            <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary, #475569)", lineHeight: 1.5 }}>
              {t(
                "{{name}} has active tasks or subtasks in this project. Select a replacement team member from the project or add a new team member, and choose which items to reassign.",
                {
                  name: userToRemove.name,
                  defaultValue: `${userToRemove.name} has active tasks or subtasks in this project. Select a replacement team member from the project or add a new team member, and choose which items to reassign.`,
                }
              )}
            </p>

            {/* Searchable Grouped Dropdown for Replacement User */}
            <div className="rmm-form-group">
              <label className="rmm-form-label">
                <UserCheck size={16} color="var(--color-primary, #2563eb)" />
                {t("Reassign Tasks To", { defaultValue: "Reassign Tasks To" })}
                {totalActiveItems > 0 && <span className="rmm-required">*</span>}
              </label>

              {totalCandidateUsers === 0 ? (
                <div style={{ padding: "12px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", fontSize: "13px" }}>
                  {t("No other team members found in the organization.", {
                    defaultValue: "No other team members found in the organization.",
                  })}
                </div>
              ) : (
                <>
                  <div
                    ref={triggerRef}
                    className={`rmm-select-trigger ${dropdownOpen ? "active" : ""} ${error && !selectedUserId ? "has-error" : ""}`}
                    onClick={() => {
                      if (!loading) setDropdownOpen((prev) => !prev);
                    }}
                  >
                    <div className="rmm-trigger-content">
                      {selectedUserObj ? (
                        <>
                          <div className="rmm-option-avatar" style={{ width: "24px", height: "24px", fontSize: "11px" }}>
                            {selectedUserObj.avatar ? (
                              <img src={selectedUserObj.avatar} alt={selectedUserObj.name} />
                            ) : (
                              (selectedUserObj.name || "U").charAt(0).toUpperCase()
                            )}
                          </div>
                          <span className="rmm-trigger-text">{selectedUserObj.name}</span>
                          <span className={`rmm-trigger-tag ${selectedUserObj.isInProject ? "" : "tag-new"}`}>
                            {selectedUserObj.isInProject
                              ? t("In Project", { defaultValue: "In Project" })
                              : t("Will Add to Project", { defaultValue: "Will Add to Project" })}
                          </span>
                        </>
                      ) : (
                        <span className="rmm-trigger-placeholder">
                          {t("Select replacement member...", {
                            defaultValue: "Select replacement member...",
                          })}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      size={16}
                      style={{
                        transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                        color: "var(--text-muted, #94a3b8)",
                        flexShrink: 0,
                      }}
                    />
                  </div>

                  {/* Dropdown Menu Portal */}
                  {dropdownOpen &&
                    createPortal(
                      <div
                        ref={dropdownRef}
                        className="rmm-dropdown-menu"
                        style={{
                          top: `${dropdownPos.top}px`,
                          left: `${dropdownPos.left}px`,
                          width: `${dropdownPos.width}px`,
                        }}
                      >
                        <div className="rmm-search-wrap">
                          <Search size={14} color="var(--text-muted, #94a3b8)" />
                          <input
                            ref={searchInputRef}
                            type="text"
                            className="rmm-search-input"
                            placeholder={t("Search by name, role, or email...", {
                              defaultValue: "Search by name, role, or email...",
                            })}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>

                        <div className="rmm-options-list">
                          {filteredProjectMembers.length === 0 &&
                          filteredNonProjectMembers.length === 0 ? (
                            <div className="rmm-empty-state">
                              {t("No matching users found", { defaultValue: "No matching users found" })}
                            </div>
                          ) : (
                            <>
                              {/* Group 1: Members in Project */}
                              {filteredProjectMembers.length > 0 && (
                                <>
                                  <div className="rmm-group-header">
                                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <Users size={12} />
                                      {t("Members in Project", { defaultValue: "Members in Project" })}
                                    </span>
                                    <span className="rmm-group-count">{filteredProjectMembers.length}</span>
                                  </div>
                                  {filteredProjectMembers.map((u) => {
                                    const uId = u.id || u._originalId;
                                    const isSelected = String(selectedUserId) === String(uId);
                                    return (
                                      <div
                                        key={`in-proj-${uId}`}
                                        className={`rmm-option-item ${isSelected ? "selected" : ""}`}
                                        onClick={() => {
                                          setSelectedUserId(uId);
                                          setDropdownOpen(false);
                                          if (error) setError("");
                                        }}
                                      >
                                        <div className="rmm-option-left">
                                          <div className="rmm-option-avatar">
                                            {u.avatar ? (
                                              <img src={u.avatar} alt={u.name} />
                                            ) : (
                                              (u.name || "U").charAt(0).toUpperCase()
                                            )}
                                          </div>
                                          <div className="rmm-option-text">
                                            <div className="rmm-option-name">{u.name}</div>
                                            <div className="rmm-option-sub">
                                              {u.role ? `${u.role}` : ""}
                                              {u.role && u.email ? " · " : ""}
                                              {u.email || ""}
                                            </div>
                                          </div>
                                        </div>
                                        {isSelected && <Check size={16} className="rmm-option-check" />}
                                      </div>
                                    );
                                  })}
                                </>
                              )}

                              {/* Group 2: Add & Assign */}
                              {filteredNonProjectMembers.length > 0 && (
                                <>
                                  <div className="rmm-group-header group-add">
                                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <UserPlus size={12} color="#d97706" />
                                      {t("Add & Assign", { defaultValue: "Add & Assign" })}
                                    </span>
                                    <span className="rmm-group-note">
                                      {t("(Adds to project)", { defaultValue: "(Adds to project)" })}
                                    </span>
                                  </div>
                                  {filteredNonProjectMembers.map((u) => {
                                    const uId = u.id || u._originalId;
                                    const isSelected = String(selectedUserId) === String(uId);
                                    return (
                                      <div
                                        key={`out-proj-${uId}`}
                                        className={`rmm-option-item ${isSelected ? "selected" : ""}`}
                                        onClick={() => {
                                          setSelectedUserId(uId);
                                          setDropdownOpen(false);
                                          if (error) setError("");
                                        }}
                                      >
                                        <div className="rmm-option-left">
                                          <div className="rmm-option-avatar" style={{ background: "#fef3c7", color: "#b45309" }}>
                                            {u.avatar ? (
                                              <img src={u.avatar} alt={u.name} />
                                            ) : (
                                              (u.name || "U").charAt(0).toUpperCase()
                                            )}
                                          </div>
                                          <div className="rmm-option-text">
                                            <div className="rmm-option-name">{u.name}</div>
                                            <div className="rmm-option-sub">
                                              {u.role ? `${u.role}` : ""}
                                              {u.role && u.email ? " · " : ""}
                                              {u.email || ""}
                                            </div>
                                          </div>
                                        </div>
                                        {isSelected && <Check size={16} className="rmm-option-check" />}
                                      </div>
                                    );
                                  })}
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>,
                      document.body
                    )}
                </>
              )}
            </div>

            {/* Granular Task & Subtask Selection Checklist */}
            {totalActiveItems > 0 && (
              <div className="rmm-checklist-section">
                <div className="rmm-checklist-header">
                  <div className="rmm-checklist-header-left">
                    <span className="rmm-checklist-title">
                      {t("Select Tasks to Transfer", { defaultValue: "Select Tasks to Transfer" })}
                    </span>
                    <span className="rmm-selection-count">
                      {t("{{selected}} of {{total}} Selected", {
                        selected: totalSelectedCount,
                        total: totalActiveItems,
                        defaultValue: `${totalSelectedCount} of ${totalActiveItems} Selected`,
                      })}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="rmm-select-all-btn"
                    onClick={handleToggleSelectAll}
                  >
                    {isAllSelected
                      ? t("Deselect All", { defaultValue: "Deselect All" })
                      : t("Select All", { defaultValue: "Select All" })}
                  </button>
                </div>

                <div className="rmm-checklist-body">
                  {/* Tasks List */}
                  {tasks.length > 0 && (
                    <>
                      <div className="rmm-section-divider">
                        {t("Tasks ({{count}})", { count: tasks.length, defaultValue: `Tasks (${tasks.length})` })}
                      </div>
                      {tasks.map((task) => {
                        const checked = selectedTaskIds.has(task.id);
                        const priorityClass =
                          task.priority === "high" || task.priority === "urgent"
                            ? "rmm-badge-priority-high"
                            : task.priority === "medium"
                            ? "rmm-badge-priority-medium"
                            : "rmm-badge-priority-low";
                        return (
                          <div
                            key={`task-${task.id}`}
                            className={`rmm-check-item ${checked ? "checked" : ""}`}
                            onClick={() => handleToggleTask(task.id)}
                          >
                            <div className="rmm-checkbox-box">
                              {checked && <Check size={13} strokeWidth={3} />}
                            </div>
                            <div className="rmm-check-item-content">
                              <div className="rmm-item-title-row">
                                <span className="rmm-item-code">
                                  {task.business_id || `#${task.id}`}
                                </span>
                                <span className="rmm-item-title">{task.title}</span>
                              </div>
                              <div className="rmm-item-subtext">
                                {task.priority && (
                                  <span className={`rmm-item-badge ${priorityClass}`}>
                                    {task.priority}
                                  </span>
                                )}
                                <span className="rmm-item-badge rmm-badge-status">
                                  {task.status || "In Progress"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}

                  {/* Deliverables / Subtasks List */}
                  {deliverables.length > 0 && (
                    <>
                      <div className="rmm-section-divider">
                        {t("Subtasks / Deliverables ({{count}})", {
                          count: deliverables.length,
                          defaultValue: `Subtasks / Deliverables (${deliverables.length})`,
                        })}
                      </div>
                      {deliverables.map((deliv) => {
                        const checked = selectedDeliverableIds.has(deliv.id);
                        return (
                          <div
                            key={`deliv-${deliv.id}`}
                            className={`rmm-check-item ${checked ? "checked" : ""}`}
                            onClick={() => handleToggleDeliverable(deliv.id)}
                          >
                            <div className="rmm-checkbox-box">
                              {checked && <Check size={13} strokeWidth={3} />}
                            </div>
                            <div className="rmm-check-item-content">
                              <div className="rmm-item-title-row">
                                <span className="rmm-item-badge rmm-badge-subtask">
                                  <Layers size={10} style={{ display: "inline", marginRight: "3px" }} />
                                  {deliv.task?.business_id
                                    ? `${deliv.task.business_id}`
                                    : t("Subtask", { defaultValue: "Subtask" })}
                                </span>
                                <span className="rmm-item-title">{deliv.title}</span>
                              </div>
                              <div className="rmm-item-subtext">
                                <span className="rmm-item-badge rmm-badge-status">
                                  {deliv.status || "In Progress"}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="rmm-footer">
            <button
              type="button"
              className="rmm-btn-cancel"
              onClick={onClose}
              disabled={loading}
            >
              {t("Cancel", { defaultValue: "Cancel" })}
            </button>

            <button
              type="submit"
              className="rmm-btn-submit"
              disabled={
                loading ||
                (totalActiveItems > 0 && !selectedUserId) ||
                totalCandidateUsers === 0
              }
            >
              {loading ? (
                <>
                  <div className="rmm-spinner" />
                  <span>{t("Processing...", { defaultValue: "Processing..." })}</span>
                </>
              ) : (
                <>
                  <ArrowRight size={15} />
                  <span>
                    {totalActiveItems > 0
                      ? t("Reassign & Remove", { defaultValue: "Reassign & Remove" })
                      : t("Remove Member", { defaultValue: "Remove Member" })}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
