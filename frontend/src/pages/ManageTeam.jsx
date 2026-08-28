/**
 * ManageTeam.jsx — Team Management Page
 *
 * Admin/manager page for creating, editing, and managing teams.
 * Features:
 * - Create new teams with name, description, and member selection
 * - Edit existing teams (update name, description, members)
 * - Delete teams with confirmation
 * - Add/remove members from teams
 * - Set team leader (requires team_lead role)
 * - Create project for a specific team
 * - Search and sort teams
 * - Paginated team list
 *
 * Access restricted to admin and manager roles.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { Crown, Clock } from "lucide-react";
import TeamExportReport from "./TeamExportReport";
import TeamWorkingHoursModal from "../components/TeamWorkingHoursModal";
import {
  MdAdd,
  MdDelete,
  MdEdit,
  MdPeople,
  MdSearch,
  MdExpandMore,
  MdGroup,
  MdPersonAdd,
  MdCreateNewFolder,
  MdCalendarToday,
} from "react-icons/md";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import ConfirmModal from "../components/ConfirmModal";
import { useEscapeKey } from "../hooks/useEscapeKey";
import useConfirmOnClose from "../hooks/useConfirmOnClose";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import { useAutoRefresh } from "../utils/useAutoRefresh";
import API_URL from "../config/api";
import Pagination from "../components/Pagination";
import { useNotification } from "../context/NotificationContext";
import { showSuccessMessage } from "../utils/notify";
import { useSubmit } from "../hooks/useSubmit";
import LoadingButton from "../components/LoadingButton";
import RichTextEditor from "../components/RichTextEditor";
import "./ManageTeam.css";

/** Color palette for user avatar backgrounds */
const AVATAR_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Extracts up to 2 initials from a name */
function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Returns a deterministic avatar color based on the name hash */
function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * ManageTeam — Main team management page component.
 * Handles CRUD operations for teams, member management, and leader assignment.
 */
