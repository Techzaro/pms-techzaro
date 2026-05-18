import DashboardLayout from "../components/layout/DashboardLayout";
import { useState } from "react";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import "../pages/Deliveries.css";

function Deliveries() {

  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);

  const tasks = [
    {
      id: 101,
      initials: "LI",
      bgColor: "#FFE8CC",
      textColor: "#F59E0B",
      name: "Muhammad Sufyan",
      role: "Project Manager",
      title: "Ecommerce homepage design",
      description: "Design and implement the new ecommerce homepage.",
      status: "In Progress",
      priority: "High",
      date1: "22-04-2026",
      date2: "28-04-2026",
      assigned_by: "Muhammad Sufyan",
      assigned_to: "You",
    },
    {
      id: 102,
      initials: "LN",
      bgColor: "#DCFCE7",
      textColor: "#22C55E",
      name: "Leyla Nazir",
      role: "Team Lead",
      title: "Dashboard performance audit",
      description: "Review current dashboard performance and propose improvements.",
      status: "Pending",
      priority: "Medium",
      date1: "24-04-2026",
      date2: "30-04-2026",
      assigned_by: "Leyla Nazir",
      assigned_to: "You",
    },
  ];

 return (
  <DashboardLayout>

    <div className="projects-page">

      <div className="projects-header">

        <div>
          <h1>Deliverables</h1>
          <p>Manage and track your deliverables</p>
        </div>

        <div className="header-actions">

          <button className="filter-btn">
            View Completed
          </button>

          <button
            className="create-btn"
            onClick={() => setShowModal(true)}
          >
            + Create Deliverable
          </button>

        </div>

      </div>

      <div className="task-progress">

        <p className="All">All</p>

        <p className="Pending">
          <GoDotFill />
          Pending
        </p>

        <p className="Progress">
          <GoDotFill />
          In Progress
        </p>

        <p className="Completed">
          <GoDotFill color="#22C55E" />
          Completed
        </p>

        <p className="Failed">
          <GoDotFill />
          Failed
        </p>

        <p className="Aban">
          <GoDotFill color="#6B7280" />
          Abandoned
        </p>

      </div>

      <div className="container">

        <div className="table-header">
          <div>Assigned By</div>
          <div>Task</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Date</div>
          <div>Action</div>
        </div>

        {tasks.map((task) => (
          <div className="table-row" key={task.id}>

            <div className="user-box">

              <div
                className="avatar"
                style={{
                  background: task.bgColor,
                  color: task.textColor,
                }}
              >
                {task.initials}
              </div>

              <div>
                <div className="user-name">{task.name}</div>
                <div className="user-role">{task.role}</div>
              </div>

            </div>

            <div>
              <div className="task-title">{task.title}</div>

              <div className="task-description">
                {task.description}
              </div>
            </div>

            <div>
              <span className="badge status-badge">
                <span className="dot"></span>
                {task.status}
              </span>
            </div>

            <div>
              <span className="badge priority-badge">
                <span className="dot"></span>
                {task.priority}
              </span>
            </div>

            <div className="date-box">
              <div>{task.date1}</div>
              <div>{task.date2}</div>
            </div>

            <div>
              <button
                className="view-btn"
                onClick={() => navigate(`/details/${task.id}`)}
              >
                View
              </button>
            </div>

          </div>
        ))}

      </div>

    </div>

  </DashboardLayout>
);
}

export default Deliveries;