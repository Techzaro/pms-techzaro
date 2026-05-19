import DashboardLayout from "../components/layout/DashboardLayout";
import { CiCalendar } from "react-icons/ci";
import { IoIosArrowDown } from "react-icons/io";
import { LuArrowDownToLine } from "react-icons/lu";
import { GoDotFill } from "react-icons/go";
import { useNavigate } from "react-router-dom";
import { IoSearchOutline } from "react-icons/io5";
import "../pages/Task.css";

function Tasks() {
  const navigate = useNavigate();

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
      <div className="Task">
        <div className="task-text">
          <h3>Tasks Assigned To You</h3>
          <p>Manage and track your tasks</p>
        </div>

        <div className="task-btns">
          <div className="all-time">
            <select name="" id="">
              <option value="">All Time</option>
              <option value="">Month</option>
              <option value="">Week</option>
              <option value="">Day</option>
            </select>

          </div>

          <div
            className="export"
            onClick={() => navigate("/taskby")}
          >
            <span>Assigned by you</span>
            <LuArrowDownToLine />
          </div>
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
      <div className="tasks-search-bar">
        <IoSearchOutline fontSize={"20px"} />
        <input type="text" placeholder="Search by task name" />
      </div>
      {/* TABLE */}

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

            {/* USER */}

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

            {/* TASK */}

            <div>
              <div className="task-title">{task.title}</div>

              <div className="task-description">
                {task.description}
              </div>
            </div>

            {/* STATUS */}

            <div>
              <span className="badge status-badge">
                <span className="dot"></span>
                {task.status}
              </span>
            </div>

            {/* PRIORITY */}

            <div>
              <span className="badge priority-badge">
                <span className="dot"></span>
                {task.priority}
              </span>
            </div>

            {/* DATE */}

            <div className="date-box">
              <div>{task.date1}</div>
              <div>{task.date2}</div>
            </div>

            {/* ACTION */}

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
    </DashboardLayout>
  );
}

export default Tasks;