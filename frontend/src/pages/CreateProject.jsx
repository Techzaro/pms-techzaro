/**
 * CreateProject page component.
 * Rendered when the user navigates to /createproject or related route.
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./CreateProject.css";

/**
 * Perform the create project.
 */

/**
 * Page to create a new project with details, goals, milestones and assigned users.
 */
function CreateProject() {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    goals: "",
    sheets_documents: "",
    website_name: "",
    website_link: "",
    client_name: "",
    category: "",
    budget: "",
    priority: "Medium",
    team_id: "",
    assigned_users: [],
    status: "Planned",
    start_date: "",
    end_date: "",
  });

  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [goalChecklistRows, setGoalChecklistRows] = useState([{ text: "", done: false }]);
  const [milestoneRows, setMilestoneRows] = useState([{ title: "", due_date: "", status: "planned" }]);
  const [sidebarNotes, setSidebarNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    fetchUsers();
    fetchTeams();

    const teamId = searchParams.get("teamId");

    if (teamId) {
      setFormData((prev) => ({
        ...prev,
        team_id: teamId,
      }));
    }
  }, []);

  /**
   * Perform the fetch users.
   */

  /**
   * Fetch the list of users from the backend for assignment.
   */
  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://127.0.0.1:8000/api/team-users", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data || []);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Unable to load users.");
    }
  };

  /**
   * Perform the fetch teams.
   */

  /**
   * Fetch the list of teams from the backend for project assignment.
   */
  const fetchTeams = async () => {
    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://127.0.0.1:8000/api/teams", {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setTeams(data || []);
      }
    } catch (err) {
      console.error("Error fetching teams:", err);
      setError("Unable to load teams.");
    }
  };

  /**
   * Perform the handle input change.
   */

  /**
   * Update the form state when a field value changes.
   */
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  /**
   * Perform the handle user select.
   */

  /**
   * Toggle a user in the assigned users list.
   */
  const handleUserSelect = (userId) => {
    setFormData((prev) => ({
      ...prev,
      assigned_users: prev.assigned_users.includes(userId)
        ? prev.assigned_users.filter((id) => id !== userId)
        : [...prev.assigned_users, userId],
    }));
  };

  /**
   * Perform the update rich text.
   */

  /**
   * Update a rich text field value in the form state.
   */
  const updateRichText = (field, html) => {
    setFormData((prev) => ({
      ...prev,
      [field]: html,
    }));
  };

  const quillModules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ font: [] }, { size: [] }],
      [{ align: [] }],
      ["blockquote", "code-block"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link", "image", "video"],
      ["clean"],
    ],
  };

  const quillFormats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "font",
    "size",
    "align",
    "blockquote",
    "code-block",
    "list",
    "bullet",
    "link",
    "image",
    "video",
  ];

  /**
   * Perform the handle create project.
   */

  /**
   * Submit the create project request to the backend API.
   */
  const handleCreateProject = async (e) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const token = localStorage.getItem("token");

      const goals_checklist = goalChecklistRows
        .filter((g) => g.text.trim())
        .map((g) => ({ text: g.text.trim(), done: !!g.done }));

      const milestones = milestoneRows
        .filter((m) => m.title.trim())
        .map((m) => ({
          title: m.title.trim(),
          due_date: m.due_date || null,
          status: m.status || "planned",
        }));

      const payload = {
        ...formData,
        budget: formData.budget === "" || formData.budget == null ? null : Number(formData.budget),
        goals_checklist: goals_checklist.length > 0 ? goals_checklist : undefined,
        milestones: milestones.length > 0 ? milestones : undefined,
        sidebar_notes: sidebarNotes.trim() || undefined,
      };

      const res = await fetch("http://127.0.0.1:8000/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to create project");
      }

      const createdProject = data.project || data;
      setSuccess("Project created successfully!");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });

      setGoalChecklistRows([{ text: "", done: false }]);
      setMilestoneRows([{ title: "", due_date: "", status: "planned" }]);
      setSidebarNotes("");

      setFormData({
        title: "",
        description: "",
        goals: "",
        sheets_documents: "",
        website_name: "",
        website_link: "",
        client_name: "",
        category: "",
        budget: "",
        priority: "Medium",
        team_id: "",
        assigned_users: [],
        status: "Planned",
        start_date: "",
        end_date: "",
      });

      setTimeout(() => {
        navigate(`/projects/${createdProject.id}`);
      }, 1200);
    } catch (err) {
      console.error(err);

      setError(err.message || "An error occurred");

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="create-project-page">
        <div className="create-project-container">
          <div className="create-project-header">
            <h1 className="create-project-title">
              Create New Project
            </h1>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              {success}
            </div>
          )}

          <form
            onSubmit={handleCreateProject}
            className="project-form"
          >
            <div className="form-group">
              <label className="form-label">
                Project Title *
              </label>

              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="Enter project title"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Description
              </label>

              <ReactQuill
                theme="snow"
                value={formData.description}
                onChange={(content) =>
                  updateRichText("description", content)
                }
                modules={quillModules}
                formats={quillFormats}
                className="quill-editor"
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                Project Goals
              </label>

              <ReactQuill
                theme="snow"
                value={formData.goals}
                onChange={(content) =>
                  updateRichText("goals", content)
                }
                modules={quillModules}
                formats={quillFormats}
                className="quill-editor"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Project goals checklist (details page)</label>
              <p className="form-hint" style={{ marginTop: 0 }}>
                Short lines shown as checkmarks on the project details Overview tab.
              </p>
              {goalChecklistRows.map((row, idx) => (
                <div key={idx} className="form-row" style={{ alignItems: "center", marginBottom: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Goal text"
                    value={row.text}
                    onChange={(e) => {
                      const v = e.target.value;
                      setGoalChecklistRows((prev) => prev.map((r, i) => (i === idx ? { ...r, text: v } : r)));
                    }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={row.done}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setGoalChecklistRows((prev) => prev.map((r, i) => (i === idx ? { ...r, done: v } : r)));
                      }}
                    />
                    Done
                  </label>
                  {goalChecklistRows.length > 1 && (
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() => setGoalChecklistRows((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="filter-btn"
                onClick={() => setGoalChecklistRows((prev) => [...prev, { text: "", done: false }])}
              >
                + Add goal line
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">
                Sheets / Documents
              </label>

              <ReactQuill
                theme="snow"
                value={formData.sheets_documents}
                onChange={(content) =>
                  updateRichText("sheets_documents", content)
                }
                modules={quillModules}
                formats={quillFormats}
                className="quill-editor"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Website Name
                </label>

                <input
                  type="text"
                  name="website_name"
                  value={formData.website_name}
                  onChange={handleInputChange}
                  placeholder="e.g. TECH XARO Official"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Website Link
                </label>

                <input
                  type="url"
                  name="website_link"
                  value={formData.website_link}
                  onChange={handleInputChange}
                  placeholder="https://example.com"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Client name</label>
                <input
                  type="text"
                  name="client_name"
                  value={formData.client_name}
                  onChange={handleInputChange}
                  placeholder="e.g. AquaGasPlastics"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <input
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  placeholder="e.g. Web Development"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Budget (USD)</label>
                <input
                  type="number"
                  name="budget"
                  value={formData.budget}
                  onChange={handleInputChange}
                  placeholder="15000"
                  min="0"
                  step="0.01"
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Deadlines / milestones (details page)</label>
              <p className="form-hint" style={{ marginTop: 0 }}>
                Shown in the Deadlines panel on project details.
              </p>
              {milestoneRows.map((row, idx) => (
                <div key={idx} className="form-row" style={{ marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Phase name (e.g. Design)"
                    value={row.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMilestoneRows((prev) => prev.map((r, i) => (i === idx ? { ...r, title: v } : r)));
                    }}
                    style={{ minWidth: 160, flex: 1 }}
                  />
                  <input
                    type="date"
                    className="form-input"
                    value={row.due_date}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMilestoneRows((prev) => prev.map((r, i) => (i === idx ? { ...r, due_date: v } : r)));
                    }}
                  />
                  <select
                    className="form-select"
                    value={row.status}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMilestoneRows((prev) => prev.map((r, i) => (i === idx ? { ...r, status: v } : r)));
                    }}
                    style={{ minWidth: 130 }}
                  >
                    <option value="planned">Planned</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  {milestoneRows.length > 1 && (
                    <button type="button" className="filter-btn" onClick={() => setMilestoneRows((prev) => prev.filter((_, i) => i !== idx))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="filter-btn" onClick={() => setMilestoneRows((prev) => [...prev, { title: "", due_date: "", status: "planned" }])}>
                + Add milestone
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Project notes (sidebar on details)</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="Internal notes shown in the Notes panel on project details…"
                value={sidebarNotes}
                onChange={(e) => setSidebarNotes(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>

           <div className="project-layout">

  {/* LEFT SIDE */}
  <div className="left-fields">

    <div className="form-group">
      <label className="form-label">
        Team (Optional)
      </label>

      <select
        name="team_id"
        value={formData.team_id}
        onChange={handleInputChange}
        className="form-select"
      >
        <option value="">
          -- No Team --
        </option>

        {teams.map((team) => (
          <option
            key={team.id}
            value={team.id}
          >
            {team.name}
          </option>
        ))}
      </select>

      <p className="form-hint">
        Selecting a team links the project to that team.
      </p>
    </div>

    <div className="form-group">
      <label className="form-label">
        Status
      </label>

      <select
        name="status"
        value={formData.status}
        onChange={handleInputChange}
        className="form-select"
      >
        <option value="Planned">Planned</option>
        <option value="In Progress">In Progress</option>
        <option value="Completed">Completed</option>
        <option value="On Hold">On Hold</option>
      </select>
    </div>

  </div>

  {/* RIGHT SIDE */}
  <div className="right-fields">

    <div className="form-group">
      <label className="form-label">
        Select Users (Optional)
      </label>

      <div className="user-select-dropdown">
        {users.length > 0 ? (
          <div className="user-list">
            {users.map((user) => (
              <label
                key={user.id}
                className="user-checkbox"
              >
                <input
                  type="checkbox"
                  checked={formData.assigned_users.includes(
                    user.id
                  )}
                  onChange={() =>
                    handleUserSelect(user.id)
                  }
                />

                <span>{user.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="no-users">
            No users available
          </p>
        )}
      </div>

      <p className="form-hint">
        Choose one or more users for the project.
      </p>
    </div>

  </div>

</div>
           

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Start Date & Time
                </label>

                <input
                  type="datetime-local"
                  name="start_date"
                  value={formData.start_date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  End Date & Time
                </label>

                <input
                  type="datetime-local"
                  name="end_date"
                  value={formData.end_date}
                  onChange={handleInputChange}
                  className="form-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="form-submit-btn"
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default CreateProject;