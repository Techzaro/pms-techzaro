import React, { useState, useEffect, useRef } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import { ArrowLeft, Clock, User, Shield, CheckCircle, XCircle, RotateCcw, Lock, RefreshCw, FileText } from "lucide-react";
import HRMAdminActions from "./HRMAdminActions";
import HRMStatusTimeline from "./HRMStatusTimeline";
import "./ApplicationDetailsPage.css";

function ApplicationDetailsPage({ requestId, onBack, onRefresh, isAdmin = false, isApprover = false }) {
  const [data, setData] = useState(null);
  const [employeeStats, setEmployeeStats] = useState(null);
  const [previewUrls, setPreviewUrls] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState("");
  const [adminRemarks, setAdminRemarks] = useState("");
  const [memberResponse, setMemberResponse] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    fetchDetail();
    
    // Start polling for real-time updates
    pollingRef.current = setInterval(() => {
      fetchDetail(true); // true means silent fetch
    }, 5000);

    return () => clearInterval(pollingRef.current);
  }, [requestId]);

  const fetchDetail = async (silent = false) => {
    if (!silent) setLoading(true);
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
        
        // Stop polling if request is in a final state
        const status = json.data.application.status;
        if (['Approved', 'Rejected', 'Closed', 'Cancelled'].includes(status)) {
            clearInterval(pollingRef.current);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleUpdateStatus = async (actionType, adminRemarks) => {
    let newStat = "Pending";
    if (actionType === "approve") newStat = "Approved";
    if (actionType === "reject") newStat = "Rejected";
    if (actionType === "remove") newStat = "Cancelled";
    if (actionType === "in_progress") newStat = "In Progress";
    if (actionType === "request_info") newStat = "Additional Information Required";
    if (actionType === "complete") newStat = "Completed";

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

  const handleMemberResponse = async () => {
    if (!memberResponse.trim()) {
       alert("Please provide the requested information.");
       return;
    }
    setSubmittingStatus(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/member/requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: "Pending", comments: memberResponse })
      });
      const json = await res.json();
      if (json.success) {
        setMemberResponse("");
        fetchDetail();
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      alert("Error submitting information");
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

      {(isAdmin || isApprover) && <HRMAdminActions onAction={handleUpdateStatus} />}

      <div className="pms-card mt-4">
        <div className="pms-card-header"><FileText size={18} /> <h4>Request Details</h4></div>
        <div className="pms-card-body">
          <p><strong>Title:</strong> {data.title}</p>
          <p><strong>Type:</strong> {data.application_type}</p>
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
                 
                 let filePaths = [];
                 if (typeof displayVal === 'string') {
                    if (displayVal.startsWith('/storage/')) {
                       filePaths = [displayVal];
                    } else if (displayVal.startsWith('[')) {
                       try {
                           const parsed = JSON.parse(displayVal);
                           if (Array.isArray(parsed) && parsed.every(p => typeof p === 'string' && p.startsWith('/storage/'))) {
                               filePaths = parsed;
                           }
                       } catch(e) {}
                    }
                 }
                 
                 if (filePaths.length > 0) {
                    const baseUrl = API_URL.replace('/api', '');
                    const fullUrls = filePaths.map(p => `${baseUrl}${p}`);
                    displayVal = (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => { setPreviewUrls(fullUrls); setPreviewIndex(0); }}
                          className="btn-pms-primary"
                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          <FileText size={14} /> View Document{filePaths.length > 1 ? 's' : ''} ({filePaths.length})
                        </button>
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
        <div className="pms-card-header"><h4>Approval Workflow Chain</h4></div>
        <div className="pms-card-body">
          {data.approvals && data.approvals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.approvals.map((appr, idx) => (
                <div key={idx} style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: appr.status === 'Approved' ? 'var(--pms-success-light)' : 'var(--pms-bg)' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--text-heading)' }}>Step {appr.step_order}</strong>
                    <div style={{ fontSize: '14px', color: 'var(--pms-primary)', fontWeight: '600' }}>
                      {appr.approver_type === 'Designation' || appr.approver_type === 'Role' ? appr.approver_id : (appr.approver_user?.name || 'Specific User')}
                      {appr.approver_type === 'User' && appr.approver_user && <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>({appr.approver_user.designation || (appr.approver_user.role === 'admin' ? 'Admin' : appr.approver_user.role)})</span>}
                    </div>
                  </div>
                  <span className={`pms-badge pms-badge--${appr.status === 'Approved' ? 'success' : 'warning'}`}>{appr.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>No workflow chain defined for this request.</p>
          )}
        </div>
      </div>

      <div className="pms-card mt-4">
        <div className="pms-card-header"><h4>Application Timeline</h4></div>
        <div className="pms-card-body" style={{ padding: "0" }}>
          <HRMStatusTimeline status={data.status} />
        </div>
      </div>

      {!isAdmin && data.status === 'Additional Information Required' && (
        <div className="pms-card mt-4" style={{ border: '1px solid var(--pms-warning)' }}>
          <div className="pms-card-header" style={{ background: 'var(--pms-warning-light)', color: '#92400e' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={18} /> Additional Information Required
            </h4>
          </div>
          <div className="pms-card-body">
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              The approver has requested more details before processing your application. Please provide the required information below to resubmit your application.
            </p>
            <textarea
              className="pms-textarea"
              style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '12px', fontSize: '14px' }}
              placeholder="Type your response here..."
              value={memberResponse}
              onChange={(e) => setMemberResponse(e.target.value)}
            />
            <button
              className="btn-pms-primary"
              onClick={handleMemberResponse}
              disabled={submittingStatus}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', fontWeight: '600' }}
            >
              {submittingStatus ? "Submitting..." : "Submit Information & Resume Process"}
            </button>
          </div>
        </div>
      )}

      {previewUrls && previewUrls.length > 0 && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', color: 'white' }}>
            <div style={{ fontSize: '16px', fontWeight: '600' }}>
              Document {previewIndex + 1} of {previewUrls.length}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <a href={previewUrls[previewIndex]} target="_blank" rel="noreferrer" style={{ background: '#3b82f6', color: 'white', textDecoration: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Download Original
              </a>
              <button onClick={() => setPreviewUrls(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                &times; Close
              </button>
            </div>
          </div>
          <div style={{ width: '100%', maxWidth: '1200px', height: '80vh', background: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', display: 'flex', position: 'relative' }}>
            {previewUrls.length > 1 && (
              <button 
                onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === 0 ? 'not-allowed' : 'pointer', zIndex: 10, opacity: previewIndex === 0 ? 0.3 : 1 }}
              >
                <ArrowLeft size={24} />
              </button>
            )}
            
            <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
              {previewUrls[previewIndex].toLowerCase().match(/\.(jpeg|jpg|gif|png)$/) != null ? (
                <img src={previewUrls[previewIndex]} alt={`Preview ${previewIndex + 1}`} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <iframe src={previewUrls[previewIndex]} style={{ width: '100%', height: '100%', border: 'none' }} title={`Document Preview ${previewIndex + 1}`} />
              )}
            </div>

            {previewUrls.length > 1 && (
              <button 
                onClick={() => setPreviewIndex((i) => Math.min(previewUrls.length - 1, i + 1))}
                disabled={previewIndex === previewUrls.length - 1}
                style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: previewIndex === previewUrls.length - 1 ? 'not-allowed' : 'pointer', zIndex: 10, opacity: previewIndex === previewUrls.length - 1 ? 0.3 : 1 }}
              >
                <ArrowLeft size={24} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
          </div>
          
          {previewUrls.length > 1 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              {previewUrls.map((_, idx) => (
                <button 
                  key={idx}
                  onClick={() => setPreviewIndex(idx)}
                  style={{ width: '12px', height: '12px', borderRadius: '50%', border: 'none', background: idx === previewIndex ? '#3b82f6' : 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'background 0.2s' }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default ApplicationDetailsPage;
