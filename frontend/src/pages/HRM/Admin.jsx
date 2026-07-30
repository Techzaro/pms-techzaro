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
  MdWork,
  MdDescription,
  MdOutlineDescription,
  MdEventAvailable,
  MdAccountBalanceWallet,
  MdTrendingUp,
  MdCampaign,
  MdInventory2,
  MdAnalytics,
  MdSchool,
  MdGroups,
  MdArrowForward,
  MdCake,
  MdNotifications,
} from "react-icons/md";

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
      { key: "open_positions", label: "Open Positions", icon: MdWork, page: "hrm/recruitment", tone: "indigo" },
      { key: "applicants_in_pipeline", label: "Applicants in Pipeline", icon: MdGroups, page: "hrm/recruitment", tone: "indigo" },
      { key: "offer_letters_pending", label: "Offer Letters Pending", icon: MdDescription, page: "hrm/offer-letters", tone: "indigo" },
    ],
  },
  {
    label: "Workforce",
    cards: [
      { key: "total_employees", label: "Total Employees", icon: MdGroups, page: "hrm/documents", tone: "emerald" },
      { key: "present_today", label: "Present Today", icon: MdEventAvailable, page: "hrm/attendance", tone: "emerald" },
      { key: "on_leave_today", label: "On Leave Today", icon: MdEventAvailable, page: "hrm/attendance", tone: "amber" },
      { key: "reviews_due", label: "Performance Reviews Due", icon: MdTrendingUp, page: "hrm/performance", tone: "emerald" },
      { key: "assets_issued", label: "Assets Issued", icon: MdInventory2, page: "hrm/assets", tone: "emerald" },
      { key: "documents_pending", label: "Documents Pending", icon: MdOutlineDescription, page: "hrm/documents", tone: "amber" },
    ],
  },
  {
    label: "Payroll",
    cards: [
      { key: "payroll_processed", label: "Payroll Processed", icon: MdAccountBalanceWallet, page: "hrm/payroll", tone: "violet", isCount: true },
      { key: "payroll_total", label: "This Month's Payroll", icon: MdAccountBalanceWallet, page: "hrm/payroll", tone: "violet", isCurrency: true },
      { key: "payslips_pending", label: "Payslips Pending", icon: MdAccountBalanceWallet, page: "hrm/payroll", tone: "amber" },
    ],
  },
  {
    label: "Engagement",
    cards: [
      { key: "active_notices", label: "Active Notices", icon: MdCampaign, page: "hrm/notice-board", tone: "sky" },
      { key: "ongoing_trainings", label: "Ongoing Trainings", icon: MdSchool, page: "hrm/training", tone: "sky" },
      { key: "training_enrollments", label: "Training Enrollments", icon: MdSchool, page: "hrm/training", tone: "sky" },
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
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  })();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  useEffect(() => {
    const token = authToken();
    if (!token) {
      setLoading(false);
      return;
    }
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };

    // Expected shape: GET /dashboard/hrm-stats -> { ...card keys above }
    fetch(`${API_URL}/dashboard/hrm-stats`, { headers, skipLoader: true })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setStats(data || {}))
      .catch(() => setStats({}))
      .finally(() => setLoading(false));

    // Expected shape: GET /hrm/notice-board?limit=4 -> { data: [{id, title, posted_at}] }
    fetch(`${API_URL}/hrm/notice-board?limit=4`, { headers, skipLoader: true })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setNotices(data?.data || data || []))
      .catch(() => setNotices([]));

    // Expected shape: GET /hrm/employees/upcoming-birthdays -> { data: [{id, name, date}] }
    fetch(`${API_URL}/hrm/employees/upcoming-birthdays`, { headers, skipLoader: true })
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setBirthdays(data?.data || data || []))
      .catch(() => setBirthdays([]));
  }, []);

  /** Renders the value for a card: currency, count, or "—" while loading. */
  const renderValue = (card) => {
    if (loading) return <span className="stat-card-skeleton" />;
    const raw = stats?.[card.key];
    if (raw === undefined || raw === null) return "—";
    if (card.isCurrency) return formatCurrency(raw);
    return raw;
  };

  return (
    <div className="hrm-dashboard">

      {/* ── Greeting header ── */}
      <div className="dashboard-header">
        <div>
          <h1>{greeting}, {firstName} 👋</h1>
          <p>{today} · Here's what's happening across your workforce today.</p>
        </div>
        <div className="dashboard-header-actions">
          <Link to={rolePath("hrm/recruitment")} className="dashboard-action-btn">
            <MdWork /> New Job Opening
          </Link>
          <Link to={rolePath("hrm/notice-board")} className="dashboard-action-btn dashboard-action-btn--secondary">
            <MdCampaign /> Post Notice
          </Link>
        </div>
      </div>

      {/* ── Sections mirroring the sidebar's HR groups ── */}
      {DASHBOARD_SECTIONS.map((section) => (
        <div className="dashboard-section" key={section.label}>
          <div className="dashboard-section-title">{section.label}</div>
          <div className="dashboard-stat-grid">
            {section.cards.map((card) => (
              <Link
                key={card.key}
                to={rolePath(card.page)}
                className={`stat-card ${TONE_CLASS[card.tone]}`}
              >
                <div className="stat-card-icon">
                  <card.icon />
                </div>
                <div className="stat-card-body">
                  <span className="stat-card-value">{renderValue(card)}</span>
                  <span className="stat-card-label">{card.label}</span>
                </div>
                <MdArrowForward className="stat-card-arrow" />
              </Link>
            ))}
          </div>
        </div>
      ))}

      {/* ── Insights: reports link + secondary widgets ── */}
      <div className="dashboard-section">
        <div className="dashboard-section-title">Insights</div>
        <div className="dashboard-insights-grid">

          <Link to={rolePath("hrm/reports")} className="insights-card insights-card--link">
            <div className="insights-card-header">
              <MdAnalytics />
              <h4>HR Reports & Analytics</h4>
            </div>
            <p>Headcount trends, attrition, attendance and payroll summaries in one place.</p>
            <span className="insights-card-cta">Open reports <MdArrowForward /></span>
          </Link>

          <div className="insights-card">
            <div className="insights-card-header">
              <MdCampaign />
              <h4>Latest Notices</h4>
            </div>
            {notices.length === 0 ? (
              <p className="insights-empty">No notices posted yet.</p>
            ) : (
              <ul className="insights-list">
                {notices.slice(0, 4).map((n) => (
                  <li key={n.id}>
                    <MdNotifications className="insights-list-icon" />
                    <span>{n.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="insights-card">
            <div className="insights-card-header">
              <MdCake />
              <h4>Upcoming Birthdays</h4>
            </div>
            {birthdays.length === 0 ? (
              <p className="insights-empty">No birthdays in the next 7 days.</p>
            ) : (
              <ul className="insights-list">
                {birthdays.slice(0, 4).map((b) => (
                  <li key={b.id}>
                    <MdCake className="insights-list-icon" />
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
