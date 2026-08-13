/**
 * Personalization.jsx — Personalization & Widget Settings
 * Allows users to toggle widgets ON/OFF for Dashboard, Task, and Project pages.
 */
import { useState } from "react";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { usePersonalization } from "../context/PersonalizationContext";
import { useNotification } from "../context/NotificationContext";
import { LayoutDashboard, CheckSquare, FolderKanban, RotateCcw, Sparkles } from "lucide-react";
import "./Personalization.css";

function Personalization() {
  const notify = useNotification();
  const { preferences, updatePreference, resetPreferences } = usePersonalization();
  const [activeTab, setActiveTab] = useState("dashboard");

  const breadcrumbs = [
    { label: "Dashboard", path: "/" },
    { label: "Settings", path: "/settings/notifications" },
    { label: "Personalization" },
  ];

  const widgetDefinitions = {
    dashboard: [
      { key: "summary_cards", title: "Summary Metric Cards", desc: "Top key performance cards (Total Tasks, In Progress, Approved, Overdue).", icon: "📊" },
      { key: "today_tasks", title: "Today's Workload / Tasks", desc: "Carousel list of tasks assigned or due today.", icon: "📋" },
      { key: "active_projects", title: "Active Projects Slider", desc: "Active project cards slider showing project progress.", icon: "🚀" },
      { key: "activity_feed", title: "Today's Activity Feed", desc: "Real-time timeline feed of recent system events.", icon: "⚡" },
    ],
    tasks: [
      { key: "stats_cards", title: "Task Status Summary Cards", desc: "Metric summary cards at the top of the Tasks page.", icon: "📈" },
      { key: "filter_bar", title: "Search & Filter Bar", desc: "Advanced filter bar for searching tasks by role, status, and timeframe.", icon: "🔍" },
      { key: "task_list", title: "Task Data Table", desc: "Main interactive table listing all assigned and system tasks.", icon: "📝" },
    ],
    projects: [
      { key: "overview_cards", title: "Project Status Cards", desc: "Overview metrics cards for projects status.", icon: "📁" },
      { key: "project_list", title: "Project Cards & Table", desc: "Main listing grid showing all active and completed projects.", icon: "🎯" },
    ],
  };

  const handleToggle = (page, widgetKey) => {
    const currentValue = preferences[page]?.[widgetKey] !== false;
    const nextValue = !currentValue;
    updatePreference(page, widgetKey, nextValue);
    notify.success(`Widget updated successfully`);
  };

  const handleReset = () => {
    resetPreferences();
    notify.success("Personalization preferences reset to defaults.");
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="personalization-page">
        <div className="personalization-header">
          <h1>Widget Personalization</h1>
          <p>Customize and personalize which widgets and panels appear on your Dashboard, Tasks, and Projects pages.</p>
        </div>

        <div className="personalization-tabs">
          <button
            className={`personalization-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <LayoutDashboard size={18} /> Dashboard Widgets
          </button>
          <button
            className={`personalization-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <CheckSquare size={18} /> Task Page Widgets
          </button>
          <button
            className={`personalization-tab-btn ${activeTab === "projects" ? "active" : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            <FolderKanban size={18} /> Project Page Widgets
          </button>
        </div>

        <div className="personalization-card">
          <div className="personalization-card-title">
            <span>
              {activeTab === "dashboard" && "Dashboard Widgets Configuration"}
              {activeTab === "tasks" && "Task Page Layout Configuration"}
              {activeTab === "projects" && "Project Page Layout Configuration"}
            </span>
            <button
              onClick={handleReset}
              style={{
                background: "transparent",
                border: "1px solid var(--border-color, #cbd5e1)",
                color: "var(--text-secondary, #64748b)",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>
          </div>

          <div className="widgets-grid">
            {widgetDefinitions[activeTab].map((widget) => {
              const isEnabled = preferences[activeTab]?.[widget.key] !== false;
              return (
                <div key={widget.key} className="widget-item-row">
                  <div className="widget-info">
                    <div className="widget-icon-box">{widget.icon}</div>
                    <div>
                      <div className="widget-label">{widget.title}</div>
                      <div className="widget-desc">{widget.desc}</div>
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={() => handleToggle(activeTab, widget.key)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Personalization;
