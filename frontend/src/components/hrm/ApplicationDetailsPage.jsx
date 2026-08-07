import React, { useState, useEffect } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import { ArrowLeft, Clock, User, Shield, CheckCircle, XCircle, RotateCcw, Lock, RefreshCw, FileText } from "lucide-react";
import HRMAdminActions from "./HRMAdminActions";
import HRMStatusTimeline from "./HRMStatusTimeline";
import "./ApplicationDetailsPage.css";

function ApplicationDetailsPage({ requestId, onBack, onRefresh, isAdmin = false }) {
  const [data, setData] = useState(null);
  const [employeeStats, setEmployeeStats] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
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
        setEmployeeStats(json.data.employee_stats);
        setAdminStatus(json.data.application.status || "");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (actionType, adminRemarks) => {
    let newStat = "Pending";
    if (actionType === "approve") newStat = "Approved";
    if (actionType === "reject") newStat = "Rejected";
    if (actionType === "remove") newStat = "Cancelled";

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
            {isAdmin && employeeStats && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px', fontSize: '12px' }}>
                <span style={{ padding: '2px 8px', background: '#f1f5f9', color: '#1e293b', borderRadius: '4px', fontWeight: '500' }}>Total: <strong>{employeeStats.total}</strong></span>
                <span style={{ padding: '2px 8px', background: '#ecfdf5', color: '#065f46', borderRadius: '4px', fontWeight: '500' }}>Approved: <strong>{employeeStats.approved}</strong></span>
                <span style={{ padding: '2px 8px', background: '#fffbeb', color: '#92400e', borderRadius: '4px', fontWeight: '500' }}>Pending: <strong>{employeeStats.pending}</strong></span>
              </div>
            )}
          </div>
        </div>
        <div className="banner-status-box">
          <div className="status-label">Current Status: {data.status}</div>
        </div>
      </div>

      {isAdmin && <HRMAdminActions onAction={handleUpdateStatus} />}

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
              
              if (displayVal) {
                 try {
                    const parsed = JSON.parse(displayVal);
                    if (parsed.start && parsed.end) {
                       displayVal = `${new Date(parsed.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} to ${new Date(parsed.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                    }
                 } catch (e) {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(displayVal)) {
                       displayVal = new Date(displayVal).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                    }
                    else if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(displayVal)) {
                       const [h, m] = displayVal.split(':');
                       const date = new Date();
                       date.setHours(h, m);
                       displayVal = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                    else if (/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):([0-5]\d)$/.test(displayVal)) {
                       displayVal = new Date(displayVal).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
                    }
                 }
                 
                 if (typeof displayVal === 'string' && displayVal.startsWith('/storage/')) {
                    const baseUrl = API_URL.replace('/api', '');
                    const fullUrl = `${baseUrl}${displayVal}`;
                    displayVal = (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button 
                          onClick={() => setPreviewUrl(fullUrl)}
                          className="btn-pms-primary"
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <FileText size={14} /> Preview Document
                        </button>
                        <a href={fullUrl} target="_blank" rel="noreferrer" style={{ color: "var(--pms-primary)", textDecoration: "underline", fontSize: '12px', alignSelf: 'center', fontWeight: '500' }}>Download Original</a>
                      </div>
                    );
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
        <div className="pms-card-header"><h4>Application Timeline</h4></div>
        <div className="pms-card-body" style={{ padding: "0" }}>
          <HRMStatusTimeline status={data.status} />
        </div>
      </div>

      {previewUrl && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '800px', display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
            <button onClick={() => setPreviewUrl(null)} style={{ background: 'white', color: 'black', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Close Preview</button>
          </div>
          <div style={{ width: '100%', maxWidth: '800px', height: '80vh', background: 'white', borderRadius: '8px', overflow: 'hidden' }}>
            {previewUrl.toLowerCase().match(/\.(jpeg|jpg|gif|png)$/) != null ? (
              <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <iframe src={previewUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="Document Preview" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
export default ApplicationDetailsPage;
