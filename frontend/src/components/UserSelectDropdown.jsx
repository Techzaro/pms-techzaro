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

  const isUserSelected = (userId) => {
    const num = Number(typeof userId === "object" ? userId?.id : userId);
    return selectedIds.some((id) => Number(typeof id === "object" ? id?.id : id) === num);
  };

  const toggleAll = () => {
    const filteredIds = filteredUsers.map((u) => Number(u.id));
    const allSelected = filteredIds.every((id) => isUserSelected(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !filteredIds.includes(Number(typeof id === "object" ? id?.id : id))));
    } else {
      const currentNumeric = selectedIds.map((id) => Number(typeof id === "object" ? id?.id : id));
      onChange([...new Set([...currentNumeric, ...filteredIds])]);
    }
  };

  const toggleUser = (userId) => {
    const numId = Number(typeof userId === "object" ? userId?.id : userId);
    if (isUserSelected(numId)) {
      onChange(selectedIds.filter((id) => Number(typeof id === "object" ? id?.id : id) !== numId));
    } else {
      const currentNumeric = selectedIds.map((id) => Number(typeof id === "object" ? id?.id : id));
      onChange([...currentNumeric, numId]);
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

  const selectedUsers = (users || []).filter((u) => isUserSelected(u.id));

  // Map each selectedId to its name (from users prop or from selectedIds if objects were passed)
  const selectedNamesList = selectedIds
    .map((item) => {
      if (typeof item === "object" && item?.name) return item.name;
      const numId = Number(typeof item === "object" ? item?.id : item);
      const found = (users || []).find((u) => Number(u.id) === numId);
      return found?.name || null;
    })
    .filter(Boolean);

  const selectedNamesText = selectedNamesList.join(", ");

  const triggerText = viewOnly
    ? (users.length === 0 ? "No team members" : `${users.length} team member(s)`)
    : (selectedNamesText || placeholder);

  return (
    <div className="usd-wrap" ref={ref}>
      <div className={`usd-trigger ${open ? "usd-trigger--open" : ""} ${error ? "usd-trigger--error" : ""} ${disabled ? "usd-trigger--disabled" : ""}`} onClick={handleTriggerClick}>
        {selectedNamesText && !open && (
          <span
            className="usd-combo-count"
            title={selectedNamesText}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "calc(100% - 28px)",
              display: "inline-block",
              fontWeight: 500,
              color: "var(--text-dark, #1f2937)",
            }}
          >
            {selectedNamesText}
          </span>
        )}
        {!selectedNamesText && !open && (
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

      {selectedNamesList.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          {selectedNamesList.map((name, index) => {
            const rawId = selectedIds[index];
            const numId = Number(typeof rawId === "object" ? rawId?.id : rawId);
            return (
              <span
                key={numId || index}
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
                {name}
                {!viewOnly && !disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleUser(numId);
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
                    title={`Remove ${name}`}
                  >
                    &times;
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {open && (
        <div className="usd-dropdown" onClick={(e) => e.stopPropagation()}>
          {!viewOnly && selectedNamesText && (
            <div className="usd-dropdown-header" style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-color, #e5e7eb)", fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
              <span className="usd-count" style={{ fontWeight: 500 }}>{selectedNamesText}</span>
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
                        checked={filteredUsers.length > 0 && filteredUsers.every((u) => isUserSelected(u.id))}
                        onChange={toggleAll}
                      />
                      <span className="usd-name" style={{ fontWeight: 600 }}>Select All</span>
                    </label>
                  </div>
                )}
                {filteredUsers.map((user, idx) => {
                  const isSelected = isUserSelected(user.id);
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
