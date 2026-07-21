/**
 * UserSelectDropdown.jsx
 * Multi-select combobox dropdown for selecting team members.
 * Click input → search mode. Click arrow → toggle dropdown.
 */

import { useRef, useState, useEffect } from "react";
import { MdExpandMore } from "react-icons/md";
import "./UserSelectDropdown.css";

const UserSelectDropdown = ({
  users = [],
  selectedIds: rawSelectedIds = [],
  onChange,
  placeholder = "Click to select members",
  disabled = false,
  viewOnly = false,
  error = false,
}) => {
  const selectedIds = Array.isArray(rawSelectedIds) ? rawSelectedIds : [];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

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

  useEffect(() => {
    setHighlightedIndex(0);
  }, [search, open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

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
    const map = { admin: "Admin", manager: "Manager", team_lead: "Team Lead", member: "Member", guest: "Guest" };
    return map[role] || role.charAt(0).toUpperCase() + role.slice(1);
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
      setHighlightedIndex(0);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredUsers.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredUsers.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex === 0) {
        toggleAll();
      } else if (filteredUsers[highlightedIndex - 1]) {
        toggleUser(filteredUsers[highlightedIndex - 1].id);
      }
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
          {!viewOnly && selectedIds.length > 0 && (
            <div className="usd-dropdown-header">
              <span className="usd-count">{selectedIds.length} selected</span>
            </div>
          )}
          <div className="usd-dropdown-items" ref={listRef}>
            {filteredUsers.length === 0 ? (
              <p className="usd-empty">{search ? "No users match your search." : "No users available."}</p>
            ) : (
              <>
                {!viewOnly && (
                  <div className={`usd-item ${highlightedIndex === 0 ? "usd-item--highlighted" : ""}`} onMouseEnter={() => setHighlightedIndex(0)}>
                    <label className="usd-item-left">
                      <input
                        type="checkbox"
                        checked={filteredUsers.length > 0 && filteredUsers.every((u) => selectedIds.includes(u.id))}
                        onChange={toggleAll}
                      />
                      <span className="usd-name" style={{ fontWeight: 600 }}>Select All</span>
                    </label>
                  </div>
                )}
                {filteredUsers.map((user, idx) => {
                  const isSelected = selectedIds.includes(user.id);
                  const itemIdx = viewOnly ? idx : idx + 1;
                  return (
                    <div key={user.id} className={`usd-item ${isSelected ? "usd-item--selected" : ""} ${highlightedIndex === itemIdx ? "usd-item--highlighted" : ""}`} onMouseEnter={() => setHighlightedIndex(itemIdx)}>
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
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSelectDropdown;
