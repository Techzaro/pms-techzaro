import React, { useState, useEffect } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import { ArrowLeft, Clock, User, Shield, CheckCircle, XCircle, RotateCcw, Lock, RefreshCw, FileText } from "lucide-react";
import "./ApplicationDetailsPage.css";

function ApplicationDetailsPage({ requestId, onBack, onRefresh }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState("");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [requestId]);

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-history/all/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data.application);
        setAdminStatus(json.data.application.status || "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStat) => {
    setSubmittingStatus(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-history/all/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStat, comments: adminRemarks })
      });
      const json = await res.json();
      if (json.success) {
        setAdminRemarks("");
        fetchDetail();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      alert("Error updating status");
    } finally {
      setSubmittingStatus(false);
    }
  };

  if (loading) return <div>Loading details...</div>;
  if (!data) return <div><button onClick={onBack}>Back</button> Error loading details.</div>;

  return (
    <div className="app-detail-page">
      <div className="app-detail-navbar">
        <button className="btn-pms-back" onClick={onBack}><ArrowLeft size={16} /> Back</button>
        <div className="navbar-title">
          <h2>Request: <span className="highlight-id">{data.request_number}</span></h2>
        </div>
        <button className="btn-pms-refresh" onClick={fetchDetail}><RefreshCw size={15} /> Refresh</button>
      </div>

      <div className="app-banner-card">
        <div className="user-profile-summary">
          <div className="user-info">
            <h3>{data.employee?.name}</h3>
            <p><User size={13} /> {data.employee?.email}</p>
          </div>
        </div>
        <div className="banner-status-box">
          <div className="status-label">Current Status: {data.status}</div>
        </div>
      </div>

      <div className="admin-decision-card">
        <div className="decision-header">
          <Shield size={18} color="#0082ff" />
          <h3>Admin Decision Panel</h3>
        </div>
        <div className="decision-form">
          <textarea
            className="pms-textarea"
            rows={2}
            placeholder="Decision remarks..."
            value={adminRemarks}
            onChange={(e) => setAdminRemarks(e.target.value)}
          />
          <div className="decision-actions" style={{marginTop: '10px', display: 'flex', gap: '10px'}}>
            <button className="btn-decision btn-approve" disabled={submittingStatus} onClick={() => handleUpdateStatus("Approved")}>
              <CheckCircle size={15} /> Approve
            </button>
            <button className="btn-decision btn-return" disabled={submittingStatus} onClick={() => handleUpdateStatus("Returned")}>
              <RotateCcw size={15} /> Return
            </button>
            <button className="btn-decision btn-reject" disabled={submittingStatus} onClick={() => handleUpdateStatus("Rejected")}>
              <XCircle size={15} /> Reject
            </button>
          </div>
        </div>
      </div>

      <div className="pms-card mt-4">
        <div className="pms-card-header"><FileText size={18} /> <h4>Request Details</h4></div>
        <div className="pms-card-body">
          <p><strong>Title:</strong> {data.title}</p>
          <p><strong>Type:</strong> {data.type?.name}</p>
          <p><strong>Description:</strong> {data.description}</p>
          <hr />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "12px", background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            {data.fields?.map((f, i) => {
              let displayVal = f.field_value;
              
              // Formatting Logic for Dates / Times
              if (displayVal) {
                 // Check if valid JSON (for daterange)
                 try {
                    const parsed = JSON.parse(displayVal);
                    if (parsed.start && parsed.end) {
                       displayVal = `${new Date(parsed.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to ${new Date(parsed.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                    }
                 } catch (e) {
                    // Check if standard Date YYYY-MM-DD
                    if (/^\d{4}-\d{2}-\d{2}$/.test(displayVal)) {
                       displayVal = new Date(displayVal).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                    }
                    // Check if standard Time HH:mm
                    else if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(displayVal)) {
                       const [h, m] = displayVal.split(':');
                       const date = new Date();
                       date.setHours(h, m);
                       displayVal = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                    // Check if datetime-local YYYY-MM-DDTHH:mm
                    else if (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)$/.test(displayVal)) {
                       displayVal = new Date(displayVal).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                 }
                 
                 // If it is a file upload URL, display as link
                 if (typeof displayVal === 'string' && displayVal.startsWith('/storage/')) {
                    displayVal = <a href={displayVal} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "underline" }}>View Attachment</a>;
                 }
              }

              return (
                <div key={i}>
                  <strong style={{ color: "var(--text-secondary)", display: "block", marginBottom: "4px", fontSize: "13px", textTransform: "capitalize" }}>
                    {f.field_name.replace(/_/g, ' ')}
                  </strong>
                  <div style={{ color: "var(--text-heading)", fontWeight: "500" }}>{displayVal || '-'}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="pms-card mt-4">
        <div className="pms-card-header"><h4>Audit History</h4></div>
        <div className="pms-card-body">
          <ul>
            {data.history?.map((h, i) => (
              <li key={i}><strong>{h.action}</strong> to {h.new_status} on {new Date(h.created_at).toLocaleString()} by {h.performed_by?.name || 'Admin'} - {h.comments}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
export default ApplicationDetailsPage;
