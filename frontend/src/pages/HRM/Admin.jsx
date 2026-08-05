import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API_URL from "../../config/api";
import { authToken, rolePath, getUser } from "../../utils/auth";
import {
  Briefcase,
  Users,
  FileText,
  Calendar,
  CreditCard,
  TrendingUp,
  Bell,
  Award,
  ChevronRight,
  Gift,
  Plus,
  Clock,
  AlertTriangle,
  Layers,
  Building2,
  CheckCircle2,
  Send,
  ShieldAlert,
} from "lucide-react";

import "./Admin.css";

const DASHBOARD_SECTIONS = [
  {
    label: "Hiring & Onboarding",
    cards: [
      { key: "open_positions", label: "Open Positions", icon: Briefcase, page: "hrm/recruitment", tone: "indigo", badge: "Hiring Open" },
      { key: "applicants_in_pipeline", label: "Applicants in Pipeline", icon: Users, page: "hrm/recruitment", tone: "indigo" },
      { key: "offer_letters_pending", label: "Offer Letters Pending", icon: FileText, page: "hrm/offer-letters", tone: "amber" },
    ],
  },
  {
    label: "Workforce & Attendance Operations",
    cards: [
      { key: "total_employees", label: "Total Workforce", icon: Users, page: "hrm/workforce", tone: "emerald" },
      { key: "present_today", label: "Present Today", icon: Calendar, page: "hrm/attendance?tab=attendance", tone: "emerald" },
      { key: "on_leave_today", label: "On Leave Today", icon: Calendar, page: "hrm/attendance?tab=attendance", tone: "amber" },
      { key: "reviews_due", label: "Performance Reviews Due", icon: TrendingUp, page: "hrm/performance", tone: "emerald" },
      { key: "assets_issued", label: "Assets / Equipment Issued", icon: Layers, page: "hrm/assets", tone: "emerald" },
      { key: "documents_pending", label: "Documents Pending", icon: FileText, page: "hrm/documents", tone: "amber" },
    ],
  },
  {
    label: "Payroll & Financial Claims",
    cards: [
      { key: "payroll_processed", label: "Payroll Batches Processed", icon: CreditCard, page: "hrm/payroll", tone: "violet", isCount: true },
      { key: "payroll_total", label: "This Month's Payroll Total", icon: CreditCard, page: "hrm/payroll", tone: "violet", isCurrency: true },
      { key: "payslips_pending", label: "Payslips Pending Review", icon: CreditCard, page: "hrm/payroll", tone: "amber" },
    ],
  },
  {
    label: "Engagement & Corporate Policy",
    cards: [
      { key: "active_notices", label: "Active Notice Announcements", icon: Bell, page: "hrm/notice-board", tone: "sky" },
      { key: "ongoing_trainings", label: "Ongoing Training Courses", icon: Award, page: "hrm/training", tone: "sky" },
      { key: "training_enrollments", label: "Active Enrollments", icon: Award, page: "hrm/training", tone: "sky" },
    ],
  },
];

