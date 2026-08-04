/**
 * Dashboard - HR Management overview page.
 * Mirrors the Sidebar's five HR groups (Hiring, Workforce, Payroll,
 * Engagement, Insights) as scannable stat sections, plus a greeting
 * header and quick-create actions consistent with the Header bar.
 *
 * Design rationale (matches Sidebar/Header conventions):
 *  - Same section grouping + labels as the sidebar, so the mental model
 *    a user built scanning the nav carries straight into the dashboard
 *    (recognition over recall).
 *  - Each section card uses the same icon used for that module in the
 *    sidebar, reinforcing that "Hiring" here === "Hiring" there.
 *  - Numbers are the hero of each card (glanceable status), with a link
 *    into the relevant module for anyone who wants to act on it.
 *  - Uses the same CSS custom properties (--color-primary,
 *    --color-primary-bg, --color-border, --color-surface, etc.) already
 *    relied on by Header.jsx / Sidebar.css, so it inherits the app's
 *    light/dark theme automatically via ThemeContext.
 */

import { useEffect, useState } from "react";
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
} from "lucide-react";

import "./Admin.css";

/**
 * Section + card config. Icons/labels intentionally match HR_SECTIONS in
 * Sidebar.jsx so the two stay visually and semantically in sync.
 * `stat` keys map to fields expected from GET /dashboard/hrm-stats.
 */
const DASHBOARD_SECTIONS = [
  {
    label: "Hiring",
    cards: [
      { key: "open_positions", label: "Open Positions", icon: Briefcase, page: "hrm/recruitment", tone: "indigo" },
      { key: "applicants_in_pipeline", label: "Applicants in Pipeline", icon: Users, page: "hrm/recruitment", tone: "indigo" },
      { key: "offer_letters_pending", label: "Offer Letters Pending", icon: FileText, page: "hrm/offer-letters", tone: "indigo" },
    ],
  },
  {
    label: "Workforce",
    cards: [
      { key: "total_employees", label: "Total Employees", icon: Users, page: "hrm/documents", tone: "emerald" },
      { key: "present_today", label: "Present Today", icon: Calendar, page: "hrm/attendance", tone: "emerald" },
      { key: "on_leave_today", label: "On Leave Today", icon: Calendar, page: "hrm/attendance", tone: "amber" },
      { key: "reviews_due", label: "Performance Reviews Due", icon: TrendingUp, page: "hrm/performance", tone: "emerald" },
      { key: "assets_issued", label: "Assets Issued", icon: Briefcase, page: "hrm/assets", tone: "emerald" },
      { key: "documents_pending", label: "Documents Pending", icon: FileText, page: "hrm/documents", tone: "amber" },
    ],
  },
  {
    label: "Payroll",
    cards: [
      { key: "payroll_processed", label: "Payroll Processed", icon: CreditCard, page: "hrm/payroll", tone: "violet", isCount: true },
      { key: "payroll_total", label: "This Month's Payroll", icon: CreditCard, page: "hrm/payroll", tone: "violet", isCurrency: true },
      { key: "payslips_pending", label: "Payslips Pending", icon: CreditCard, page: "hrm/payroll", tone: "amber" },
    ],
  },
  {
    label: "Engagement",
    cards: [
      { key: "active_notices", label: "Active Notices", icon: Bell, page: "hrm/notice-board", tone: "sky" },
      { key: "ongoing_trainings", label: "Ongoing Trainings", icon: Award, page: "hrm/training", tone: "sky" },
      { key: "training_enrollments", label: "Training Enrollments", icon: Award, page: "hrm/training", tone: "sky" },
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

/** Formats a raw number as PKR currency, matching payroll conventions. */
const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(value || 0);

function HRMAdmin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState([]);
  const [birthdays, setBirthdays] = useState([]);

  const user = getUser() || { name: "there" };
  const firstName = (user.name || "there").split(" ")[0];

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
    <div className="hrm-dashboard-page">
      {/* ── Header ── */}
      <div className="dashboard-hero">
        <div className="dashboard-hero-main">
          <h1>
            {greeting}, {firstName} 👋
          </h1>
          <p>Here's what's happening across your HR operations today.</p>
        </div>

        <div className="dashboard-hero-actions">
          <Link to={rolePath("hrm/recruitment")} className="hero-btn hero-btn--primary">
            + Post Job
          </Link>
          <Link to={rolePath("hrm/attendance")} className="hero-btn hero-btn--secondary">
            View Punch Logs
          </Link>
        </div>
      </div>

      {/* ── Sectioned Stat Grid ── */}
      {DASHBOARD_SECTIONS.map((sec) => (
        <div key={sec.label} className="dashboard-section">
          <div className="dashboard-section-title">{sec.label}</div>
          <div className="dashboard-card-grid">
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
                  <div className="stat-card-header">
                    <span className="stat-card-label">{card.label}</span>
                    <span className="stat-card-icon">
                      <IconComp />
                    </span>
                  </div>
                  <div className="stat-card-value">{loading ? "…" : displayVal}</div>
                  <div className="stat-card-footer">
                    <span>View details</span>
                    <ChevronRight />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Insights: reports link + secondary widgets ── */}
      <div className="dashboard-section">
        <div className="dashboard-section-title">Insights</div>
        <div className="dashboard-insights-grid">

          <Link to={rolePath("hrm/reports")} className="insights-card insights-card--link">
            <div className="insights-card-header">
              <TrendingUp />
              <h4>HR Reports & Analytics</h4>
            </div>
            <p>Headcount trends, attrition, attendance and payroll summaries in one place.</p>
            <span className="insights-card-cta">Open reports <ChevronRight /></span>
          </Link>

          <div className="insights-card">
            <div className="insights-card-header">
              <Bell />
              <h4>Latest Notices</h4>
            </div>
            {notices.length === 0 ? (
              <p className="insights-empty">No notices posted yet.</p>
            ) : (
              <ul className="insights-list">
                {notices.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <Bell className="insights-list-icon" />
                    <span>{n.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="insights-card">
            <div className="insights-card-header">
              <Gift />
              <h4>Upcoming Birthdays</h4>
            </div>
            {birthdays.length === 0 ? (
              <p className="insights-empty">No birthdays in the next 7 days.</p>
            ) : (
              <ul className="insights-list">
                {birthdays.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <Gift className="insights-list-icon" />
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
