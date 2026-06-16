import { useRef, useState, useEffect } from "react";
import { MdExpandMore } from "react-icons/md";
import "./UserSelectDropdown.css";

const UserSelectDropdown = ({
  users = [],
  selectedIds = [],
  onChange,
  placeholder = "Click to select members",
  disabled = false,
  viewOnly = false,
  error = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleAll = () => {
    if (selectedIds.length === users.length) {
      onChange([]);
    } else {
      onChange(users.map((u) => u.id));
    }
  };

  const toggleUser = (userId) => {
    if (selectedIds.includes(userId)) {
      onChange(selectedIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedIds, userId]);
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
              users.map((user) => (
                <label key={user.id} className="usd-item">
                  <input
                    type="checkbox"
                    checked={viewOnly ? false : selectedIds.includes(user.id)}
                    onChange={viewOnly ? undefined : () => toggleUser(user.id)}
                    disabled={viewOnly}
                  />
                  <span className="usd-name">{user.name}</span>
                  {user.role && <span className="usd-role">{user.role}</span>}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserSelectDropdown;
