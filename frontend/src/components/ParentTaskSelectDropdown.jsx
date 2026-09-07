/**
 * ParentTaskSelectDropdown.jsx
 * Multi-select combobox for selecting parent task(s) ("Sub-task Of").
 * Supports search by Task ID, Title, and Assignee name with checkboxes and removable chips.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MdExpandMore, MdClose } from "react-icons/md";
import { FiUser } from "react-icons/fi";
import "./ParentTaskSelectDropdown.css";
import "./MultiSelectDropdown.css";

const ParentTaskSelectDropdown = ({
  tasks = [],
  value = [],
  onChange,
  placeholder,
  disabled = false,
  error = false,
  name = "parent_id",
  showChips = true,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize value to array of strings
  const selectedIds = useMemo(() => {
    if (Array.isArray(value)) return value.map(String);
    if (value !== null && value !== undefined && value !== "") return [String(value)];
    return [];
  }, [value]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Helper to get formatted assignee text for a task
  const getAssigneeText = (task) => {
    if (!task) return "";

    // 1. Array of assignees (multi-user relationship)
    if (Array.isArray(task?.assignees) && task.assignees.length > 0) {
      const names = task.assignees
        .map((u) => (typeof u === "object" ? u?.name : u))
        .filter(Boolean);
      if (names.length > 0) return names.join(", ");
    }

    // 2. Array of assigned_users
    if (Array.isArray(task?.assigned_users) && task.assigned_users.length > 0) {
      const names = task.assigned_users
        .map((u) => (typeof u === "object" ? u?.name : u))
        .filter(Boolean);
      if (names.length > 0) return names.join(", ");
    }

    // 3. Array of users
    if (Array.isArray(task?.users) && task.users.length > 0) {
      const names = task.users
        .map((u) => (typeof u === "object" ? u?.name : u))
        .filter(Boolean);
      if (names.length > 0) return names.join(", ");
    }

    // 4. Array in assigned_to
    if (Array.isArray(task?.assigned_to) && task.assigned_to.length > 0) {
      const names = task.assigned_to
        .map((u) => (typeof u === "object" ? u?.name : u))
        .filter(Boolean);
      if (names.length > 0) return names.join(", ");
    }

    // 5. Explicit pre-formatted assignee string from backend
    if (typeof task?.assignee_name === "string" && task.assignee_name.trim()) {
      return task.assignee_name.trim();
    }

    // 6. Single assignee object or string
    if (typeof task?.assignee === "object" && task.assignee?.name) {
      return task.assignee.name;
    }
    if (typeof task?.assignee === "string" && task.assignee.trim()) {
      return task.assignee.trim();
    }

    // 7. Single assigned_user / assignedTo / assigned_to_name
    if (typeof task?.assigned_user === "object" && task.assigned_user?.name) {
      return task.assigned_user.name;
    }
    if (typeof task?.assignedTo === "object" && task.assignedTo?.name) {
      return task.assignedTo.name;
    }
    if (typeof task?.assigned_to_name === "string" && task.assigned_to_name.trim()) {
      return task.assigned_to_name.trim();
    }

    // 8. Fallbacks for current owner if no assignee found
    if (typeof task?.currentOwner === "object" && task.currentOwner?.name) {
      return task.currentOwner.name;
    }
    if (typeof task?.current_owner === "object" && task.current_owner?.name) {
      return task.current_owner.name;
    }
    if (typeof task?.current_owner_name === "string" && task.current_owner_name.trim()) {
      return task.current_owner_name.trim();
    }

    return "";
  };

  // Find currently selected single task object (for single select display)
  const singleSelectedTask = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    return tasks.find((tk) => String(tk.id) === selectedIds[0]) || null;
  }, [tasks, selectedIds]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter tasks based on search
  const q = search.toLowerCase().trim();
  const filteredTasks = useMemo(() => {
    if (!q) return tasks;
    return tasks.filter((tk) => {
      const bId = (tk.business_id || "").toLowerCase();
      const title = (tk.title || "").toLowerCase();
      const assignee = getAssigneeText(tk).toLowerCase();
      return bId.includes(q) || title.includes(q) || assignee.includes(q);
    });
  }, [tasks, q]);

  const allVisibleSelected = filteredTasks.length > 0 && filteredTasks.every((tk) => selectedSet.has(String(tk.id)));
  const someVisibleSelected = filteredTasks.some((tk) => selectedSet.has(String(tk.id)));

  // Reset highlight on search or open change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  const handleTriggerClick = () => {
    if (disabled) return;
    if (!open) {
      setSearch("");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (disabled) return;
    if (open) {
      setOpen(false);
      setSearch("");
    } else {
      setSearch("");
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange([]);
    setSearch("");
  };

  const toggleTask = (taskId) => {
    const strId = String(taskId);
    const next = selectedSet.has(strId)
      ? selectedIds.filter((id) => id !== strId).map(Number)
      : [...selectedIds.map(Number), typeof taskId === "number" ? taskId : Number(taskId) || taskId];
    onChange(next);
  };

  const toggleAll = () => {
    if (allVisibleSelected) {
      const visibleIds = new Set(filteredTasks.map((tk) => String(tk.id)));
      onChange(selectedIds.filter((id) => !visibleIds.has(String(id))).map(Number));
    } else {
      const merged = new Set(selectedIds.map(String));
      filteredTasks.forEach((tk) => merged.add(String(tk.id)));
      onChange(tasks.filter((tk) => merged.has(String(tk.id))).map((tk) => tk.id));
    }
  };

  const totalOptions = 1 + filteredTasks.length; // index 0 is Select All

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setHighlightedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open) {
        if (highlightedIndex === 0) {
          toggleAll();
        } else if (filteredTasks[highlightedIndex - 1]) {
          toggleTask(filteredTasks[highlightedIndex - 1].id);
        }
      } else {
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const defaultPlaceholder = placeholder || t("None (Main Task)", { defaultValue: "None (Main Task)" });

  return (
    <div className={`ptsd-wrap ${open ? "ptsd-open" : ""}`} ref={ref}>
      <div
        className={`ptsd-trigger ${open ? "ptsd-trigger--open" : ""} ${error ? "ptsd-trigger--error" : ""} ${disabled ? "ptsd-trigger--disabled" : ""}`}
        onClick={handleTriggerClick}
      >
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="ptsd-combo-input"
            placeholder={t("Search by task ID, title or assignee...", { defaultValue: "Search by task ID, title or assignee..." })}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
        ) : singleSelectedTask ? (
          <div className="ptsd-selected-box">
            {singleSelectedTask.business_id && (
              <span className="ptsd-item-id">{singleSelectedTask.business_id}</span>
            )}
            <span className="ptsd-selected-title">{singleSelectedTask.title}</span>
            {getAssigneeText(singleSelectedTask) ? (
              <span className="ptsd-assignee-badge ptsd-assignee-badge--active">
                <FiUser size={11} />
                <span>{t("Assigned to: {{name}}", { name: getAssigneeText(singleSelectedTask), defaultValue: `Assigned to: ${getAssigneeText(singleSelectedTask)}` })}</span>
              </span>
            ) : (
              <span className="ptsd-assignee-badge">
                <span>{t("Unassigned", { defaultValue: "Unassigned" })}</span>
              </span>
            )}
          </div>
        ) : selectedIds.length > 1 ? (
          <span className="ptsd-selected-title" style={{ fontWeight: 500 }}>
            {selectedIds.length} {t("selected", { defaultValue: "selected" })}
          </span>
        ) : (
          <span className="ptsd-combo-placeholder">{defaultPlaceholder}</span>
        )}

        {/* Clear selection button */}
        {!disabled && selectedIds.length > 0 && !open && (
          <button
            type="button"
            className="ptsd-clear-btn"
            onClick={handleClear}
            title={t("Clear parent task", { defaultValue: "Clear parent task" })}
          >
            <MdClose size={18} />
          </button>
        )}

        {/* Dropdown chevron */}
        <MdExpandMore
          size={20}
          className={`ptsd-arrow ${open ? "ptsd-arrow--open" : ""}`}
          onClick={handleArrowClick}
        />
      </div>

      {/* Removable chips below input */}
      {showChips && selectedIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          {selectedIds.map((id, index) => {
            const tk = tasks.find((t) => String(t.id) === String(id));
            const chipName = tk ? (tk.business_id ? `${tk.business_id} - ${tk.title}` : tk.title) : `Task #${id}`;
            return (
              <span
                key={id || index}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 9px",
                  borderRadius: "14px",
                  fontSize: "12px",
                  fontWeight: 500,
                  background: "var(--color-primary-bg, #eff6ff)",
                  color: "var(--color-primary, #2563eb)",
                  border: "1px solid var(--color-primary-border, #bfdbfe)",
                }}
              >
                {chipName}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTask(id);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      marginLeft: "2px",
                      display: "inline-flex",
                      alignItems: "center",
                      color: "inherit",
                      fontSize: "14px",
                      lineHeight: 1,
                    }}
                    title={t("Remove {{name}}", { name: chipName, defaultValue: `Remove ${chipName}` })}
                  >
                    &times;
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown menu */}
      {open && (
        <div className="ptsd-dropdown" onClick={(e) => e.stopPropagation()}>
          {filteredTasks.length > 0 && (
            <div className="msd-select-all" onClick={toggleAll}>
              <span className={`msd-checkbox ${allVisibleSelected ? "msd-checked" : someVisibleSelected ? "msd-partial" : ""}`}>
                {allVisibleSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
                {someVisibleSelected && !allVisibleSelected && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                )}
              </span>
              <span className="msd-select-all-text">{allVisibleSelected ? t("Deselect All", { defaultValue: "Deselect All" }) : t("Select All", { defaultValue: "Select All" })}</span>
            </div>
          )}

          <div className="ptsd-dropdown-items" ref={listRef}>
            {filteredTasks.length === 0 && search ? (
              <p className="ptsd-empty">
                {t("No tasks match your search.", { defaultValue: "No tasks match your search." })}
              </p>
            ) : (
              filteredTasks.map((tk, idx) => {
                const isSelected = selectedSet.has(String(tk.id));
                const itemIdx = idx + 1;
                const assigneeStr = getAssigneeText(tk);

                return (
                  <div
                    key={tk.id}
                    className={`ptsd-item ${isSelected ? "ptsd-item--selected" : ""} ${highlightedIndex === itemIdx ? "ptsd-item--highlighted" : ""}`}
                    onClick={() => toggleTask(tk.id)}
                    onMouseEnter={() => setHighlightedIndex(itemIdx)}
                  >
                    <span className={`msd-checkbox ${isSelected ? "msd-checked" : ""}`} style={{ marginRight: "4px" }}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    <div className="ptsd-item-info">
                      <div className="ptsd-item-header">
                        {tk.business_id && (
                          <span className="ptsd-item-id">{tk.business_id}</span>
                        )}
                        <span className="ptsd-item-title">{tk.title}</span>
                      </div>
                      <div className="ptsd-item-meta">
                        {assigneeStr ? (
                          <span className="ptsd-item-assignee">
                            <FiUser size={11} style={{ color: "#6366f1" }} />
                            <span>{t("Assigned to: {{name}}", { name: assigneeStr, defaultValue: `Assigned to: ${assigneeStr}` })}</span>
                          </span>
                        ) : (
                          <span className="ptsd-item-assignee" style={{ color: "#9ca3af" }}>
                            <FiUser size={11} />
                            <span>{t("Unassigned", { defaultValue: "Unassigned" })}</span>
                          </span>
                        )}
                        {tk.priority && (
                          <span style={{ fontSize: "11px", color: "#9ca3af" }}>• {tk.priority}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={selectedIds.join(",")} />
    </div>
  );
};

export default ParentTaskSelectDropdown;
