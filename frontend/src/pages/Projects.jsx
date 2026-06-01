import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import CreateProjectModal from "../components/CreateProjectModal";
import { IoSearchOutline } from "react-icons/io5";
import API_URL from "../config/api";
import "./Projects.css";

function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("token");

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

      setProjects(data.projects || data || []);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "#d1fae5";

      case "in_progress":
      case "in progress":
        return "#ddd6fe";

      case "on_hold":
      case "on hold":
        return "#fee2e2";

      default:
        return "#e0e7ff";
    }
  };

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

            {localStorage.getItem("role") !== "member" && (
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
          <input type="text" placeholder="Search by project name" />
        </div>
        {/* PROJECTS */}

        <div className="projects-container">

          {loading ? (

            <div className="loading-text">
              Loading projects...
            </div>

          ) : projects.length === 0 ? (

            <div className="loading-text">
              No projects found
            </div>

          ) : (

            projects.map((project) => (

              <div
                key={project.id}
                className="projects-card"
              >

                {/* HEADER */}

                <div className="project-card-header">

                  <h3>
                    {project.title || project.name}
                  </h3>

                  <div
                    className="card-subtitle"
                    dangerouslySetInnerHTML={{
                      __html:
                        project.description ||
                        "No description available",
                    }}
                  />

                </div>

                {/* PROGRESS */}

                <div className="progress-section">

                  <div className="progress-top">

                    <span>Progress</span>

                    <span>
                      {project.progress || 65}%
                    </span>

                  </div>

                  <div className="progress-bar">

                    <div
                      className="progress-fill"
                      style={{
                        width: `${project.progress || 65}%`,
                      }}
                    ></div>

                  </div>
                </div>

                {/* FOOTER */}

                <div className="card-footer">

                  <div className="date-info">

                    <span className="date-icon">
                      📅
                    </span>

                    {project.end_date ? (
                      <span>
                        {new Date(
                          project.end_date
                        ).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>30 Oct 2026</span>
                    )}

                  </div>

                </div>

                {/* ACTIONS */}

                <div className="project-card-actions">

                  <span
                    className="status-badge"
                    style={{
                      backgroundColor:
                        getStatusBadgeColor(
                          project.status
                        ),
                    }}
                  >
                    {project.status || "In Progress"}
                  </span>

                  <button
                    className="view-details-btn"
                    onClick={() =>
                      navigate(`/projects/${project.id}`)
                    }
                  >
                    View →
                  </button>

                </div>

              </div>
            ))
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <CreateProjectModal
            onClose={() => setShowModal(false)}
          />
        </div>
      )}
    </DashboardLayout>
  );
}

export default Projects;