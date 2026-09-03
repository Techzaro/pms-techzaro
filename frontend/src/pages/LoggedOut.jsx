import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./Login.css";
import "./LoggedOut.css";

function LoggedOut() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get("reason");

  const title = reason === "inactivity" ? t("Session Expired", { defaultValue: "Session Expired" }) : t("Logged Out", { defaultValue: "Logged Out" });
  const message = reason === "inactivity"
    ? t("Your session has expired due to 3 hours of inactivity. Please log in again to continue.", { defaultValue: "Your session has expired due to 3 hours of inactivity. Please log in again to continue." })
    : t("You have been successfully logged out of your account.", { defaultValue: "You have been successfully logged out of your account." });

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <h1>{t("TECHXARO ONE", { defaultValue: "TECHXARO ONE" })}</h1>
          <p>{t("Manage Projects, Teams & Tasks Professionally", { defaultValue: "Manage Projects, Teams & Tasks Professionally" })}</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>{title}</h2>
          <p className="subtitle">{message}</p>

          <div className="loggedout-divider"></div>

          <div className="button-area">
            <Link to="/login" className="loggedout-btn-link">
              {t("Login Again", { defaultValue: "Login Again" })}
            </Link>
          </div>

          <p className="loggedout-note">{t("If you need help, contact your administrator.", { defaultValue: "If you need help, contact your administrator." })}</p>
        </div>
      </div>
    </div>
  );
}

export default LoggedOut;
