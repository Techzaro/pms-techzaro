import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import CustomSelect from "../components/CustomSelect";
import RichTextEditor from "../components/RichTextEditor";
import CreatableSelect from "react-select/creatable";
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
  const navigate = useNavigate();
  const notify = useNotification();
  const user = getUser();

  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);

  // Form Mode: 'event' vs 'announcement'
  const [formType, setFormType] = useState("event");

  // Core Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Category: stored as a react-select option object { value, label } so
  // CreatableSelect always reflects selection in the same render cycle —
  // no string→option lookup that could miss a brand-new category.
  const [selectedCategoryOption, setSelectedCategoryOption] = useState(null);
  // Keep categoryId as a derived convenience for the API payload
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

  // Visibility & Audience State
  const [visibilityLevel, setVisibilityLevel] = useState("organization");
  const [projectId, setProjectId] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");

  // Inline Category Creation State (used by CreatableSelect handler)
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
        // In create mode, pre-select the first category as an option object
        if (!isEditMode && catData.length > 0) {
          setSelectedCategoryOption({ value: String(catData[0].id), label: catData[0].name });
        }
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

    // Fetch timezones list & Organization regional enforcement policy
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

  // Load existing event if editing
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
          setTitle(ev.title || "");
          setDescription(ev.description || "");
          const isAnnounce = ev.type === "announcement" || ev.type === "Company Announcement" || ev.is_announcement;
          setFormType(isAnnounce ? "announcement" : "event");
          // Resolve category: if categories already loaded (fetched in parallel), build
          // the option object directly; otherwise store the raw ID so the resolution
          // useEffect below can pick it up once the categories list arrives.
          if (ev.category_id) {
            setCategories((prevCats) => {
              const match = prevCats.find((c) => String(c.id) === String(ev.category_id));
              if (match) {
                setSelectedCategoryOption({ value: String(match.id), label: match.name });
              } else {
                // Categories not yet loaded — store a stub; the effect below resolves it
                setSelectedCategoryOption({ value: String(ev.category_id), label: t("Loading…", { defaultValue: "Loading…" }), __pending: true });
              }
              return prevCats; // do NOT mutate the categories array itself
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

  // Resolve a pending category stub once the categories list has loaded.
  // This handles the race condition in edit mode where the event API responds
  // before the /event-categories API does.
  useEffect(() => {
    if (!selectedCategoryOption?.__pending || categories.length === 0) return;
    const match = categories.find((c) => String(c.id) === selectedCategoryOption.value);
    if (match) {
      setSelectedCategoryOption({ value: String(match.id), label: match.name });
    }
  }, [categories, selectedCategoryOption]);

  // Category Creation — called by CreatableSelect's onCreateOption
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
        // 1. Append to local categories list so it's available for future lookups
        setCategories((prev) => [...prev, newCat]);
        // 2. Set the option object DIRECTLY — no string→lookup round-trip.
        //    CreatableSelect uses the `value` prop object reference, so this
        //    immediately shows the new category as selected without a second render.
        setSelectedCategoryOption({ value: String(newCat.id), label: newCat.name });
        notify.success(t("Event category created successfully", { defaultValue: "Event category created successfully" }));
      } else {
        notify.error(data?.message || t("Failed to create category", { defaultValue: "Failed to create category" }));
      }
    } catch (err) {
      console.error("Create category error:", err);
      notify.error(t("Network error while creating category", { defaultValue: "Network error while creating category" }));
    } finally {
      setSavingNewCat(false);
    }
  };

  // Compute UTC strings and check Working Hours Compliance (SRS Sec 11, 13, 15, 16)
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

    // If Organization policy strictly enforces working hours, block submission if outside hours
    if (enforceOrgHours && participantWarnings.length > 0) {
      notify.error(
        t("Cannot schedule event: Organization strictly enforces working hours policy, and {{count}} participant(s) are outside their scheduled hours.", { count: participantWarnings.length, defaultValue: `Cannot schedule event: Organization strictly enforces working hours policy, and ${participantWarnings.length} participant(s) are outside their scheduled hours.` })
      );
      return;
    }

    setSubmitting(true);
    try {
      const token = authToken();
      const isAnnounce = formType === "announcement";

      const startDateTime = allDay || isAnnounce ? `${startDate} 00:00:00` : `${startDate} ${startTime}:00`;
      const endDateTime = isAnnounce ? startDateTime : (endDate ? (allDay ? `${endDate} 23:59:59` : `${endDate} ${endTime}:00`) : startDateTime);

      const payload = {
        title: title.trim(),
        description: description && description.replace(/<[^>]*>/g, "").trim() ? description : null,
        type: isAnnounce ? "announcement" : "event",
        category_id: categoryId ? Number(categoryId) : null,
        start_date: startDateTime,
        end_date: endDateTime,
        event_timezone: eventTimezone,
        timezone: eventTimezone,
        all_day: isAnnounce ? true : allDay,
        is_global: isAnnounce || visibilityLevel === "organization",
        visibility_level: visibilityLevel,
        location: isAnnounce ? null : (location.trim() || null),
        meeting_link: isAnnounce ? null : (meetingLink.trim() || null),
        color: color,
        participant_user_ids: isAnnounce ? [] : selectedUserIds,
        assigned_user_ids: isAnnounce ? [] : selectedUserIds,
        team_ids: selectedTeamIds,
        user_ids: selectedUserIds,
        project_id: visibilityLevel === "project_team" ? projectId : null,
      };

      const url = isEditMode ? `${API_URL}/events/${id}` : `${API_URL}/events`;
      const method = isEditMode ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data?.success) {
        notify.success(isEditMode ? t("Event updated successfully!", { defaultValue: "Event updated successfully!" }) : (isAnnounce ? t("Company Announcement published!", { defaultValue: "Company Announcement published!" }) : t("Event created successfully!", { defaultValue: "Event created successfully!" })));
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

  // react-select/creatable format: { value, label }
  // Note: selectedCategoryOption is React STATE (declared at top), not derived here.
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
          {t("Loading event editor...", { defaultValue: "Loading event editor..." })}
        </div>
      </DashboardLayout>
    );
  }

  const breadcrumbs = [
    { label: t("Events & Announcements", { defaultValue: "Events & Announcements" }), path: rolePath("events") },
    { label: isEditMode ? t("Edit Event", { defaultValue: "Edit Event" }) : t("Create Event / Announcement", { defaultValue: "Create Event / Announcement" }) },
  ];

  return (
    <DashboardLayout>
      <Breadcrumb items={breadcrumbs} />

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "0 8px" }}>
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
          {/* SEGMENTED FORM TYPE SELECTOR */}
          <div style={{ background: "var(--bg-hover)", padding: "4px", borderRadius: "10px", display: "flex", gap: "6px", marginBottom: "24px", border: "1px solid var(--border-color)" }}>
            <button
              type="button"
              onClick={() => setFormType("event")}
              style={{
                flex: 1,
                padding: "9px 16px",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "13px",
                border: "none",
                background: formType === "event" ? "#2563eb" : "transparent",
                color: formType === "event" ? "#ffffff" : "var(--text-secondary)",
                boxShadow: formType === "event" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Calendar size={16} /> {t("📅 Scheduled Event / Meeting", { defaultValue: "📅 Scheduled Event / Meeting" })}
            </button>
            <button
              type="button"
              onClick={() => setFormType("announcement")}
              style={{
                flex: 1,
                padding: "9px 16px",
                borderRadius: "8px",
                fontWeight: 600,
                fontSize: "13px",
                border: "none",
                background: formType === "announcement" ? "#f59e0b" : "transparent",
                color: formType === "announcement" ? "#ffffff" : "var(--text-secondary)",
                boxShadow: formType === "announcement" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                cursor: "pointer",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              <Megaphone size={16} /> {t("📢 Company Announcement", { defaultValue: "📢 Company Announcement" })}
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
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
            {/* CATEGORY & THEME COLOR */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              {/* ── Task 7: Creatable Categories ── */}
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
                      minHeight: "40px",
                      borderRadius: "8px",
                      border: `1px solid ${state.isFocused ? "#2563eb" : "var(--border-color, #cbd5e1)"}`,
                      boxShadow: state.isFocused ? "0 0 0 2px rgba(37,99,235,0.15)" : "none",
                      background: "var(--bg-card, #ffffff)",
                      color: "var(--text-primary, #0f172a)",
                      fontSize: "13px",
                      cursor: "text",
                    }),
                    menu: (base) => ({
                      ...base,
                      borderRadius: "8px",
                      border: "1px solid var(--border-color, #e2e8f0)",
                      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                      zIndex: 9999,
                    }),
                    option: (base, state) => ({
                      ...base,
                      fontSize: "13px",
                      background: state.isSelected ? "#2563eb" : state.isFocused ? "#eff6ff" : "transparent",
                      color: state.isSelected ? "#fff" : "var(--text-primary, #0f172a)",
                      cursor: "pointer",
                    }),
                    singleValue: (base) => ({ ...base, color: "var(--text-primary, #0f172a)", fontSize: "13px" }),
                    placeholder: (base) => ({ ...base, color: "var(--text-muted, #94a3b8)", fontSize: "13px" }),
                    input: (base) => ({ ...base, color: "var(--text-primary, #0f172a)" }),
                  }}
                />
              </div>

              {/* ── Task 1: Custom Color Picker ── */}
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
                        outline: color === c ? "2px solid #fff" : "none",
                        outlineOffset: "-4px",
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "border 0.15s, outline 0.15s",
                      }}
                    />
                  ))}

                  {/* Hidden native color input */}
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />

                  {/* Custom color trigger button */}
                  <button
                    type="button"
                    title={t("Pick custom color", { defaultValue: "Pick custom color" })}
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
                      flexShrink: 0,
                      transition: "all 0.15s",
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
                  style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px", color: "var(--text-primary)", boxSizing: "border-box" }}
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
                  <div style={{ gridColumn: allDay ? "span 1" : "span 1" }}>
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

                  <div style={{ gridColumn: allDay ? "span 1" : "span 1" }}>
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

                {/* Event Timezone Selector (SRS Sec 11) */}
                <div style={{ marginTop: "4px", paddingTop: "10px", borderTop: "1px solid var(--border-light, #e2e8f0)" }}>
                  <label style={{ fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px", color: "var(--text-heading)" }}>
                    <Globe size={13} style={{ color: "var(--color-primary, #4f46e5)" }} /> {t("Event Timezone (IANA)", { defaultValue: "Event Timezone (IANA)" })}
                  </label>
                  <select
                    value={eventTimezone}
                    onChange={(e) => setEventTimezone(e.target.value)}
                    style={{ width: "100%", height: "38px", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", color: "var(--text-primary)" }}
                  >
                    {timezonesList.length > 0 ? (
                      timezonesList.map((tz) => (
                        <option key={tz} value={tz}>{tz} {getTimezoneOffsetDisplay(tz)}</option>
                      ))
                    ) : (
                      ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Tokyo'].map((tz) => (
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
                    placeholder={t("e.g. Conference Room A or Main Hall", { defaultValue: "e.g. Conference Room A or Main Hall" })}
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


            {/* DESCRIPTION — Task 2: Rich Text Editor */}
            <div>
              <label style={{ fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                {formType === "announcement" ? t("Announcement Details & Message", { defaultValue: "Announcement Details & Message" }) : t("Event Description", { defaultValue: "Event Description" })}
              </label>
              <RichTextEditor
                value={description}
                onChange={(html) => setDescription(html)}
                placeholder={t("Provide detailed description, agenda, or important notes...", { defaultValue: "Provide detailed description, agenda, or important notes..." })}
                style={{ borderRadius: "8px", fontSize: "13px" }}
              />
            </div>



            {/* DYNAMIC AUDIENCE & VISIBILITY */}
            <div style={{ borderTop: "1px solid var(--border-color)", paddingTop: "18px", display: "flex", flexDirection: "column", gap: "14px" }}>
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

              {/* DYNAMIC TARGET PROJECT */}
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

              {/* DYNAMIC TARGET TEAM */}
              {visibilityLevel === "team" && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
                    {t("Target Team *", { defaultValue: "Target Team *" })}
                  </label>
                  <select
                    value={selectedTeamIds[0] || ""}
                    onChange={(e) => setSelectedTeamIds(e.target.value ? [Number(e.target.value)] : [])}
                    style={{ width: "100%", height: "40px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "13px" }}
                  >
                    <option value="">{t("Select Team...", { defaultValue: "Select Team..." })}</option>
                    {teams.map((tItem) => (
                      <option key={tItem.id} value={tItem.id}>{tItem.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* SPECIFIC ATTENDEES — Task 5: show only for "custom" visibility; Task 6: upgraded card layout */}
              {formType === "event" && visibilityLevel === "custom" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 600 }}>
                      {t("Specific Attendees / Invitees", { defaultValue: "Specific Attendees / Invitees" })}
                    </label>
                    <span style={{ fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>
                      {t("{{count}} selected", { count: selectedUserIds.length, defaultValue: `${selectedUserIds.length} selected` })}
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder={t("Search by name, email, or designation...", { defaultValue: "Search by name, email, or designation..." })}
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    style={{ width: "100%", height: "36px", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--border-color)", background: "var(--bg-card)", fontSize: "12px", marginBottom: "6px", boxSizing: "border-box" }}
                  />

                  <div style={{ maxHeight: "210px", overflowY: "auto", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "6px", background: "var(--bg-card)" }}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                        {t("No users found", { defaultValue: "No users found" })}
                      </div>
                    ) : (
                      filteredUsers.map((u) => {
                        if (!u?.id) return null;
                        const isSelected = selectedUserIds.includes(u.id);
                        const designation = u.designation || u.job_title || u.position || u.role || null;
                        return (
                          <div
                            key={u.id}
                            onClick={() => toggleUserSelection(u.id)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "8px 10px",
                              borderRadius: "8px",
                              cursor: "pointer",
                              background: isSelected ? "#eff6ff" : "transparent",
                              border: isSelected ? "1px solid #bfdbfe" : "1px solid transparent",
                              margin: "3px 0",
                              transition: "background 0.12s, border-color 0.12s",
                            }}
                          >
                            {/* Avatar initial */}
                            <div style={{
                              width: 36,
                              height: 36,
                              borderRadius: "50%",
                              background: isSelected ? "#2563eb" : "var(--bg-hover, #f1f5f9)",
                              color: isSelected ? "#fff" : "var(--text-secondary, #64748b)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "13px",
                              flexShrink: 0,
                              marginRight: "10px",
                              transition: "background 0.12s",
                            }}>
                              {(u.name || "?")[0].toUpperCase()}
                            </div>

                            {/* Info card */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {/* Row 1: Name */}
                              <div style={{ fontWeight: 600, fontSize: "13px", color: isSelected ? "#1d4ed8" : "var(--text-primary, #0f172a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {u.name || t("User", { defaultValue: "User" })}
                              </div>
                              {/* Row 2: Professional Email */}
                              {u.email && (
                                <div style={{ fontSize: "11px", color: "var(--text-secondary, #64748b)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  ✉ {u.email}
                                </div>
                              )}
                              {/* Row 3: Designation / Role tag */}
                              {designation && (
                                <div style={{ marginTop: "2px" }}>
                                  <span style={{
                                    display: "inline-block",
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    padding: "1px 7px",
                                    borderRadius: "10px",
                                    background: isSelected ? "rgba(37,99,235,0.12)" : "var(--bg-hover, #f1f5f9)",
                                    color: isSelected ? "#1d4ed8" : "var(--text-secondary, #64748b)",
                                    textTransform: "capitalize",
                                  }}>
                                    {designation}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Selected checkmark */}
                            {isSelected && (
                              <Check size={15} color="#2563eb" style={{ flexShrink: 0, marginLeft: "8px" }} />
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Selected Attendees Working Hours & Localized Event Time (SRS Sec 13 & 15) */}
                  {selectedUserIds.length > 0 && startDateTimeUtc && (
                    <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                      <label style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)" }}>
                        {t("Participant Local Event Times & Availability", { defaultValue: "Participant Local Event Times & Availability" })}
                      </label>
                      {usersList
                        .filter((u) => selectedUserIds.includes(u.id))
                        .map((u) => {
                          const uTz = u.timezone || "UTC";
                          const comp = checkWorkingHoursCompliance(startDateTimeUtc, endDateTimeUtc, u.working_hours, uTz);
                          return (
                            <div
                              key={u.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "6px 10px",
                                borderRadius: "6px",
                                background: comp.isCompliant ? "var(--bg-hover, #f8fafc)" : "rgba(239, 68, 68, 0.08)",
                                border: `1px solid ${comp.isCompliant ? "var(--border-light, #e2e8f0)" : "rgba(239, 68, 68, 0.3)"}`,
                                fontSize: "12px",
                                flexWrap: "wrap",
                                gap: "6px",
                              }}
                            >
                              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.name}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px" }}>
                                <span style={{ color: "var(--text-secondary)" }}>
                                  {t("Local: {{time}} ({{tz}})", { time: comp.localTimeFormatted, tz: uTz, defaultValue: `Local: ${comp.localTimeFormatted} (${uTz})` })}
                                </span>
                                <span style={{ color: comp.isCompliant ? "var(--color-success, #10b981)" : "var(--color-danger, #ef4444)", fontWeight: 600 }}>
                                  {comp.isCompliant ? `✓ ${t("Hours: {{schedule}}", { schedule: comp.scheduleText, defaultValue: `Hours: ${comp.scheduleText}` })}` : `⚠ ${t("Outside Hours ({{schedule}})", { schedule: comp.scheduleText, defaultValue: `Outside Hours (${comp.scheduleText})` })}`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>


            {/* WORKING HOURS WARNING BANNER (SRS Sec 15 & 16) */}
            {participantWarnings.length > 0 && (
              <div
                style={{
                  marginTop: "16px",
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
                <p style={{ fontSize: "12px", margin: "0 0 6px 0", lineHeight: 1.4 }}>
                  {t("The proposed event time falls outside regular working availability for {{count}} participant(s):", { count: participantWarnings.length, defaultValue: `The proposed event time falls outside regular working availability for ${participantWarnings.length} participant(s):` })}
                </p>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", display: "flex", flexDirection: "column", gap: "3px" }}>
                  {participantWarnings.map((w, idx) => (
                    <li key={idx}>
                      {t("<strong>{{name}}</strong>'s local time will be <strong>{{time}}</strong> ({{day}}), outside their working hours of <em>{{schedule}}</em>.", {
                        name: w.user.name,
                        time: w.localTime,
                        day: w.localDay,
                        schedule: w.scheduleText,
                        defaultValue: `<strong>${w.user.name}</strong>'s local time will be <strong>${w.localTime}</strong> (${w.localDay}), outside their working hours of <em>${w.scheduleText}</em>.`
                      })}
                    </li>
                  ))}
                </ul>
                {enforceOrgHours && (
                  <p style={{ margin: "8px 0 0 0", fontSize: "11px", fontWeight: 600 }}>
                    {t("⛔ Organization settings enforce working hours. You must select a time that fits all participants.", { defaultValue: "⛔ Organization settings enforce working hours. You must select a time that fits all participants." })}
                  </p>
                )}
              </div>
            )}

            {/* SUBMIT BUTTONS */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "18px" }}>
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
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
              >
                <Save size={15} />
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

