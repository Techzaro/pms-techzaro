/**
 * Sidebar - HR Management navigation sidebar.
 * Dedicated HRM sidebar: a single "Dashboard" entry point followed by
 * the HR modules, grouped into labeled sections (Hiring, Workforce,
 * Payroll, Engagement, Insights) instead of a single collapsed dropdown.
 *
 * Design rationale (HCI):
 *  - Recognition over recall: section labels let a user scan and find a
 *    module by category instead of remembering it's inside "HR Management".
 *  - Hick's Law / fewer clicks: with only HR content left in this sidebar,
 *    hiding all 10 modules behind one extra click added friction for no
 *    benefit — items are now exposed directly.
 *  - Chunking (Miller's Law): 10 flat items are split into 5 groups of
 *    1-4, which is easier to scan than one long undifferentiated list.
 *  - Visibility of system status: the active route gets both a background
 *    fill and an aria-current flag (not color alone), so state is legible
 *    to screen readers and not dependent on color perception.
 *  - Fitts's Law: full-width, generously padded row targets, not just the
 *    icon/text glyphs, since this is used as a touch target on mobile too.
 *
 * Supports three viewport modes:
 *   - Desktop (>1200px): always visible, icon+text
 *   - Tablet (769-1200px): collapsible on hover/click
 *   - Mobile (≤768px): overlay drawer toggled via hamburger menu
 */

