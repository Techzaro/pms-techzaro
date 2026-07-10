/**
 * UserSelectDropdown.jsx
 * Multi-select dropdown component for selecting team members with per-user due dates.
 * Supports select-all functionality, view-only mode, displays user roles below names,
 * and provides a datetime picker for each selected user to set individual due dates.
 * Closes automatically when clicking outside the dropdown.
 */

import { useRef, useState, useEffect } from "react";
import { MdExpandMore } from "react-icons/md";
import { IoCalendarOutline } from "react-icons/io5";
import "./UserSelectDropdown.css";

/**
 * Multi-select dropdown for team member selection with optional per-user due dates.
 * @param {Array} users - Array of user objects (id, name, role).
 * @param {Array} selectedIds - Array of currently selected user IDs.
 * @param {Function} onChange - Callback with updated array of selected IDs.
 * @param {Object} [dueDates] - Map of {userId: 'YYYY-MM-DDTHH:MM'} for per-user due dates.
 * @param {Function} [onDueDateChange] - Callback (userId, dateValue) when a due date changes.
 * @param {boolean} [showDueDate] - Show datetime picker for per-user due dates.
 * @param {string} [placeholder='Click to select members'] - Placeholder text.
 * @param {boolean} [disabled] - Disables the dropdown when true.
 * @param {boolean} [viewOnly] - Shows members as read-only without selection.
 * @param {boolean} [error] - Applies error styling to the trigger.
 */
const UserSelectDropdown = ({
  users = [],
  selectedIds = [],
  onChange,
  dueDates = {},
  onDueDateChange,
  showDueDate = false,
  placeholder = "Click to select members",
  disabled = false,
  viewOnly = false,
  error = false,
}) => {
  const [open, setOpen] = useState(false);
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const dateInputRefs = useRef({});
  const ref = useRef(null);

  // Close dropdown when clicking outside the component
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** Toggles selection of all users or deselects all */
  const toggleAll = () => {
    if (selectedIds.length === users.length) {
      onChange([]);
    } else {
      onChange(users.map((u) => u.id));
    }
  };

  /** Toggles a single user in/out of the selected list */
  const toggleUser = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  /** Format role for display */
  const formatRole = (role) => {
    if (!role) return "";
    const map = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member" };
    return map[role] || role.charAt(0).toUpperCase() + role.slice(1);
  };

  /** Format date for display */
  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="usd-wrap" ref={ref}>
      <div
        className={`usd-trigger ${open ? "usd-trigger--open" : ""} ${error ? "usd-trigger--error" : ""} ${disabled ? "usd-trigger--disabled" : ""}`}
        onClick={() => !disabled && setOpen(!open)}
      >
        <span className={(!viewOnly && selectedIds.length === 0) || (viewOnly && users.length === 0) ? "usd-placeholder" : "usd-value"}>
          {viewOnly
            ? (users.length === 0 ? "No team members" : `${users.length} team member(s)`)
            : (selectedIds.length === 0 ? placeholder : `${selectedIds.length} member(s) selected`)
          }
        </span>
        <MdExpandMore
          size={20}
          className={`usd-arrow ${open ? "usd-arrow--open" : ""}`}
        />
      </div>

      {open && (
        <div className="usd-dropdown">
          {!viewOnly && (
            <div className="usd-dropdown-header">
              <label className="usd-selectall">
                <input
                  type="checkbox"
                  checked={users.length > 0 && selectedIds.length === users.length}
                  onChange={toggleAll}
                />
                Select All
              </label>
              {selectedIds.length > 0 && (
                <span className="usd-count">{selectedIds.length} selected</span>
              )}
            </div>
          )}
          <div className="usd-dropdown-items">
            {users.length === 0 ? (
              <p className="usd-empty">No users available.</p>
            ) : (
              users.map((user) => {
                const isSelected = selectedIds.includes(user.id);
                return (
                  <div key={user.id} className={`usd-item ${isSelected ? "usd-item--selected" : ""}`}>
                    <label className="usd-item-left">
                      <input
                        type="checkbox"
                        checked={viewOnly ? false : isSelected}
                        onChange={viewOnly ? undefined : () => toggleUser(user.id)}
                        disabled={viewOnly}
                      />
                      <div className="usd-item-info">
                        <span className="usd-name">{user.name}</span>
                        {user.role && <span className="usd-role">{formatRole(user.role)}</span>}
                      </div>
                    </label>
                    {showDueDate && isSelected && (
                      <div className="usd-date-wrap" onClick={(e) => e.stopPropagation()}>
                        {dueDates[user.id] && (
                          <span className="usd-date-text">{formatDisplayDate(dueDates[user.id])}</span>
                        )}
                        <IoCalendarOutline
                          className="usd-cal-icon"
                          size={16}
                          onClick={() => {
                            const input = dateInputRefs.current[user.id];
                            if (input) {
                              if (input.showPicker) input.showPicker();
                              else input.click();
                            }
                            setActiveDatePicker(user.id);
                          }}
                        />
                        <input
                          ref={(el) => (dateInputRefs.current[user.id] = el)}
                          type="datetime-local"
                          className="usd-date-input-hidden"
                          value={dueDates[user.id] || ""}
                          onChange={(e) => onDueDateChange?.(user.id, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSelectDropdown;
