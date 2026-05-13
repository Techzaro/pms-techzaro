import Header from "../components/layout/Header";
import Sidebar from "../components/layout/Sidebar";
import RightSidebar from "../components/layout/RightSidebar";

function Admin() {
  return (
    <div className="dashboard-page">

      {/* TOP HEADER */}
      <Header />

      {/* SIDEBAR + CONTENT */}
      <div className="main-layout">

        {/* LEFT SIDEBAR */}
        <Sidebar />

        {/* RIGHT CONTENT */}
        <div className="dashboard-content">

          <div className="welcome-box">
            <h1>Welcome Back, Admin 👋</h1>
            <p>Manage your projects, tasks and team activities.</p>
          </div>

          <div className="status-buttons">
            <button className="status-btn all">All</button>
            <button className="status-btn pending">Pending</button>
            <button className="status-btn in-progress">In Progress</button>
            <button className="status-btn completed">Completed</button>
            <button className="status-btn failed">Failed</button>
            <button className="status-btn abandoned">Abandoned</button>
          </div>

          <div className="dashboard-cards">

            <div className="card-box">
              <h3>Total Projects</h3>
              <h2>12</h2>
            </div>

            <div className="card-box">
              <h3>Total Tasks</h3>
              <h2>46</h2>
            </div>

            <div className="card-box">
              <h3>Completed</h3>
              <h2>31</h2>
            </div>

            <div className="card-box">
              <h3>Pending</h3>
              <h2>15</h2>
            </div>

          </div>

        </div>

        <RightSidebar />
      </div>
    </div>
  );
}

export default Admin;