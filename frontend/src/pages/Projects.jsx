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

        {/* HEADER */}

        <div className="projects-header">
          <div>
            <h1>Projects</h1>
            <p>Showing: All Active Projects</p>
          </div>

          <div className="header-actions">
            <button className="filter-btn">
              View Completed
            </button>

            <Link to="/create-project">
              <button className="create-btn">
                + Create Project
              </button>
            </Link>
          </div>
        </div>

        {/* PROJECT CARDS */}

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
                className="project-card"
              >

                {/* CARD HEADER */}

                <div className="card-header">
                  <h3>
                    {project.title || project.name}
                  </h3>

                  <div
                    className="card-subtitle"
                    dangerouslySetInnerHTML={{
                      __html:
                        project.description ||
                        "No description",
                    }}
                  />
                </div>

                {/* CARD BODY */}

                <div className="card-body">

                  <div className="card-info">
                    <strong>Project Details:</strong>{" "}
                    {project.team?.name || "No Team"}
                  </div>

                  <div className="card-goals">
                    <strong>📋 Project Goals:</strong>
                    <br />

                    <div
                      dangerouslySetInnerHTML={{
                        __html:
                          project.goals ||
                          "No goals defined",
                      }}
                    />
                  </div>

                  <div className="card-sheets">
                    <strong>📄 Sheets & Documents:</strong>
                    <br />

                    <div
                      dangerouslySetInnerHTML={{
                        __html:
                          project.sheets_documents ||
                          "No documents",
                      }}
                    />
                  </div>

                  <div className="card-website">
                    <strong>🌐 Website</strong>

                    {project.website_link ? (
                      <p>
                        <a
                          href={project.website_link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {project.website_link}
                        </a>
                      </p>
                    ) : (
                      <p>No website</p>
                    )}
                  </div>
                </div>

                {/* CARD FOOTER */}

                <div className="card-footer">

                  <div className="date-info">
                    <span className="date-icon">
                      📅
                    </span>

                    {project.start_date &&
                    project.end_date ? (
                      <span>
                        {new Date(
                          project.start_date
                        ).toLocaleDateString()}
                        {" - "}
                        {new Date(
                          project.end_date
                        ).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>No dates set</span>
                    )}
                  </div>

                  <div className="status-section">
                    <span
                      className="status-badge"
                      style={{
                        backgroundColor:
                          getStatusBadgeColor(
                            project.status
                          ),
                      }}
                    >
                      {project.status || "Planned"}
                    </span>
                  </div>
                </div>

                {/* ACTION */}

                <div className="card-actions">
                  <button
                    className="view-details-btn"
                    onClick={() =>
                      navigate(`/projects/${project.id}`)
                    }
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