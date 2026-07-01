import { Link } from "react-router-dom";
import "./Login.css";
import "./LoggedOut.css";

function LoggedOut() {
  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="TechXaro Logo"
            className="logo"
          />
          <h1>TECHXARO PMS</h1>
          <p>Manage Projects, Teams & Tasks Professionally</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>Logged Out</h2>
          <p className="subtitle">You have been successfully logged out of your account.</p>

          <p className="loggedout-message">Thank you for using TechXaro PMS. Your session has ended.</p>

          <div className="loggedout-divider"></div>

          <div className="button-area">
            <Link to="/" className="loggedout-btn-link">
              Login Again
            </Link>
          </div>

          <p className="loggedout-note">If you need help, contact your administrator.</p>
        </div>
      </div>
    </div>
  );
}

export default LoggedOut;
