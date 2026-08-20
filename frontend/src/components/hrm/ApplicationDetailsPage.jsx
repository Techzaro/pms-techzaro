import { useState, useEffect, useRef } from "react";
import API_URL from "../../config/api";
import { authToken, getUser, rolePath } from "../../utils/auth";
import { subscribe } from "../../utils/eventBus";
import Breadcrumb from "../Breadcrumb";
import { ArrowLeft, User, RotateCcw, RefreshCw, FileText, HelpCircle, MessageSquare, Send, Edit3, X, Download, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import HRMAdminActions from "./HRMAdminActions";
import HRMStatusTimeline from "./HRMStatusTimeline";
import HRMFieldRenderer from "./HRMFieldRenderer";
import { formConfigs } from "./HRMDynamicFormRenderer";
import "./ApplicationDetailsPage.css";

function ApplicationDetailsPage({ requestId, onBack, onRefresh, isAdmin = false, isApprover = false }) {
  const [data, setData] = useState(null);
  const [employeeStats, setEmployeeStats] = useState(null);
  const [previewUrls, setPreviewUrls] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [, setAdminStatus] = useState("");
  const [, setAdminRemarks] = useState("");
  
  // Edit & Response state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFields, setEditFields] = useState({});
  const [memberResponse, setMemberResponse] = useState("");
  const [submittingStatus, setSubmittingStatus] = useState(false);
  const pollingRef = useRef(null);

  useEffect(() => {
    fetchDetail();
    
    // Start polling for real-time updates
    pollingRef.current = setInterval(() => {
      fetchDetail(true); // true means silent fetch
    }, 3000);

    const unsubscribe = subscribe('data:changed', () => fetchDetail(true));
    const refreshOnFocus = () => fetchDetail(true);
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      clearInterval(pollingRef.current);
      unsubscribe();
      window.removeEventListener('focus', refreshOnFocus);
    };
    // fetchDetail intentionally follows requestId; including its render-local
    // identity would restart the polling interval on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setPreviewUrls(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


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

  const getFieldsForEditing = () => {
    if (!data) return [];
    
    // Standard config fields for this application type
    const configRaw = formConfigs[data.application_type] || [];
    const configFiltered = configRaw.filter(f => f.type !== 'attachment' && f.id !== 'comments' && f.id !== 'details');
    
    const fieldDefs = [
      ...configFiltered.map(f => ({ id: f.id, label: f.label, type: f.type, required: Boolean(f.required), options: f.options })),
    ];

    // Include existing fields from data.fields if not present in configFiltered
    if (data.fields && Array.isArray(data.fields)) {
      data.fields.forEach(f => {
        if (!fieldDefs.some(fd => fd.id === f.field_name || fd.id === f.id)) {
          if (f.field_name !== 'global_attachment' && f.field_name !== 'attachment') {
            fieldDefs.push({
              id: f.field_name,
              label: f.field_name.replace(/_/g, ' '),
              type: 'text',
              required: false
            });
          }
        }
      });
    }

    // Always include Document Attachment field so applicant can attach supporting files
    fieldDefs.push({
      id: "global_attachment",
      type: "attachment",
      label: "Attach Supporting Documents / Files",
      required: false
    });

    return fieldDefs;
  };

  const handleStartEdit = () => {
    setEditTitle(data.title || "");
    setEditDescription(data.description || "");
    const initialFields = {};
    if (data.fields && Array.isArray(data.fields)) {
      data.fields.forEach(f => {
        let rawVal = f.field_value || "";
        if (typeof rawVal === 'string' && (rawVal.startsWith('[') || rawVal.startsWith('{'))) {
          try {
            rawVal = JSON.parse(rawVal);
          } catch (e) {}
        }
        initialFields[f.field_name] = rawVal;
      });
    }
    setEditFields(initialFields);
    setIsEditing(true);
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
    setSubmittingStatus(true);
    try {
      const token = authToken();
      let hasFiles = false;
      const formDataObj = new FormData();
      formDataObj.append('comments', memberResponse);

      if (isEditing) {
        formDataObj.append('title', editTitle);
        formDataObj.append('description', editDescription);

        const textFields = {};
        Object.keys(editFields).forEach(key => {
          const val = editFields[key];
          if (Array.isArray(val) && val.length > 0 && val[0] instanceof File) {
            hasFiles = true;
            val.forEach(fileObj => {
              formDataObj.append('files[]', fileObj);
            });
          } else {
            textFields[key] = val;
          }
        });
        formDataObj.append('fields', JSON.stringify(textFields));
      }

      let reqOptions;
      if (hasFiles) {
        reqOptions = {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formDataObj
        };
      } else {
        const payload = { comments: memberResponse };
        if (isEditing) {
          payload.title = editTitle;
          payload.description = editDescription;
          payload.fields = editFields;
        }
        reqOptions = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        };
      }

      const res = await fetch(`${API_URL}/hrm/application-history/all/${requestId}/respond-info`, reqOptions);
      const json = await res.json();
      if (json.success) {
        setMemberResponse("");
        setIsEditing(false);
        fetchDetail();
        if (onRefresh) onRefresh();
      } else {
        alert(json.message || "Error submitting information");
      }
    } catch (err) {
      alert("Error submitting information");
    } finally {
      setSubmittingStatus(false);
    }
  };


  if (loading) return <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}><div className="app-spinner" style={{ margin: '0 auto 16px' }}></div>Loading application details...</div>;
  if (!data) return <div style={{ padding: '40px' }}><button className="btn-pms-back" onClick={onBack}><ArrowLeft size={16} /> Back</button> Error loading details.</div>;

  const currentUser = getUser();
  const isApplicant = currentUser && (Number(currentUser.id) === Number(data.employee_id) || Number(currentUser.id) === Number(data.employee?.id));

  // Find latest comment left by approver when requesting info
  const lastInfoRequest = data.history?.slice().reverse().find(h => 
    h.new_status === 'Additional Information Required' || (h.comments && h.comments.trim() !== '')
  );
  const approverComment = lastInfoRequest?.comments;
  const approverName = lastInfoRequest?.performed_by?.name || "Approver";

  return (
    <div className="app-detail-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: "Applications", path: rolePath("hrm/applications") }, { label: `Request #${data.request_number}` }]} />

      <header className="att-header" style={{ marginBottom: "20px", marginTop: "15px", padding: '20px', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <button className="btn-pms-back" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            <ArrowLeft size={16} /> Back to List
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Request <span style={{ color: '#0082ff' }}>#{data.request_number}</span>
              </h1>
              <span className={`pms-badge pms-badge--${
                data.status === 'Approved' ? 'success' : 
                data.status === 'Rejected' ? 'danger' : 
                data.status === 'Additional Information Required' ? 'warning' : 'info'
              }`} style={{ fontSize: '12.5px', padding: '4px 12px', borderRadius: '6px' }}>
                {data.status}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '13.5px' }}>
              Submitted by <strong>{data.employee?.name}</strong> for <strong>{data.application_type}</strong>
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button className="btn-pms-refresh" onClick={() => fetchDetail()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            <RefreshCw size={15} /> Refresh Data
          </button>
        </div>
      </header>


      <div className="app-banner-card">
        <div className="user-profile-summary">
          <div className="user-avatar">{data.employee?.name?.charAt(0) || 'U'}</div>
          <div className="user-info">
            <h3>{data.employee?.name}</h3>
            <p><User size={13} /> {data.employee?.email}</p>
            {isAdmin && employeeStats && (
              <div className="user-meta-tags">
                <span>Total: <strong>{employeeStats.total}</strong></span>
                <span style={{ color: '#6ee7b7' }}>Approved: <strong>{employeeStats.approved}</strong></span>
                <span style={{ color: '#fde047' }}>Pending: <strong>{employeeStats.pending}</strong></span>
              </div>
            )}
          </div>
        </div>
        <div className="banner-status-box">
          <div className="status-label">Current Status</div>
          <span className={`pms-badge pms-badge--${
            data.status === 'Approved' ? 'success' : 
            data.status === 'Rejected' ? 'danger' : 
            data.status === 'Additional Information Required' ? 'warning' : 'info'
          }`} style={{ fontSize: '13px', padding: '6px 14px' }}>
            {data.status}
          </span>
        </div>
      </div>

      {data.status === 'Additional Information Required' && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '18px 22px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(245, 158, 11, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#b45309', fontWeight: '700', fontSize: '15.5px' }}>
              <HelpCircle size={20} /> Approver Requested Additional Information
            </div>
            {(isApplicant || !isAdmin || !isApprover) && !isEditing && (
              <button 
                onClick={handleStartEdit}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#d97706', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)' }}
              >
                <Edit3 size={15} /> Edit & Resubmit Application
              </button>
            )}
          </div>
          {approverComment ? (
            <div style={{ background: '#ffffff', border: '1px solid #fef08a', borderRadius: '8px', padding: '14px 16px', color: '#78350f', fontSize: '14px', lineHeight: '1.5' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: '#92400e' }}>Comment from {approverName}:</div>
              <div dangerouslySetInnerHTML={{ __html: approverComment }} />
            </div>
          ) : (
            <p style={{ color: '#92400e', fontSize: '13.5px', margin: 0 }}>
              The approver has requested additional details before taking a decision on your application.
            </p>
          )}
        </div>
      )}

      {(isAdmin || isApprover) && <HRMAdminActions onAction={handleUpdateStatus} />}

      <div className="pms-card mt-4">
        <div className="pms-card-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} /> 
            <h4>{isEditing ? "Edit Application Details" : "Request Details"}</h4>
          </div>
          {data.status === 'Additional Information Required' && (isApplicant || !isAdmin || !isApprover) && (
            <button 
              onClick={isEditing ? () => setIsEditing(false) : handleStartEdit}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', background: isEditing ? '#f1f5f9' : '#eef2ff', color: isEditing ? '#475569' : '#4f46e5', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', fontWeight: '600', cursor: 'pointer' }}
            >
              {isEditing ? <><X size={14} /> Cancel Editing</> : <><Edit3 size={14} /> Edit Fields</>}
            </button>
          )}
        </div>
        <div className="pms-card-body">
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Application Title / Subject <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input 
                  type="text" 
                  className="pms-input"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                  value={editTitle} 
                  onChange={(e) => setEditTitle(e.target.value)} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Description / Justification
                </label>
                <textarea 
                  className="pms-textarea"
                  style={{ width: '100%', minHeight: '90px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                  value={editDescription} 
                  onChange={(e) => setEditDescription(e.target.value)} 
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13.5px', fontWeight: '700', color: '#0f172a', margin: '16px 0 12px' }}>
                  Application Form Inputs & Supporting Documents
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  {getFieldsForEditing().map((fieldDef) => (
                    <div 
                      key={fieldDef.id} 
                      style={{ gridColumn: (fieldDef.type === 'richtext' || fieldDef.type === 'attachment') ? '1 / -1' : 'auto' }}
                    >
                      <HRMFieldRenderer
                        field={fieldDef}
                        value={editFields[fieldDef.id]}
                        onChange={(val) => setEditFields(prev => ({ ...prev, [fieldDef.id]: val }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (

            <>
              <p style={{ margin: '0 0 8px', fontSize: '14px' }}><strong>Title:</strong> {data.title}</p>
              <p style={{ margin: '0 0 8px', fontSize: '14px' }}><strong>Type:</strong> <span className="type-badge">{data.application_type}</span></p>
              <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#475569' }}><strong>Description:</strong> {data.description || 'No additional description provided.'}</p>
              <hr />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px", background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
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
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {fullUrls.map((url, idx) => (
                              <a 
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-pms-primary"
                                style={{ padding: '7px 14px', fontSize: '12.5px', borderRadius: '6px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: '600', background: '#3b82f6', color: '#ffffff', boxShadow: '0 2px 4px rgba(59, 130, 246, 0.25)' }}
                              >
                                <ExternalLink size={14} /> View Document {fullUrls.length > 1 ? `#${idx + 1}` : ''}
                              </a>
                            ))}
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
            </>
          )}
        </div>
      </div>
      
      <div className="pms-card mt-4">
        <div className="pms-card-header"><h4>Approval Workflow Chain</h4></div>
        <div className="pms-card-body">
          {data.approvals && data.approvals.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.approvals.map((appr, idx) => (
                <div key={idx} style={{ padding: '12px 16px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: appr.status === 'Approved' ? '#f0fdf4' : appr.status === 'Additional Information Required' ? '#fffbeb' : '#ffffff' }}>
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--text-heading, #0f172a)' }}>Step {appr.step_order}</strong>
                    <div style={{ fontSize: '14px', color: '#4f46e5', fontWeight: '600' }}>
                      {appr.approver_type === 'Designation' || appr.approver_type === 'Role' ? appr.approver_id : (appr.approver_user?.name || 'Specific User')}
                      {appr.approver_type === 'User' && appr.approver_user && <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>({appr.approver_user.designation || (appr.approver_user.role === 'admin' ? 'Admin' : appr.approver_user.role)})</span>}
                    </div>
                  </div>
                  <span className={`pms-badge pms-badge--${
                    appr.status === 'Approved' ? 'success' : 
                    appr.status === 'Rejected' ? 'danger' : 
                    appr.status === 'Additional Information Required' ? 'warning' : 'info'
                  }`}>
                    {appr.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-secondary, #64748b)', fontSize: '13px', margin: 0 }}>No workflow chain defined for this request.</p>
          )}
        </div>
      </div>

      <div className="pms-card mt-4">
        <div className="pms-card-header"><h4>Application Timeline</h4></div>
        <div className="pms-card-body" style={{ padding: "0" }}>
          <HRMStatusTimeline status={data.status} />
        </div>
      </div>

      {data.history && data.history.length > 0 && (
        <div className="pms-card mt-4">
          <div className="pms-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={18} /> <h4>Activity & Remarks History</h4>
          </div>
          <div className="pms-card-body" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {data.history.map((hist, idx) => (
                <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <strong style={{ fontSize: '13.5px', color: '#0f172a' }}>
                      {hist.performed_by?.name || "System / HR"}
                      <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '400', marginLeft: '6px' }}>
                        ({hist.performed_by?.designation || hist.performed_by?.role || 'User'})
                      </span>
                    </strong>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      {new Date(hist.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '12.5px', color: '#475569', fontWeight: '500', marginBottom: hist.comments ? '6px' : '0' }}>
                    Action: <span style={{ color: '#4f46e5' }}>{hist.action}</span>
                    {hist.new_status && <span> &rarr; Status: <strong>{hist.new_status}</strong></span>}
                  </div>
                  {hist.comments && (
                    <div 
                      style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 12px', fontSize: '13.5px', color: '#1e293b', marginTop: '6px' }}
                      dangerouslySetInnerHTML={{ __html: hist.comments }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {data.status === 'Additional Information Required' && (isApplicant || !isApprover || !isAdmin) && (
        <div className="pms-card mt-4" style={{ border: '2px solid #f59e0b', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="pms-card-header" style={{ background: '#fffbeb', color: '#b45309', borderBottom: '1px solid #fde68a', padding: '14px 20px' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={18} /> {isEditing ? "Submit Updated Application & Response" : "Provide Requested Details"}
            </h4>
          </div>
          <div className="pms-card-body" style={{ padding: '20px' }}>
            <p style={{ fontSize: '13.5px', color: '#475569', marginBottom: '14px', lineHeight: '1.5' }}>
              {isEditing 
                ? "You have modified the application details above. Add any additional notes below and click resubmit to send your updated application back to the approver."
                : "The approver has requested more details before processing your application. You can edit your application fields above or provide your response below."}
            </p>
            <textarea
              className="pms-textarea"
              style={{ width: '100%', minHeight: '110px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '16px', fontSize: '14px', outline: 'none', background: '#ffffff' }}
              placeholder="Type your explanation / additional notes here..."
              value={memberResponse}
              onChange={(e) => setMemberResponse(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-pms-primary"
                onClick={handleMemberResponse}
                disabled={submittingStatus}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', fontWeight: '600', fontSize: '14.5px', background: '#f59e0b', color: '#ffffff', border: 'none', cursor: submittingStatus ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 2px 6px rgba(245, 158, 11, 0.25)' }}
              >
                <Send size={16} /> {submittingStatus ? "Submitting Application..." : (isEditing ? "Save Changes & Resubmit Application" : "Submit Information & Resume Process")}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewUrls && previewUrls.length > 0 && (
        <div 
          className="lightbox-overlay" 
          onClick={(e) => { if (e.target.classList.contains('lightbox-overlay')) setPreviewUrls(null); }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(6px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
        >
          <button 
            onClick={() => setPreviewUrls(null)}
            style={{
              position: 'fixed',
              top: '20px',
              right: '24px',
              zIndex: 1000000,
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
            }}
            title="Close Preview (Esc)"
          >
            <X size={22} />
          </button>

          <div 
            style={{
              width: '100%',
              maxWidth: '1100px',
              height: '85vh',
              background: '#ffffff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
          >
            {/* Modal Header Bar INSIDE the Card */}
            <div 
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 20px',
                background: '#0f172a',
                color: '#ffffff',
                borderBottom: '1px solid #1e293b',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} style={{ color: '#38bdf8' }} />
                <span style={{ fontWeight: '600', fontSize: '15px' }}>
                  Document Preview ({previewIndex + 1} of {previewUrls.length})
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <a 
                  href={previewUrls[previewIndex]} 
                  download={`document_${previewIndex + 1}`}
                  target="_blank" 
                  rel="noreferrer"
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <Download size={16} /> Download File
                </a>

                <button 
                  onClick={() => setPreviewUrls(null)} 
                  style={{
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <X size={16} /> Close
                </button>
              </div>
            </div>

            {/* Modal Body Container */}
            <div style={{ flex: 1, position: 'relative', background: '#f8fafc', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewUrls.length > 1 && (
                <button 
                  onClick={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                  disabled={previewIndex === 0}
                  style={{
                    position: 'absolute',
                    left: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(15, 23, 42, 0.75)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: previewIndex === 0 ? 'not-allowed' : 'pointer',
                    zIndex: 10,
                    opacity: previewIndex === 0 ? 0.3 : 1,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                  }}
                >
                  <ChevronLeft size={24} />
                </button>
              )}

              {previewUrls[previewIndex].toLowerCase().match(/\.(jpeg|jpg|gif|png|webp|svg)$/) != null ? (
                <img 
                  src={previewUrls[previewIndex]} 
                  alt={`Document Preview ${previewIndex + 1}`} 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '16px' }} 
                />
              ) : (
                <iframe 
                  src={previewUrls[previewIndex]} 
                  style={{ width: '100%', height: '100%', border: 'none' }} 
                  title={`Document Preview ${previewIndex + 1}`} 
                />
              )}

              {previewUrls.length > 1 && (
                <button 
                  onClick={() => setPreviewIndex((i) => Math.min(previewUrls.length - 1, i + 1))}
                  disabled={previewIndex === previewUrls.length - 1}
                  style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(15, 23, 42, 0.75)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: previewIndex === previewUrls.length - 1 ? 'not-allowed' : 'pointer',
                    zIndex: 10,
                    opacity: previewIndex === previewUrls.length - 1 ? 0.3 : 1,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                  }}
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>

            {/* Modal Bottom Indicator Bar if multiple documents */}
            {previewUrls.length > 1 && (
              <div style={{ padding: '10px', background: '#0f172a', display: 'flex', justifyContent: 'center', gap: '8px', flexShrink: 0 }}>
                {previewUrls.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setPreviewIndex(idx)}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      border: 'none',
                      background: idx === previewIndex ? '#38bdf8' : 'rgba(255,255,255,0.3)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
export default ApplicationDetailsPage;
