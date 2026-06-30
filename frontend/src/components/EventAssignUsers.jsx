/**
 * EventAssignUsers.jsx
 * Wrapper component for assigning users to events.
 * Provides a user dropdown and an optional "Assign To All Users" checkbox.
 */

import { useEffect, useRef, useState } from "react";
import UserSelectDropdown from "./UserSelectDropdown";
import "./EventAssignUsers.css";

/**
 * User assignment component for events.
 * @param {Array} [users=[]] - List of available users
 * @param {Array} [selectedIds=[]] - Currently selected user IDs
 * @param {Function} onChange - Callback when selection changes
 * @param {boolean} [allUsersAllowed=false] - Whether to show the "Assign To All" checkbox
 */
function EventAssignUsers({ users = [], selectedIds = [], onChange, allUsersAllowed = false }) {
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    setSelectAll(selectedIds.length > 0 && selectedIds.length === users.length);
  }, [selectedIds, users.length]);

  const handleToggleAll = () => {
    if (selectAll) {
      setSelectAll(false);
      onChange([]);
    } else {
      setSelectAll(true);
      onChange(users.map((u) => u.id));
    }
  };

  return (
    <div className="event-assign-users">
      <label className="event-label">Assign Users</label>
      <UserSelectDropdown
        users={users}
        selectedIds={selectedIds}
        onChange={onChange}
        placeholder="Select users to assign"
      />
      {allUsersAllowed && (
        <label className="event-assign-all">
          <input
            type="checkbox"
            checked={selectAll}
            onChange={handleToggleAll}
          />
          Assign To All Users
        </label>
      )}
    </div>
  );
}

export default EventAssignUsers;
