/**
 * UserSelectDropdown.jsx
 * Multi-select combobox dropdown for selecting team members.
 * Click input → search mode. Click arrow → toggle dropdown.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { MdExpandMore } from "react-icons/md";
import { IoCalendarOutline } from "react-icons/io5";
import "./UserSelectDropdown.css";

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
  const [search, setSearch] = useState("");
  const [activeDatePicker, setActiveDatePicker] = useState(null);
  const dateInputRefs = useRef({});
  const ref = useRef(null);
  const inputRef = useRef(null);

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

  const toggleAll = () => {
    const filteredIds = filteredUsers.map((u) => u.id);
    const allSelected = filteredIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !filteredIds.includes(id)));
    } else {
      onChange([...new Set([...selectedIds, ...filteredIds])]);
    }
  };

  const toggleUser = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const formatRole = (role) => {
    if (!role) return "";
    const map = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member" };
    return map[role] || role.charAt(0).toUpperCase() + role.slice(1);
  };

  const formatDisplayDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  const q = search.toLowerCase().trim();
  const filteredUsers = q
    ? users.filter((u) =>
        u.name?.toLowerCase().includes(q) ||
        u.role?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
      )
    : users;

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    if (!open) setOpen(true);
  };

  const handleInputFocus = () => {
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (!open) {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
      setSearch("");
    } else {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setSearch("");
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const triggerText = viewOnly
    ? (users.length === 0 ? "No team members" : `${users.length} team member(s)`)
    : (selectedIds.length === 0 ? placeholder : `${selectedIds.length} member(s) selected`);

  return (
    <div className="usd-wrap" ref={ref}>
      <div className={`usd-trigger ${open ? "usd-trigger--open" : ""} ${error ? "usd-trigger--error" : ""} ${disabled ? "usd-trigger--disabled" : ""}`} onClick={handleTriggerClick}>
        {selectedIds.length > 0 && (
          <span className="usd-combo-count">{selectedIds.length} selected</span>
        )}
        {selectedIds.length === 0 && !open && (
          <span className="usd-combo-placeholder">{triggerText}</span>
        )}
        {open && (
          <input
            ref={inputRef}
            type="text"
            className="usd-combo-input"
            placeholder="Search members..."
            value={search}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            disabled={disabled || viewOnly}
          />
        )}
        <MdExpandMore
          size={20}
          className={`usd-arrow ${open ? "usd-arrow--open" : ""}`}
          onClick={handleArrowClick}
        />
      </div>

      {open && (
        <div className="usd-dropdown" onClick={(e) => e.stopPropagation()}>
          {!viewOnly && (
            <div className="usd-dropdown-header">
              <label className="usd-selectall">
                <input
                  type="checkbox"
                  checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.includes(u.id))}
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
            {filteredUsers.length === 0 ? (
              <p className="usd-empty">{search ? "No users match your search." : "No users available."}</p>
            ) : (
              filteredUsers.map((user) => {
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
                        <div className="usd-meta">
                          {user.role && <span className="usd-role">{formatRole(user.role)}</span>}
                          {user.department && <span className="usd-dept">{user.department}</span>}
                        </div>
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
