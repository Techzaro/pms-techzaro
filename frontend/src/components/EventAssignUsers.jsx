import { useEffect, useRef, useState } from "react";
import UserSelectDropdown from "./UserSelectDropdown";
import "./EventAssignUsers.css";

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
