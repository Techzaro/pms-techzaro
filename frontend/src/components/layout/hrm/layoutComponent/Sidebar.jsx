import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import API_URL from "../../../../config/api";
import { authToken, getUser, rolePath } from "../../../../utils/auth";

import {
  MdDashboard,
  MdWork,
  MdPeople,
  MdCalendarToday,
  MdBarChart,
  MdKeyboardArrowDown,
  MdNotifications,
  MdSchool,
  MdCardMembership,
  MdBadge,
  MdWorkHistory,
  MdCorporateFare,
  MdAttachMoney,
  MdReceiptLong,
  MdFactCheck,
} from "react-icons/md";

import "./Sidebar.css";

function Sidebar() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isTabletExpanded, setIsTabletExpanded] = useState(false);

  // Dropdown open states persisted in sessionStorage
  const [attendanceOpen, setAttendanceOpen] = useState(
    () => sessionStorage.getItem("hrm_attendanceOpen") === "true"
  );
  const toggleAttendance = () => {
    setAttendanceOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("hrm_attendanceOpen", next);
      return next;
    });
  };

  const [performanceOpen, setPerformanceOpen] = useState(
    () => sessionStorage.getItem("hrm_performanceOpen") === "true"
  );
  const togglePerformance = () => {
    setPerformanceOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("hrm_performanceOpen", next);
      return next;
    });
  };

  const [recruitmentOpen, setRecruitmentOpen] = useState(
    () => sessionStorage.getItem("hrm_recruitmentOpen") === "true"
  );
  const toggleRecruitment = () => {
    setRecruitmentOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("hrm_recruitmentOpen", next);
      return next;
    });
  };

  const [workforceOpen, setWorkforceOpen] = useState(
    () => sessionStorage.getItem("hrm_workforceOpen") === "true"
  );
  const toggleWorkforce = () => {
    setWorkforceOpen((prev) => {
      const next = !prev;
      sessionStorage.setItem("hrm_workforceOpen", next);
      return next;
    });
  };

  const [user, setUserState] = useState(() => {
    const stored = getUser();
    return {
      name: stored?.name || "User",
      email: stored?.email || "user@example.com",
      role: stored?.role || "Member",
    };
  });

  const location = useLocation();

  const isMemberRole =
    user?.role?.toLowerCase() === "member" ||
    location.pathname.toLowerCase().includes("hrm/member-dashboard");

  const isActive = (page) => location.pathname.toLowerCase().endsWith(page.toLowerCase());
  const isActiveOrStart = (page) => location.pathname.toLowerCase().includes(page.toLowerCase());

  const isAttendanceRoute = location.pathname.toLowerCase().includes("hrm/attendance");
  const isAttendanceTabActive = (tabVal) => {
    if (!isAttendanceRoute) return false;
    const currentTab = new URLSearchParams(location.search).get("tab") || "attendance";
    return currentTab === tabVal;
  };

  const isPerformanceRoute = location.pathname.toLowerCase().includes("hrm/performance");
  const isPerformanceTabActive = (tabVal) => {
    if (!isPerformanceRoute) return false;
    const currentTab = new URLSearchParams(location.search).get("tab") || "utilization";
    return currentTab === tabVal;
  };

  const isMemberDashboardRoute = location.pathname.toLowerCase().includes("hrm/member-dashboard");
  const isMemberTabActive = (tabVal) => {
    if (!isMemberDashboardRoute) return false;
    const currentTab = new URLSearchParams(location.search).get("tab") || "attendance";
    return currentTab === tabVal;
  };

  // Auto expand dropdowns based on current route
  useEffect(() => {
    if (isAttendanceRoute) {
      setAttendanceOpen(true);
      sessionStorage.setItem("hrm_attendanceOpen", "true");
    }
    if (isPerformanceRoute) {
      setPerformanceOpen(true);
      sessionStorage.setItem("hrm_performanceOpen", "true");
    }
  }, [location.pathname, location.search]);

  // Auto-close mobile sidebar on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname]);

  // Listen for toggle-sidebar event
  useEffect(() => {
    const handler = () => setIsMobileOpen((prev) => !prev);
    window.addEventListener("toggle-sidebar", handler);
    return () => window.removeEventListener("toggle-sidebar", handler);
  }, []);

  const toggleMobile = () => setIsMobileOpen((prev) => !prev);
  const toggleTablet = () => setIsTabletExpanded((prev) => !prev);

  const handleMouseLeave = () => {
    if (window.innerWidth <= 1200 && window.innerWidth >= 769) {
      setIsTabletExpanded(false);
    }
  };

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
        {/* Mobile header */}
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

        <div>
          {/* Main Landing Link */}
          <Link
            to={isMemberRole ? rolePath("hrm/member-dashboard") : rolePath("HRM")}
            className={`sidebar-link ${!isMemberRole && (isActive("HRM") || isActive("hrm")) ? "active" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <MdDashboard />
            <span>{isMemberRole ? "My Member Hub" : "Dashboard"}</span>
          </Link>

          {!isMemberRole ? (
            /* ADMIN / MANAGER HR SIDEBAR NAVIGATION */
            <>
              {/* Recruitment & Hiring Dropdown */}
              <div
                className={`sidebar-link ${isActiveOrStart("hrm/recruitment") || isActiveOrStart("hrm/offer-letters") ? "active" : ""}`}
                style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}
              >
                <div
                  onClick={toggleRecruitment}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
                >
                  <MdWork />
                  <span style={{ flex: 1 }}>Hiring &amp; Onboarding</span>
                  <MdKeyboardArrowDown
                    size={18}
                    style={{
                      transition: "transform 0.2s",
                      transform: recruitmentOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
                {recruitmentOpen && (
                  <div className="sidebar-sub-links">
                    <Link
                      to={rolePath("hrm/recruitment")}
                      className={`sidebar-sub-link ${isActiveOrStart("hrm/recruitment") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Job Openings &amp; Candidates
                    </Link>
                    <Link
                      to={rolePath("hrm/offer-letters")}
                      className={`sidebar-sub-link ${isActiveOrStart("hrm/offer-letters") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Offer Letters
                    </Link>
                  </div>
                )}
              </div>

              {/* Workforce & Documents Dropdown */}
              <div
                className={`sidebar-link ${isActiveOrStart("hrm/workforce") || isActiveOrStart("hrm/documents") ? "active" : ""}`}
                style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}
              >
                <div
                  onClick={toggleWorkforce}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
                >
                  <MdPeople />
                  <span style={{ flex: 1 }}>Workforce &amp; Directory</span>
                  <MdKeyboardArrowDown
                    size={18}
                    style={{
                      transition: "transform 0.2s",
                      transform: workforceOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
                {workforceOpen && (
                  <div className="sidebar-sub-links">
                    <Link
                      to={rolePath("hrm/workforce")}
                      className={`sidebar-sub-link ${isActiveOrStart("hrm/workforce") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Employee Directory
                    </Link>
                    <Link
                      to={rolePath("hrm/documents")}
                      className={`sidebar-sub-link ${isActiveOrStart("hrm/documents") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Employee Documents
                    </Link>
                  </div>
                )}
              </div>

              {/* Attendance & Leave Dropdown */}
              <div
                className={`sidebar-link ${isAttendanceRoute ? "active" : ""}`}
                style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}
              >
                <div
                  onClick={toggleAttendance}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
                >
                  <MdCalendarToday />
                  <span style={{ flex: 1 }}>Attendance &amp; Leave</span>
                  <MdKeyboardArrowDown
                    size={18}
                    style={{
                      transition: "transform 0.2s",
                      transform: attendanceOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
                {attendanceOpen && (
                  <div className="sidebar-sub-links">
                    <Link
                      to={rolePath("hrm/attendance?tab=attendance")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("attendance") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Punch Logs &amp; Attendance
                    </Link>
                    <Link
                      to={rolePath("hrm/attendance?tab=pending")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("pending") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Member Requests &amp; Approvals
                    </Link>
                    <Link
                      to={rolePath("hrm/attendance?tab=manual")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("manual") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Manual HR Entry &amp; Roster
                    </Link>
                    <Link
                      to={rolePath("hrm/attendance?tab=shifts")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("shifts") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Working Policies &amp; Shifts
                    </Link>
                    <Link
                      to={rolePath("hrm/attendance?tab=warnings")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("warnings") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Attendance Warnings &amp; Policy
                    </Link>
                    <Link
                      to={rolePath("hrm/attendance?tab=departments")}
                      className={`sidebar-sub-link ${isAttendanceTabActive("departments") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Department Summary
                    </Link>
                  </div>
                )}
              </div>

              {/* Performance & Evaluation Dropdown */}
              <div
                className={`sidebar-link ${isPerformanceRoute ? "active" : ""}`}
                style={{ cursor: "default", flexDirection: "column", alignItems: "stretch" }}
              >
                <div
                  onClick={togglePerformance}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "4px 0" }}
                >
                  <MdBarChart />
                  <span style={{ flex: 1 }}>Performance &amp; Evaluation</span>
                  <MdKeyboardArrowDown
                    size={18}
                    style={{
                      transition: "transform 0.2s",
                      transform: performanceOpen ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
                {performanceOpen && (
                  <div className="sidebar-sub-links">
                    <Link
                      to={rolePath("hrm/performance?tab=utilization")}
                      className={`sidebar-sub-link ${isPerformanceTabActive("utilization") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Utilization &amp; Intelligence
                    </Link>
                    <Link
                      to={rolePath("hrm/performance?tab=okrs")}
                      className={`sidebar-sub-link ${isPerformanceTabActive("okrs") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      OKRs &amp; Goals
                    </Link>
                    <Link
                      to={rolePath("hrm/performance?tab=appraisals")}
                      className={`sidebar-sub-link ${isPerformanceTabActive("appraisals") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      360° Appraisals
                    </Link>
                    <Link
                      to={rolePath("hrm/performance?tab=radar")}
                      className={`sidebar-sub-link ${isPerformanceTabActive("radar") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Competency Radar
                    </Link>
                    <Link
                      to={rolePath("hrm/performance?tab=top")}
                      className={`sidebar-sub-link ${isPerformanceTabActive("top") ? "active" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Top Leaderboard
                    </Link>
                  </div>
                )}
              </div>

              {/* Notice Board */}
              <Link
                to={rolePath("hrm/notice-board")}
                className={`sidebar-link ${isActiveOrStart("hrm/notice-board") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdNotifications />
                <span>Notice Board</span>
              </Link>

              {/* Training & Learning */}
              <Link
                to={rolePath("hrm/training")}
                className={`sidebar-link ${isActiveOrStart("hrm/training") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdSchool />
                <span>Training &amp; Learning</span>
              </Link>

              <hr />

              {/* HR Reports & Analytics */}
              <Link
                to={rolePath("hrm/reports")}
                className={`sidebar-link ${isActiveOrStart("hrm/reports") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdBarChart />
                <span>HR Reports &amp; Analytics</span>
              </Link>
            </>
          ) : (
            /* MEMBER HUB NAVIGATION LINKS */
            <>
              <Link
                to={rolePath("hrm/member-dashboard?tab=attendance")}
                className={`sidebar-link ${isMemberTabActive("attendance") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdCalendarToday />
                <span>Attendance &amp; Punch</span>
              </Link>

              <Link
                to={rolePath("hrm/member-dashboard?tab=leaves")}
                className={`sidebar-link ${isMemberTabActive("leaves") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdWorkHistory />
                <span>Leave Requests</span>
              </Link>

              <Link
                to={rolePath("hrm/member-dashboard?tab=wfh")}
                className={`sidebar-link ${isMemberTabActive("wfh") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdCorporateFare />
                <span>WFH Applications</span>
              </Link>

              <Link
                to={rolePath("hrm/member-dashboard?tab=claims")}
                className={`sidebar-link ${isMemberTabActive("claims") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdAttachMoney />
                <span>Advance Salary &amp; Expenses</span>
              </Link>

              <Link
                to={rolePath("hrm/member-dashboard?tab=corrections")}
                className={`sidebar-link ${isMemberTabActive("corrections") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdReceiptLong />
                <span>Attendance Corrections</span>
              </Link>

              <Link
                to={rolePath("hrm/notice-board")}
                className={`sidebar-link ${isActiveOrStart("hrm/notice-board") ? "active" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                <MdNotifications />
                <span>Notice Board</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {isMobileOpen && <div className="sidebar-backdrop" onClick={toggleMobile} />}
      {isTabletExpanded && <div className="sidebar-tablet-backdrop" onClick={toggleTablet} />}
    </>
  );
}

export default Sidebar;