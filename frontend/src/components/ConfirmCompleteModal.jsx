import { IoCheckmarkCircle, IoClose } from "react-icons/io5";

export default function ConfirmCompleteModal({ taskTitle, isProject, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "white", borderRadius: "16px", padding: "32px", maxWidth: "440px", width: "90%", position: "relative" }}>
        <button onClick={onCancel} style={{ position: "absolute", top: "12px", right: "12px", background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#9CA3AF" }}>
          <IoClose />
        </button>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <IoCheckmarkCircle style={{ fontSize: "28px", color: "#22C55E" }} />
          </div>
        </div>

        <h3 style={{ textAlign: "center", fontSize: "18px", fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>Complete {isProject ? "Project" : "Task"}</h3>
        <p style={{ textAlign: "center", fontSize: "14px", color: "#6B7280", margin: "0 0 8px", lineHeight: 1.5 }}>
          Are you sure you want to mark <strong>"{taskTitle}"</strong> as completed?
        </p>
        <p style={{ textAlign: "center", fontSize: "14px", color: "#6B7280", margin: "0 0 24px", lineHeight: 1.5 }}>
          This {isProject ? "project" : "task"} will be moved to the <strong>Deliverables</strong> tab.
        </p>

        <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "10px 24px", borderRadius: "10px", border: "1px solid #E5E7EB", background: "white", color: "#374151", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ padding: "10px 24px", borderRadius: "10px", border: "none", background: "#22C55E", color: "white", fontWeight: 600, fontSize: "14px", cursor: "pointer" }}>
            Yes, Complete
          </button>
        </div>
      </div>
    </div>
  );
}