import { Link, useLocation, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import API_URL from "../../../../config/api";
import { authToken, getCurrentRole, getUser, setUser, rolePath, getUrlRole } from "../../../../utils/auth";

import {
  MdDashboard,
  MdPeople,
  // HR Management icons
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
} from "react-icons/md";

import "./Sidebar.css";

/**
 * HR modules grouped into scannable sections. Each item's `page` is the
 * slug used for route matching and Link target (rolePath("hrm/<page>")).
 */
const HR_SECTIONS = [
  {
    label: "Hiring",
    items: [
      { page: "hrm/recruitment", label: "Recruitment & Onboarding", icon: MdWork },
      { page: "hrm/offer-letters", label: "Offer Letters", icon: MdDescription },
    ],
  },
  {
    label: "Workforce",
    items: [
      { page: "hrm/workforce", label: "Workforce Directory", icon: MdPeople },
      { page: "hrm/documents", label: "Employee Documents", icon: MdOutlineDescription },
      { page: "hrm/attendance", label: "Attendance & Leave", icon: MdEventAvailable },
      { page: "hrm/performance", label: "Performance & Evaluation", icon: MdTrendingUp },
      { page: "hrm/assets", label: "Assets / Items Issued", icon: MdInventory2 },
    ],
  },
  {
    label: "Payroll",
    items: [
      { page: "hrm/payroll", label: "Payroll & Salary", icon: MdAccountBalanceWallet },
    ],
  },
  {
    label: "Engagement",
    items: [
      { page: "hrm/notice-board", label: "Notice Board", icon: MdCampaign },
      { page: "hrm/training", label: "Training & Learning", icon: MdSchool },
    ],
  },
  {
    label: "Insights",
    items: [
      { page: "hrm/reports", label: "HR Reports & Analytics", icon: MdAnalytics },
    ],
  },
];

/**
 * Sidebar navigation component.
 */
function Sidebar() {

  // ── Viewport mode state ──
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isTabletExpanded, setIsTabletExpanded] = useState(false);

  /** Current user info – initialised from local storage. */
  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
    };
  });

  const location = useLocation();
  const { role: urlRole } = useParams();
  const rolePrefix = `/${urlRole}`;

  // ── Route-matching helpers ──
  /** Exact match for a given page slug. */
  const isActive = (page) => {
    const current = location.pathname.toLowerCase();
    const target = `${rolePrefix}/${page}`.toLowerCase();
    return current === target || (page.toLowerCase() === "hrm" && (current.endsWith("/hrm") || current.endsWith("/hrm/")));
  };

  /** Exact or prefix match (for detail pages). */
  const isActiveOrStart = (page) => {
    const current = location.pathname.toLowerCase();
    const target = `${rolePrefix}/${page}`.toLowerCase();
    if (current === target || current.startsWith(`${target}/`)) return true;
    if (page.includes("recruitment") || page === "RecruitmentOnboarding") {
      return current.includes("recruitment") || current.includes("onboarding");
    }
    if (page.includes("offer") || page === "offerletters") {
      return current.includes("offer");
    }
    return false;
  };

  // Fetch user data from API on mount
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/user`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      skipLoader: true,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.name) {
          setUserState({ name: data.name, email: data.email, role: data.role, avatar: data.avatar || null });
          const role = getCurrentRole();
          setUser(role, { id: data.id, name: data.name, email: data.email, role: data.role, avatar: data.avatar || null });
        }
      })
      .catch(() => {});
  }, []);

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Broadcast sidebar open/close state to the Header for logo visibility
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("sidebar-state", { detail: { open: isMobileOpen } }));
  }, [isMobileOpen]);

  // Listen for toggle-sidebar events dispatched by the Header hamburger button
  useEffect(() => {
    const handler = () => setIsMobileOpen(prev => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const toggleMobile = () => setIsMobileOpen(prev => !prev);
  const toggleTablet = () => setIsTabletExpanded(prev => !prev);

  /** Collapse tablet sidebar when the mouse leaves (tablet viewport only). */
  const handleMouseLeave = () => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      setIsTabletExpanded(false);
    }
  };

  /** Expand tablet sidebar when clicking inside it (tablet viewport only). */
  const handleSidebarClick = (e) => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      e.stopPropagation();
      setIsTabletExpanded(true);
    }
  };

  return (
    <>
      <div
        className={`sidebar ${isMobileOpen ? "sidebar--open" : ""} ${isTabletExpanded ? "sidebar--tablet-expanded" : ""}`}
        onMouseLeave={handleMouseLeave}
        onClick={handleSidebarClick}
      >

        {/* Mobile-only header with close button and logo */}
        <div className="sidebar-mobile-header">
          <button className="sidebar-close-btn" onClick={toggleMobile} aria-label="Close sidebar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18" />
              <path d="M6 6L18 18" />
            </svg>
          </button>
          <div className="sidebar-logo-box">
            <b>TX</b>
          </div>
          <div className="sidebar-logo-text">
            <h3>Techxaro</h3>
            <span>HRM Portal</span>
          </div>
        </div>

        <nav aria-label="HR Management navigation">

          {/* Dashboard link – overview / landing page */}
          <Link
            to={user?.role?.toLowerCase() === "member" ? rolePath("hrm/member-dashboard") : rolePath("HRM")}
            className={`sidebar-link ${isActive("HRM") || isActive("hrm") || isActive("hrm/member-dashboard") ? "active" : ""}`}
            aria-current={isActive("HRM") || isActive("hrm") || isActive("hrm/member-dashboard") ? "page" : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDashboard />
            <span>{user?.role?.toLowerCase() === "member" ? "My Member Hub" : "Dashboard"}</span>
          </Link>

          {/* HR modules, grouped into labeled sections for scannability */}
          {(user?.role?.toLowerCase() === "member" ? [
            {
              label: "My Member Portal",
              items: [
                { page: "hrm/member-dashboard", label: "My HRM Dashboard", icon: MdDashboard },
              ],
            },
          ] : HR_SECTIONS).map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div className="sidebar-section-title">{section.label}</div>
              {section.items.map(({ page, label, icon: Icon }) => {
                const active = isActiveOrStart(page);
                return (
                  <Link
                    key={page}
                    to={rolePath(page)}
                    className={`sidebar-link ${active ? "active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}

        </nav>

      </div>

      {/* Mobile backdrop – clicking closes the sidebar */}
      {isMobileOpen && <div className="sidebar-backdrop" onClick={toggleMobile} />}
      {/* Tablet backdrop – clicking collapses the sidebar */}
      {isTabletExpanded && <div className="sidebar-tablet-backdrop" onClick={toggleTablet} />}
    </>
  );
}

export default Sidebar;