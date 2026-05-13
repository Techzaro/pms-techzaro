import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./Projects.css";

function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        "http://127.0.0.1:8000/api/projects",
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

      console.log("Projects API Response:", data);

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
        return "#fef3c7";
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
        <div className="projects-header">
          <div>
            <h1>Projects</h1>
            <p>Showing: All Active Projects</p>
          </div>

          <div className="header-actions">
            <button className="filter-btn">View Completed</button>
            <Link to="/create-project">
              <button className="create-btn">+ Create Project</button>
            </Link>
          </div>
        </div>

        <div className="projects-container">
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#6b7280" }}>
              <p>No projects found. Create one to get started!</p>
            </div>
          ) : (
            projects.map((project) => (
              <div key={project.id} className="project-card">
                <div className="card-header">
                  <h3>{project.title || project.name}</h3>
                  <p className="card-subtitle">{project.description}</p>
                </div>

                <div className="card-body">
                  <p className="card-info">
                    <strong>Project Details:</strong> {project.team?.name || "No Team"}
                  </p>

                  <p className="card-goals">
                    <strong>📋 Project Goals:</strong>
                    <br />
                    {project.goals || "No goals defined"}
                  </p>

                  <p className="card-sheets">
                    <strong>📄 Sheets & Documents:</strong>
                    <br />
                    {project.sheets_documents || "No documents"}
                  </p>

                  <div className="card-website">
                    <strong>🌐 Website</strong>
                    {project.website_link ? (
                      <p>
                        <a href={project.website_link} target="_blank" rel="noopener noreferrer">
                          {project.website_link}
                        </a>
                      </p>
                    ) : (
                      <p>No website</p>
                    )}
                  </div>
                </div>

                <div className="card-footer">
                  <div className="date-info">
                    <span className="date-icon">📅</span>
                    {project.start_date && project.end_date ? (
                      <span>
                        {new Date(project.start_date).toLocaleDateString()} - {new Date(project.end_date).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>No dates set</span>
                    )}
                  </div>

                  <div className="status-section">
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor: getStatusBadgeColor(project.status),
                      }}
                    >
                      {project.status || "Planned"}
                    </span>
                  </div>
                </div>

                <div className="card-actions">
                  <button
                    className="view-details-btn"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    View Details →
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default Projects;