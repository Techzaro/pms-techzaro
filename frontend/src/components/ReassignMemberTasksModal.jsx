/**
 * ReassignMemberTasksModal.jsx
 * 
 * Re-export wrapper around ReassignMemberModal for backwards compatibility.
 */

import React from "react";
import ReassignMemberModal from "./ReassignMemberModal";

export default function ReassignMemberTasksModal(props) {
  return <ReassignMemberModal {...props} />;
}
