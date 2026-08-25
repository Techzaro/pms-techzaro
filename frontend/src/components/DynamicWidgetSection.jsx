import React, { useState, useEffect, useRef } from "react";
import { Plus, X, GripVertical, RotateCcw, Search, Maximize2, Minimize2, Pin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CalendarEventsWidget, { CalendarWidget, EventsWidget, KnowledgeBaseWidget } from "./CalendarEventsWidget";
import { usePinnedTasks, togglePinTask } from "../utils/pinnedTasks";
import { rolePath } from "../utils/auth";

function PinnedTasksSubWidget() {
  const [pinnedTasks] = usePinnedTasks();
  const navigate = useNavigate();

  if (pinnedTasks.length === 0) {
    return (
      <div style={{ padding: "16px 8px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)" }}>
          No pinned tasks. Click "Pin to Dashboard" on any task to show it here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
      {pinnedTasks.map((t) => (
        <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "8px", background: "var(--bg-card-subtle, #f8fafc)", border: "1px solid var(--border-color, #e2e8f0)" }}>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-heading)", cursor: "pointer" }} onClick={() => navigate(rolePath(`tasks/task-details/${t.id}`))}>
            #{t.id} - {t.title}
          </span>
          <button onClick={() => togglePinTask(t)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }} title="Unpin">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * DynamicWidgetSection.jsx
 * Reusable, draggable, and resizable widget section for Admin, Projects, Tasks, etc.
 * 
 * @param {string} storageKey - LocalStorage key for persisting widgets layout.
 * @param {string} sectionTitle - Display title for the section (default: "Dashboard Widgets").
 */
/**
 * WidgetCardItem component with Omnidirectional Mouse Pointer Resizing Handles
 */
function WidgetCardItem({
  w,
  index,
  isDragOver,
  draggedIndex,
  handleDragOver,
  handleDrop,
  handleDragStart,
  setDraggedIndex,
  setDragOverIndex,
  handleRemoveWidget,
  handleUpdateTitle,
  handleUpdateContent,
  setWidgets
}) {
  const cardRef = useRef(null);

  const startResize = (e, direction) => {
    e.preventDefault();
    e.stopPropagation();

    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;

    const handleMouseMove = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (direction.includes("right")) {
        newWidth = Math.max(260, startWidth + dx);
      } else if (direction.includes("left")) {
        newWidth = Math.max(260, startWidth - dx);
      }

      if (direction.includes("bottom")) {
        newHeight = Math.max(120, startHeight + dy);
      } else if (direction.includes("top")) {
        newHeight = Math.max(120, startHeight - dy);
      }

      setWidgets((prev) =>
        prev.map((item) =>
          item.id === w.id
            ? { ...item, width: `${Math.round(newWidth)}px`, height: Math.round(newHeight) }
            : item
        )
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      ref={cardRef}
      key={w.id}
      draggable={false}
      onDragOver={(e) => handleDragOver(e, index)}
      onDrop={(e) => handleDrop(e, index)}
      className="widget-card-item"
      style={{
        flex: w.width && w.width !== "100%" ? "0 0 auto" : "1 1 auto",
        width: w.width || "100%",
        minWidth: "260px",
        minHeight: w.type === "calendar" || w.type === "calendar_events" || w.type === "events" ? "300px" : "140px",
        height: w.height ? `${w.height}px` : "auto",
        overflow: "visible",
        background: "var(--bg-card, #ffffff)",
        borderRadius: "20px",
        padding: "20px",
        boxShadow: "var(--shadow-sm, 0 4px 14px rgba(0,0,0,0.03))",
        border: isDragOver ? "2px dashed #4f46e5" : "1px solid var(--border-color, #e2e8f0)",
        position: "relative",
        boxSizing: "border-box",
        transition: "border 0.15s ease",
        opacity: draggedIndex === index ? 0.4 : 1,
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Absolute Edge & Corner Handles for Omnidirectional Resize */}
      <div onMouseDown={(e) => startResize(e, "top")} style={{ position: "absolute", top: -4, left: 12, right: 12, height: 10, cursor: "ns-resize", zIndex: 20 }} />
      <div onMouseDown={(e) => startResize(e, "bottom")} style={{ position: "absolute", bottom: -4, left: 12, right: 12, height: 10, cursor: "ns-resize", zIndex: 20 }} />
      <div onMouseDown={(e) => startResize(e, "left")} style={{ position: "absolute", left: -4, top: 12, bottom: 12, width: 10, cursor: "ew-resize", zIndex: 20 }} />
      <div onMouseDown={(e) => startResize(e, "right")} style={{ position: "absolute", right: -4, top: 12, bottom: 12, width: 10, cursor: "ew-resize", zIndex: 20 }} />
      <div onMouseDown={(e) => startResize(e, "top-left")} style={{ position: "absolute", top: -4, left: -4, width: 14, height: 14, cursor: "nwse-resize", zIndex: 21 }} />
      <div onMouseDown={(e) => startResize(e, "top-right")} style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, cursor: "nesw-resize", zIndex: 21 }} />
      <div onMouseDown={(e) => startResize(e, "bottom-left")} style={{ position: "absolute", bottom: -4, left: -4, width: 14, height: 14, cursor: "nesw-resize", zIndex: 21 }} />
      <div onMouseDown={(e) => startResize(e, "bottom-right")} style={{ position: "absolute", bottom: -4, right: -4, width: 14, height: 14, cursor: "nwse-resize", zIndex: 21 }} />

      {/* Header Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "12px",
          gap: "10px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0 }}>
          <span
            draggable={true}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={() => { setDraggedIndex(null); setDragOverIndex(null); }}
            title="Drag handle to reorder widget"
            style={{
              cursor: "grab",
              color: "var(--text-secondary, #94a3b8)",
              display: "inline-flex",
              alignItems: "center",
              padding: "4px 2px"
            }}
          >
            <GripVertical size={18} />
          </span>

          {w.type === "calendar_events" || w.type === "calendar" || w.type === "events" || w.type === "knowledge_base" ? (
            <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-heading)" }}>
              {w.type === "calendar" ? "📅 " : w.type === "events" ? "🗓️ " : w.type === "knowledge_base" ? "📖 " : "📅 "}{w.title || (w.type === "calendar" ? "Calendar Widget" : w.type === "events" ? "Events Widget" : w.type === "knowledge_base" ? "Knowledge Base" : "Calendar & Events")}
            </h4>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
              <span style={{ fontSize: "18px" }}>📝</span>
              <input
                type="text"
                value={w.title || "Notes"}
                onChange={(e) => handleUpdateTitle(w.id, e.target.value)}
                placeholder="Widget Title..."
                style={{
                  border: "none",
                  background: "transparent",
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--text-heading)",
                  outline: "none",
                  width: "100%"
                }}
              />
            </div>
          )}
        </div>

        {/* Remove 'X' button */}
        <button
          onClick={() => handleRemoveWidget(w.id)}
          title="Remove Widget"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-secondary, #94a3b8)",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "6px",
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Widget Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {w.type === "calendar" ? (
          <CalendarWidget />
        ) : w.type === "events" ? (
          <EventsWidget />
        ) : w.type === "knowledge_base" ? (
          <KnowledgeBaseWidget />
        ) : w.type === "calendar_events" ? (
          <CalendarEventsWidget />
        ) : w.type === "pinned_tasks" ? (
          <PinnedTasksSubWidget />
        ) : (
          <textarea
            value={w.content || ""}
            onChange={(e) => handleUpdateContent(w.id, e.target.value)}
            placeholder="Type your notes or reminders here..."
            style={{
              width: "100%",
              height: "100%",
              minHeight: "90px",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid var(--border-color, #cbd5e1)",
              background: "var(--bg-card-subtle, #f8fafc)",
              fontSize: "13px",
              color: "var(--text-primary)",
              resize: "none",
              fontFamily: "inherit",
              boxSizing: "border-box"
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function DynamicWidgetSection({ storageKey = "pms_dashboard_widgets", sectionTitle = "Dashboard Widgets" }) {
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return []; // Task 6: Initial state defaults to empty []
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [draggedIndex, setDraggedIndex] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widgets));
    } catch {}
  }, [widgets, storageKey]);

  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Drag & Drop handlers for widget reordering
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e, index) => {
    e.preventDefault(); // Mandatory for HTML5 drop
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === undefined || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    setWidgets((prev) => {
      const updated = [...prev];
      const [removed] = updated.splice(draggedIndex, 1);
      updated.splice(targetIndex, 0, removed);
      return updated;
    });
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleRemoveWidget = (id) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  };

  const handleAddWidget = (type, title = "") => {
    if (type === "calendar") {
      if (!widgets.some((w) => w.type === "calendar")) {
        setWidgets((prev) => [
          ...prev,
          { id: `cal_${Date.now()}`, type: "calendar", title: "Calendar Widget", width: "100%", height: 320 }
        ]);
      }
    } else if (type === "events") {
      if (!widgets.some((w) => w.type === "events")) {
        setWidgets((prev) => [
          ...prev,
          { id: `ev_${Date.now()}`, type: "events", title: "Events Widget", width: "100%", height: 320 }
        ]);
      }
    } else if (type === "knowledge_base") {
      if (!widgets.some((w) => w.type === "knowledge_base")) {
        setWidgets((prev) => [
          ...prev,
          { id: `kb_${Date.now()}`, type: "knowledge_base", title: "Knowledge Base", width: "100%", height: 320 }
        ]);
      }
    } else if (type === "calendar_events") {
      if (!widgets.some((w) => w.type === "calendar_events")) {
        setWidgets((prev) => [
          ...prev,
          { id: `calev_${Date.now()}`, type: "calendar_events", title: "Calendar & Events", width: "100%", height: 380 }
        ]);
      }
    } else {
      const widgetTitle = title.trim() || "Notes";
      const newId = `widget_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      setWidgets((prev) => [
        ...prev,
        { id: newId, type: type || "notes", title: widgetTitle, content: "", width: "100%", height: 180 }
      ]);
    }
    setShowAddModal(false);
    setSearchTerm("");
  };

  const handleUpdateTitle = (id, newTitle) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, title: newTitle } : w))
    );
  };

  const handleUpdateContent = (id, newContent) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, content: newContent } : w))
    );
  };

  const handleUpdateWidth = (id, width) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, width } : w))
    );
  };

  const handleResetWidgets = () => {
    setWidgets([]);
    try { localStorage.removeItem(storageKey); } catch {}
  };

  // Predefined widgets
  const predefinedWidgets = [
    { type: "pinned_tasks", title: "Pinned Tasks & Reminders", desc: "View and access your pinned dashboard tasks" },
    { type: "calendar", title: "Calendar Widget", desc: "Mini monthly calendar grid & schedule navigator" },
    { type: "events", title: "Events Widget", desc: "Upcoming events schedule and attendee assignments" },
    { type: "knowledge_base", title: "Knowledge Base", desc: "Recently added and updated documentation and guidelines" },
    { type: "calendar_events", title: "Calendar & Events (Combined)", desc: "Combined mini calendar and schedule view" },
    { type: "notes", title: "Notes Widget", desc: "Custom card with editable title and notes" }
  ];

  const searchTrimmed = searchTerm.trim().toLowerCase();

  const filteredPredefined = predefinedWidgets.filter((w) =>
    w.title.toLowerCase().includes(searchTrimmed) || w.desc.toLowerCase().includes(searchTrimmed)
  );

  const exactMatch = predefinedWidgets.some(
    (w) => w.title.toLowerCase() === searchTrimmed
  );

  return (
    <div className="dynamic-widget-section" style={{ marginTop: "16px", marginBottom: "30px" }}>
      {/* Widget Grid Container */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "20px",
          alignItems: "stretch"
        }}
      >
        {widgets.map((w, index) => {
          const isDragOver = dragOverIndex === index;

          return (
            <WidgetCardItem
              key={w.id}
              w={w}
              index={index}
              isDragOver={isDragOver}
              draggedIndex={draggedIndex}
              handleDragOver={handleDragOver}
              handleDrop={handleDrop}
              handleDragStart={handleDragStart}
              setDraggedIndex={setDraggedIndex}
              setDragOverIndex={setDragOverIndex}
              handleRemoveWidget={handleRemoveWidget}
              handleUpdateTitle={handleUpdateTitle}
              handleUpdateContent={handleUpdateContent}
              setWidgets={setWidgets}
            />
          );
        })}

        {/* ADD WIDGET PLACEHOLDER CARD */}
        <div
          className="add-widget-placeholder-card"
          onClick={() => setShowAddModal(true)}
          style={{
            flex: "1 1 100%",
            border: "2px dashed var(--border-color, #cbd5e1)",
            borderRadius: "16px",
            padding: "24px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: "var(--bg-card-subtle, #f8fafc)",
            transition: "all 0.2s ease",
            boxSizing: "border-box"
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "#eef2ff",
              color: "#4f46e5",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "8px"
            }}
          >
            <Plus size={20} />
          </div>
          <h4 style={{ margin: "0 0 2px 0", fontSize: "15px", fontWeight: "700", color: "var(--text-heading)" }}>
            Add Widget
          </h4>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)" }}>
            Click to add Notes, Calendar & Events, or create a Custom Widget
          </p>
        </div>
      </div>

      {/* SEARCHABLE ADD WIDGET SELECTION MODAL (Tasks 5 & 6) */}
      {showAddModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddModal(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div
            className="add-widget-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-card, #ffffff)",
              borderRadius: "20px",
              padding: "28px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "var(--text-heading)" }}>
                  Add Widget
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-secondary)" }}>
                  Search predefined widgets or type to create a custom widget.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>

            {/* SEARCH INPUT (Task 5) */}
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8"
                }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search or type custom widget name..."
                autoFocus
                style={{
                  width: "100%",
                  height: "40px",
                  padding: "8px 12px 8px 36px",
                  borderRadius: "10px",
                  border: "1px solid var(--border-color, #cbd5e1)",
                  background: "var(--bg-card-subtle, #f8fafc)",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box"
                }}
              />
            </div>

            {/* WIDGET OPTIONS LIST */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "280px", overflowY: "auto" }}>
              {filteredPredefined.map((w) => (
                <div
                  key={w.type}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    background: "var(--bg-card, #ffffff)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "22px" }}>{w.type === "calendar_events" ? "📅" : "📝"}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>{w.title}</div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{w.desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddWidget(w.type, w.title)}
                    style={{
                      background: "#4f46e5",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "6px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    + Add
                  </button>
                </div>
              ))}

              {/* DYNAMIC CUSTOM SEARCH CREATION OPTION (Task 5) */}
              {searchTrimmed && !exactMatch && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px dashed #4f46e5",
                    background: "#eef2ff"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "22px" }}>✨</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "14px", color: "#4f46e5" }}>
                        Create "{searchTerm.trim()}" as Widget
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Custom card with editable notes
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddWidget("notes", searchTerm.trim())}
                    style={{
                      background: "#4f46e5",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      padding: "6px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer"
                    }}
                  >
                    Create
                  </button>
                </div>
              )}
            </div>

            <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--border-color, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={handleResetWidgets}
                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <RotateCcw size={14} /> Clear All Widgets
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: "var(--bg-card-subtle, #e2e8f0)", color: "var(--text-primary)", border: "none", borderRadius: "8px", padding: "8px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
