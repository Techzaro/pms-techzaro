import { useEffect, useState } from "react";
import { MdKeyboardArrowDown } from "react-icons/md";

import API_URL from "../../config/api";
import "./Header.css";

import CreateTaskModal from "../CreateTaskModal";
import CreateDeliverableModel from "../layout/CreateDeliverableModel";

function Header() {

  const [isProfileOpen, setIsProfileOpen] =
    useState(false);

  const [showTaskModal, setShowTaskModal] =
    useState(false);

  const [
    showDeliverableModal,
    setShowDeliverableModal,
  ] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= 1200);

  useEffect(() => {
    const handler = (e) => setSidebarOpen(e.detail.open);
    window.addEventListener("sidebar-state", handler);
    return () => window.removeEventListener("sidebar-state", handler);
  }, []);

  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth <= 1200);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("modal-state", { detail: { open: isProfileOpen } }));
  }, [isProfileOpen]);

  const showFullLogo = sidebarOpen || !isSmallScreen;

  const [user, setUser] = useState({
    name:
      localStorage.getItem("name") ||
      "User",

    email:
      localStorage.getItem("email") ||
      "user@example.com",

    role:
      localStorage.getItem("role") ||
      "Member",
  });

  const toggleProfileModal = () =>
    setIsProfileOpen((prev) => !prev);

  useEffect(() => {

    const token =
      localStorage.getItem("token");

    if (!token) return;

    fetch(`${API_URL}/user`, {
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

          localStorage.setItem(
            "name",
            data.name
          );

          localStorage.setItem(
            "email",
            data.email
          );

          localStorage.setItem(
            "role",
            data.role
          );
        }
      })

      .catch(() => {});
  }, []);

  return (
    <>

      <div className="header-container">

        {/* LEFT */}

        <div className="header-left">

          <button
            className="header-menu-btn"
            onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12H21" />
              <path d="M3 6H21" />
              <path d="M3 18H21" />
            </svg>
          </button>

          <div className="logo-box">
            <b>TX</b>
          </div>

          <div className={"logo-text" + (showFullLogo || isSmallScreen ? "" : " logo-text--hidden")}>
            <h3>Techxaro</h3>
            <span>PMS Portal</span>
          </div>

        </div>

        {/* SEARCH */}

        <div className="header-search">

          <i className="fa-solid fa-magnifying-glass search-icon"></i>

          <input
            type="text"
            className="form-control"
            placeholder="Search projects, tasks or employees..."
          />

        </div>

        {/* RIGHT */}

        <div className="header-right">

          {/* TASK BUTTON */}

          <button
            className="task-btn"
            onClick={() =>
              setShowTaskModal(true)
            }
          >
            + Task
          </button>

          {/* DELIVERABLE BUTTON */}

          <button
            className="project-btn"
            onClick={() =>
              setShowDeliverableModal(true)
            }
          >
            + Deliverables
          </button>

          <hr />

          {/* USER */}

          <div
            className="user-info"
            onClick={toggleProfileModal}
          >

            <div className="user-avatar">
              {user.name
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="user-text">

              <h6>{user.name}</h6>

              <span>{user.role}</span>

            </div>

            <div className="arrow-icon">
              <MdKeyboardArrowDown
                fontSize={"25px"}
              />
            </div>

            {isProfileOpen && (

              <div
                className="header-modal-card"
                onClick={(e) =>
                  e.stopPropagation()
                }
              >

                <div className="header-modal-top">

                  <h3>Your Profile</h3>

                  <p className="modal-subtitle">
                    Latest account details
                  </p>

                </div>

                <div className="header-modal-item">
                  <span>Name</span>

                  <strong>
                    {user.name}
                  </strong>
                </div>

                <div className="header-modal-item">
                  <span>Email</span>

                  <strong>
                    {user.email}
                  </strong>
                </div>

                <div className="header-modal-item">
                  <span>Role</span>

                  <strong>
                    {user.role}
                  </strong>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

      {/* TASK MODAL */}

      {showTaskModal && (

        <CreateTaskModal
          onClose={() =>
            setShowTaskModal(false)
          }
        />
      )}

      {/* DELIVERABLE MODAL */}

      {showDeliverableModal && (

        <CreateDeliverableModel
          onClose={() =>
            setShowDeliverableModal(false)
          }
        />
      )}

    </>
  );
}

export default Header;