import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";
import { IoSearchOutline } from "react-icons/io5";
import API_URL from "../config/api";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import "./Projects.css";

function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = authToken();

      const response = await fetch(
        `${API_URL}/projects`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }

      const data = await response.json();

      setProjects(Array.isArray(data) ? data : data.projects || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (project) => {
    const total = project.total_tasks ?? 0;
    const completed = project.completed_tasks ?? 0;
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const calculateStatus = (project) => {
    const progress = calculateProgress(project);
    const endDate = project.end_date ? new Date(project.end_date) : null;
    const now = new Date();

    if (progress === 100) {
      if (endDate && now <= endDate) {
        return "Completed";
      }
      return "Completed";
    }

    if (endDate && now > endDate) {
      return "Failed";
    }

    return "In Progress";
  };

  const getProgressColor = (percent) => {
    const grey = [107, 114, 128];
    const blue = [79, 70, 229];
    const t = Math.min(percent, 100) / 100;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const r = Math.round(grey[0] + (blue[0] - grey[0]) * eased);
    const g = Math.round(grey[1] + (blue[1] - grey[1]) * eased);
    const b = Math.round(grey[2] + (blue[2] - grey[2]) * eased);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "#d1fae5";
      case "in_progress":
      case "in progress":
        return "#ddd6fe";
      case "failed":
        return "#fee2e2";
      case "on_hold":
      case "on hold":
        return "#fee2e2";
      default:
        return "#e0e7ff";
    }
  };

  const filteredProjects = projects.filter((project) =>
    project.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="projects-page">

        {/* HEADER */}
        <div className="projects-header">
          <div>
            <h1>Projects</h1>
            <p>Manage and track your projects</p>
          </div>

          <div className="header-actions">
            <div className="all-time">
              <select name="" id="">
                <option value="">All Time</option>
                <option value="">Month</option>
                <option value="">Week</option>
                <option value="">Day</option>
              </select>
            </div>

            {getCurrentRole() !== "member" && (
              <button
                className="create-btn"
                onClick={() => setShowModal(true)}
              >
                + Create Project
              </button>
            )}
          </div>
        </div>

        <div className="projects-search-bar">
          <IoSearchOutline fontSize={"20px"} />
          <input
            type="text"
            placeholder="Search by project name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* PROJECTS */}
        <div className="projects-container">
          {loading ? (
            <div className="loading-text">Loading projects...</div>
          ) : filteredProjects.length === 0 ? (
            <div className="loading-text">No projects found</div>
          ) : (
            filteredProjects.map((project) => {
              const progress = calculateProgress(project);
              const displayStatus = calculateStatus(project);

              return (
                <div
                  key={project.id}
                  className="projects-card"
                >
                  {/* HEADER */}
                  <div className="project-card-header">
                    <h3>{project.title}</h3>
                    <div
                      className="card-subtitle"
                      dangerouslySetInnerHTML={{
                        __html: project.description || "No description available",
                      }}
                    />
                  </div>

                  {/* PROGRESS */}
                  <div className="progress-section">
                    <div className="progress-top">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${progress}%`,
                          minWidth: progress === 0 ? "100%" : "0",
                          background: progress === 0 ? "#d1d5db" : getProgressColor(progress),
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* FOOTER */}
                  <div className="card-footer">
                    <div className="date-info">
                      <span className="date-icon">📅</span>
                      {project.end_date ? (
                        <span>
                          {new Date(project.end_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span>No deadline set</span>
                      )}
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div className="project-card-actions">
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: getStatusBadgeColor(displayStatus),
                      }}
                    >
                      {displayStatus}
                    </span>

                    <button
                      className="view-details-btn"
                      onClick={() => navigate(rolePath(`projects/project-details/${project.id}`))}
                    >
                      View →
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <CreateProjectModal
            onClose={(created) => {
              setShowModal(false);
              if (created) fetchProjects();
            }}
          />
        </div>
      )}
    </DashboardLayout>
  );
}

export default Projects;