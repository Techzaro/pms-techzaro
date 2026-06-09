import { useState } from "react";
import { createPortal } from "react-dom";
import {
  createDoc,
  getPageWidth,
  addLogo,
  addTitle,
  addSubtitle,
  addDivider,
  addSectionTitle,
  addStatCards,
  addAutoTable,
  addTimeline,
  addFooter,
  savePdf,
  COLORS,
} from "../utils/pdfUtils";
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
  const [showReview, setShowReview] = useState(false);

  const toggleCheck = (id) => setChecks((p) => ({ ...p, [id]: !p[id] }));

  const generatePDF = () => {
    const doc = createDoc();
    let y = 20;

    y = addLogo(doc, y);

    const reportTitle = exportType === "activity" ? "My Activity Report" : exportType === "schedule" ? "My Schedule Report" : "My Progress Report";
    y = addTitle(doc, reportTitle, y);

    const pageWidth = getPageWidth(doc);
    doc.setFillColor(107, 114, 128);
    doc.circle(pageWidth / 2, y + 8, 8, "F");
    y += 20;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.text);
    doc.text("Umar Naseer", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(156, 163, 175);
    doc.text("Frontend Developer", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.setTextColor(55, 65, 81);
    doc.text(customDate, pageWidth / 2, y, { align: "center" });
    y += 12;

    y = addDivider(doc, y);

    if (exportType === "activity") {
      y = addSectionTitle(doc, "Activity Summary", y);
      y = addStatCards(doc, [
        { label: "Total Task", value: "78", color: COLORS.primary },
        { label: "Completed", value: "40", color: COLORS.success },
        { label: "Pending", value: "18", color: COLORS.warning },
        { label: "Overdue", value: "8", color: COLORS.danger },
      ], y);

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Activity Timeline", y);
      y = addTimeline(doc, [
        { date: "01 May", action: "Task Created", detail: "Landing Page Design" },
        { date: "03 May", action: "Task Updated", detail: "API Integration" },
        { date: "05 May", action: "Task Completed", detail: "User Flow Design" },
        { date: "07 May", action: "File Uploaded", detail: "Wireframes.pdf" },
      ], y);

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Task History", y);
      y = addAutoTable(doc,
        ["Task", "Project", "Status", "Date"],
        [
          ["Landing Page Redesign", "Ecommerce Website", "Completed", "12 May"],
          ["API Integration", "Mobile App", "In Progress", "10 May"],
          ["Dashboard Design", "CRM Dashboard", "Completed", "08 May"],
          ["User Flow Design", "Mobile App", "Completed", "08 May"],
          ["Wireframe Design", "Website Redesign", "Completed", "08 May"],
        ],
        y,
        { columnStyles: { 2: { cellWidth: 30, halign: "center" }, 3: { cellWidth: 25, halign: "right" } } }
      );
    }

    if (exportType === "schedule") {
      y = addSectionTitle(doc, "Events", y);
      y = addAutoTable(doc,
        ["Name", "Date", "Status", "Type"],
        [
          ["Task Created", "03 May", "10:00 AM", "Task"],
          ["Task Updated", "08 May", "11:00 AM", "Review"],
          ["Task Completed", "12 May", "02:00 PM", "Meeting"],
          ["File Uploaded", "17 May", "10:30 AM", "Personal"],
        ],
        y,
        { columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 30 }, 2: { cellWidth: 30, halign: "center" }, 3: { cellWidth: 30, halign: "right" } } }
      );

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Deadlines", y);
      [
        { name: "Landing Page Design", date: "01 May, 2026" },
        { name: "API Integration", date: "03 May, 2026" },
        { name: "User Flow Design", date: "05 May, 2026" },
        { name: "Wireframes.pdf", date: "07 May, 2026" },
      ].forEach((item) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...COLORS.text);
        doc.text(item.name, 22, y + 3);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLORS.muted);
        doc.text(item.date, pageWidth - 22, y + 3, { align: "right" });
        y += 8;
      });
      y += 5;

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Deliverables", y);
      y = addAutoTable(doc,
        ["Deliverables", "Status", "Date"],
        [
          ["Ecommerce homepage design", "Completed", "12 May"],
          ["Ecommerce homepage design", "In Progress", "10 May"],
          ["Ecommerce homepage design", "Pending", "08 May"],
          ["Ecommerce homepage design", "Failed", "07 May"],
          ["Ecommerce homepage design", "Abandoned", "05 May"],
        ],
        y,
        { columnStyles: { 1: { cellWidth: 35, halign: "center" }, 2: { cellWidth: 30, halign: "right" } } }
      );
    }

    if (exportType === "progress") {
      y = addSectionTitle(doc, "Performance Overview", y);
      y = addStatCards(doc, [
        { label: "Assigned", value: "78", color: COLORS.primary },
        { label: "Completed", value: "40", color: COLORS.success },
        { label: "Pending", value: "18", color: COLORS.warning },
        { label: "Overdue", value: "8", color: COLORS.danger },
      ], y);

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Events", y);
      y = addTimeline(doc, [
        { date: "01 May", action: "Task Created", detail: "Landing Page Design" },
        { date: "03 May", action: "Task Updated", detail: "API Integration" },
        { date: "05 May", action: "Task Completed", detail: "User Flow Design" },
        { date: "07 May", action: "File Uploaded", detail: "Wireframes.pdf" },
      ], y);

      y = addDivider(doc, y);
      y = addSectionTitle(doc, "Deliverables", y);
      y = addAutoTable(doc,
        ["Task", "Project", "Status", "Date"],
        [
          ["Landing Page Redesign", "Ecommerce Website", "Completed", "12 May"],
          ["API Integration", "Mobile App", "In Progress", "10 May"],
          ["Dashboard Design", "CRM Dashboard", "Completed", "08 May"],
          ["User Flow Design", "Mobile App", "Completed", "07 May"],
          ["Wireframe Design", "Website Redesign", "Completed", "05 May"],
        ],
        y,
        { columnStyles: { 2: { cellWidth: 30, halign: "center" }, 3: { cellWidth: 25, halign: "right" } } }
      );
    }

    addFooter(doc);

    const fileName = exportType === "activity" ? "My-Activity-Report.pdf" : exportType === "schedule" ? "My-Schedule-Report.pdf" : "My-Progress-Report.pdf";
    savePdf(doc, fileName);
    setShowReview(false);
  };

  const handleExport = () => {
    generatePDF();
  };

  const handleReview = () => setShowReview(true);

  if (!isOpen) return null;

  return createPortal(
    <>
      {/* MAIN MODAL */}
      <div className="er-overlay">
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
          <button className="er-export-btn" onClick={handleReview} disabled={fileFormat === "excel"} style={fileFormat === "excel" ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
            </svg>
            Report Review
          </button>
        </div>

      </div>
    </div>

      {/* REVIEW POPUP */}
      {showReview && (
        <div className="er-overlay" onClick={() => setShowReview(false)}>
          <div className="er-review-modal" onClick={(e) => e.stopPropagation()}>

            {/* Close button */}
            <button className="er-close-btn" style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }} onClick={() => setShowReview(false)}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 5L5 15M5 5l10 10" />
              </svg>
            </button>

            {/* PMS Logo */}
            <div style={{ padding: "24px 32px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: "#4f46e5" }}></div>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>PMS</span>
              </div>
            </div>

            {/* Report Header */}
            <div style={{ textAlign: "center", padding: "24px 32px 0" }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 0 }}>
                {exportType === "activity" ? "My Activity Report" : exportType === "schedule" ? "My Schedule Report" : "My Progress Report"}
              </h1>
            </div>

            {/* Profile Section */}
            <div style={{ textAlign: "center", padding: "24px 32px 20px" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#6b7280", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <svg width="50" height="50" viewBox="0 0 50 50" fill="none">
                  <circle cx="25" cy="20" r="10" fill="#4b5563" />
                  <path d="M5 48c0-11 9-20 20-20s20 9 20 20" fill="#4b5563" />
                </svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Umar Naseer</div>
              <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 12 }}>Frontend Developer</div>
              <div style={{ display: "inline-block", padding: "6px 16px", background: "#f9fafb", borderRadius: 20, fontSize: 13, color: "#374151", border: "1px solid #e5e7eb" }}>
                {customDate}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

            {exportType === "activity" && (
              <>
                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Activity Summary</h2>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[
                      { label: "Total Task", value: "78", color: "#4f46e5" },
                      { label: "Completed", value: "40", color: "#16a34a" },
                      { label: "Pending", value: "18", color: "#f59e0b" },
                      { label: "Overdue", value: "8", color: "#ef4444" },
                    ].map((stat) => (
                      <div key={stat.label} style={{ flex: 1, minWidth: 100, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{stat.label}</div>
                        <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Activity Timeline</h2>
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: "#e5e7eb" }}></div>
                    {[
                      { date: "01 May", action: "Task Created", detail: "Landing Page Design" },
                      { date: "03 May", action: "Task Updated", detail: "API Integration" },
                      { date: "05 May", action: "Task Completed", detail: "User Flow Design" },
                      { date: "07 May", action: "File Uploaded", detail: "Wireframes.pdf" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: i < 3 ? 20 : 0, position: "relative" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4f46e5", position: "absolute", left: -20, top: 5, zIndex: 1 }}></div>
                        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: "#6b7280", minWidth: 60 }}>{item.date}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{item.action}</span>
                          </div>
                          <span style={{ fontSize: 13, color: "#6b7280" }}>{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Task History</h2>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", padding: "12px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
                      <span>Task</span><span>Project</span><span style={{ textAlign: "center" }}>Status</span><span style={{ textAlign: "right" }}>Date</span>
                    </div>
                    {[
                      { task: "Landing Page Redesign", project: "Ecommerce Website", status: "Completed", date: "12 May" },
                      { task: "API Integration", project: "Mobile App", status: "In Progress", date: "10 May" },
                      { task: "Dashboard Design", project: "CRM Dashboard", status: "Completed", date: "08 May" },
                      { task: "User Flow Design", project: "Mobile App", status: "Completed", date: "08 May" },
                      { task: "Wireframe Design", project: "Website Redesign", status: "Completed", date: "08 May" },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", padding: "14px 20px", borderBottom: i < 4 ? "1px solid #e5e7eb" : "none", fontSize: 14, alignItems: "center" }}>
                        <span style={{ fontWeight: 500, color: "#111827" }}>{row.task}</span>
                        <span style={{ color: "#6b7280" }}>{row.project}</span>
                        <span style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: row.status === "Completed" ? "#dcfce7" : "#dbeafe", color: row.status === "Completed" ? "#16a34a" : "#2563eb" }}>{row.status}</span>
                        </span>
                        <span style={{ textAlign: "right", color: "#6b7280" }}>{row.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {exportType === "schedule" && (
              <>
                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Events</h2>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "12px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
                      <span>Name</span><span>Date</span><span>Status</span><span style={{ textAlign: "right" }}>Type</span>
                    </div>
                    {[
                      { name: "Task Created", date: "03 May", status: "10:00 AM", type: "Task", typeColor: { bg: "#dbeafe", text: "#2563eb" } },
                      { name: "Task Updated", date: "08 May", status: "11:00 AM", type: "Review", typeColor: { bg: "#dcfce7", text: "#16a34a" } },
                      { name: "Task Completed", date: "12 May", status: "02:00 PM", type: "Meeting", typeColor: { bg: "#dbeafe", text: "#2563eb" } },
                      { name: "File Uploaded", date: "17 May", status: "10:30 AM", type: "Personal", typeColor: { bg: "#fef3c7", text: "#d97706" } },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "14px 20px", borderBottom: i < 3 ? "1px solid #e5e7eb" : "none", fontSize: 14, alignItems: "center" }}>
                        <span style={{ fontWeight: 500, color: "#111827" }}>{row.name}</span>
                        <span style={{ color: "#6b7280" }}>{row.date}</span>
                        <span style={{ color: "#6b7280" }}>{row.status}</span>
                        <span style={{ textAlign: "right" }}>
                          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: row.typeColor.bg, color: row.typeColor.text }}>{row.type}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Deadlines</h2>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    {[
                      { name: "Landing Page Design", date: "01 May, 2026" },
                      { name: "API Integration", date: "03 May, 2026" },
                      { name: "User Flow Design", date: "05 May, 2026" },
                      { name: "Wireframes.pdf", date: "07 May, 2026" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: i < 3 ? "1px solid #e5e7eb" : "none", fontSize: 14 }}>
                        <span style={{ fontWeight: 500, color: "#111827" }}>{item.name}</span>
                        <span style={{ color: "#6b7280" }}>{item.date}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Deliverables</h2>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "12px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
                      <span>Deliverables</span><span style={{ textAlign: "center" }}>Status</span><span style={{ textAlign: "right" }}>Date</span>
                    </div>
                    {[
                      { name: "Ecommerce homepage design", desc: "Design and implement the new ecommerce homepage.", status: "Completed", date: "12 May", statusColor: { bg: "#dcfce7", text: "#16a34a" } },
                      { name: "Ecommerce homepage design", desc: "Design and implement the new ecommerce homepage.", status: "In Progress", date: "10 May", statusColor: { bg: "#dbeafe", text: "#2563eb" } },
                      { name: "Ecommerce homepage design", desc: "Design and implement the new ecommerce homepage.", status: "Pending", date: "08 May", statusColor: { bg: "#fef3c7", text: "#d97706" } },
                      { name: "Ecommerce homepage design", desc: "Design and implement the new ecommerce homepage.", status: "Failed", date: "07 May", statusColor: { bg: "#fef2f2", text: "#ef4444" } },
                      { name: "Ecommerce homepage design", desc: "Design and implement the new ecommerce homepage.", status: "Abandoned", date: "05 May", statusColor: { bg: "#f3f4f6", text: "#6b7280" } },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", padding: "14px 20px", borderBottom: i < 4 ? "1px solid #e5e7eb" : "none", fontSize: 14, alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 500, color: "#111827" }}>{row.name}</div>
                          <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{row.desc}</div>
                        </div>
                        <span style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: row.statusColor.bg, color: row.statusColor.text }}>{row.status}</span>
                        </span>
                        <span style={{ textAlign: "right", color: "#6b7280" }}>{row.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {exportType === "progress" && (
              <>
                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Performance Overview</h2>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {[
                      { label: "Assigned", value: "78", color: "#4f46e5" },
                      { label: "Completed", value: "40", color: "#16a34a" },
                      { label: "Pending", value: "18", color: "#f59e0b" },
                      { label: "Overdue", value: "8", color: "#ef4444" },
                    ].map((stat) => (
                      <div key={stat.label} style={{ flex: 1, minWidth: 100, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{stat.label}</div>
                        <div style={{ fontSize: 32, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 20 }}>Events</h2>
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: "#e5e7eb" }}></div>
                    {[
                      { date: "01 May", action: "Task Created", detail: "Landing Page Design" },
                      { date: "03 May", action: "Task Updated", detail: "API Integration" },
                      { date: "05 May", action: "Task Completed", detail: "User Flow Design" },
                      { date: "07 May", action: "File Uploaded", detail: "Wireframes.pdf" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: i < 3 ? 20 : 0, position: "relative" }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#4f46e5", position: "absolute", left: -20, top: 5, zIndex: 1 }}></div>
                        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
                            <span style={{ fontSize: 13, color: "#6b7280", minWidth: 60 }}>{item.date}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{item.action}</span>
                          </div>
                          <span style={{ fontSize: 13, color: "#6b7280" }}>{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #e5e7eb", margin: "0 32px" }}></div>

                <div style={{ padding: "24px 32px" }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 16 }}>Deliverables</h2>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", padding: "12px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, color: "#6b7280" }}>
                      <span>Task</span><span>Project</span><span style={{ textAlign: "center" }}>Status</span><span style={{ textAlign: "right" }}>Date</span>
                    </div>
                    {[
                      { task: "Landing Page Redesign", project: "Ecommerce Website", status: "Completed", date: "12 May", statusColor: { bg: "#dcfce7", text: "#16a34a" } },
                      { task: "API Integration", project: "Mobile App", status: "In Progress", date: "10 May", statusColor: { bg: "#dbeafe", text: "#2563eb" } },
                      { task: "Dashboard Design", project: "CRM Dashboard", status: "Completed", date: "08 May", statusColor: { bg: "#dcfce7", text: "#16a34a" } },
                      { task: "User Flow Design", project: "Mobile App", status: "Completed", date: "07 May", statusColor: { bg: "#dcfce7", text: "#16a34a" } },
                      { task: "Wireframe Design", project: "Website Redesign", status: "Completed", date: "05 May", statusColor: { bg: "#dcfce7", text: "#16a34a" } },
                    ].map((row, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", padding: "14px 20px", borderBottom: i < 4 ? "1px solid #e5e7eb" : "none", fontSize: 14, alignItems: "center" }}>
                        <span style={{ fontWeight: 500, color: "#111827" }}>{row.task}</span>
                        <span style={{ color: "#6b7280" }}>{row.project}</span>
                        <span style={{ textAlign: "center" }}>
                          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500, background: row.statusColor.bg, color: row.statusColor.text }}>{row.status}</span>
                        </span>
                        <span style={{ textAlign: "right", color: "#6b7280" }}>{row.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Footer */}
            <div style={{ borderTop: "1px solid #e5e7eb", padding: "16px 32px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Generated by PMS</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Page 1 of 6</span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button className="er-cancel-btn" onClick={() => setShowReview(false)}>Cancel</button>
                <button className="er-export-btn" onClick={handleExport} disabled={fileFormat === "excel"} style={fileFormat === "excel" ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v8M4 6l4 4 4-4M2 14h12" />
                  </svg>
                  Report Download
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>,
    document.body
  );
}

export default MemberExportReport;
