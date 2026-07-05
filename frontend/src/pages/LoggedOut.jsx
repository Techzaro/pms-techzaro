import { Link, useSearchParams } from "react-router-dom";
import "./Login.css";
import "./LoggedOut.css";

function LoggedOut() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");

  const title = reason === "inactivity" ? "Session Expired" : "Logged Out";
  const message = reason === "inactivity"
    ? "Your session has expired due to 60 minutes of inactivity. Please log in again to continue."
    : "You have been successfully logged out of your account.";

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
          <h2>{title}</h2>
          <p className="subtitle">{message}</p>

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
