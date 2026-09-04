/**
 * ParentTaskSelectDropdown.jsx
 * Rich single-select combobox for selecting a parent task ("Sub-task Of").
 * Supports search by Task ID, Title, and Assignee name with live preview.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MdExpandMore, MdCheck, MdClose } from "react-icons/md";
import { FiUser } from "react-icons/fi";
import "./ParentTaskSelectDropdown.css";

const ParentTaskSelectDropdown = ({
  tasks = [],
  value = "",
  onChange,
  placeholder,
  disabled = false,
  error = false,
  name = "parent_id",
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Helper to get formatted assignee text for a task
  const getAssigneeText = (task) => {
    if (!task) return "";
    if (task.assignee_name && typeof task.assignee_name === "string") {
      return task.assignee_name;
    }
    if (task.currentOwner && typeof task.currentOwner === "object" && task.currentOwner.name) {
      return task.currentOwner.name;
    }
    if (task.current_owner && typeof task.current_owner === "object" && task.current_owner.name) {
      return task.current_owner.name;
    }
    if (task.current_owner_name && typeof task.current_owner_name === "string") {
      return task.current_owner_name;
    }
    if (task.assignees && Array.isArray(task.assignees) && task.assignees.length > 0) {
      const names = task.assignees
        .map((u) => (typeof u === "object" ? u?.name : u))
        .filter(Boolean);
      if (names.length > 0) return names.join(", ");
    }
    if (task.assignee && typeof task.assignee === "object" && task.assignee.name) {
      return task.assignee.name;
    }
    if (task.assignee && typeof task.assignee === "string") {
      return task.assignee;
    }
    if (task.assignedTo && typeof task.assignedTo === "object" && task.assignedTo.name) {
      return task.assignedTo.name;
    }
    if (task.assigned_user && typeof task.assigned_user === "object" && task.assigned_user.name) {
      return task.assigned_user.name;
    }
    return "";
  };

  // Find currently selected task object
  const selectedTask = useMemo(() => {
    if (!value) return null;
    return tasks.find((tk) => String(tk.id) === String(value)) || null;
  }, [tasks, value]);

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
    onChange("");
    setSearch("");
    setOpen(false);
  };

  const handleSelect = (taskId) => {
    onChange(taskId ? String(taskId) : "");
    setOpen(false);
    setSearch("");
  };

  // Keyboard navigation: options list includes "None" option at index 0 when no search or when matching
  const totalOptions = 1 + filteredTasks.length; // index 0 is "None"

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex === 0) {
        handleSelect("");
      } else {
        const target = filteredTasks[highlightedIndex - 1];
        if (target) handleSelect(target.id);
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
        ) : selectedTask ? (
          <div className="ptsd-selected-box">
            {selectedTask.business_id && (
              <span className="ptsd-item-id">{selectedTask.business_id}</span>
            )}
            <span className="ptsd-selected-title">{selectedTask.title}</span>
            {getAssigneeText(selectedTask) ? (
              <span className="ptsd-assignee-badge ptsd-assignee-badge--active">
                <FiUser size={11} />
                <span>{t("Assigned to: {{name}}", { name: getAssigneeText(selectedTask), defaultValue: `Assigned to: ${getAssigneeText(selectedTask)}` })}</span>
              </span>
            ) : (
              <span className="ptsd-assignee-badge">
                <span>{t("Unassigned", { defaultValue: "Unassigned" })}</span>
              </span>
            )}
          </div>
        ) : (
          <span className="ptsd-combo-placeholder">{defaultPlaceholder}</span>
        )}

        {/* Clear selection button */}
        {!disabled && selectedTask && !open && (
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

      {/* Dropdown menu */}
      {open && (
        <div className="ptsd-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="ptsd-dropdown-items" ref={listRef}>
            {/* Option 0: None (Main Task) */}
            <div
              className={`ptsd-item ${!value ? "ptsd-item--selected" : ""} ${highlightedIndex === 0 ? "ptsd-item--highlighted" : ""}`}
              onClick={() => handleSelect("")}
              onMouseEnter={() => setHighlightedIndex(0)}
            >
              <div className="ptsd-item-info">
                <span className="ptsd-item-title" style={{ color: "#6b7280", fontStyle: "italic" }}>
                  {t("None (Main Task)", { defaultValue: "None (Main Task)" })}
                </span>
              </div>
              {!value && <MdCheck size={18} className="ptsd-item-check" />}
            </div>

            {/* Task list options */}
            {filteredTasks.length === 0 && search ? (
              <p className="ptsd-empty">
                {t("No tasks match your search.", { defaultValue: "No tasks match your search." })}
              </p>
            ) : (
              filteredTasks.map((tk, idx) => {
                const isSelected = String(tk.id) === String(value);
                const itemIdx = idx + 1;
                const assigneeStr = getAssigneeText(tk);

                return (
                  <div
                    key={tk.id}
                    className={`ptsd-item ${isSelected ? "ptsd-item--selected" : ""} ${highlightedIndex === itemIdx ? "ptsd-item--highlighted" : ""}`}
                    onClick={() => handleSelect(tk.id)}
                    onMouseEnter={() => setHighlightedIndex(itemIdx)}
                  >
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
                    {isSelected && <MdCheck size={18} className="ptsd-item-check" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
};

export default ParentTaskSelectDropdown;
