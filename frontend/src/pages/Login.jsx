/**
 * Login page component.
 * Handles user authentication and redirects based on role.
 */
import { useState } from "react";
import "./Login.css";

/**
 * Perform the login.
 */

/**
 * Login page component which authenticates users and routes them by role.
 */
function Login() {

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  /**
   * Display a temporary status message to the user.
   */
  const showMessage = (text, type = "success") => {
    setMessage(text);
    setMessageType(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 4000);
  };

  /**
   * Submit login credentials to the backend and handle response.
   */
  const handleLogin = async () => {
    if (!email.trim()) {
      showMessage("Please enter your email.", "error");
      return;
    }

    if (!password.trim()) {
      showMessage("Please enter your password.", "error");
      return;
    }

    try {

      setLoading(true);

      const res = await fetch("http://127.0.0.1:8000/api/login", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      const text = await res.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Unable to login");
      }

      if (!res.ok) {
        throw new Error(data.message || "Unable to login");
      }

      if (data.status) {

        localStorage.setItem("token", data.token);
        localStorage.setItem("role", data.role);
        if (data.user) {
          localStorage.setItem("name", data.user.name || "User");
          localStorage.setItem("email", data.user.email || "user@example.com");
        }

        if (data.role === "admin") {
          window.location.href = "/admin";
        }

        else if (data.role === "manager") {
          window.location.href = "/manager";
        }

        else if (data.role === "teamlead" || data.role === "team_lead") {
          window.location.href = "/teamlead";
        }

        else {
          window.location.href = "/member";
        }

      } else {

        showMessage(data.message, "error");

      }

    } catch (error) {
      console.log(error);
      showMessage(error.message || "Server Error", "error");
    } finally {

      setLoading(false);

    }
  };

  return (

    <div className="login-page">

      {/* LEFT SIDE */}

      <div className="login-left">

        <div className="overlay">

          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="Techxaro Logo"
            className="logo"
          />

          <h1>TECHXARO PMS</h1>

          <p>
            Manage Projects, Teams & Tasks Professionally
          </p>

        </div>

      </div>


      {/* RIGHT SIDE */}

      <div className="login-right">

        <div className="login-box">

          <h2>Welcome</h2>

          <p className="subtitle">
            Login to continue your work
          </p>


          {/* EMAIL */}

          <input
            type="email"
            placeholder="Enter Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />


          {/* PASSWORD */}

          <input
            type="password"
            placeholder="Enter Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />


          {/* OPTIONS */}
<div className="bottom-area">

  <div className="options">

    <label className="remember-box">
      <input type="checkbox" />
      Remember Me
    </label>

    <span className="forgot-password">
      Forgot Password?
    </span>

  </div>


  <div className="button-area">

    <button
      onClick={handleLogin}
      disabled={loading}
    >

      {loading ? "Loading..." : "Login"}

    </button>

  </div>

</div>

        </div>

        {message && (
          <div className={`message ${messageType}`}>
            {message}
          </div>
        )}

      </div>

    </div>
  );
}

export default Login;