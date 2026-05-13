
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import "./Header.css";

function Header() {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [user, setUser] = useState({
    name: localStorage.getItem("name") || "User",
    email: localStorage.getItem("email") || "user@example.com",
    role: localStorage.getItem("role") || "Member",
  });

  const toggleProfileModal = () => setIsProfileOpen((prev) => !prev);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch("http://127.0.0.1:8000/api/user", {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.name) {
          setUser({
            name: data.name,
            email: data.email,
            role: data.role,
          });
          localStorage.setItem("name", data.name);
          localStorage.setItem("email", data.email);
          localStorage.setItem("role", data.role);
        }
      })
      .catch(() => {
        // ignore fetch errors and use fallback values
      });
  }, []);

  return (
    <div className="header-container">
        <div className="header-left">
            <div className="logo-box">
                <b>TX</b>
            </div>
            <div className="logo-text">
               <h3>Techxaro</h3>
               <span>PMS Portal</span>
            </div>
        </div>

      <div className="header-search">
 <i className="fa-solid fa-magnifying-glass search-icon"></i>

        <input
          type="text"
          className="form-control"
          placeholder="Search projects, tasks or employees..."
        />

      </div>


      <div className="header-right">

       <Link to="/add-task" className="task-btn">
            + Task
       </Link>

       <Link to="/deliverables" className="project-btn">
            + Deliverables
       </Link>
        <hr />

<div className="user-info" onClick={toggleProfileModal}>

          <div className="user-text">
            <h6>{user.name}</h6>
            <span>{user.role}</span>
          </div>

          <div className="user-avatar">
            {user.name.charAt(0).toUpperCase()}
          </div>

          {isProfileOpen && (
            <div className="header-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="header-modal-top">
                <h3>Your Profile</h3>
                <p className="modal-subtitle">Latest account details</p>
              </div>
              <div className="header-modal-item">
                <span>Name</span>
                <strong>{user.name}</strong>
              </div>
              <div className="header-modal-item">
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
              <div className="header-modal-item">
                <span>Role</span>
                <strong>{user.role}</strong>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Header;