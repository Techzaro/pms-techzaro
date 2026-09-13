/**
 * UserSelectDropdown.jsx
 * Multi-select combobox dropdown for selecting team members.
 * Click input → search mode. Click arrow → toggle dropdown.
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MdExpandMore } from "react-icons/md";
import "./UserSelectDropdown.css";

const UserSelectDropdown = ({
  users = [],
  selectedIds: rawSelectedIds = [],
  onChange,
  placeholder,
  disabled = false,
  viewOnly = false,
  error = false,
  autoOpen = false,
  onBeforeRemove,
}) => {
  const { t } = useTranslation();
  const defaultPlaceholder = placeholder || t("Click to select members", { defaultValue: "Click to select members" });
  const selectedIds = Array.isArray(rawSelectedIds) ? rawSelectedIds : [];
  const [open, setOpen] = useState(autoOpen);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target) && dropdownRef.current && !dropdownRef.current.contains(e.target)) {
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

  const [dropdownStyle, setDropdownStyle] = useState({});

  const updateDropdownPosition = useCallback(() => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 6,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(320, window.innerHeight - rect.bottom - 20),
        zIndex: 99999,
      });
    }
  }, []);

  useEffect(() => {
    if (open) {
      updateDropdownPosition();
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, open]);

  const isUserSelected = (userId) => {
    const strId = String(typeof userId === "object" ? userId?.id : userId);
    return selectedIds.some((id) => String(typeof id === "object" ? id?.id : id) === strId);
  };

  const toggleAll = () => {
    const filteredIds = filteredUsers.map((u) => String(u.id));
    const allSelected = filteredIds.every((id) => isUserSelected(id));
    if (allSelected) {
      onChange(selectedIds.filter((id) => !filteredIds.includes(String(typeof id === "object" ? id?.id : id))));
    } else {
      const currentStrIds = selectedIds.map((id) => String(typeof id === "object" ? id?.id : id));
      onChange([...new Set([...currentStrIds, ...filteredIds])]);
    }
  };

  const toggleUser = (userId) => {
    const strId = String(typeof userId === "object" ? userId?.id : userId);
    if (isUserSelected(strId)) {
      onChange(selectedIds.filter((id) => String(typeof id === "object" ? id?.id : id) !== strId));
    } else {
      const currentStrIds = selectedIds.map((id) => String(typeof id === "object" ? id?.id : id));
      onChange([...currentStrIds, strId]);
    }
  };

  const formatRole = (role) => {
    if (!role) return "";
    const map = { admin: t("Admin", { defaultValue: "Admin" }), manager: t("Manager", { defaultValue: "Manager" }), team_lead: t("Team Lead", { defaultValue: "Team Lead" }), member: t("Member", { defaultValue: "Member" }), guest: t("Guest", { defaultValue: "Guest" }) };
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
    if (disabled || viewOnly) return;
    setOpen(true);
  };

  const handleTriggerClick = () => {
    if (disabled || viewOnly) return;
    if (!open) {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleArrowClick = (e) => {
    e.stopPropagation();
    if (disabled || viewOnly) return;
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
      const strId = String(typeof item === "object" ? item?.id : item);
      const found = (users || []).find((u) => String(u.id) === strId);
      return found?.name || null;
    })
    .filter(Boolean);

  const selectedNamesText = selectedNamesList.join(", ");

  const triggerText = viewOnly
    ? (users.length === 0 ? t("No team members", { defaultValue: "No team members" }) : t("{{count}} team member(s)", { defaultValue: `${users.length} team member(s)`, count: users.length }))
    : (selectedNamesText || defaultPlaceholder);

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
            placeholder={t("Search members...", { defaultValue: "Search members..." })}
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

      {selectedIds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
          {selectedIds.map((rawId, index) => {
            const strId = String(typeof rawId === "object" ? rawId?.id : rawId);
            if (!strId || strId === "undefined") return null;
            const foundUser = (users || []).find((u) => String(u.id) === strId);
            const chipName = (typeof rawId === "object" && rawId?.name) || foundUser?.name || null;
            if (!chipName) return null;
            return (
              <span
                key={strId || index}
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
                {!viewOnly && !disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onBeforeRemove) {
                        const userName = chipName || "this member";
                        if (!window.confirm(t("Remove \"{{name}}\" from this project?", { name: userName, defaultValue: `Remove "${userName}" from this project?` }))) return;
                      }
                      toggleUser(rawId);
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

      {open && createPortal(
        <div ref={dropdownRef} className="usd-dropdown" style={dropdownStyle} onClick={(e) => e.stopPropagation()}>
          {!viewOnly && selectedNamesText && (
            <div className="usd-dropdown-header" style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-color, #e5e7eb)", fontSize: "12px", color: "var(--text-muted, #6b7280)" }}>
              <span className="usd-count" style={{ fontWeight: 500 }}>{selectedNamesText}</span>
            </div>
          )}
          <div className="usd-dropdown-items" ref={listRef} style={{ maxHeight: "inherit" }}>
            {filteredUsers.length === 0 ? (
              <p className="usd-empty">{search ? t("No users match your search.", { defaultValue: "No users match your search." }) : t("No users available.", { defaultValue: "No users available." })}</p>
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
                      <span className="usd-name" style={{ fontWeight: 600 }}>{t("Select All", { defaultValue: "Select All" })}</span>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className="usd-name">{user.name}</span>
                            {user._isExternal && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "#ede9fe", color: "#6d28d9", fontWeight: 500, whiteSpace: "nowrap", lineHeight: "16px" }}>
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                                {user.org_name || "Shared"}
                              </span>
                            )}
                          </div>
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
        </div>,
        document.body
      )}
    </div>
  );
};

export default UserSelectDropdown;
