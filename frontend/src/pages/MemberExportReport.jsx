import { useState } from "react";
import { createPortal } from "react-dom";
import "../pages/ExportReport.css";

const exportTypes = [
  {
    id: "activity",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    title: "My Activity",
    description: "Overview of key metrics and high level insights",
  },
  {
    id: "schedule",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
    title: "My Schedule",
    description: "Overview of key metrics and high level insights",
  },
  {
    id: "progress",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    title: "My Progress",
    description: "Overview of key metrics and high level insights",
  },
];

const fileFormats = [
  {
    id: "pdf",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#fef2f2" />
        <text x="12" y="15" textAnchor="middle" fill="#ef4444" fontSize="8" fontWeight="700" fontFamily="Arial">PDF</text>
      </svg>
    ),
    title: "PDF",
    description: "Best for sharing and printing",
  },
  {
    id: "excel",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="2" width="20" height="20" rx="4" fill="#f0fdf4" />
        <text x="12" y="15" textAnchor="middle" fill="#16a34a" fontSize="7" fontWeight="700" fontFamily="Arial">XLS</text>
      </svg>
    ),
    title: "Excel / CSV",
    description: "Best for data analysis and calculations",
  },
];

const includeOptionsList = [
  { id: "deadlines", label: "Deadlines" },
  { id: "activity", label: "My Activity" },
  { id: "attachments", label: "Attachments" },
  { id: "completed", label: "Completed Tasks" },
];

function MemberExportReport({ isOpen, onClose }) {
  const [selectedProjects, setSelectedProjects] = useState("All Projects");
  const [selectedTasks, setSelectedTasks] = useState("All Tasks");
  const [exportType, setExportType] = useState("activity");
  const [dateRange, setDateRange] = useState("Custom");
  const [customDate] = useState("Oct 1, 2026 - Oct 17, 2026");
  const [fileFormat, setFileFormat] = useState("pdf");
  const [checks, setChecks] = useState({
    deadlines: true,
    activity: true,
    attachments: false,
    completed: true,
  });

  const toggleCheck = (id) => setChecks((p) => ({ ...p, [id]: !p[id] }));

  const handleExport = () => {
    alert("Report exported successfully!");
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="er-overlay" onClick={onClose}>
      <div className="er-modal" onClick={(e) => e.stopPropagation()}>

        {/* HEADER */}
        <div className="er-header">
          <div>
            <h2>Export Report</h2>
            <p>Choose your preferences and export your report.</p>
          </div>
          <button className="er-close-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5L5 15M5 5l10 10" />
            </svg>
          </button>
        </div>

        {/* SECTION 1: CHOOSE PROJECTS & TASKS */}
        <div className="er-section">
          <h3>1. Choose Projects & Tasks</h3>
          <div className="er-projects-row">
            <div className="er-select-wrapper">
              <select value={selectedProjects} onChange={(e) => setSelectedProjects(e.target.value)}>
                <option>All Projects</option>
                <option>Ecommerce Website</option>
                <option>Website Redesign</option>
                <option>CRM System</option>
                <option>Mobile App</option>
              </select>
            </div>
            <button className="er-include-btn">Include all projects</button>
            <div className="er-select-wrapper">
              <select value={selectedTasks} onChange={(e) => setSelectedTasks(e.target.value)}>
                <option>All Tasks</option>
                <option>Pending</option>
                <option>In Progress</option>
                <option>Completed</option>
                <option>Overdue</option>
              </select>
            </div>
            <button className="er-include-btn">Include all tasks</button>
          </div>
        </div>

        {/* SECTION 2: EXPORT TYPE */}
        <div className="er-section">
          <h3>2. Export Type</h3>
          <div className="er-cards-grid er-export-type-grid-3">
            {exportTypes.map((type) => (
              <div
                key={type.id}
                className={`er-type-card ${exportType === type.id ? "active" : ""}`}
                onClick={() => setExportType(type.id)}
              >
                <div className="er-type-icon">{type.icon}</div>
                <h4>{type.title}</h4>
                <p>{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 3: DATE RANGE */}
        <div className="er-section">
          <h3>3. Date Range</h3>
          <div className="er-date-row">
            <div className="er-date-buttons">
              {["Today", "This Week", "This Month", "Custom"].map((range) => (
                <button
                  key={range}
                  className={`er-date-btn ${dateRange === range ? "active" : ""}`}
                  onClick={() => setDateRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
            <div className="er-date-display">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="14" height="13" rx="2" />
                <path d="M2 7h14" />
                <path d="M6 1v4M12 1v4" />
              </svg>
              <span>{customDate}</span>
            </div>
          </div>
        </div>

        {/* SECTION 4: FILE FORMAT */}
        <div className="er-section">
          <h3>4. File Format</h3>
          <div className="er-cards-grid er-format-grid-2">
            {fileFormats.map((format) => (
              <div
                key={format.id}
                className={`er-format-card ${fileFormat === format.id ? "active" : ""}`}
                onClick={() => setFileFormat(format.id)}
              >
                <div className="er-format-icon">{format.icon}</div>
                <div className="er-format-info">
                  <h4>{format.title}</h4>
                  <p>{format.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 5: INCLUDE OPTIONS */}
        <div className="er-section">
          <h3>5. Include Options</h3>
          <div className="er-checkbox-row">
            {includeOptionsList.map((opt) => (
              <label key={opt.id} className="er-checkbox-label">
                <input
                  type="checkbox"
                  checked={checks[opt.id]}
                  onChange={() => toggleCheck(opt.id)}
                />
                <span className="er-checkbox-custom"></span>
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* FOOTER */}
        <div className="er-footer">
          <button className="er-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="er-export-btn" onClick={handleExport}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
            </svg>
            Export Report
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

export default MemberExportReport;