const TONE_CLASS = {
  indigo: "stat-card--indigo",
  emerald: "stat-card--emerald",
  amber: "stat-card--amber",
  violet: "stat-card--violet",
  sky: "stat-card--sky",
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(value || 0);

function HRMAdmin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState([]);
  const [birthdays, setBirthdays] = useState([]);

  const currentUser = getUser() || { name: "Admin User" };
  const firstName = (currentUser.name || "Admin").split(" ")[0];

  const greeting = (() => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    return "Good evening";
  })();

  useEffect(() => {
    const token = authToken();
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/dashboard/hrm-stats`, { headers }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_URL}/hrm/notices`, { headers }).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([statsRes, noticesRes]) => {
        if (statsRes?.data) setStats(statsRes.data);
        if (noticesRes?.data) setNotices(Array.isArray(noticesRes.data) ? noticesRes.data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="hrm-dashboard">
      {/* HERO GREETING BANNER */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-main">
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Welcome to Techxaro Enterprise HR Operations &amp; Workforce Command Center.</p>
        </div>

        <div className="dashboard-hero-actions">
          <Link to={rolePath("hrm/recruitment")} className="hero-btn hero-btn--primary">
            <Plus size={16} /> Post Job Position
          </Link>
          <Link to={rolePath("hrm/attendance?tab=pending")} className="hero-btn hero-btn--secondary">
            <Send size={16} /> Member Requests Queue
          </Link>
          <Link to={rolePath("hrm/attendance?tab=attendance")} className="hero-btn hero-btn--secondary">
            <Clock size={16} /> Punch Logs
          </Link>
        </div>
      </div>

      {/* TOP LEVEL HIGHLIGHT METRICS GRID */}
      <div className="dashboard-top-metrics">
        <div className="top-metric-card">
          <div className="top-metric-header">
            <span>👥 Active Workforce</span>
            <Users size={18} color="var(--color-primary, #4f46e5)" />
          </div>
          <div className="top-metric-val">{loading ? "…" : stats?.total_employees || 0} Employees</div>
          <span className="top-metric-sub">Across all organization departments</span>
        </div>

        <div className="top-metric-card">
          <div className="top-metric-header">
            <span>🌴 Present Today</span>
            <Calendar size={18} color="#10b981" />
          </div>
          <div className="top-metric-val" style={{ color: "#10b981" }}>{loading ? "…" : stats?.present_today || 0} Present</div>
          <span className="top-metric-sub">{stats?.on_leave_today || 0} on approved leave today</span>
        </div>

        <div className="top-metric-card">
          <div className="top-metric-header">
            <span>⏳ Member Requests Queue</span>
            <AlertTriangle size={18} color="#f59e0b" />
          </div>
          <div className="top-metric-val" style={{ color: "#d97706" }}>{loading ? "…" : (stats?.documents_pending || 0) + (stats?.offer_letters_pending || 0)} Action Needed</div>
          <span className="top-metric-sub">Leaves, Advances &amp; Corrections</span>
        </div>

        <div className="top-metric-card">
          <div className="top-metric-header">
            <span>💵 Monthly Payroll Total</span>
            <CreditCard size={18} color="#8b5cf6" />
          </div>
          <div className="top-metric-val" style={{ color: "#8b5cf6" }}>
            {loading ? "…" : formatCurrency(stats?.payroll_total || 0)}
          </div>
          <span className="top-metric-sub">{stats?.payslips_pending || 0} payslips pending generation</span>
        </div>
      </div>

      {/* SECTIONED MODULE STAT GRIDS */}
      {DASHBOARD_SECTIONS.map((sec) => (
        <div key={sec.label} className="dashboard-section">
          <div className="dashboard-section-title">{sec.label}</div>
          <div className="dashboard-stat-grid">
            {sec.cards.map((card) => {
              const IconComp = card.icon;
              const rawVal = stats ? stats[card.key] : null;
              let displayVal = "—";
              if (!loading && rawVal !== null && rawVal !== undefined) {
                if (card.isCurrency) displayVal = formatCurrency(rawVal);
                else displayVal = String(rawVal);
              }

              return (
                <Link
                  key={card.key}
                  to={rolePath(card.page)}
                  className={`stat-card ${TONE_CLASS[card.tone] || ""}`}
                >
                  <div className="stat-card-icon">
                    <IconComp size={20} />
                  </div>
                  <div className="stat-card-body">
                    <div className="stat-card-value">{loading ? "…" : displayVal}</div>
                    <div className="stat-card-label">{card.label}</div>
                  </div>
                  <div className="stat-card-arrow">
                    <ChevronRight size={16} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* INSIGHTS & BULLETIN BOARD */}
      <div className="dashboard-section">
        <div className="dashboard-section-title">Insights &amp; Executive Bulletin</div>
        <div className="dashboard-insights-grid">
          <Link to={rolePath("hrm/reports")} className="insights-card insights-card--link">
            <div className="insights-card-header">
              <TrendingUp size={20} />
              <h4>HR Reports &amp; Analytics Command</h4>
            </div>
            <p>Headcount trends, attendance ratios, leave utilization, and payroll cost summaries in one place.</p>
            <span className="insights-card-cta">
              Open Analytics Reports <ChevronRight size={14} />
            </span>
          </Link>

          <div className="insights-card">
            <div className="insights-card-header">
              <Bell size={20} />
              <h4>Company Notice Announcements</h4>
            </div>
            {notices.length === 0 ? (
              <p className="insights-empty">No active notices posted yet.</p>
            ) : (
              <ul className="insights-list">
                {notices.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <Bell className="insights-list-icon" size={15} />
                    <span style={{ fontWeight: "600" }}>{n.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="insights-card">
            <div className="insights-card-header">
              <Gift size={20} />
              <h4>Upcoming Celebrations &amp; Birthdays</h4>
            </div>
            {birthdays.length === 0 ? (
              <p className="insights-empty">No celebrations scheduled for the next 7 days.</p>
            ) : (
              <ul className="insights-list">
                {birthdays.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <Gift className="insights-list-icon" size={15} />
                    <span>{b.name}</span>
                    <span className="insights-list-meta">{b.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HRMAdmin;
