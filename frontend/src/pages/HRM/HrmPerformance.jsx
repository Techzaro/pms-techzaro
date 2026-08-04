import React, { useState, useEffect, useCallback, useMemo } from "react";
import DashboardLayout from "../../components/layout/hrm/DashboardLayout";
import Breadcrumb from "../../components/Breadcrumb";
import {
  TrendingUp,
  Award,
  CheckCircle2,
  Plus,
  X,
  Search,
  Filter,
  Edit3,
  FileText,
  RefreshCw,
  Sliders,
  Users,
  Calendar,
  Clock,
} from "lucide-react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import "./Attendance.css";

async function apiRequest(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function HrmPerformance() {
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("utilization");

  // Data States
  const [userMatrix, setUserMatrix] = useState([]);
  const [goals, setGoals] = useState([]);
  const [appraisals, setAppraisals] = useState([]);
  const [topPerformers, setTopPerformers] = useState([]);
  const [kpis, setKpis] = useState({
    total_financial_value: 0,
    avg_performance_score: 4.5,
    top_rated_count: 0,
    promotion_eligible_count: 0,
  });

  // Filters
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");

  // Modals
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [updateGoalModalOpen, setUpdateGoalModalOpen] = useState(false);
  const [appraisalModalOpen, setAppraisalModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [selectedAppraisal, setSelectedAppraisal] = useState(null);
  const [activeGoalToUpdate, setActiveGoalToUpdate] = useState(null);

  // New Goal Form
  const [goalUserId, setGoalUserId] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalCategory, setGoalCategory] = useState("Technical");
  const [goalTarget, setGoalTarget] = useState(100);
  const [goalWeightage, setGoalWeightage] = useState(25);
  const [goalDueDate, setGoalDueDate] = useState("");

  // Update Goal Progress Form
  const [updateGoalValue, setUpdateGoalValue] = useState(0);
  const [updateGoalStatus, setUpdateGoalStatus] = useState("On Track");

  // Appraisal Form
  const [appraisalUserId, setAppraisalUserId] = useState("");
  const [periodName, setPeriodName] = useState("Q3 2026");
  const [techScore, setTechScore] = useState(4.5);
  const [timeScore, setTimeScore] = useState(4.5);
  const [collabScore, setCollabScore] = useState(4.5);
  const [probScore, setProbScore] = useState(4.0);
  const [commScore, setCommScore] = useState(4.5);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [promotionEligible, setPromotionEligible] = useState(true);

  // Toast Helper
  const notify = (msg, kind = "success") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    document.title = "Performance & Evaluation Suite | TechXaro HRM";
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest("/hrm/performance/summary").catch(() => ({
        success: false,
        userMatrix: [],
        goals: [],
        appraisals: [],
        topPerformers: [],
        kpis: {},
      }));

      if (res && res.userMatrix) {
        setUserMatrix(res.userMatrix || []);
        setGoals(res.goals || []);
        setAppraisals(res.appraisals || []);
        setTopPerformers(res.topPerformers || []);
        setKpis(res.kpis || {});
      }
    } catch (err) {
      notify(err.message || "Failed to load performance metrics.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Live Score Calculator
  const liveOverallScore = useMemo(() => {
    const avg =
      (Number(techScore) +
        Number(timeScore) +
        Number(collabScore) +
        Number(probScore) +
        Number(commScore)) /
      5.0;
    return Math.round(avg * 10) / 10;
  }, [techScore, timeScore, collabScore, probScore, commScore]);

  const liveRatingTier = useMemo(() => {
    if (liveOverallScore >= 4.5) return "🌟 Exceeds Expectations";
    if (liveOverallScore >= 3.5) return "✅ Meets Expectations";
    if (liveOverallScore >= 2.5) return "⚠️ Needs Improvement";
    return "🚨 Unsatisfactory / PIP Required";
  }, [liveOverallScore]);

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return userMatrix.filter((u) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q));

      const matchesDept = deptFilter === "All" || u.department === deptFilter;
      return matchesSearch && matchesDept;
    });
  }, [userMatrix, search, deptFilter]);

  // Goal Submission
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/hrm/performance/goals", {
        method: "POST",
        body: JSON.stringify({
          user_id: goalUserId,
          goal_title: goalTitle,
          category: goalCategory,
          target_value: Number(goalTarget),
          current_value: 0,
          weightage: Number(goalWeightage),
          due_date: goalDueDate || null,
        }),
      });

      notify(res.message || "OKR performance goal created successfully ✔");
      setGoalModalOpen(false);
      loadData(true);
    } catch (err) {
      notify(err.message || "Failed to create goal.", "error");
    }
  };

  // Update Goal Progress Handler
  const handleUpdateGoalProgress = async (e) => {
    e.preventDefault();
    if (!activeGoalToUpdate) return;
    try {
      const res = await apiRequest(
        `/hrm/performance/goals/${activeGoalToUpdate.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            current_value: Number(updateGoalValue),
            status:
              Number(updateGoalValue) >= activeGoalToUpdate.target_value
                ? "Completed"
                : updateGoalStatus,
          }),
        }
      );

      notify(res.message || "Goal progress updated successfully ✔");
      setUpdateGoalModalOpen(false);
      loadData(true);
    } catch (err) {
      notify(err.message || "Failed to update goal progress.", "error");
    }
  };

  // Appraisal Submission
  const handleSubmitAppraisal = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest("/hrm/performance/appraisals", {
        method: "POST",
        body: JSON.stringify({
          user_id: appraisalUserId,
          period_name: periodName,
          technical_score: Number(techScore),
          timeliness_score: Number(timeScore),
          collaboration_score: Number(collabScore),
          problem_solving_score: Number(probScore),
          communication_score: Number(commScore),
          feedback_notes: feedbackNotes,
          promotion_eligible: promotionEligible,
        }),
      });

      notify(res.message || "360° Appraisal submitted successfully ✔");
      setAppraisalModalOpen(false);
      loadData(true);
    } catch (err) {
      notify(err.message || "Failed to submit appraisal.", "error");
    }
  };

  return (
    
      <main className="att-page" id="performance-eval-page">
        {toast && (
          <div className={`att-toast att-toast--${toast.kind}`} role="alert">
            {toast.message}
          </div>
        )}

        {/* BREADCRUMB */}
        <Breadcrumb items={[{ label: "Enterprise HRM", path: "/admin/hrm/performance" }, { label: "Performance & Evaluation" }]} />

        {/* COMMAND CENTER STYLE HEADER */}
        <header className="att-header">
          <div>
            <div className="att-title-row">
              <h1>Enterprise Performance &amp; Evaluation Center</h1>
              <span className="att-live-pill">
                <TrendingUp size={14} /> 360° Live Evaluation Active
              </span>
            </div>
            <p>
              Stipend-based financial ROI utilization, OKR goal tracking, 360° manager appraisals, and top performer rankings.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              className="att-btn att-btn--primary"
              onClick={() => {
                setGoalUserId(userMatrix[0]?.id || "");
                setGoalModalOpen(true);
              }}
            >
              <Plus size={18} /> Assign OKR Goal
            </button>

            <button
              className="att-btn"
              style={{ background: "#166534", color: "#ffffff" }}
              onClick={() => {
                setAppraisalUserId(userMatrix[0]?.id || "");
                setAppraisalModalOpen(true);
              }}
            >
              <Award size={18} /> Conduct 360° Appraisal
            </button>

            <button
              className="att-btn"
              style={{ background: "#475569", color: "#ffffff" }}
              onClick={() => loadData()}
            >
              <RefreshCw size={18} /> Refresh Data
            </button>
          </div>
        </header>

        {/* ATTENDANCE PAGE STYLE STATS GRID */}
        <section
          className="att-stats-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Financial Value Generated</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#0082ff" }}>
              💰 ${(kpis.total_financial_value || 0).toLocaleString()}
            </h3>
            <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>Stipends &amp; Billable ROI</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Average Org Appraisal</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#166534" }}>
              ⭐️ {kpis.avg_performance_score || 4.5} / 5.0
            </h3>
            <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>360 Rating Score</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Top Overachievers</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#b45309" }}>
              🏆 {kpis.top_rated_count || 0} Staff
            </h3>
            <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>Rating &ge; 4.5 Stars</span>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
            <span style={{ fontSize: "11px", color: "#64748b" }}>Promotion Eligible</span>
            <h3 style={{ margin: "2px 0 0", fontSize: "20px", color: "#7c3aed" }}>
              🚀 {kpis.promotion_eligible_count || 0} Staff
            </h3>
            <span style={{ fontSize: "10.5px", color: "#94a3b8" }}>Tier &amp; Salary Increase</span>
          </div>
        </section>

        {/* MULTI-TAB NAVIGATION BAR (MATCHING ATTENDANCE PAGE) */}
        <nav className="att-tabs-nav">
          <button
            className={`att-tab-btn ${activeTab === "utilization" ? "active" : ""}`}
            onClick={() => setActiveTab("utilization")}
          >
            <TrendingUp size={18} /> Stipend &amp; Utilization Intelligence
          </button>

          <button
            className={`att-tab-btn ${activeTab === "okrs" ? "active" : ""}`}
            onClick={() => setActiveTab("okrs")}
          >
            <Award size={18} /> OKRs &amp; Performance Goals ({goals.length})
          </button>

          <button
            className={`att-tab-btn ${activeTab === "appraisals" ? "active" : ""}`}
            onClick={() => setActiveTab("appraisals")}
          >
            <Award size={18} /> 360° Appraisals ({appraisals.length})
          </button>

          <button
            className={`att-tab-btn ${activeTab === "radar" ? "active" : ""}`}
            onClick={() => setActiveTab("radar")}
          >
            <Award size={18} /> Org Competency Radar
          </button>

          <button
            className={`att-tab-btn ${activeTab === "top" ? "active" : ""}`}
            onClick={() => setActiveTab("top")}
          >
            <Award size={18} /> Top Performer Leaderboard
          </button>
        </nav>

        {/* TAB 1: STIPEND-BASED COST UTILIZATION INTELLIGENCE */}
        {activeTab === "utilization" && (
          <section className="att-card">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justify: "space-between",
                gap: "12px",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  alignItems: "center",
                  flex: 1,
                  minWidth: "260px",
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "8px 14px",
                }}
              >
                <Search size={18} color="#64748b" />
                <input
                  type="text"
                  placeholder="Search employee name, email, department..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ border: "none", outline: "none", width: "100%", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                <Filter size={18} color="#64748b" />
                <select
                  className="att-input"
                  style={{ padding: "8px 12px", width: "auto" }}
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                >
                  <option value="All">All Departments</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Product">Product &amp; Design</option>
                  <option value="Marketing">Marketing &amp; Sales</option>
                  <option value="Operations">Operations &amp; HR</option>
                </select>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px", color: "#475569" }}>Employee &amp; Role</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Offer Stipend</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Hourly Cost Rate</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Monthly Logged Hours</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Financial Value Generated</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Utilization Rate %</th>
                    <th style={{ padding: "12px", color: "#475569" }}>360 Rating &amp; Status</th>
                    <th style={{ padding: "12px", color: "#475569", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", fontWeight: "700", color: "#0f172a" }}>
                        {u.name} <br />
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "400" }}>
                          {u.department} • {u.designation}
                        </span>
                      </td>

                      <td style={{ padding: "12px", fontWeight: "700", color: "#166534" }}>
                        ${u.stipend.toLocaleString()}/mo
                      </td>

                      <td style={{ padding: "12px", color: "#334155" }}>${u.hourly_rate}/hr</td>

                      <td style={{ padding: "12px" }}>
                        <strong>{u.worked_hours} hrs</strong> / 176h Target
                      </td>

                      <td style={{ padding: "12px", fontWeight: "700", color: "#0082ff" }}>
                        ${u.financial_value.toLocaleString()}
                      </td>

                      <td style={{ padding: "12px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: u.utilization_rate >= 85 ? "#f0fdf4" : "#fffbeb",
                            color: u.utilization_rate >= 85 ? "#166534" : "#b45309",
                          }}
                        >
                          {u.utilization_rate}%
                        </span>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: "700", color: "#d97706" }}>
                          <Award size={15} /> {u.overall_score} / 5.0
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{u.rating_tier}</div>
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "#0082ff",
                            color: "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setAppraisalUserId(u.id);
                            setAppraisalModalOpen(true);
                          }}
                        >
                          Appraise
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                        No employee performance records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: OKRS & PERFORMANCE GOALS ENGINE */}
        {activeTab === "okrs" && (
          <section className="att-card">
            <div
              style={{
                display: "flex",
                justify: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <Award size={20} color="#0082ff" /> Quarterly &amp; Monthly Performance OKR Goals
              </h2>

              <button
                className="att-btn att-btn--primary"
                onClick={() => {
                  setGoalUserId(userMatrix[0]?.id || "");
                  setGoalModalOpen(true);
                }}
              >
                <Plus size={16} /> Assign New Goal
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              {goals.map((g) => {
                const pct = Math.min(
                  100,
                  Math.round((g.current_value / Math.max(1, g.target_value)) * 100)
                );
                return (
                  <div
                    key={g.id}
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justify: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                        }}
                      >
                        {g.category}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: g.status === "Completed" ? "#166534" : "#b45309",
                        }}
                      >
                        {g.status}
                      </span>
                    </div>

                    <h3 style={{ margin: "0 0 6px", fontSize: "15px", color: "#0f172a" }}>
                      {g.goal_title}
                    </h3>
                    <p style={{ margin: "0 0 10px", fontSize: "12px", color: "#64748b" }}>
                      Assigned to: <strong>{g.user_name}</strong> ({g.department})
                    </p>

                    <div style={{ marginBottom: "8px" }}>
                      <div
                        style={{
                          display: "flex",
                          justify: "space-between",
                          fontSize: "11px",
                          color: "#475569",
                          marginBottom: "4px",
                        }}
                      >
                        <span>Progress: {pct}%</span>
                        <strong>
                          {g.current_value} / {g.target_value} {g.unit}
                        </strong>
                      </div>

                      <div
                        style={{
                          width: "100%",
                          background: "#e2e8f0",
                          height: "8px",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            background: g.status === "Completed" ? "#16a34a" : "#0082ff",
                            height: "100%",
                            borderRadius: "4px",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: "11px",
                        color: "#94a3b8",
                        display: "flex",
                        justify: "space-between",
                        alignItems: "center",
                        marginTop: "10px",
                      }}
                    >
                      <span>Weightage: {g.weightage}%</span>
                      <button
                        style={{
                          padding: "3px 8px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          borderRadius: "4px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        onClick={() => {
                          setActiveGoalToUpdate(g);
                          setUpdateGoalValue(g.current_value);
                          setUpdateGoalStatus(g.status);
                          setUpdateGoalModalOpen(true);
                        }}
                      >
                        <Edit3 size={14} /> Update Progress
                      </button>
                    </div>
                  </div>
                );
              })}
              {goals.length === 0 && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    textAlign: "center",
                    padding: "32px",
                    color: "#94a3b8",
                  }}
                >
                  No active goals assigned yet. Click "Assign New Goal" above to create one.
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: 360-DEGREE APPRAISALS */}
        {activeTab === "appraisals" && (
          <section className="att-card">
            <div
              style={{
                display: "flex",
                justify: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h2 className="att-card-title" style={{ margin: 0 }}>
                <Award size={20} color="#0082ff" /> 360° Manager &amp; Peer Performance Reviews
              </h2>

              <button
                className="att-btn"
                style={{ background: "#166534", color: "#ffffff" }}
                onClick={() => {
                  setAppraisalUserId(userMatrix[0]?.id || "");
                  setAppraisalModalOpen(true);
                }}
              >
                <Award size={16} /> Appraise Employee
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ padding: "12px", color: "#475569" }}>Employee Name</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Period</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Category Scores</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Overall Rating</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Feedback Remarks</th>
                    <th style={{ padding: "12px", color: "#475569" }}>Promotion Track</th>
                    <th style={{ padding: "12px", color: "#475569", textAlign: "right" }}>Scorecard</th>
                  </tr>
                </thead>
                <tbody>
                  {appraisals.map((a) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px", fontWeight: "700" }}>
                        {a.user_name} <br />
                        <span style={{ fontSize: "11px", color: "#64748b", fontWeight: "400" }}>
                          {a.department}
                        </span>
                      </td>

                      <td style={{ padding: "12px", fontWeight: "600", color: "#334155" }}>
                        {a.period_name}
                      </td>

                      <td style={{ padding: "12px", fontSize: "11px", color: "#475569" }}>
                        <div>Tech: <strong>{a.technical_score}</strong> • Time: <strong>{a.timeliness_score}</strong></div>
                        <div>Collab: <strong>{a.collaboration_score}</strong> • Prob: <strong>{a.problem_solving_score}</strong></div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        <div style={{ fontWeight: "700", color: "#d97706", fontSize: "14px" }}>
                          ⭐️ {a.overall_score} / 5.0
                        </div>
                        <span
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "10.5px",
                            fontWeight: "700",
                            background: "#fef3c7",
                            color: "#92400e",
                          }}
                        >
                          {a.rating_tier}
                        </span>
                      </td>

                      <td style={{ padding: "12px", color: "#475569", maxWidth: "260px" }}>
                        <div
                          style={{
                            background: "#f8fafc",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            border: "1px solid #e2e8f0",
                            fontSize: "12px",
                          }}
                        >
                          "{a.feedback_notes}"
                        </div>
                      </td>

                      <td style={{ padding: "12px" }}>
                        {a.promotion_eligible ? (
                          <span
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: "700",
                              background: "#dcfce7",
                              color: "#166534",
                            }}
                          >
                            🚀 Eligible for Promotion
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#94a3b8" }}>Standard Track</span>
                        )}
                      </td>

                      <td style={{ padding: "12px", textAlign: "right" }}>
                        <button
                          style={{
                            padding: "4px 10px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "#f1f5f9",
                            color: "#1e293b",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                          onClick={() => {
                            setSelectedAppraisal(a);
                            setPrintModalOpen(true);
                          }}
                        >
                          <FileText size={14} /> Scorecard
                        </button>
                      </td>
                    </tr>
                  ))}
                  {appraisals.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
                        No appraisal review records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 4: ORG COMPETENCY RADAR */}
        {activeTab === "radar" && (
          <section className="att-card">
            <h2 className="att-card-title" style={{ marginBottom: "16px" }}>
              <Award size={20} color="#7c3aed" /> Organization Skill Competency Breakdown
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {[
                { label: "Technical Competency", score: 4.6, color: "#166534" },
                { label: "Timeliness & Punch Punctuality", score: 4.4, color: "#0082ff" },
                { label: "Team Collaboration & Support", score: 4.8, color: "#7c3aed" },
                { label: "Problem Solving & Architecture", score: 4.5, color: "#b45309" },
                { label: "Communication & Leadership", score: 4.3, color: "#dc2626" },
              ].map((skill, i) => (
                <div
                  key={i}
                  style={{
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justify: "space-between",
                      fontSize: "13px",
                      fontWeight: "700",
                      marginBottom: "8px",
                      color: skill.color,
                    }}
                  >
                    <span>{skill.label}</span>
                    <span>{skill.score} / 5.0</span>
                  </div>

                  <div
                    style={{
                      width: "100%",
                      background: "#e2e8f0",
                      height: "8px",
                      borderRadius: "4px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${(skill.score / 5.0) * 100}%`,
                        background: skill.color,
                        height: "100%",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 5: TOP PERFORMER LEADERBOARD */}
        {activeTab === "top" && (
          <section className="att-card">
            <h2 className="att-card-title" style={{ marginBottom: "16px" }}>
              <Award size={20} color="#d97706" /> Top Financial Yield &amp; High Performer Rankings
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "16px",
              }}
            >
              {topPerformers.map((tp, idx) => (
                <div
                  key={tp.id}
                  style={{
                    background: idx === 0 ? "#fffbeb" : "#f8fafc",
                    border: idx === 0 ? "2px solid #fde68a" : "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "16px",
                    position: "relative",
                  }}
                >
                  <div style={{ position: "absolute", top: "12px", right: "12px", fontSize: "20px" }}>
                    {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "⭐️"}
                  </div>

                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>
                    RANK #{idx + 1}
                  </div>
                  <h3 style={{ margin: "4px 0 2px", color: "#0f172a", fontSize: "16px" }}>
                    {tp.name}
                  </h3>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>
                    {tp.department} • {tp.designation}
                  </div>

                  <div
                    style={{
                      background: "#ffffff",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                      fontSize: "12px",
                    }}
                  >
                    <div>
                      💰 Financial Yield:{" "}
                      <strong style={{ color: "#0082ff" }}>
                        ${tp.financial_value.toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      ⚡ Utilization Rate: <strong>{tp.utilization_rate}%</strong>
                    </div>
                    <div>
                      ⭐️ Rating Score:{" "}
                      <strong style={{ color: "#d97706" }}>{tp.overall_score} / 5.0</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MODAL: ASSIGN OKR GOAL */}
        {goalModalOpen && (
          <div className="att-modal-overlay" onClick={() => setGoalModalOpen(false)}>
            <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
              <div className="att-modal-header">
                <h3>Assign Performance OKR Goal</h3>
                <button
                  style={{ border: "none", background: "none", cursor: "pointer" }}
                  onClick={() => setGoalModalOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateGoal}>
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Select Employee</label>
                    <select
                      className="att-input"
                      value={goalUserId}
                      onChange={(e) => setGoalUserId(e.target.value)}
                      required
                    >
                      {userMatrix.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Goal Title / OKR Target</label>
                    <input
                      type="text"
                      className="att-input"
                      placeholder="e.g. Reduce System Latency by 30%"
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Category</label>
                      <select
                        className="att-input"
                        value={goalCategory}
                        onChange={(e) => setGoalCategory(e.target.value)}
                      >
                        <option value="Technical">Technical</option>
                        <option value="Productivity">Productivity</option>
                        <option value="Quality">Quality</option>
                        <option value="Leadership">Leadership</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Target Value</label>
                      <input
                        type="number"
                        className="att-input"
                        value={goalTarget}
                        onChange={(e) => setGoalTarget(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Weightage %</label>
                      <input
                        type="number"
                        className="att-input"
                        value={goalWeightage}
                        onChange={(e) => setGoalWeightage(e.target.value)}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Due Date</label>
                      <input
                        type="date"
                        className="att-input"
                        value={goalDueDate}
                        onChange={(e) => setGoalDueDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                  <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setGoalModalOpen(false)}>Cancel</button>
                  <button type="submit" className="att-btn att-btn--primary">Assign Goal</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: UPDATE GOAL PROGRESS SLIDER */}
        {updateGoalModalOpen && activeGoalToUpdate && (
          <div className="att-modal-overlay" onClick={() => setUpdateGoalModalOpen(false)}>
            <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
              <div className="att-modal-header">
                <h3>Update Goal Progress</h3>
                <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setUpdateGoalModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateGoalProgress}>
                <div style={{ padding: "16px" }}>
                  <h4 style={{ margin: "0 0 4px", color: "#0f172a" }}>{activeGoalToUpdate.goal_title}</h4>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "14px" }}>
                    Target: {activeGoalToUpdate.target_value} {activeGoalToUpdate.unit}
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "6px" }}>
                      Current Progress Value: <strong>{updateGoalValue}</strong> / {activeGoalToUpdate.target_value}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max={activeGoalToUpdate.target_value}
                      value={updateGoalValue}
                      onChange={(e) => setUpdateGoalValue(e.target.value)}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#475569", display: "block", marginBottom: "4px" }}>Status</label>
                    <select
                      className="att-input"
                      value={updateGoalStatus}
                      onChange={(e) => setUpdateGoalStatus(e.target.value)}
                    >
                      <option value="On Track">On Track</option>
                      <option value="At Risk">At Risk</option>
                      <option value="Behind">Behind</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                  <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setUpdateGoalModalOpen(false)}>Cancel</button>
                  <button type="submit" className="att-btn att-btn--primary">Save Progress</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CONDUCT 360 APPRAISAL */}
        {appraisalModalOpen && (
          <div className="att-modal-overlay" onClick={() => setAppraisalModalOpen(false)}>
            <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
              <div className="att-modal-header" style={{ borderTop: "4px solid #166534" }}>
                <h3>Conduct 360° Performance Appraisal</h3>
                <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setAppraisalModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitAppraisal}>
                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Select Employee</label>
                      <select
                        className="att-input"
                        value={appraisalUserId}
                        onChange={(e) => setAppraisalUserId(e.target.value)}
                        required
                      >
                        {userMatrix.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: "12px", color: "#475569" }}>Appraisal Period</label>
                      <input
                        type="text"
                        className="att-input"
                        value={periodName}
                        onChange={(e) => setPeriodName(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* LIVE CALCULATED BANNER */}
                  <div
                    style={{
                      background: "#f0fdf4",
                      border: "1px solid #bbf7d0",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      display: "flex",
                      justify: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "11px", color: "#166534" }}>LIVE CALCULATED OVERALL SCORE:</span>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: "#d97706" }}>
                        ⭐️ {liveOverallScore} / 5.0
                      </div>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "700", background: "#fef3c7", color: "#92400e" }}>
                      {liveRatingTier}
                    </span>
                  </div>

                  <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
                    <label style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a", display: "block", marginBottom: "8px" }}>
                      Rating Categories (1.0 to 5.0 Stars):
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px" }}>
                      <div>
                        <label>Technical Competency: <strong>{techScore}</strong></label>
                        <input
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={techScore}
                          onChange={(e) => setTechScore(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div>
                        <label>Timeliness &amp; Punching: <strong>{timeScore}</strong></label>
                        <input
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={timeScore}
                          onChange={(e) => setTimeScore(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div>
                        <label>Team Collaboration: <strong>{collabScore}</strong></label>
                        <input
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={collabScore}
                          onChange={(e) => setCollabScore(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>

                      <div>
                        <label>Problem Solving: <strong>{probScore}</strong></label>
                        <input
                          type="range"
                          min="1.0"
                          max="5.0"
                          step="0.1"
                          value={probScore}
                          onChange={(e) => setProbScore(e.target.value)}
                          style={{ width: "100%" }}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: "12px", color: "#475569" }}>Manager Feedback Remarks</label>
                    <textarea
                      className="att-input"
                      rows="3"
                      style={{ width: "100%", padding: "8px" }}
                      value={feedbackNotes}
                      onChange={(e) => setFeedbackNotes(e.target.value)}
                      placeholder="Write appraisal evaluation remarks..."
                      required
                    />
                  </div>

                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", fontWeight: "600", color: "#166534" }}>
                    <input
                      type="checkbox"
                      checked={promotionEligible}
                      onChange={(e) => setPromotionEligible(e.target.checked)}
                    />
                    🚀 Mark Employee Eligible for Promotion / Salary Increase
                  </label>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
                  <button type="button" className="att-btn" style={{ background: "#f1f5f9", color: "#334155" }} onClick={() => setAppraisalModalOpen(false)}>Cancel</button>
                  <button type="submit" className="att-btn" style={{ background: "#166534", color: "#fff" }}>Submit Appraisal Review</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: PRINTABLE SCORECARD REPORT */}
        {printModalOpen && selectedAppraisal && (
          <div className="att-modal-overlay" onClick={() => setPrintModalOpen(false)}>
            <div className="att-modal-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "560px" }}>
              <div className="att-modal-header">
                <h3>Official Appraisal Scorecard</h3>
                <button style={{ border: "none", background: "none", cursor: "pointer" }} onClick={() => setPrintModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #e2e8f0", paddingBottom: "12px", marginBottom: "16px" }}>
                  <div>
                    <h2 style={{ margin: 0, color: "#0f172a" }}>{selectedAppraisal.user_name}</h2>
                    <span style={{ fontSize: "12px", color: "#64748b" }}>{selectedAppraisal.department} • {selectedAppraisal.period_name}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "#d97706" }}>⭐️ {selectedAppraisal.overall_score} / 5.0</div>
                    <span style={{ fontSize: "11px", fontWeight: "700", color: "#166534" }}>{selectedAppraisal.rating_tier}</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12.5px", marginBottom: "16px" }}>
                  <div>Technical Competency: <strong>{selectedAppraisal.technical_score} / 5.0</strong></div>
                  <div>Timeliness &amp; Punching: <strong>{selectedAppraisal.timeliness_score} / 5.0</strong></div>
                  <div>Team Collaboration: <strong>{selectedAppraisal.collaboration_score} / 5.0</strong></div>
                  <div>Problem Solving: <strong>{selectedAppraisal.problem_solving_score} / 5.0</strong></div>
                </div>

                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "12px", fontSize: "12.5px", marginBottom: "16px" }}>
                  <strong>Manager Remarks:</strong>
                  <p style={{ margin: "4px 0 0", color: "#334155" }}>"{selectedAppraisal.feedback_notes}"</p>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <button
                    className="att-btn att-btn--primary"
                    onClick={() => window.print()}
                  >
                    Print Scorecard PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
  
  );
}
