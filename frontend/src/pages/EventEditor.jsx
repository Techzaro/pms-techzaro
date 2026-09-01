import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import RichTextEditor from "../components/RichTextEditor";
import CreatableSelect from "react-select/creatable";
import UnifiedActivityFeed from "../components/UnifiedActivityFeed";
import DOMPurify from "dompurify";
import API_URL from "../config/api";
import { authToken, rolePath, getUser } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import "./EventsPage.css";
import {
  ArrowLeft,
  Calendar,
  Megaphone,
  Save,
  Pipette,
  MapPin,
  Clock,
  Video,
  Users,
  Building,
  ShieldCheck,
  Lock,
  Loader2,
  Check,
  Globe,
  AlertTriangle,
  Activity,
  CheckCircle2,
  ExternalLink,
  Bell,
  Plus,
  Trash2,
  Paperclip,
  UploadCloud,
  Download,
  FileText,
  File,
  XCircle,
  UserPlus,
  X,
} from "lucide-react";
import {
  convertToLocal,
  convertToUTC,
  getTimezoneOffsetDisplay,
  checkWorkingHoursCompliance,
} from "../utils/timezoneUtils";

export default function EventEditor() {
  const { t } = useTranslation();
  const { id } = useParams();
  const locationState = useLocation();
  const isEditMode = Boolean(id);
  const isViewMode = Boolean(id) && !locationState.pathname.includes("/edit");
  const isFormMode = !id || locationState.pathname.includes("/edit");
  const navigate = useNavigate();
  const notify = useNotification();
  const user = getUser();

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);

  // Tab for view mode: "details" | "activity"
  const [viewTab, setViewTab] = useState("details");

  // Acknowledge & RSVP state (for view mode)
  const [loadedEvent, setLoadedEvent] = useState(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Quick Add Participant modal in view mode
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [newParticipantIds, setNewParticipantIds] = useState([]);
  const [addingParticipants, setAddingParticipants] = useState(false);

  // Form Mode: 'event' vs 'announcement'
  const [formType, setFormType] = useState("event");

  // Core Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategoryOption, setSelectedCategoryOption] = useState(null);
  const categoryId = selectedCategoryOption ? selectedCategoryOption.value : "";
  const [eventTimezone, setEventTimezone] = useState(user?.timezone || "UTC");
  const [timezonesList, setTimezonesList] = useState([]);
  const [enforceOrgHours, setEnforceOrgHours] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [color, setColor] = useState("#3b82f6");

  // Dynamic Reminders State
  const [reminders, setReminders] = useState([
    { id: "rem-default-1", value: 15, unit: "minutes" },
  ]);

  // Attachments State
  const [existingAttachments, setExistingAttachments] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Visibility & Audience State
  const [visibilityLevel, setVisibilityLevel] = useState("organization");
  const [projectId, setProjectId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  // Inline Category Creation State
  const [savingNewCat, setSavingNewCat] = useState(false);
  const colorInputRef = useRef(null);

  // Dynamic Options from API
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Fetch dynamic dropdowns
  useEffect(() => {
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/event-categories`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        const catData = Array.isArray(d?.data) ? d.data : [];
        setCategories(catData);
      })
      .catch(() => {});

    fetch(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setProjects(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {});

    fetch(`${API_URL}/teams`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setTeams(Array.isArray(d) ? d : d?.data || []))
      .catch(() => {});

    fetch(`${API_URL}/users`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => setUsersList(Array.isArray(d) ? d : d?.data || d?.users || []))
      .catch(() => {});

    fetch(`${API_URL}/regional-settings/timezones`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data && Array.isArray(d.data)) setTimezonesList(d.data);
      })
      .catch(() => {});

    fetch(`${API_URL}/organization-settings/regional`, { headers: { Authorization: `Bearer ${token}` }, skipLoader: true })
      .then((r) => r.json())
      .then((d) => {
        const reg = d?.data || d?.regional_settings;
        if (reg && reg.enforce_working_hours !== undefined) {
          setEnforceOrgHours(Boolean(reg.enforce_working_hours));
        }
      })
      .catch(() => {});

    if (!isEditMode && locationState.state?.projectId) {
      setProjectId(String(locationState.state.projectId));
      setVisibilityLevel("project_team");
    }
  }, [isEditMode, locationState.state]);

  // Load existing event if editing or viewing
  useEffect(() => {
    if (!isEditMode) return;

    const token = authToken();
    setLoading(true);

    fetch(`${API_URL}/events/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      skipLoader: true,
    })
      .then((r) => r.json())
      .then((d) => {
        const ev = d?.data || d?.event;
        if (ev) {
          setLoadedEvent(ev);

          // Detect user's RSVP status
          const myParticipant = Array.isArray(ev.participants)
            ? ev.participants.find((p) => p.user_id === user?.id)
            : null;
          if (myParticipant) {
            setRsvpStatus(myParticipant.status);
            setAcknowledged(myParticipant.status === "acknowledged" || myParticipant.status === "accepted");
          }

          setTitle(ev.title || "");
          setDescription(ev.description || "");
          const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_announcement;
          setFormType(isAnnounce ? "announcement" : "event");

          if (ev.category_id) {
            setCategories((prevCats) => {
              const match = prevCats.find((c) => String(c.id) === String(ev.category_id));
              if (match) {
                setSelectedCategoryOption({ value: String(match.id), label: match.name });
              } else {
                setSelectedCategoryOption({ value: String(ev.category_id), label: t("Loading…", { defaultValue: "Loading…" }), __pending: true });
              }
              return prevCats;
            });
          }
          setVisibilityLevel(ev.visibility_level || "organization");
          setLocation(ev.location || "");
          setMeetingLink(ev.meeting_link || "");
          setColor(ev.color || "#3b82f6");
          setAllDay(Boolean(ev.all_day));
          if (ev.event_timezone || ev.timezone) {
            setEventTimezone(ev.event_timezone || ev.timezone);
          }

          if (ev.start_date) {
            const parts = ev.start_date.split("T");
            setStartDate(parts[0] || "");
            if (parts[1]) setStartTime(parts[1].substring(0, 5));
          }
          if (ev.end_date) {
            const parts = ev.end_date.split("T");
            setEndDate(parts[0] || "");
            if (parts[1]) setEndTime(parts[1].substring(0, 5));
          }

          if (Array.isArray(ev.assigned_users)) {
            setSelectedUserIds(ev.assigned_users.map((u) => u.id));
          }

          if (Array.isArray(ev.reminders) && ev.reminders.length > 0) {
            setReminders(ev.reminders.map((r, idx) => ({ id: r.id || `rem-${idx}`, value: r.value, unit: r.unit })));
          }

          if (Array.isArray(ev.attachments)) {
            setExistingAttachments(ev.attachments);
          }
        } else {
          notify.error(t("Event not found.", { defaultValue: "Event not found." }));
          navigate(rolePath("events"));
        }
      })
      .catch(() => {
        notify.error(t("Failed to load event details.", { defaultValue: "Failed to load event details." }));
      })
      .finally(() => setLoading(false));
  }, [id, isEditMode, t]);

  // Resolve pending category once categories list arrives
  useEffect(() => {
    if (!selectedCategoryOption?.__pending || categories.length === 0) return;
    const match = categories.find((c) => String(c.id) === selectedCategoryOption.value);
    if (match) {
      setSelectedCategoryOption({ value: String(match.id), label: match.name });
    }
  }, [categories, selectedCategoryOption]);

  // Dynamic Reminders Handlers
  const handleAddReminder = () => {
    setReminders((prev) => [...prev, { id: `rem-${Date.now()}`, value: 15, unit: "minutes" }]);
  };

  const handleUpdateReminder = (index, field, val) => {
    setReminders((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleRemoveReminder = (index) => {
    setReminders((prev) => prev.filter((_, i) => i !== index));
  };

  // Attachments Handlers
  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setNewFiles((prev) => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const handleRemoveNewFile = (index) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingAttachment = async (attachmentId) => {
    if (!window.confirm(t("Are you sure you want to delete this attachment?", { defaultValue: "Are you sure you want to delete this attachment?" }))) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id}/attachments/${attachmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setExistingAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        notify.success(t("Attachment deleted successfully.", { defaultValue: "Attachment deleted successfully." }));
      }
    } catch (err) {
      notify.error(t("Failed to delete attachment.", { defaultValue: "Failed to delete attachment." }));
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id || loadedEvent?.id}/attachments/${attachment.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.file_name || "attachment";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      notify.error(t("Failed to download attachment.", { defaultValue: "Failed to download attachment." }));
    }
  };

  // Category Creation handler
  const handleCreateCategory = async (inputValue) => {
    const name = (inputValue || "").trim();
    if (!name) return;

    try {
      setSavingNewCat(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/event-categories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (res.ok && (data?.data?.id || data?.category?.id)) {
        const newCat = data.data || data.category;
        setCategories((prev) => [...prev, newCat]);
        setSelectedCategoryOption({ value: String(newCat.id), label: newCat.name });
        notify.success(t("Event category created successfully", { defaultValue: "Event category created successfully" }));
      } else {
        notify.error(data?.message || t("Failed to create category", { defaultValue: "Failed to create category" }));
      }
    } catch (err) {
      notify.error(t("Network error while creating category", { defaultValue: "Network error while creating category" }));
    } finally {
      setSavingNewCat(false);
    }
  };

  // Cancel Event
  const handleCancelEvent = async () => {
    if (!window.confirm(t("Are you sure you want to cancel this event? All attendees will be notified.", { defaultValue: "Are you sure you want to cancel this event? All attendees will be notified." }))) return;
    try {
      setActionLoading(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id || loadedEvent?.id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Event cancelled successfully.", { defaultValue: "Event cancelled successfully." }));
        setLoadedEvent((prev) => ({ ...prev, status: "cancelled" }));
      } else {
        notify.error(data?.message || t("Failed to cancel event.", { defaultValue: "Failed to cancel event." }));
      }
    } catch (err) {
      notify.error(t("Failed to cancel event.", { defaultValue: "Failed to cancel event." }));
    } finally {
      setActionLoading(false);
    }
  };

  // RSVP / Acknowledge Action
  const handleRsvp = async (status) => {
    try {
      setActionLoading(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id || loadedEvent?.id}/rsvp`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRsvpStatus(status);
        setAcknowledged(true);
        notify.success(t("RSVP response recorded: {{status}}", { status, defaultValue: `RSVP response recorded: ${status}` }));
        if (loadedEvent) {
          setLoadedEvent((prev) => ({
            ...prev,
            participants: prev.participants
              ? prev.participants.map((p) => p.user_id === user?.id ? { ...p, status } : p)
              : [{ user_id: user?.id, status, user }],
          }));
        }
      } else {
        notify.error(data?.message || t("Failed to record RSVP.", { defaultValue: "Failed to record RSVP." }));
      }
    } catch (err) {
      notify.error(t("Network error while recording RSVP.", { defaultValue: "Network error while recording RSVP." }));
    } finally {
      setActionLoading(false);
    }
  };

  // Add Participants Action (in view mode)
  const handleAddParticipantsSubmit = async () => {
    if (newParticipantIds.length === 0) return;
    try {
      setAddingParticipants(true);
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id || loadedEvent?.id}/participants`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_ids: newParticipantIds }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Participants added successfully!", { defaultValue: "Participants added successfully!" }));
        setLoadedEvent(data.data);
        setShowAddParticipantModal(false);
        setNewParticipantIds([]);
      } else {
        notify.error(data?.message || t("Failed to add participants.", { defaultValue: "Failed to add participants." }));
      }
    } catch (err) {
      notify.error(t("Failed to add participants.", { defaultValue: "Failed to add participants." }));
    } finally {
      setAddingParticipants(false);
    }
  };

  // Remove Participant (in view mode)
  const handleRemoveParticipant = async (participantUserId) => {
    if (!window.confirm(t("Remove this participant from the event?", { defaultValue: "Remove this participant from the event?" }))) return;
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/events/${id || loadedEvent?.id}/participants/${participantUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify.success(t("Participant removed.", { defaultValue: "Participant removed." }));
        setLoadedEvent(data.data);
      }
    } catch (err) {
      notify.error(t("Failed to remove participant.", { defaultValue: "Failed to remove participant." }));
    }
  };

  // Compute UTC strings and check Working Hours Compliance
  const startDateTimeUtc = React.useMemo(() => {
    if (!startDate) return null;
    return convertToUTC(allDay ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`, eventTimezone);
  }, [startDate, startTime, allDay, eventTimezone]);

  const endDateTimeUtc = React.useMemo(() => {
    if (!startDate) return null;
    const endD = endDate || startDate;
    const endT = endTime || startTime;
    return convertToUTC(allDay ? `${endD} 23:59:59` : `${endD} ${endT}:00`, eventTimezone);
  }, [startDate, endDate, endTime, startTime, allDay, eventTimezone]);

  const participantWarnings = React.useMemo(() => {
    if (formType === "announcement" || allDay || !startDateTimeUtc) return [];
    const warnings = [];
    const selectedUsers = usersList.filter((u) => selectedUserIds.includes(u.id));
    selectedUsers.forEach((u) => {
      const uTz = u.timezone || "UTC";
      const compliance = checkWorkingHoursCompliance(startDateTimeUtc, endDateTimeUtc, u.working_hours, uTz);
      if (!compliance.isCompliant) {
        warnings.push({
          user: u,
          reason: compliance.reason,
          localTime: compliance.localTimeFormatted,
          localDay: compliance.localDay,
          scheduleText: compliance.scheduleText,
        });
      }
    });
    return warnings;
  }, [formType, allDay, startDateTimeUtc, endDateTimeUtc, usersList, selectedUserIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim()) {
      notify.error(t("Title is required.", { defaultValue: "Title is required." }));
      return;
    }
    if (!startDate) {
      notify.error(t("Date is required.", { defaultValue: "Date is required." }));
      return;
    }

    if (enforceOrgHours && participantWarnings.length > 0) {
      notify.error(
        t("Cannot schedule event: Organization strictly enforces working hours policy, and {{count}} participant(s) are outside their scheduled hours.", {
          count: participantWarnings.length,
          defaultValue: `Cannot schedule event: Organization strictly enforces working hours policy, and ${participantWarnings.length} participant(s) are outside their scheduled hours.`,
        })
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = authToken();
      const isAnnounce = formType === "announcement";

      const startDateTime = allDay || isAnnounce ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
      const endDateTime = isAnnounce ? startDateTime : (endDate ? (allDay ? `${endDate} 23:59:59` : `${endDate} ${endTime}:00`) : startDateTime);

      // Clean formatted reminders array
      const formattedReminders = reminders
        .filter((r) => r.value > 0)
        .map((r) => ({ value: Number(r.value), unit: r.unit }));

      // Multipart FormData to support instant file uploads during event creation/editing
      const formData = new FormData();
      formData.append("title", title.trim());
      if (description && description.replace(/<[^>]*>/g, "").trim()) {
        formData.append("description", description);
      }
      formData.append("type", isAnnounce ? "announcement" : "event");
      if (categoryId) formData.append("category_id", categoryId);
      formData.append("start_date", startDateTime);
      formData.append("end_date", endDateTime);
      formData.append("start_time", startTime);
      formData.append("end_time", endTime);
      formData.append("event_timezone", eventTimezone);
      formData.append("timezone", eventTimezone);
      formData.append("all_day", allDay ? "1" : "0");
      formData.append("is_global", isAnnounce || visibilityLevel === "organization" ? "1" : "0");
      formData.append("visibility_level", visibilityLevel);
      if (!isAnnounce && location.trim()) formData.append("location", location.trim());
      if (!isAnnounce && meetingLink.trim()) formData.append("meeting_link", meetingLink.trim());
      formData.append("color", color);
      formData.append("status", "scheduled");

      if (visibilityLevel === "project_team" && projectId) {
        formData.append("project_id", projectId);
      }

      // Arrays as JSON strings for clean backend parsing
      formData.append("assigned_user_ids", JSON.stringify(isAnnounce ? [] : selectedUserIds));
      formData.append("participant_user_ids", JSON.stringify(isAnnounce ? [] : selectedUserIds));
      formData.append("team_ids", JSON.stringify(selectedTeamIds));
      formData.append("reminders", JSON.stringify(formattedReminders));

      // Append new files
      newFiles.forEach((file) => {
        formData.append("attachments[]", file);
      });

      const url = isEditMode ? `${API_URL}/events/${id}` : `${API_URL}/events`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        notify.success(
          isEditMode
            ? t("Event updated successfully!", { defaultValue: "Event updated successfully!" })
            : isAnnounce
            ? t("Company Announcement published!", { defaultValue: "Company Announcement published!" })
            : t("Event created successfully!", { defaultValue: "Event created successfully!" })
        );
        navigate(rolePath("events"));
      } else {
        notify.error(data?.message || t("Failed to save event.", { defaultValue: "Failed to save event." }));
      }
    } catch (e) {
      notify.error(t("An error occurred while saving event.", { defaultValue: "An error occurred while saving event." }));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserSelection = (uId) => {
    if (!uId) return;
    setSelectedUserIds((prev) =>
      prev.includes(uId) ? prev.filter((x) => x !== uId) : [...prev, uId]
    );
  };

  const filteredUsers = usersList.filter((u) => {
    if (!attendeeSearch.trim()) return true;
    const q = attendeeSearch.toLowerCase();
    return u?.name?.toLowerCase().includes(q) || u?.email?.toLowerCase().includes(q);
  });

  const categoryOptions = categories.map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  const PRESET_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#ef4444"];

  const visibilityOptions = [
    { value: "organization", label: t("Organization (Everyone in Company)", { defaultValue: "Organization (Everyone in Company)" }) },
    { value: "department_team", label: t("Department Team (My Department)", { defaultValue: "Department Team (My Department)" }) },
    { value: "project_team", label: t("Project Team (Target Project Members)", { defaultValue: "Project Team (Target Project Members)" }) },
    { value: "team", label: t("Team (Specific Team Members)", { defaultValue: "Team (Specific Team Members)" }) },
    { value: "custom", label: t("Custom (Select Specific Users & Teams)", { defaultValue: "Custom (Select Specific Users & Teams)" }) },
    { value: "private", label: t("Private (Only Me)", { defaultValue: "Private (Only Me)" }) },
  ];

  const projectOptions = [
    { value: "", label: t("Select Target Project...", { defaultValue: "Select Target Project..." }) },
    ...projects.map((p) => ({ value: String(p.id), label: p.title })),
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ textAlign: "center", padding: "100px 0", color: "var(--text-secondary)" }}>
          <Loader2 className="animate-spin" size={36} style={{ margin: "0 auto 12px", color: "#2563eb" }} />
          {t("Loading event details...", { defaultValue: "Loading event details..." })}
        </div>
      </DashboardLayout>
    );
  }

  const breadcrumbs = [
    { label: t("Events & Announcements", { defaultValue: "Events & Announcements" }), path: rolePath("events") },
    {
      label: isViewMode
        ? t("Event Details", { defaultValue: "Event Details" })
        : isEditMode
        ? t("Edit Event", { defaultValue: "Edit Event" })
        : t("Create Event / Announcement", { defaultValue: "Create Event / Announcement" }),
    },
  ];

  // ── VIEW MODE: Read-only page with tabs, attachments, participants & actions ─────────────
  if (isViewMode && loadedEvent) {
    const ev = loadedEvent;
    const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement";
    const isAssigned = Array.isArray(ev.assigned_users) && ev.assigned_users.some((u) => u?.id === user?.id);
    const isParticipant = Array.isArray(ev.participants) && ev.participants.some((p) => p?.user_id === user?.id);
    const isCreatorOrOrganizer = ev.user_id === user?.id || ev.organizer_id === user?.id || ev.created_by === user?.id;
    const canEdit = isCreatorOrOrganizer || ["admin", "manager", "superadmin"].includes(user?.role);
    const isCancelled = ev.status === "cancelled";
    const startDateObj = ev.start_date ? new Date(ev.start_date) : null;

    return (
      <DashboardLayout>
        <Breadcrumb items={breadcrumbs} />
        <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0 8px" }}>
          {/* Top Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "10px" }}>
            <button
              type="button"
              onClick={() => navigate(rolePath("events"))}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600 }}
            >
              <ArrowLeft size={16} /> {t("Back to Events", { defaultValue: "Back to Events" })}
            </button>

            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* RSVP & Acknowledge Controls - Hidden for Creator / Organizer */}
              {!isCancelled && !isCreatorOrOrganizer && (isAssigned || isParticipant || isAnnounce) && (
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {isAnnounce ? (
                    <button
                      type="button"
                      onClick={() => handleRsvp("acknowledged")}
                      disabled={actionLoading || acknowledged}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        border: "none",
                        background: acknowledged ? "#10b981" : "#2563eb",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: acknowledged ? "default" : "pointer",
                      }}
                    >
                      <CheckCircle2 size={14} />
                      {acknowledged ? t("Acknowledged ✓", { defaultValue: "Acknowledged ✓" }) : t("Acknowledge", { defaultValue: "Acknowledge" })}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRsvp("accepted")}
                        disabled={actionLoading}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "7px 12px",
                          borderRadius: "6px",
                          border: "1px solid #16a34a",
                          background: rsvpStatus === "accepted" ? "#16a34a" : "#f0fdf4",
                          color: rsvpStatus === "accepted" ? "#fff" : "#16a34a",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ✓ {t("Accept", { defaultValue: "Accept" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRsvp("tentative")}
                        disabled={actionLoading}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "7px 12px",
                          borderRadius: "6px",
                          border: "1px solid #d97706",
                          background: rsvpStatus === "tentative" ? "#d97706" : "#fef3c7",
                          color: rsvpStatus === "tentative" ? "#fff" : "#d97706",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ? {t("Maybe", { defaultValue: "Maybe" })}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRsvp("declined")}
                        disabled={actionLoading}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "7px 12px",
                          borderRadius: "6px",
                          border: "1px solid #dc2626",
                          background: rsvpStatus === "declined" ? "#dc2626" : "#fef2f2",
                          color: rsvpStatus === "declined" ? "#fff" : "#dc2626",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        ✕ {t("Decline", { defaultValue: "Decline" })}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Cancel Event Action */}
              {canEdit && !isCancelled && (
                <button
                  type="button"
                  onClick={handleCancelEvent}
                  disabled={actionLoading}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #fca5a5",
                    background: "#fef2f2",
                    color: "#dc2626",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <XCircle size={15} /> {t("Cancel Event", { defaultValue: "Cancel Event" })}
                </button>
              )}

              {/* Edit Event Action */}
              {canEdit && !isCancelled && (
                <button
                  type="button"
                  onClick={() => navigate(rolePath(`events/edit/${id}`))}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t("Edit", { defaultValue: "Edit" })}
                </button>
              )}
            </div>
          </div>

          {/* ── TAB BAR ─────────────────────────────────── */}
          <div style={{ display: "flex", gap: "4px", borderBottom: "2px solid var(--border-color)" }}>
            {[
              { id: "details", label: t("Details", { defaultValue: "Details" }), icon: <Calendar size={15} /> },
              { id: "activity", label: t("Activity", { defaultValue: "Activity" }), icon: <Activity size={15} /> },
            ].map(({ id: tabId, label, icon }) => (
              <button
                key={tabId}
                type="button"
                onClick={() => setViewTab(tabId)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  border: "none",
                  borderBottom: viewTab === tabId ? "2px solid #2563eb" : "2px solid transparent",
                  marginBottom: "-2px",
                  background: "transparent",
                  color: viewTab === tabId ? "#2563eb" : "var(--text-secondary)",
                  fontWeight: viewTab === tabId ? 700 : 500,
                  fontSize: "13px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* ── DETAILS TAB ──────────────────────────────── */}
          {viewTab === "details" && (
            <div style={{ background: "var(--bg-card)", borderRadius: "0 0 14px 14px", border: "1px solid var(--border-color)", borderTop: "none", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              {/* Type + Category + Status badges */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
                {isAnnounce ? (
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#d97706", background: "#fef3c7", padding: "3px 10px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Megaphone size={13} /> {t("Company Announcement", { defaultValue: "Company Announcement" })}
                  </span>
                ) : (
                  <span style={{ fontSize: "12px", fontWeight: 700, color: ev.category?.color || "#2563eb", background: "#eff6ff", padding: "3px 10px", borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={13} /> {t("Event Invitation", { defaultValue: "Event Invitation" })}
                  </span>
                )}
                {ev.category?.name && (
                  <span style={{ fontSize: "12px", fontWeight: 600, color: ev.category?.color || "#475569", background: "var(--bg-hover)", padding: "3px 8px", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    {ev.category.name}
                  </span>
                )}
                {ev.status && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 9px",
                      borderRadius: "10px",
                      background: isCancelled ? "#fee2e2" : "#f0fdf4",
                      color: isCancelled ? "#dc2626" : "#16a34a",
                    }}
                  >
                    {ev.status}
                  </span>
                )}
                {ev.visibility_level && (
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "12px", background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border-color)" }}>
                    {ev.visibility_level}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 style={{ margin: "0 0 20px", fontSize: "24px", fontWeight: 700, color: isCancelled ? "#94a3b8" : "var(--text-primary)", textDecoration: isCancelled ? "line-through" : "none", lineHeight: 1.3 }}>
                {ev.title}
              </h2>

              {/* Timing & Location Info */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px", background: "var(--bg-hover)", borderRadius: "10px", border: "1px solid var(--border-color)", marginBottom: "20px", fontSize: "13px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                  <Clock size={16} color="#2563eb" />
                  <span>
                    {startDateObj
                      ? startDateObj.toLocaleString([], { dateStyle: "full", timeStyle: ev.all_day ? undefined : "short" })
                      : t("Date not set", { defaultValue: "Date not set" })}
                    {ev.end_date && ev.end_date !== ev.start_date && (
                      <span> – {new Date(ev.end_date).toLocaleString([], { dateStyle: "medium", timeStyle: ev.all_day ? undefined : "short" })}</span>
                    )}
                    {ev.all_day && <span style={{ marginLeft: "6px", fontWeight: 600, color: "#2563eb" }}>{t("(All Day)", { defaultValue: "(All Day)" })}</span>}
                  </span>
                </div>
                {ev.location && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-primary)" }}>
                    <MapPin size={16} color="#ef4444" /> <span>{ev.location}</span>
                  </div>
                )}
                {ev.meeting_link && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Video size={16} color="#10b981" />
                    <a
                      href={ev.meeting_link.startsWith("http") ? ev.meeting_link : "https://" + ev.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      {t("Join Video Meeting", { defaultValue: "Join Video Meeting" })} <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>

              {/* Description */}
              {ev.description && (
                <div
                  style={{ fontSize: "14px", lineHeight: "1.7", color: "var(--text-primary)", marginBottom: "24px" }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(ev.description, {
                      ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "s", "ul", "ol", "li", "h1", "h2", "h3", "blockquote", "a", "span", "code"],
                      ALLOWED_ATTR: ["href", "target", "rel", "class", "style"],
                    }),
                  }}
                />
              )}

              {/* Configured Dynamic Reminders */}
              {Array.isArray(ev.reminders) && ev.reminders.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginBottom: "20px" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Bell size={14} color="#f59e0b" />
                    {t("Scheduled Reminders", { defaultValue: "Scheduled Reminders" })}
                  </h4>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {ev.reminders.map((r, idx) => (
                      <span key={r.id || idx} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", background: "var(--bg-hover)", padding: "4px 10px", borderRadius: "16px", border: "1px solid var(--border-color)" }}>
                        <Clock size={12} color="#64748b" />
                        {r.value} {r.unit} {t("before start", { defaultValue: "before start" })}
                        {r.is_sent && <span style={{ color: "#16a34a", fontWeight: 700, fontSize: "10px" }}>(Sent ✓)</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Event Attachments */}
              {Array.isArray(ev.attachments) && ev.attachments.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginBottom: "20px" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Paperclip size={14} color="#2563eb" />
                    {t("Attachments ({{count}})", { count: ev.attachments.length, defaultValue: `Attachments (${ev.attachments.length})` })}
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {ev.attachments.map((att) => (
                      <div
                        key={att.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          border: "1px solid var(--border-color)",
                          background: "var(--bg-hover)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <FileText size={18} color="#2563eb" />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {att.file_name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {att.file_size ? `${(att.file_size / 1024).toFixed(1)} KB` : ""}{" "}
                              {att.uploaded_by ? `• Uploaded by ${att.uploaded_by}` : ""}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDownloadAttachment(att)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            color: "#2563eb",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Download size={13} /> {t("Download", { defaultValue: "Download" })}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attendees & RSVP Status */}
              {Array.isArray(ev.participants) && ev.participants.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "16px", marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                    <h4 style={{ margin: 0, fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <Users size={14} color="#6366f1" />
                      {t("Participants & RSVP ({{count}})", { count: ev.participants.length, defaultValue: `Participants & RSVP (${ev.participants.length})` })}
                    </h4>
                    {canEdit && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => setShowAddParticipantModal(true)}
                        style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                      >
                        <UserPlus size={14} /> {t("Add Participants", { defaultValue: "Add Participants" })}
                      </button>
                    )}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px" }}>
                    {ev.participants.map((p) => {
                      const statusColor = p.status === "accepted" ? "#16a34a" : p.status === "declined" ? "#dc2626" : p.status === "tentative" ? "#d97706" : "#64748b";
                      const statusBg = p.status === "accepted" ? "#f0fdf4" : p.status === "declined" ? "#fef2f2" : p.status === "tentative" ? "#fef3c7" : "#f1f5f9";
                      return (
                        <div
                          key={p.id || p.user_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color)",
                            background: "var(--bg-hover)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, flexShrink: 0 }}>
                              {(p.name || "U")[0].toUpperCase()}
                            </div>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "capitalize", padding: "2px 6px", borderRadius: "10px", background: statusBg, color: statusColor }}>
                              {p.status || "invited"}
                            </span>
                            {canEdit && !isCancelled && (
                              <button
                                type="button"
                                title={t("Remove attendee", { defaultValue: "Remove attendee" })}
                                onClick={() => handleRemoveParticipant(p.user_id)}
                                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "2px" }}
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer Organizer Info */}
              <div style={{ fontSize: "12px", color: "var(--text-muted)", paddingTop: "14px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <span>
                  {t("Organized by", { defaultValue: "Organized by" })}: <strong>{ev.organizer_name || ev.creator_name || "System"}</strong>
                </span>
                <span>
                  {t("Created", { defaultValue: "Created" })}: {ev.created_at ? new Date(ev.created_at).toLocaleDateString() : ""}
                </span>
              </div>
            </div>
          )}

          {/* ── ACTIVITY TAB ─────────────────────────────── */}
          {viewTab === "activity" && (
            <div style={{ background: "var(--bg-card)", borderRadius: "0 0 14px 14px", border: "1px solid var(--border-color)", borderTop: "none", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <UnifiedActivityFeed module="event" entityId={id} />
            </div>
          )}
        </div>

        {/* Add Participants Modal (View Mode) */}
        {showAddParticipantModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "16px" }}>
            <div style={{ background: "var(--bg-card, #ffffff)", borderRadius: "12px", maxWidth: "480px", width: "100%", padding: "20px", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>
                  {t("Add Event Participants", { defaultValue: "Add Event Participants" })}
                </h3>
                <button onClick={() => setShowAddParticipantModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "6px", marginBottom: "16px" }}>
                {usersList
                  .filter((u) => !loadedEvent?.participants?.some((p) => p.user_id === u.id))
                  .map((u) => {
                    const isSelected = newParticipantIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() =>
                          setNewParticipantIds((prev) =>
                            prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                          )
                        }
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          background: isSelected ? "#eff6ff" : "transparent",
                          margin: "2px 0",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>
                            {u.name[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontSize: "12px", fontWeight: 600 }}>{u.name}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{u.email}</div>
                          </div>
                        </div>
                        <input type="checkbox" checked={isSelected} readOnly style={{ cursor: "pointer" }} />
                      </div>
                    );
                  })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowAddParticipantModal(false)}
                  style={{ padding: "8px 14px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  {t("Cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  onClick={handleAddParticipantsSubmit}
                  disabled={addingParticipants || newParticipantIds.length === 0}
                  style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                >
                  {addingParticipants ? t("Adding...", { defaultValue: "Adding..." }) : t("Add Selected", { defaultValue: "Add Selected" })}
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardLayout>
    );
  }

  // ── CREATE / EDIT FORM MODE ─────────────────────────────
  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ maxWidth: "840px", margin: "0 auto", padding: "0 8px", paddingBottom: "80px" }}>
        {/* HEADER BAR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => navigate(rolePath("events"))}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontSize: "13px", fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> {t("Back to Events", { defaultValue: "Back to Events" })}
          </button>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            {isEditMode ? t("Edit Event / Announcement", { defaultValue: "Edit Event / Announcement" }) : t("New Event / Announcement", { defaultValue: "New Event / Announcement" })}
          </h3>
        </div>

        <div style={{ background: "var(--bg-card)", borderRadius: "14px", border: "1px solid var(--border-color)", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* TYPE DROPDOWN */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                {t("Type", { defaultValue: "Type" })} <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                style={{
                  width: "100%",
                  height: "42px",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-card)",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
              >
                <option value="event">{t("📅 Event Invitation", { defaultValue: "📅 Event Invitation" })}</option>
                <option value="announcement">{t("📢 Company Announcement", { defaultValue: "📢 Company Announcement" })}</option>
              </select>
            </div>

            {/* TITLE */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {formType === "announcement" ? t("Announcement Headline *", { defaultValue: "Announcement Headline *" }) : t("Event Title *", { defaultValue: "Event Title *" })}
              </label>
              <input
                type="text"
                required
                placeholder={formType === "announcement" ? t("e.g. Office Closure for National Holiday", { defaultValue: "e.g. Office Closure for National Holiday" }) : t("e.g. Sprint Review & Architecture Planning", { defaultValue: "e.g. Sprint Review & Architecture Planning" })}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%", height: "42px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "14px", color: "var(--text-primary)", boxSizing: "border-box" }}
              />
            </div>

            {/* CATEGORY & THEME COLOR */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Category", { defaultValue: "Category" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <CreatableSelect
                  isClearable
                  isDisabled={savingNewCat}
                  isLoading={savingNewCat}
                  onChange={(option) => setSelectedCategoryOption(option || null)}
                  onCreateOption={handleCreateCategory}
                  options={categoryOptions}
                  value={selectedCategoryOption}
                  placeholder={t("Select or type to create…", { defaultValue: "Select or type to create…" })}
                  formatCreateLabel={(inputValue) => `➕ ${t('Create "{{name}}"', { name: inputValue, defaultValue: `Create "${inputValue}"` })}`}
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      minHeight: "42px",
                      borderRadius: "8px",
                      border: `1px solid ${state.isFocused ? "#2563eb" : "var(--border-color, #cbd5e1)"}`,
                      boxShadow: state.isFocused ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
                      background: "var(--bg-card, #ffffff)",
                      color: "var(--text-primary, #0f172a)",
                      fontSize: "13px",
                    }),
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Theme Color", { defaultValue: "Theme Color" })}
                </label>
                <div style={{ display: "flex", gap: "7px", alignItems: "center", flexWrap: "wrap" }}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: c,
                        border: color === c ? "3px solid #0f172a" : "2px solid transparent",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    />
                  ))}
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                    tabIndex={-1}
                  />
                  <button
                    type="button"
                    onClick={() => colorInputRef.current?.click()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "4px 10px",
                      borderRadius: "20px",
                      border: !PRESET_COLORS.includes(color) ? "2px solid #0f172a" : "1px solid var(--border-color, #cbd5e1)",
                      background: !PRESET_COLORS.includes(color) ? color : "var(--bg-hover, #f8fafc)",
                      color: !PRESET_COLORS.includes(color) ? "#fff" : "var(--text-secondary, #64748b)",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Pipette size={12} />
                    {!PRESET_COLORS.includes(color) ? color.toUpperCase() : t("Custom", { defaultValue: "Custom" })}
                  </button>
                </div>
              </div>
            </div>

            {/* DATE & TIME */}
            {formType === "announcement" ? (
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Announcement Date *", { defaultValue: "Announcement Date *" })}
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", boxSizing: "border-box" }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--bg-hover)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>{t("Event Timing", { defaultValue: "Event Timing" })}</span>
                  <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                      style={{ cursor: "pointer" }}
                    />
                    {t("All Day Event", { defaultValue: "All Day Event" })}
                  </label>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: allDay ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Start Date *", { defaultValue: "Start Date *" })}</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                    />
                  </div>

                  {!allDay && (
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("Start Time", { defaultValue: "Start Time" })}</label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("End Date", { defaultValue: "End Date" })}</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                    />
                  </div>

                  {!allDay && (
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "4px" }}>{t("End Time", { defaultValue: "End Time" })}</label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                      />
                    </div>
                  )}
                </div>

                {/* Event Timezone Selector */}
                <div style={{ marginTop: "4px", paddingTop: "10px", borderTop: "1px solid var(--border-light, #e2e8f0)" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                    <Globe size={13} style={{ color: "var(--color-primary, #4f46e5)" }} /> {t("Event Timezone (IANA)", { defaultValue: "Event Timezone (IANA)" })}
                  </label>
                  <select
                    value={eventTimezone}
                    onChange={(e) => setEventTimezone(e.target.value)}
                    style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px" }}
                  >
                    {timezonesList.length > 0 ? (
                      timezonesList.map((tz) => (
                        <option key={tz} value={tz}>{tz} {getTimezoneOffsetDisplay(tz)}</option>
                      ))
                    ) : (
                      ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo"].map((tz) => (
                        <option key={tz} value={tz}>{tz} {getTimezoneOffsetDisplay(tz)}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* LOCATION & MEETING LINK */}
            {formType === "event" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    {t("Location (Physical)", { defaultValue: "Location (Physical)" })}
                  </label>
                  <input
                    type="text"
                    placeholder={t("e.g. Conference Room A or Main Office", { defaultValue: "e.g. Conference Room A or Main Office" })}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                    {t("Meeting Link (Virtual)", { defaultValue: "Meeting Link (Virtual)" })}
                  </label>
                  <input
                    type="text"
                    placeholder={t("e.g. https://meet.google.com/xyz-abcd-efg", { defaultValue: "e.g. https://meet.google.com/xyz-abcd-efg" })}
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", boxSizing: "border-box" }}
                  />
                </div>
              </div>
            )}

            {/* DESCRIPTION */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {formType === "announcement" ? t("Announcement Message *", { defaultValue: "Announcement Message *" }) : t("Event Description", { defaultValue: "Event Description" })}
              </label>
              <RichTextEditor
                value={description}
                onChange={(html) => setDescription(html)}
                placeholder={t("Provide detailed agenda, discussion points, or announcement notes...", { defaultValue: "Provide detailed agenda, discussion points, or announcement notes..." })}
                style={{ borderRadius: "8px", fontSize: "13px" }}
              />
            </div>

            {/* DYNAMIC REMINDERS (PHASE 4) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg-hover)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Bell size={16} color="#f59e0b" />
                  <span style={{ fontSize: "13px", fontWeight: 700 }}>{t("Dynamic Event Reminders", { defaultValue: "Dynamic Event Reminders" })}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAddReminder}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    color: "#2563eb",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={13} /> {t("Add Reminder", { defaultValue: "Add Reminder" })}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {reminders.map((rem, index) => (
                  <div key={rem.id || index} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)", width: "65px" }}>{t("Remind", { defaultValue: "Remind" })}:</span>
                    <input
                      type="number"
                      min="1"
                      value={rem.value}
                      onChange={(e) => handleUpdateReminder(index, "value", Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: "80px", height: "36px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
                    />
                    <select
                      value={rem.unit}
                      onChange={(e) => handleUpdateReminder(index, "unit", e.target.value)}
                      style={{ width: "130px", height: "36px", padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
                    >
                      <option value="minutes">{t("Minutes before", { defaultValue: "Minutes before" })}</option>
                      <option value="hours">{t("Hours before", { defaultValue: "Hours before" })}</option>
                      <option value="days">{t("Days before", { defaultValue: "Days before" })}</option>
                    </select>

                    <button
                      type="button"
                      title={t("Remove reminder", { defaultValue: "Remove reminder" })}
                      onClick={() => handleRemoveReminder(index)}
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: "6px" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ATTACHMENTS DROPZONE (PHASE 4) */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "var(--bg-hover)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Paperclip size={16} color="#2563eb" />
                <span style={{ fontSize: "13px", fontWeight: 700 }}>{t("Event Attachments & Resources", { defaultValue: "Event Attachments & Resources" })}</span>
              </div>

              {/* Existing Attachments */}
              {existingAttachments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)" }}>{t("Existing Attachments:", { defaultValue: "Existing Attachments:" })}</span>
                  {existingAttachments.map((att) => (
                    <div key={att.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: "6px", background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{att.file_name}</span>
                      <button type="button" onClick={() => handleDeleteExistingAttachment(att.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: "2px dashed var(--border-color, #cbd5e1)",
                  borderRadius: "8px",
                  padding: "18px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: "var(--bg-card, #ffffff)",
                  transition: "border-color 0.15s ease",
                }}
              >
                <UploadCloud size={24} color="#64748b" style={{ margin: "0 auto 6px" }} />
                <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {t("Click or drag files here to attach to this event", { defaultValue: "Click or drag files here to attach to this event" })}
                </p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {t("Supports PDFs, documents, images, and presentations up to 50MB", { defaultValue: "Supports PDFs, documents, images, and presentations up to 50MB" })}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                />
              </div>

              {/* Queued New Files */}
              {newFiles.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb" }}>{t("Files ready to upload:", { defaultValue: "Files ready to upload:" })}</span>
                  {newFiles.map((file, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: "6px", background: "#eff6ff", border: "1px solid #bfdbfe" }}>
                      <span style={{ fontSize: "12px", color: "#1d4ed8" }}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
                      <button type="button" onClick={() => handleRemoveNewFile(idx)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AUDIENCE / VISIBILITY LEVEL & PARTICIPANTS */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
              <div>
                <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                  {t("Audience / Visibility Level", { defaultValue: "Audience / Visibility Level" })} <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <CustomSelect
                  name="visibility_level"
                  value={visibilityLevel}
                  onChange={(val) => setVisibilityLevel(val)}
                  options={visibilityOptions}
                />
              </div>

              {visibilityLevel === "project_team" && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {t("Target Project *", { defaultValue: "Target Project *" })}
                  </label>
                  <CustomSelect
                    name="project_id"
                    value={projectId}
                    onChange={(val) => setProjectId(val)}
                    options={projectOptions}
                  />
                </div>
              )}

              {/* SPECIFIC ATTENDEES LIST (MULTI-SELECT) */}
              {visibilityLevel === "custom" && formType === "event" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", background: "var(--bg-hover)", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "13px", fontWeight: 700 }}>
                      {t("Invited Participants / Attendees", { defaultValue: "Invited Participants / Attendees" })}
                    </label>
                    <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 700 }}>
                      {t("{{count}} selected", { count: selectedUserIds.length, defaultValue: `${selectedUserIds.length} selected` })}
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder={t("Search by name, email, or department...", { defaultValue: "Search by name, email, or department..." })}
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", boxSizing: "border-box" }}
                  />

                  <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "6px", background: "var(--bg-card)" }}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                        {t("No users found", { defaultValue: "No users found" })}
                      </div>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUserSelection(u.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              cursor: "pointer",
                              background: isSelected ? "#eff6ff" : "transparent",
                              border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                              margin: "2px 0",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: isSelected ? "#2563eb" : "#cbd5e1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700 }}>
                                {(u.name || "U")[0].toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: isSelected ? "#1d4ed8" : "var(--text-primary)" }}>{u.name}</div>
                                <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{u.email}</div>
                              </div>
                            </div>
                            {isSelected && <Check size={14} color="#2563eb" strokeWidth={3} />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* WORKING HOURS WARNING */}
            {participantWarnings.length > 0 && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "10px",
                  background: enforceOrgHours ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
                  border: `1px solid ${enforceOrgHours ? "#ef4444" : "#f59e0b"}`,
                  color: enforceOrgHours ? "#b91c1c" : "#b45309",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "13px", marginBottom: "6px" }}>
                  <AlertTriangle size={16} />
                  {enforceOrgHours
                    ? t("Strict Organization Policy: Cannot Schedule Outside Working Hours", { defaultValue: "Strict Organization Policy: Cannot Schedule Outside Working Hours" })
                    : t("Working Hours Warning (Non-Blocking)", { defaultValue: "Working Hours Warning (Non-Blocking)" })}
                </div>
                <p style={{ fontSize: "12px", margin: "0 0 6px 0" }}>
                  {t("The proposed event time falls outside regular working availability for {{count}} participant(s):", { count: participantWarnings.length, defaultValue: `The proposed event time falls outside regular working availability for ${participantWarnings.length} participant(s):` })}
                </p>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px" }}>
                  {participantWarnings.map((w, idx) => (
                    <li key={idx}>
                      <strong>{w.user.name}</strong> ({w.localTime}, {w.localDay} - schedule: <em>{w.scheduleText}</em>)
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* SUBMIT BUTTONS */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
              <button
                type="button"
                onClick={() => navigate(rolePath("events"))}
                style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-hover)", color: "var(--text-primary)", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                {t("Cancel", { defaultValue: "Cancel" })}
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "9px 22px",
                  borderRadius: "8px",
                  border: "none",
                  background: formType === "announcement" ? "#f59e0b" : "#2563eb",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {submitting
                  ? t("Saving...", { defaultValue: "Saving..." })
                  : isEditMode
                  ? t("Save Changes", { defaultValue: "Save Changes" })
                  : formType === "announcement"
                  ? t("Publish Announcement", { defaultValue: "Publish Announcement" })
                  : t("Create Event", { defaultValue: "Create Event" })}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