function ManageTeam() {
  const { t } = useTranslation();
  const notify = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();

  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOption, setSortOption] = useState("newest");
  const [selectedTeamFilter, setSelectedTeamFilter] = useState(searchParams.get("selectedTeam") || "");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [addMemberTeamId, setAddMemberTeamId] = useState(null);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [selectedLeaderId, setSelectedLeaderId] = useState(null);

  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [isMemberDropdownOpen, setIsMemberDropdownOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [mtMemberSearch, setMtMemberSearch] = useState("");
  const [mtUserSearch, setMtUserSearch] = useState("");
  const [memberHighlightedIndex, setMemberHighlightedIndex] = useState(0);
  const [userHighlightedIndex, setUserHighlightedIndex] = useState(0);
  const mtMemberListRef = useRef(null);
  const mtUserListRef = useRef(null);

  const [deleteTeamConfirmOpen, setDeleteTeamConfirmOpen] = useState(false);
  const [showTeamExportModal, setShowTeamExportModal] = useState(false);
  const [deleteTeamId, setDeleteTeamId] = useState(null);
  const [leaderConfirmOpen, setLeaderConfirmOpen] = useState(false);
  const [workingHoursModalOpen, setWorkingHoursModalOpen] = useState(false);
  const [workingHoursTeam, setWorkingHoursTeam] = useState(null);
  const [leaderConfirmData, setLeaderConfirmData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [removeMemberConfirmOpen, setRemoveMemberConfirmOpen] = useState(false);
  const [removeMemberData, setRemoveMemberData] = useState({ teamId: null, memberId: null, memberName: "" });
  const [editTeamId, setEditTeamId] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const navigate = useNavigate();
  const { submitting, run } = useSubmit();

  // ✅ Define fetchUsers first
  // Fetch all users for member selection dropdowns
  const fetchUsers = async () => {
    const token = authToken();
    if (!token) return;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/team-users`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
        _notifHandled: true,
      });
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : (data.users || []));
    } catch (error) {
      console.error("Failed to load users", error);
      setUsers([]);
      notify.error(t("Unable to load users.", { defaultValue: "Unable to load users." }));
    } finally {
      setLoading(false);
    }
  };

  // ✅ Define fetchTeams BEFORE the useEffect that uses it
  // Fetch all teams with their members and leader info
  const fetchTeams = async () => {
    const token = authToken();
    if (!token) return;
    try {
      let url = `${API_URL}/teams`;
      const queryParams = [];
      if (timeFilter && timeFilter !== "custom") {
        queryParams.push(`days=${timeFilter}`);
      } else if (timeFilter === "custom" && startDate && endDate) {
        queryParams.push(`start_date=${startDate}`, `end_date=${endDate}`);
      }
      if (queryParams.length > 0) {
        url += `?${queryParams.join("&")}`;
      }
      const response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      const data = await response.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load teams", error);
    }
  };

  // ✅ Now useEffect can safely call fetchTeams and fetchUsers
  // Verify user has admin/manager role, then fetch initial data
  useEffect(() => {
    const role = getCurrentRole();
    const token = authToken();
    if (!token || (role !== "admin" && role !== "manager")) {
      navigate("/");
      return;
    }
    Promise.all([fetchUsers(), fetchTeams()]);
  }, []);

  // Auto-refresh teams when data changes elsewhere in the app
  useAutoRefresh(fetchTeams, { events: ["data:changed"] });

  // Sync selectedTeam from URL search params
  useEffect(() => {
    const teamId = searchParams.get("selectedTeam");
    if (teamId) {
      setSelectedTeamFilter(teamId);
    }
  }, [searchParams]);

  useEffect(() => { setMemberHighlightedIndex(0); }, [isMemberDropdownOpen, mtMemberSearch]);
  useEffect(() => { setUserHighlightedIndex(0); }, [isUserDropdownOpen, mtUserSearch]);
  useEffect(() => {
    if (isMemberDropdownOpen && mtMemberListRef.current) {
      const el = mtMemberListRef.current.children[memberHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [memberHighlightedIndex, isMemberDropdownOpen]);
  useEffect(() => {
    if (isUserDropdownOpen && mtUserListRef.current) {
      const el = mtUserListRef.current.children[userHighlightedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [userHighlightedIndex, isUserDropdownOpen]);

  // ... rest of the functions (handleSetLeader, handleRemoveMember, etc.)

  const handleSetLeader = async (teamId, memberId) => {
    const member = teams.flatMap(t => t.members).find(m => Number(m.id) === Number(memberId));

    const memberRole = member?.role === 'teamlead' ? 'team_lead' : member?.role;
    if (memberRole !== 'team_lead') {
      notify.error(t('"{{name}}" cannot be assigned as Team Lead. First update this user\'s role to "Team Lead" from Edit User, then you can assign them as Team Lead.', { name: member?.name || t("This user", { defaultValue: "This user" }), defaultValue: `"${member?.name || 'This user'}" cannot be assigned as Team Lead. First update this user's role to "Team Lead" from Edit User, then you can assign them as Team Lead.` }));
      return;
    }

    setLeaderConfirmData({ teamId, memberId, memberName: member?.name || t("this member", { defaultValue: "this member" }) });
    setLeaderConfirmOpen(true);
  };

  // Confirm and execute leader assignment via API
  const confirmSetLeader = async () => {
    const { teamId, memberId } = leaderConfirmData;
    setLeaderConfirmOpen(false);
    setLeaderConfirmData({ teamId: null, memberId: null, memberName: "" });
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/leader`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ leader_id: memberId }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Could not update team leader.", { defaultValue: "Could not update team leader." }));
      await fetchTeams();
      showSuccessMessage("Team leader", "updated");
    });
  };

  // Remove a member from a team after confirmation
  const handleRemoveMember = async (teamId, memberId) => {
    const member = teams.flatMap(t => t.members).find(m => Number(m.id) === Number(memberId));
    setRemoveMemberData({ teamId, memberId, memberName: member?.name || t("this member", { defaultValue: "this member" }) });
    setRemoveMemberConfirmOpen(true);
  };

  // Confirm and execute member removal via API
  const confirmRemoveMember = async () => {
    const { teamId, memberId } = removeMemberData;
    setRemoveMemberConfirmOpen(false);
    setRemoveMemberData({ teamId: null, memberId: null, memberName: "" });
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}/members/${memberId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Could not remove member.", { defaultValue: "Could not remove member." }));
      await fetchTeams();
      showSuccessMessage("Member", "removed from team");
    });
  };

  // Delete a team after confirmation
  const handleDeleteTeam = async (teamId) => {
    setDeleteTeamId(teamId);
    setDeleteTeamConfirmOpen(true);
  };

  // Confirm and execute team deletion via API
  const confirmDeleteTeam = async () => {
    const teamId = deleteTeamId;
    setDeleteTeamConfirmOpen(false);
    setDeleteTeamId(null);
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${teamId}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Could not delete team.", { defaultValue: "Could not delete team." }));
      await fetchTeams();
      showSuccessMessage("Team", "deleted");
    });
  };

  const handleProjectForTeam = (teamId) => {
    navigate(rolePath(`create-project?teamId=${teamId}`));
  };

  const openCreateTeamModal = () => {
    setAddMemberTeamId(null);
    setEditTeamId(null);
    setTeamName("");
    setTeamDescription("");
    setSelectedMemberIds([]);
    setSelectedLeaderId(null);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  const openAddMemberModal = (teamId) => {
    setAddMemberTeamId(teamId);
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setAddMemberTeamId(null);
    setEditTeamId(null);
    setTeamName("");
    setTeamDescription("");
    setSelectedMemberIds([]);
    setSelectedLeaderId(null);
    setSelectedUserIds([]);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
  };

  const { isDirty: teamIsDirty, setIsDirty: setTeamIsDirty, handleClose: handleTeamClose, ConfirmDialog: TeamConfirmDialog } = useConfirmOnClose(closeModal);
  useEscapeKey(isModalOpen, handleTeamClose);

  const toggleMemberSelection = (userId) => {
    setTeamIsDirty(true);
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleSelectAllMembers = () => {
    setTeamIsDirty(true);
    if (selectedMemberIds.length === users.length) {
      setSelectedMemberIds([]);
    } else {
      setSelectedMemberIds(users.map((u) => u.id));
    }
  };

  const toggleSelectAllUsers = (teamMembers) => {
    const availableUsers = users.filter((u) => !teamMembers.some((m) => m.id === u.id));
    if (selectedUserIds.length === availableUsers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(availableUsers.map((u) => u.id));
    }
  };

  // Create a new team with name, description, and selected members
  const handleCreateTeam = async (e, isDraft = false) => {
    if (e) e.preventDefault();
    if (!selectedMemberIds || selectedMemberIds.length === 0) {
      notify.error(t("At least one team member is required.", { defaultValue: "At least one team member is required." }));
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: teamName,
          description: teamDescription,
          member_ids: selectedMemberIds,
          leader_id: selectedLeaderId,
          team_lead_id: selectedLeaderId,
          status: isDraft ? "draft" : "active",
          is_draft: isDraft,
        }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Failed to create team", { defaultValue: "Failed to create team" }));
      showSuccessMessage("Team", isDraft ? "saved as draft" : "created");
      fetchTeams();
      closeModal();
    });
  };

  // Add selected users to an existing team
  const handleAddMembers = async (e) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) {
      notify.error(t("Please select at least one user.", { defaultValue: "Please select at least one user." }));
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${addMemberTeamId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_ids: selectedUserIds }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Failed to add members", { defaultValue: "Failed to add members" }));
      showSuccessMessage("Members", "added to team");
      fetchTeams();
      closeModal();
    });
  };

  const openEditTeamModal = (team) => {
    setEditTeamId(team.id);
    setTeamName(team.name);
    setTeamDescription(team.description || "");
    setSelectedMemberIds(team.members.map((m) => m.id));
    setSelectedLeaderId(team.leader_id || null);
    setAddMemberTeamId(null);
    setIsMemberDropdownOpen(false);
    setIsUserDropdownOpen(false);
    setIsModalOpen(true);
  };

  // Update an existing team's name, description, leader, and member list
  const handleUpdateTeam = async (e) => {
    e.preventDefault();
    if (!selectedMemberIds || selectedMemberIds.length === 0) {
      notify.error(t("At least one team member is required.", { defaultValue: "At least one team member is required." }));
      return;
    }
    await run(async () => {
      const token = authToken();
      const response = await fetch(`${API_URL}/teams/${editTeamId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: teamName, description: teamDescription, member_ids: selectedMemberIds, leader_id: selectedLeaderId, team_lead_id: selectedLeaderId }),
        _notifHandled: true,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || t("Failed to update team", { defaultValue: "Failed to update team" }));
      showSuccessMessage("Team", "updated");
      fetchTeams();
      closeModal();
    });
  };

  // Compute available users for adding to a team (exclude current members)
  const currentTeamMembers = addMemberTeamId
    ? teams.find((t) => t.id === addMemberTeamId)?.members || []
    : [];
  const availableUsersForTeam = users.filter(
    (u) => !currentTeamMembers.some((m) => m.id === u.id)
  );

  // Apply search filter, team filter, date range filter, and sorting to teams list
  const filteredTeams = teams
    .filter((t) => {
      const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTeam = !selectedTeamFilter || String(t.id) === String(selectedTeamFilter);

      let matchesDate = true;
      if (timeFilter && t.created_at) {
        const teamDate = new Date(t.created_at);
        const now = new Date();

        if (timeFilter === "7") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          sevenDaysAgo.setHours(0, 0, 0, 0);
          matchesDate = teamDate >= sevenDaysAgo;
        } else if (timeFilter === "30") {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          thirtyDaysAgo.setHours(0, 0, 0, 0);
          matchesDate = teamDate >= thirtyDaysAgo;
        } else if (timeFilter === "180") {
          const sixMonthsAgo = new Date();
          sixMonthsAgo.setMonth(now.getMonth() - 6);
          sixMonthsAgo.setHours(0, 0, 0, 0);
          matchesDate = teamDate >= sixMonthsAgo;
        } else if (timeFilter === "custom") {
          if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (teamDate < start) matchesDate = false;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (teamDate > end) matchesDate = false;
          }
        }
      }

      return matchesSearch && matchesTeam && matchesDate;
    })
    .sort((a, b) => {
      if (sortOption === "newest") return new Date(b.created_at) - new Date(a.created_at);
      if (sortOption === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortOption === "name-asc") return a.name.localeCompare(b.name);
      if (sortOption === "name-desc") return b.name.localeCompare(a.name);
      if (sortOption === "members") return b.members.length - a.members.length;
      return 0;
    });

  const totalTeamPages = Math.ceil(filteredTeams.length / pageSize) || 1;
  const paginatedTeams = filteredTeams.slice((page - 1) * pageSize, page * pageSize);

  const selectedTeamName = useMemo(() => {
    if (!selectedTeamFilter) return "";
    const found = teams.find((t) => String(t.id) === String(selectedTeamFilter));
    return found?.name || "";
  }, [selectedTeamFilter, teams]);

  const breadcrumbs = selectedTeamName
    ? [
        { label: t("Teams", { defaultValue: "Teams" }), onClick: () => { setSelectedTeamFilter(""); setSearchParams({}); } },
        { label: selectedTeamName },
      ]
    : [{ label: t("Teams", { defaultValue: "Teams" }) }];


  return (
    <>
      <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />
      <div className="mt-page">
        {/* HEADER */}
        <div className="mt-header">
          <div className="mt-header-left">
            <h1 className="mt-title">{t("Team Management", { defaultValue: "Team Management" })}</h1>
            <p className="mt-subtitle">
              {t("Organize users into functional teams, assign team leads, and manage member working hours and schedules.", { defaultValue: "Organize users into functional teams, assign team leads, and manage member working hours and schedules." })}
            </p>
          </div>
          <button className="mt-create-btn" onClick={() => openCreateTeamModal()}>
            <MdAdd size={20} />
            {t("Create Team", { defaultValue: "Create Team" })}
          </button>
        </div>

        {/* SEARCH & SORT */}
        <div className="mt-toolbar">
          <div className="mt-search-box">
            <MdSearch size={20} className="mt-search-icon" />
            <input
              type="text"
              placeholder={t("Search by team name...", { defaultValue: "Search by team name..." })}
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            />
          </div>
          {selectedTeamFilter && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <button
                onClick={() => { setSelectedTeamFilter(""); setSearchParams({}); setPage(1); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  padding: "6px 14px", borderRadius: "8px", border: "1px solid var(--border-color)",
                  background: "var(--bg-hover)", color: "var(--text-dark)", fontSize: "13px", fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("All Teams", { defaultValue: "All Teams" })}
              </button>
              <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {t("Filtered:", { defaultValue: "Filtered:" })} <strong style={{ color: "var(--text-heading)" }}>{selectedTeamName}</strong>
              </span>
            </div>
          )}

          {/* DATE RANGE FILTER */}
          <div className="mt-sort-box">
            <MdCalendarToday size={15} style={{ color: "var(--text-muted)", marginRight: "2px" }} />
            <span>
              {timeFilter === "7"
                ? t("Last 7 Days", { defaultValue: "Last 7 Days" })
                : timeFilter === "30"
                ? t("Last 30 Days", { defaultValue: "Last 30 Days" })
                : timeFilter === "180"
                ? t("Last 6 Months", { defaultValue: "Last 6 Months" })
                : timeFilter === "custom"
                ? t("Custom Range", { defaultValue: "Custom Range" })
                : t("All Time", { defaultValue: "All Time" })}
            </span>
            <MdExpandMore size={18} />
            <select value={timeFilter} onChange={(e) => { setTimeFilter(e.target.value); setPage(1); }}>
              <option value="">{t("All Time", { defaultValue: "All Time" })}</option>
              <option value="7">{t("Last 7 Days", { defaultValue: "Last 7 Days" })}</option>
              <option value="30">{t("Last 30 Days", { defaultValue: "Last 30 Days" })}</option>
              <option value="180">{t("Last 6 Months", { defaultValue: "Last 6 Months" })}</option>
              <option value="custom">{t("Custom Range", { defaultValue: "Custom Range" })}</option>
            </select>
          </div>

          {timeFilter === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                style={{ height: "42px", padding: "0 12px", borderRadius: "12px", border: "1px solid var(--border-color)", fontSize: "13px", background: "var(--bg-card)", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontWeight: 500 }}>{t("to", { defaultValue: "to" })}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                style={{ height: "42px", padding: "0 12px", borderRadius: "12px", border: "1px solid var(--border-color)", fontSize: "13px", background: "var(--bg-card)", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
            </div>
          )}

          <div className="mt-sort-box">
            <span>
              {sortOption === "newest"
                ? t("Newest First", { defaultValue: "Newest First" })
                : sortOption === "oldest"
                ? t("Oldest First", { defaultValue: "Oldest First" })
                : sortOption === "name-asc"
                ? t("Name A-Z", { defaultValue: "Name A-Z" })
                : sortOption === "name-desc"
                ? t("Name Z-A", { defaultValue: "Name Z-A" })
                : t("Sort by", { defaultValue: "Sort by" })}
            </span>
            <MdExpandMore size={18} />
            <select value={sortOption} onChange={(e) => setSortOption(e.target.value)}>
              <option value="newest">{t("Newest First", { defaultValue: "Newest First" })}</option>
              <option value="oldest">{t("Oldest First", { defaultValue: "Oldest First" })}</option>
              <option value="name-asc">{t("Name A-Z", { defaultValue: "Name A-Z" })}</option>
              <option value="name-desc">{t("Name Z-A", { defaultValue: "Name Z-A" })}</option>
            </select>
          </div>
        </div>

        {/* TEAM LIST */}
        <div className="mt-team-list">
          {paginatedTeams.length === 0 ? (
            <div className="mt-card mt-empty">
              <MdGroup size={48} className="mt-empty-icon" />
              <p>{t("No teams created yet.", { defaultValue: "No teams created yet." })}</p>
            </div>
          ) : (
            paginatedTeams.map((team) => {
              const leader = team.leader_id
                ? team.members.find((m) => Number(m.id) === Number(team.leader_id))
                : null;

              return (
                <div key={team.id} className="mt-card">
                  {/* Card Header */}
                  <div className="mt-card-top">
                    <div className="mt-card-identity">
                      <div className="mt-team-icon">
                        <MdGroup size={24} />
                      </div>
                      <div>
                        <h3 className="mt-team-name">{team.name}</h3>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                          <MdCalendarToday size={13} style={{ color: "var(--color-primary)" }} />
                          {t("Created {{date}}", { date: formatDate(team.created_at), defaultValue: `Created ${formatDate(team.created_at)}` })}
                        </span>
                      </div>
                    </div>
                    <div className="mt-card-actions">
                      <button
                        className="mt-icon-btn"
                        style={{ color: "var(--color-primary, #4f46e5)" }}
                        title={t("Team Working Hours", { defaultValue: "Team Working Hours" })}
                        onClick={() => {
                          setWorkingHoursTeam(team);
                          setWorkingHoursModalOpen(true);
                        }}
                      >
                        <Clock size={18} />
                      </button>
                      <button className="mt-icon-btn mt-icon-edit" title={t("Edit Team", { defaultValue: "Edit Team" })} onClick={() => openEditTeamModal(team)}>
                        <MdEdit size={18} />
                      </button>
                      <button
                        className="mt-icon-btn mt-icon-delete"
                        onClick={() => handleDeleteTeam(team.id)}
                        title={t("Delete Team", { defaultValue: "Delete Team" })}
                      >
                        <MdDelete size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Team Lead & Description Row */}
                  <div className="mt-lead-desc-row">
                    <div className="mt-section">
                      <span className="mt-section-label">{t("TEAM LEAD", { defaultValue: "TEAM LEAD" })}</span>
                      {leader ? (
                        <div className="mt-lead-chip">
                          <Crown size={16} className="mt-crown-icon" />
                          <span>{leader.name}</span>
                        </div>
                      ) : (
                        <p className="mt-no-data">{t("No leader assigned", { defaultValue: "No leader assigned" })}</p>
                      )}
                    </div>
                    {team.description && (
                      <div className="mt-section" >
                        <span className="mt-section-label">{t("DESCRIPTION", { defaultValue: "DESCRIPTION" })}</span>
                        <div className="mt-team-desc rte-display" dangerouslySetInnerHTML={{ __html: team.description }} />
                      </div>
                    )}
                  </div>

                  {/* Team Members */}
                  <div className="mt-section">
                    <span className="mt-section-label">{t("TEAM MEMBERS", { defaultValue: "TEAM MEMBERS" })}</span>
                    <div className="mt-members-row">
                      {team.members.length === 0 ? (
                        <p className="mt-no-data">{t("No members yet.", { defaultValue: "No members yet." })}</p>
                      ) : (
                        team.members.map((member) => {
                          const isLeader = Number(team.leader_id) === Number(member.id);
                          return (
                            <div key={member.id} className={`mt-member-chip ${isLeader ? "mt-member-chip-leader" : ""}`}>
                              <div
                                className="mt-avatar"
                                style={{ background: getAvatarColor(member.name) }}
                              >
                                {getInitials(member.name)}
                              </div>
                              <span className="mt-member-name">{member.name}</span>
                              <button
                                className={`mt-crown-btn ${isLeader ? "mt-crown-active" : ""}`}
                                title={isLeader ? t("Current Leader", { defaultValue: "Current Leader" }) : t("Set as Leader", { defaultValue: "Set as Leader" })}
                                onClick={() => handleSetLeader(team.id, member.id)}
                              >
                                <Crown size={16} />
                              </button>
                              <button
                                className="mt-chip-remove"
                                title={t("Remove member", { defaultValue: "Remove member" })}
                                onClick={() => { setRemoveMemberData({ teamId: team.id, memberId: member.id, memberName: member.name || member.username || t("this member", { defaultValue: "this member" }) }); setRemoveMemberConfirmOpen(true); }}
                              >
                                &times;
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-card-footer">
                    <button
                      className="mt-add-member-btn"
                      onClick={() => openAddMemberModal(team.id)}
                    >
                      <MdPersonAdd size={18} />
                      {t("Add Member", { defaultValue: "Add Member" })}
                    </button>
                    <button
                      className="mt-project-btn"
                      onClick={() => handleProjectForTeam(team.id)}
                    >
                      <MdCreateNewFolder size={18} />
                      {t("Create Project for this Team", { defaultValue: "Create Project for this Team" })}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* PAGINATION & ROWS PER PAGE */}
        {filteredTeams.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginTop: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "13px", color: "var(--text-secondary)" }}>
              <span>
                {t("Showing", { defaultValue: "Showing" })} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredTeams.length)} {t("of", { defaultValue: "of" })} {filteredTeams.length} {t("teams", { defaultValue: "teams" })}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span>{t("Rows per page:", { defaultValue: "Rows per page:" })}</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: "13px",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {totalTeamPages > 1 && (
              <Pagination currentPage={page} totalPages={totalTeamPages} onPageChange={setPage} />
            )}
          </div>
        )}

        {/* MODAL */}
        {isModalOpen && createPortal(
          <div className="mt-modal-overlay" onClick={handleTeamClose}>
            <div className="mt-modal" onClick={(e) => e.stopPropagation()}>
              <div className="mt-modal-header">
                <div>
                  <h2>{editTeamId ? t("Edit Team", { defaultValue: "Edit Team" }) : addMemberTeamId ? t("Add Member", { defaultValue: "Add Member" }) : t("Add New Team", { defaultValue: "Add New Team" })}</h2>
                  <p className="mt-modal-sub">
                    {editTeamId
                      ? t("Update team name, description and members", { defaultValue: "Update team name, description and members" })
                      : addMemberTeamId
                      ? t("Select users to add to this team", { defaultValue: "Select users to add to this team" })
                      : t("Create a new team and add members", { defaultValue: "Create a new team and add members" })}
                  </p>
                </div>
                <button className="mt-modal-close" onClick={handleTeamClose}>
                  &#10005;
                </button>
              </div>

              {addMemberTeamId ? (
                <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={handleAddMembers}>
                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">{t("Select Users", { defaultValue: "Select Users" })}</label>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        width: "100%",
                        height: "52px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "var(--bg-hover)",
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                      onClick={() => { setIsUserDropdownOpen(!isUserDropdownOpen); }}
                    >
                      {selectedUserIds.length > 0 && (
                        <span className="mt-combo-count">{t("{{count}} selected", { count: selectedUserIds.length })}</span>
                      )}
                      {selectedUserIds.length === 0 && !isUserDropdownOpen && (
                        <span className="mt-combo-placeholder">{t("Click to select users", { defaultValue: "Click to select users" })}</span>
                      )}
                      {isUserDropdownOpen && (
                        <input
                          type="text"
                          className="mt-combo-input"
                          placeholder={t("Search by user name, role, or department...", { defaultValue: "Search by user name, role, or department..." })}
                          value={mtUserSearch}
                          onChange={(e) => { setMtUserSearch(e.target.value); }}
                          onFocus={() => setIsUserDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { setMtUserSearch(""); setIsUserDropdownOpen(false); setUserHighlightedIndex(0); }
                            else if (e.key === "ArrowDown") { e.preventDefault(); setUserHighlightedIndex((p) => (p < availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase())).length ? p + 1 : 0)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setUserHighlightedIndex((p) => (p > 0 ? p - 1 : availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase())).length)); }
                            else if (e.key === "Enter") {
                              e.preventDefault();
                              const filtered = availableUsersForTeam.filter((u) => !mtUserSearch.trim() || u.name?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtUserSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtUserSearch.toLowerCase()));
                              if (userHighlightedIndex === 0) { toggleSelectAllUsers(currentTeamMembers); }
                              else if (filtered[userHighlightedIndex - 1]) { toggleUserSelection(filtered[userHighlightedIndex - 1].id); }
                            }
                          }}
                          autoFocus
                        />
                      )}
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isUserDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "var(--text-secondary)",
                        }}
                      />
                    </div>
                    {isUserDropdownOpen && (
                      <div className="mt-dropdown-list">
                        <div className="mt-dropdown-header">
                          <label className="mt-dropdown-selectall">
                            <input
                              type="checkbox"
                              checked={
                                availableUsersForTeam.length > 0 &&
                                selectedUserIds.length === availableUsersForTeam.length
                              }
                              onChange={() => toggleSelectAllUsers(currentTeamMembers)}
                            />
                            {t("Select All", { defaultValue: "Select All" })}
                          </label>
                          {selectedUserIds.length > 0 && (
                            <span className="mt-dropdown-count">{t("{{count}} selected", { count: selectedUserIds.length })}</span>
                          )}
                        </div>
                        <div className="mt-dropdown-items" ref={mtUserListRef}>
                          {availableUsersForTeam.length === 0 ? (
                            <p className="mt-dropdown-empty">{t("All users are already members of this team.", { defaultValue: "All users are already members of this team." })}</p>
                          ) : (
                            <>
                              <div className={`mt-dropdown-item ${userHighlightedIndex === 0 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setUserHighlightedIndex(0)} style={{ cursor: "pointer" }}>
                                <label className="mt-dropdown-item" style={{ margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={
                                      availableUsersForTeam.length > 0 &&
                                      selectedUserIds.length === availableUsersForTeam.length
                                    }
                                    onChange={() => toggleSelectAllUsers(currentTeamMembers)}
                                  />
                                  {t("Select All", { defaultValue: "Select All" })}
                                </label>
                              </div>
                              {availableUsersForTeam
                                .filter((user) => {
                                  if (!mtUserSearch.trim()) return true;
                                  const q = mtUserSearch.toLowerCase();
                                  return user.name?.toLowerCase().includes(q) || user.role?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q);
                                })
                                .map((user, idx) => (
                                <label key={user.id} className={`mt-dropdown-item ${userHighlightedIndex === idx + 1 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setUserHighlightedIndex(idx + 1)}>
                                  <input
                                    type="checkbox"
                                    checked={selectedUserIds.includes(user.id)}
                                    onChange={() => toggleUserSelection(user.id)}
                                  />
                                  <div className="mt-dropdown-info">
                                    <span className="mt-dropdown-name">{user.name}</span>
                                    <div className="mt-dropdown-badges">
                                      {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                                      {user.department && <span className="mt-dropdown-dept">{user.department}</span>}
                                    </div>
                                  </div>
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={handleTeamClose}>
                      {t("Cancel", { defaultValue: "Cancel" })}
                    </button>
                    <LoadingButton type="submit" className="mt-btn-primary" loading={submitting} disabled={selectedUserIds.length === 0}>
                      {selectedUserIds.length > 1 ? t("Add Members", { defaultValue: "Add Members" }) : t("Add Member", { defaultValue: "Add Member" })}
                    </LoadingButton>
                  </div>
                </form>
              ) : (
                <form style={{ width: "100%" }} className="mt-modal-form" onSubmit={editTeamId ? handleUpdateTeam : handleCreateTeam}>
                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">{t("Team Name", { defaultValue: "Team Name" })}</label>
                    <input
                      style={{
                        width: "100%",
                        height: "52px",
                        border: "1px solid var(--border-color)",
                        borderRadius: "12px",
                        padding: "0 14px",
                        fontSize: "14px",
                        background: "var(--bg-hover)",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      type="text"
                      value={teamName}
                      onChange={(e) => { setTeamIsDirty(true); setTeamName(e.target.value); }}
                      placeholder={t("Enter Team Name", { defaultValue: "Enter Team Name" })}
                      required
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">{t("Description", { defaultValue: "Description" })}</label>
                    <RichTextEditor
                      value={teamDescription}
                      onChange={(val) => { setTeamIsDirty(true); setTeamDescription(val); }}
                      placeholder={t("Enter team description (optional)", { defaultValue: "Enter team description (optional)" })}
                    />
                  </div>

                  <div style={{ width: "100%", marginBottom: "20px" }}>
                    <label className="mt-field-label">
                      {t("Select Members", { defaultValue: "Select Members" })} <span className="text-danger" style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        height: "44px",
                        border: isMemberDropdownOpen ? "1px solid #6366f1" : "1px solid #d1d5db",
                        borderRadius: "10px",
                        padding: "0 12px",
                        fontSize: "14px",
                        background: "var(--bg-card)",
                        cursor: "pointer",
                        boxSizing: "border-box",
                        gap: "8px",
                        boxShadow: isMemberDropdownOpen ? "0 0 0 3px rgba(99, 102, 241, 0.1)" : "none",
                        transition: "border-color 0.2s, box-shadow 0.2s",
                      }}
                      onClick={() => { if (!isMemberDropdownOpen) { setIsMemberDropdownOpen(true); setMtMemberSearch(""); } }}
                    >
                      {selectedMemberIds.length > 0 && (
                        <span className="mt-combo-count">{t("{{count}} selected", { count: selectedMemberIds.length })}</span>
                      )}
                      {selectedMemberIds.length === 0 && !isMemberDropdownOpen && (
                        <span className="mt-combo-placeholder">{t("Click to select members", { defaultValue: "Click to select members" })}</span>
                      )}
                      {isMemberDropdownOpen && (
                        <input
                          type="text"
                          className="mt-combo-input"
                          placeholder={t("Search by member name, role, or department...", { defaultValue: "Search by member name, role, or department..." })}
                          value={mtMemberSearch}
                          onChange={(e) => { setMtMemberSearch(e.target.value); }}
                          onFocus={() => setIsMemberDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") { setMtMemberSearch(""); setIsMemberDropdownOpen(false); setMemberHighlightedIndex(0); }
                            else if (e.key === "ArrowDown") { e.preventDefault(); setMemberHighlightedIndex((p) => (p < users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase())).length ? p + 1 : 0)); }
                            else if (e.key === "ArrowUp") { e.preventDefault(); setMemberHighlightedIndex((p) => (p > 0 ? p - 1 : users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase())).length)); }
                            else if (e.key === "Enter") {
                              e.preventDefault();
                              const filtered = users.filter((u) => !mtMemberSearch.trim() || u.name?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.role?.toLowerCase().includes(mtMemberSearch.toLowerCase()) || u.department?.toLowerCase().includes(mtMemberSearch.toLowerCase()));
                              if (memberHighlightedIndex === 0) { toggleSelectAllMembers(); }
                              else if (filtered[memberHighlightedIndex - 1]) { toggleMemberSelection(filtered[memberHighlightedIndex - 1].id); }
                            }
                          }}
                          autoFocus
                        />
                      )}
                      <MdExpandMore
                        size={20}
                        style={{
                          transform: isMemberDropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "0.2s",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                        onClick={(e) => { e.stopPropagation(); if (isMemberDropdownOpen) { setIsMemberDropdownOpen(false); setMtMemberSearch(""); } else { setIsMemberDropdownOpen(true); setMtMemberSearch(""); } }}
                      />
                    </div>
                    {isMemberDropdownOpen && (
                      <div className="mt-dropdown-list">
                        <div className="mt-dropdown-header">
                          <label className="mt-dropdown-selectall">
                            <input
                              type="checkbox"
                              checked={users.length > 0 && selectedMemberIds.length === users.length}
                              onChange={toggleSelectAllMembers}
                            />
                            {t("Select All", { defaultValue: "Select All" })}
                          </label>
                          {selectedMemberIds.length > 0 && (
                            <span className="mt-dropdown-count">{t("{{count}} selected", { count: selectedMemberIds.length })}</span>
                          )}
                        </div>
                        <div className="mt-dropdown-items" ref={mtMemberListRef}>
                          {users.length === 0 ? (
                            <p className="mt-dropdown-empty">{t("No users available.", { defaultValue: "No users available." })}</p>
                          ) : (
                            <>
                              <div className={`mt-dropdown-item ${memberHighlightedIndex === 0 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setMemberHighlightedIndex(0)} style={{ cursor: "pointer" }}>
                                <label className="mt-dropdown-item" style={{ margin: 0 }}>
                                  <input
                                    type="checkbox"
                                    checked={users.length > 0 && selectedMemberIds.length === users.length}
                                    onChange={toggleSelectAllMembers}
                                  />
                                  {t("Select All", { defaultValue: "Select All" })}
                                </label>
                              </div>
                              {users
                                .filter((user) => {
                                  if (!mtMemberSearch.trim()) return true;
                                  const q = mtMemberSearch.toLowerCase();
                                  return user.name?.toLowerCase().includes(q) || user.role?.toLowerCase().includes(q) || user.department?.toLowerCase().includes(q);
                                })
                                .map((user, idx) => (
                                <label key={user.id} className={`mt-dropdown-item ${memberHighlightedIndex === idx + 1 ? "mt-dropdown-item--highlighted" : ""}`} onMouseEnter={() => setMemberHighlightedIndex(idx + 1)}>
                                  <input
                                    type="checkbox"
                                    checked={selectedMemberIds.includes(user.id)}
                                    onChange={() => toggleMemberSelection(user.id)}
                                  />
                                  <div className="mt-dropdown-info">
                                    <span className="mt-dropdown-name">{user.name}</span>
                                    <div className="mt-dropdown-badges">
                                      {user.role && <span className="mt-dropdown-role">{user.role}</span>}
                                      {user.department && <span className="mt-dropdown-dept">{user.department}</span>}
                                    </div>
                                  </div>
                                </label>
                              ))}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {selectedMemberIds.length > 0 && (
                    <div style={{ width: "100%", marginBottom: "20px" }}>
                      <label className="mt-field-label">{t("Select Team Lead (Optional)", { defaultValue: "Select Team Lead (Optional)" })}</label>
                      <select
                        style={{
                          width: "100%",
                          height: "52px",
                          border: "1px solid var(--border-color)",
                          borderRadius: "12px",
                          padding: "0 14px",
                          fontSize: "14px",
                          background: "var(--bg-hover)",
                          outline: "none",
                          boxSizing: "border-box",
                          cursor: "pointer",
                        }}
                        value={selectedLeaderId || ""}
                        onChange={(e) => { setTeamIsDirty(true); setSelectedLeaderId(e.target.value ? Number(e.target.value) : null); }}
                      >
                        <option value="">{t("No leader selected", { defaultValue: "No leader selected" })}</option>
                        {users
                          .filter((u) => selectedMemberIds.includes(u.id))
                          .map((u) => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role === "teamlead" ? t("Team Lead", { defaultValue: "Team Lead" }) : u.role}){u.department ? ` - ${u.department}` : ""}</option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-modal-actions">
                    <button type="button" className="mt-btn-cancel" onClick={handleTeamClose}>
                      {t("Cancel", { defaultValue: "Cancel" })}
                    </button>
                    {!editTeamId && (
                      <button
                        type="button"
                        className="mt-btn-cancel"
                        style={{ border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)" }}
                        onClick={(e) => handleCreateTeam(e, true)}
                        disabled={submitting}
                      >
                        {t("Save as Draft", { defaultValue: "Save as Draft" })}
                      </button>
                    )}
                    <LoadingButton type="submit" className="mt-btn-primary" loading={submitting}>
                      {editTeamId ? t("Update Team", { defaultValue: "Update Team" }) : t("Create Team", { defaultValue: "Create Team" })}
                    </LoadingButton>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}
        {TeamConfirmDialog}
      </div>
    </DashboardLayout>

    <ConfirmModal
      isOpen={deleteTeamConfirmOpen}
      onClose={() => { setDeleteTeamConfirmOpen(false); setDeleteTeamId(null); }}
      onConfirm={confirmDeleteTeam}
      title={t("Delete Team", { defaultValue: "Delete Team" })}
      message={t("Are you sure you want to delete this team? All associated team data may be affected. This action cannot be undone.", { defaultValue: "Are you sure you want to delete this team? All associated team data may be affected. This action cannot be undone." })}
      confirmText={t("Delete Team", { defaultValue: "Delete Team" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <ConfirmModal
      isOpen={leaderConfirmOpen}
      onClose={() => { setLeaderConfirmOpen(false); setLeaderConfirmData({ teamId: null, memberId: null, memberName: "" }); }}
      onConfirm={confirmSetLeader}
      title={t("Confirm Team Assignment", { defaultValue: "Confirm Team Assignment" })}
      message={t("Are you sure you want to assign {{name}} as Team Lead? This will update team responsibilities and permissions.", { name: leaderConfirmData.memberName, defaultValue: `Are you sure you want to assign ${leaderConfirmData.memberName} as Team Lead? This will update team responsibilities and permissions.` })}
      confirmText={t("Confirm", { defaultValue: "Confirm" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
    />

    <ConfirmModal
      isOpen={removeMemberConfirmOpen}
      onClose={() => { setRemoveMemberConfirmOpen(false); setRemoveMemberData({ teamId: null, memberId: null, memberName: "" }); }}
      onConfirm={confirmRemoveMember}
      title={t("Remove Member", { defaultValue: "Remove Member" })}
      message={t("Are you sure you want to remove {{name}} from this team? This action cannot be undone.", { name: removeMemberData.memberName, defaultValue: `Are you sure you want to remove ${removeMemberData.memberName} from this team? This action cannot be undone.` })}
      confirmText={t("Remove", { defaultValue: "Remove" })}
      cancelText={t("Cancel", { defaultValue: "Cancel" })}
      danger
    />

    <TeamWorkingHoursModal
      isOpen={workingHoursModalOpen}
      onClose={() => {
        setWorkingHoursModalOpen(false);
        setWorkingHoursTeam(null);
      }}
      team={workingHoursTeam}
      onSaved={() => fetchTeams()}
    />
    </>
  );
}

export default ManageTeam;