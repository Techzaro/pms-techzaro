import React, { useState, useEffect, useCallback } from "react";
import API_URL from "../../config/api";
import { authToken, rolePath } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import { FileText, List, Eye } from "lucide-react";
import HRMDynamicFormRenderer from "../../components/hrm/HRMDynamicFormRenderer";
import ApplicationDetailsPage from "../../components/hrm/ApplicationDetailsPage";
import "./MemberHrmDashboard.css"; // Reuse styling for the form and tables

async function apiRequest(path, options = {}) {
  const token = authToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API Error ${res.status}`);
  }
  return res.json();
}

export default function AdminMyApplications() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [formResetKey, setFormResetKey] = useState(Date.now());
  const [submittingReq, setSubmittingReq] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  function notify(msg, kind = "success") {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  }

  const loadMyApplications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Reusing the member/summary endpoint to fetch own requests (history)
      const summaryRes = await apiRequest("/hrm/member/summary");
      setData(summaryRes);
    } catch (err) {
      if (!silent) notify("Failed to load application history.", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMyApplications();
  }, [loadMyApplications]);

  const handleDynamicFormSubmit = async ({ requestType, data }) => {
    setSubmittingReq(true);
    try {
      const token = authToken();
      const formData = new FormData();
      
      formData.append("application_type", requestType);
      formData.append("title", data.subject || `${requestType} Request`);
      if (data.comments) formData.append("description", data.comments);

      if (Object.keys(data).length > 0) {
        Object.keys(data).forEach(key => {
          if (key === "subject" || key === "comments") return; 
          if (key === "global_attachment" || key === "attachment" || key === "receipts" || key === "attachments") {
            const files = data[key];
            if (files && files.length > 0) {
              formData.append(`dynamic_fields[${key}]`, files[0]);
            }
          } else if (typeof data[key] === "object") {
            formData.append(`dynamic_fields[${key}]`, JSON.stringify(data[key]));
          } else {
            formData.append(`dynamic_fields[${key}]`, data[key]);
          }
        });
      }

      const res = await fetch(`${API_URL}/hrm/member/request-form`, {
        method: "POST",
        headers: { 
          Authorization: `Bearer ${token}`,
          "Accept": "application/json"
        },
        body: formData,
      });
      
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.message || "Failed to submit request.");

      notify(resData.message || `${requestType} submitted successfully ✔`);
      setFormResetKey(Date.now());
      loadMyApplications(false);
    } catch (err) {
      notify(err.message || "Failed to submit application.", "error");
    } finally {
      setSubmittingReq(false);
    }
  };

  const memberRequests = data?.memberRequests || [];
  const leaveHistory = data?.leaveHistory || [];

  return (
    <div style={{ padding: "20px" }}>
      {toast && <div className={`mem-toast mem-toast--${toast.kind}`} role="alert">{toast.message}</div>}

      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: "My Applications" }]} />
      
      <header className="att-header" style={{ marginBottom: "20px", marginTop: "15px", padding: '20px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div>
          <div className="att-title-row">
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>My Application Requests</h1>
          </div>
          <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '14.5px' }}>
            Submit and track your own personal leave, advance salary, and HR requests directly from your dashboard.
          </p>
        </div>
      </header>

      {selectedHistoryId ? (
        <ApplicationDetailsPage 
          requestId={selectedHistoryId} 
          onBack={() => setSelectedHistoryId(null)}
          onRefresh={() => loadMyApplications(false)}
        />
      ) : (
        <section className="mem-card" id="section-applications">
          <div className="mem-card-header">
            <h2 className="mem-card-title"><FileText size={19} /> Application Requests &amp; History</h2>
            <p className="mem-card-desc">
              Submit and manage your leave, advance salary, expense, and other HR requests dynamically.
            </p>
          </div>

          <div style={{ background: "var(--bg-card-alt)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "20px", marginBottom: "28px" }}>
            <p className="mem-section-sub" style={{ margin: "0 0 16px" }}>
              <FileText size={16} /> New Application Request
            </p>
            <div className="hrm-application-form-wrapper" style={{ pointerEvents: submittingReq ? 'none' : 'auto', opacity: submittingReq ? 0.7 : 1 }}>
              <HRMDynamicFormRenderer key={formResetKey} onSubmit={handleDynamicFormSubmit} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <p className="mem-section-sub" style={{ margin: 0 }}>
              <List size={16} /> Application History
            </p>
          </div>

          {loading && !data ? (
            <div className="mem-table-empty">Loading applications...</div>
          ) : memberRequests.length === 0 && leaveHistory.length === 0 ? (
            <div className="mem-table-empty">
              No applications submitted yet.
            </div>
          ) : (
            <div className="mem-table-wrap">
              <table className="mem-table">
                <thead>
                  <tr>
                    <th>Request Type</th>
                    <th>Subject / Details</th>
                    <th>Status</th>
                    <th>Submitted Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...memberRequests, ...leaveHistory].sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: "600", color: "var(--text-heading)" }}>{r.category || r.leave_type || r.application_type || r.name}</td>
                      <td style={{ fontWeight: "600", color: "var(--text-dark)", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.subject || r.title || r.reason || "-"}
                      </td>
                      <td>
                        <span className={`mem-badge ${r.status === "Approved" ? "mem-badge--success" : r.status === "Rejected" ? "mem-badge--danger" : "mem-badge--warning"}`}>
                          {r.status || "Pending"}
                        </span>
                      </td>
                      <td style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : "-"}
                      </td>
                      <td>
                        <button className="mem-btn mem-btn--secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setSelectedHistoryId(r.id)}>
                          <Eye size={14} style={{ marginRight: '4px' }} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
