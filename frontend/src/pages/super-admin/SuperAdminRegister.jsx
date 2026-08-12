import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { saveSuperAdminSession } from "../../utils/auth";
import { api } from "./api/superAdminApi";
import "../../pages/Login.css";

function SuperAdminRegister() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");

  const handleRegister = async () => {
    const errors = {};
    if (!companyName.trim()) errors.companyName = "Company name is required.";
    if (!name.trim()) errors.name = "Admin name is required.";
    if (!email.trim()) errors.email = "Email is required.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSuccessMsg("");
    setLoading(true);

    try {
      const result = await api.register({
        company_name: companyName,
        name,
        email,
        phone: phone || undefined,
      });

      if (result.success) {
        const pwd = result.data?.password || "";
        setGeneratedPassword(pwd);
        setSuccessMsg(
          `Organization created! You can now login with the password shown below.`
        );
      } else {
        setFieldErrors({ form: result.message || "Registration failed." });
      }
    } catch (err) {
      setFieldErrors({ form: err.message || "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="overlay">
          <img
            src="https://cdn-icons-png.flaticon.com/512/5968/5968705.png"
            alt="TechXaro Logo"
            className="logo"
          />
          <h1>TECHXARO</h1>
          <p>Organization Management System</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-box">
          <h2>Create Organization</h2>
          <p className="subtitle">Register a new organization to get started</p>

          {fieldErrors.form && (
            <span className="field-error-text form-error">{fieldErrors.form}</span>
          )}
          {successMsg && (
            <div className="field-error-text form-error" style={{ color: "#16a34a", background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: "12px" }}>
              {successMsg}
              {generatedPassword && (
                <div style={{ marginTop: "8px", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", border: "1px dashed #cbd5e1" }}>
                  <strong>Email:</strong> {email}<br />
                  <strong>Password:</strong> <code style={{ fontSize: "14px", background: "#e2e8f0", padding: "2px 6px", borderRadius: "4px" }}>{generatedPassword}</code>
                </div>
              )}
            </div>
          )}

          <input
            type="text"
            placeholder="Company Name"
            value={companyName}
            onChange={(e) => { setCompanyName(e.target.value); setFieldErrors((p) => ({ ...p, companyName: "", form: "" })); }}
            className={fieldErrors.companyName ? "field-error" : ""}
          />
          {fieldErrors.companyName && <span className="field-error-text">{fieldErrors.companyName}</span>}

          <input
            type="text"
            placeholder="Admin Full Name"
            value={name}
            onChange={(e) => { setName(e.target.value); setFieldErrors((p) => ({ ...p, name: "", form: "" })); }}
            className={fieldErrors.name ? "field-error" : ""}
          />
          {fieldErrors.name && <span className="field-error-text">{fieldErrors.name}</span>}

          <input
            type="email"
            placeholder="Admin Email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: "", form: "" })); }}
            className={fieldErrors.email ? "field-error" : ""}
          />
          {fieldErrors.email && <span className="field-error-text">{fieldErrors.email}</span>}

          <input
            type="text"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <div className="button-area" style={{ marginTop: "16px" }}>
            {successMsg ? (
              <button
                onClick={() => navigate("/super-admin/login")}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Go to Login
              </button>
            ) : (
              <button
                onClick={handleRegister}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: loading ? "#94a3b8" : "#16a34a",
                  color: "white",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.2s",
                }}
              >
                {loading ? "Creating..." : "Create Organization"}
              </button>
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: "24px" }}>
            <Link to="/super-admin/login" style={{ color: "#4f46e5", fontSize: "14px", textDecoration: "none" }}>
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SuperAdminRegister;
