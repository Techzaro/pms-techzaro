/**
 * Personalization.jsx — Personalization & Widget Settings
 * Allows users to toggle widgets ON/OFF for Dashboard, Task, and Project pages.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { usePersonalization } from "../context/PersonalizationContext";
import { useNotification } from "../context/NotificationContext";
import { LayoutDashboard, CheckSquare, FolderKanban, RotateCcw, Sparkles } from "lucide-react";
import "./Personalization.css";

function Personalization() {
  const { t } = useTranslation();
  const notify = useNotification();
  const { preferences, updatePreference, resetPreferences } = usePersonalization();
  const [activeTab, setActiveTab] = useState("dashboard");

  const breadcrumbs = [
    { label: t("Dashboard", { defaultValue: "Dashboard" }), path: "/" },
    { label: t("Settings", { defaultValue: "Settings" }), path: "/settings/notifications" },
    { label: t("Personalization", { defaultValue: "Personalization" }) },
  ];

  const widgetDefinitions = {
    dashboard: [
      { key: "summary_cards", title: t("Summary Metric Cards", { defaultValue: "Summary Metric Cards" }), desc: t("Top key performance cards (Total Tasks, In Progress, Approved, Overdue).", { defaultValue: "Top key performance cards (Total Tasks, In Progress, Approved, Overdue)." }), icon: "📊" },
      { key: "today_tasks", title: t("Today's Workload / Tasks", { defaultValue: "Today's Workload / Tasks" }), desc: t("Carousel list of tasks assigned or due today.", { defaultValue: "Carousel list of tasks assigned or due today." }), icon: "📋" },
      { key: "active_projects", title: t("Active Projects Slider", { defaultValue: "Active Projects Slider" }), desc: t("Active project cards slider showing project progress.", { defaultValue: "Active project cards slider showing project progress." }), icon: "🚀" },
      { key: "activity_feed", title: t("Today's Activity Feed", { defaultValue: "Today's Activity Feed" }), desc: t("Real-time timeline feed of recent system events.", { defaultValue: "Real-time timeline feed of recent system events." }), icon: "⚡" },
    ],
    tasks: [
      { key: "stats_cards", title: t("Task Status Summary Cards", { defaultValue: "Task Status Summary Cards" }), desc: t("Metric summary cards at the top of the Tasks page.", { defaultValue: "Metric summary cards at the top of the Tasks page." }), icon: "📈" },
      { key: "filter_bar", title: t("Search & Filter Bar", { defaultValue: "Search & Filter Bar" }), desc: t("Advanced filter bar for searching tasks by role, status, and timeframe.", { defaultValue: "Advanced filter bar for searching tasks by role, status, and timeframe." }), icon: "🔍" },
      { key: "task_list", title: t("Task Data Table", { defaultValue: "Task Data Table" }), desc: t("Main interactive table listing all assigned and system tasks.", { defaultValue: "Main interactive table listing all assigned and system tasks." }), icon: "📝" },
    ],
    projects: [
      { key: "overview_cards", title: t("Project Status Cards", { defaultValue: "Project Status Cards" }), desc: t("Overview metrics cards for projects status.", { defaultValue: "Overview metrics cards for projects status." }), icon: "📁" },
      { key: "project_list", title: t("Project Cards & Table", { defaultValue: "Project Cards & Table" }), desc: t("Main listing grid showing all active and completed projects.", { defaultValue: "Main listing grid showing all active and completed projects." }), icon: "🎯" },
    ],
  };

  const handleToggle = (page, widgetKey) => {
    const currentValue = preferences[page]?.[widgetKey] !== false;
    const nextValue = !currentValue;
    updatePreference(page, widgetKey, nextValue);
    notify.success(t("Widget updated successfully", { defaultValue: "Widget updated successfully" }));
  };

  const handleReset = () => {
    resetPreferences();
    notify.success(t("Personalization preferences reset to defaults.", { defaultValue: "Personalization preferences reset to defaults." }));
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="personalization-page">
        <div className="personalization-header">
          <h1>{t("Widget Personalization", { defaultValue: "Widget Personalization" })}</h1>
          <p>{t("Customize and personalize which widgets and panels appear on your Dashboard, Tasks, and Projects pages.", { defaultValue: "Customize and personalize which widgets and panels appear on your Dashboard, Tasks, and Projects pages." })}</p>
        </div>

        <div className="personalization-tabs">
          <button
            className={`personalization-tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <LayoutDashboard size={18} /> {t("Dashboard Widgets", { defaultValue: "Dashboard Widgets" })}
          </button>
          <button
            className={`personalization-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
          >
            <CheckSquare size={18} /> {t("Task Page Widgets", { defaultValue: "Task Page Widgets" })}
          </button>
          <button
            className={`personalization-tab-btn ${activeTab === "projects" ? "active" : ""}`}
            onClick={() => setActiveTab("projects")}
          >
            <FolderKanban size={18} /> {t("Project Page Widgets", { defaultValue: "Project Page Widgets" })}
          </button>
        </div>

        <div className="personalization-card">
          <div className="personalization-card-title">
            <span>
              {activeTab === "dashboard" && t("Dashboard Widgets Configuration", { defaultValue: "Dashboard Widgets Configuration" })}
              {activeTab === "tasks" && t("Task Page Layout Configuration", { defaultValue: "Task Page Layout Configuration" })}
              {activeTab === "projects" && t("Project Page Layout Configuration", { defaultValue: "Project Page Layout Configuration" })}
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
              <RotateCcw size={14} /> {t("Reset Defaults", { defaultValue: "Reset Defaults" })}
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
