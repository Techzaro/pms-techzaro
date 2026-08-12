import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Save, GripVertical, Settings, Users, ArrowUp, ArrowDown, Building2, CheckSquare, ChevronDown } from "lucide-react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import { rolePath } from "../../utils/auth";
import { categoryMapping } from "../../utils/applicationTypes";
import "./WorkflowSettings.css";

export default function WorkflowSettings() {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [submitterRole, setSubmitterRole] = useState([]);
  const [submitterDropdownOpen, setSubmitterDropdownOpen] = useState(false);
  const [openUserSelect, setOpenUserSelect] = useState(null);
  const [openDesignationSelect, setOpenDesignationSelect] = useState(null);
  const [departmentWorkflows, setDepartmentWorkflows] = useState([]);
  
  const [selectedTypes, setSelectedTypes] = useState([]);
  
  const [users, setUsers] = useState([]);
  const [steps, setSteps] = useState([]);
  const [orgRoles, setOrgRoles] = useState([]);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const submitterRef = useRef(null);
  const designationRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (submitterRef.current && !submitterRef.current.contains(event.target)) {
        setSubmitterDropdownOpen(false);
      }
      if (designationRef.current && !designationRef.current.contains(event.target)) {
        setOpenDesignationSelect(null);
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setOpenUserSelect(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    fetchDepartments();
    fetchOrgRoles("");
    checkExistingWorkflows();
  }, []);

  useEffect(() => {
    if (selectedDepartment) {
      setSubmitterRole([]);
      fetchDepartmentData();
      fetchOrgRoles(selectedDepartment);
    } else {
      setUsers([]);
      setSteps([]);
      setSelectedTypes([]);
      setDepartmentWorkflows([]);
      setSubmitterRole([]);
    }
  }, [selectedDepartment]);

  useEffect(() => {
    applyWorkflowData();
  }, [submitterRole, departmentWorkflows]);

  const fetchDepartments = async () => {
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_URL}/hrm/workflows/departments`, { headers });
      const json = await res.json();
      if (json.success) setDepartments(json.data);
    } catch (err) {
      console.error("Failed to fetch departments", err);
    }
  };

  const fetchOrgRoles = async (dept = "") => {
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const url = dept ? `${API_URL}/hrm/workflows/organization-roles?department=${encodeURIComponent(dept)}` : `${API_URL}/hrm/workflows/organization-roles`;
      const res = await fetch(url, { headers });
      const json = await res.json();
      if (json.success) setOrgRoles(json.data);
    } catch (err) {
      console.error(err);
    }
  };

  const checkExistingWorkflows = async () => {
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_URL}/hrm/workflows`, { headers });
      const json = await res.json();
      if (json.success && json.data.length > 0) {
        setSelectedDepartment(json.data[0].department);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDepartmentData = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      
      const [userRes, workflowRes] = await Promise.all([
        fetch(`${API_URL}/hrm/workflows/department-users?department=${encodeURIComponent(selectedDepartment)}`, { headers }),
        fetch(`${API_URL}/hrm/workflows?department=${encodeURIComponent(selectedDepartment)}`, { headers })
      ]);
      
      const userJson = await userRes.json();
      const workflowJson = await workflowRes.json();
      
      if (userJson.success) setUsers(userJson.data);
      
      if (workflowJson.success) {
        setDepartmentWorkflows(workflowJson.data);
      } else {
        setDepartmentWorkflows([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const applyWorkflowData = () => {
    if (!departmentWorkflows || departmentWorkflows.length === 0) {
        setSelectedTypes([]);
        setSteps([]);
        return;
    }
    const currentRole = submitterRole.length === 0 ? null : submitterRole;
    const wf = departmentWorkflows.find(w => {
      // Both null
      if (!w.submitter_role && !currentRole) return true;
      // Compare arrays
      if (Array.isArray(w.submitter_role) && Array.isArray(currentRole)) {
        if (w.submitter_role.length !== currentRole.length) return false;
        const sortedW = [...w.submitter_role].sort();
        const sortedC = [...currentRole].sort();
        return sortedW.every((val, index) => val === sortedC[index]);
      }
      return false;
    });
    if (wf) {
      setSelectedTypes(wf.application_types || []);
      setSteps(wf.steps.map(s => ({ id: s.id || Date.now() + Math.random(), ...s })));
    } else {
      setSelectedTypes([]);
      setSteps([]);
    }
  };

    const toggleSubmitterRole = (role) => {
      if (role === "") {
        setSubmitterRole([]);
        return;
      }
      setSubmitterRole(prev => {
        if (prev.includes(role)) {
          return prev.filter(r => r !== role);
        } else {
          return [...prev, role];
        }
      });
    };

  const handleSave = async () => {
    if (!selectedDepartment) return alert("Please select a department.");
    if (selectedTypes.length === 0) return alert("Please select at least one application type.");
    
    // Validate steps
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].approver_type === 'User' && !steps[i].approver_id) {
        return alert(`Please select a specific user for Step ${i + 1}`);
      }
    }

    setSaving(true);
    try {
      const token = authToken();
      const payload = {
        department: selectedDepartment,
        submitter_role: submitterRole.length === 0 ? null : submitterRole,
        application_types: selectedTypes,
        steps: steps.map((s, idx) => ({
          step_order: idx + 1,
          approver_type: s.approver_type,
          approver_id: s.approver_id
        }))
      };
      
      const res = await fetch(`${API_URL}/hrm/workflows`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        alert("Workflow saved successfully!");
        fetchDepartmentData();
      } else {
        alert("Error saving workflow: " + (json.message || "Unknown error"));
      }
    } catch (err) {
      alert("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    setSubmitterDropdownOpen(false);
    setSteps([...steps, { id: Date.now(), approver_type: "Designation", approver_id: "" }]);
  };

  const removeStep = (id) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id, field, value) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const moveStep = (index, direction) => {
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === steps.length - 1) return;
    const newSteps = [...steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[index + direction];
    newSteps[index + direction] = temp;
    setSteps(newSteps);
  };

  const handleTypeToggle = (typeId) => {
    if (selectedTypes.includes(typeId)) {
      setSelectedTypes(selectedTypes.filter(id => id !== typeId));
    } else {
      setSelectedTypes([...selectedTypes, typeId]);
    }
  };

  return (
    <main className="att-page" id="workflow-settings-page">
      <Breadcrumb items={[{ label: "Enterprise HRM", path: rolePath("hrm") }, { label: "Workflow Settings" }]} />
      
      <header className="att-header">
        <div>
          <div className="att-title-row">
            <h1>Application Workflow Settings</h1>
          </div>
          <p>Configure dynamic approval chains at the department level for specific application types.</p>
        </div>
      </header>

      <div className="ws-container">
        <div className="ws-sidebar">
          <div className="ws-section">
            <h3 className="ws-section-title"><Building2 size={18} className="text-pms-primary" /> Select Department</h3>
            <p className="ws-section-desc">Choose a department to configure its workflow</p>
            <select 
              className="ws-select" 
              value={selectedDepartment} 
              onChange={e => setSelectedDepartment(e.target.value)}
            >
              <option value="">-- Choose Department --</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {selectedDepartment && (
            <div className="ws-section" style={{ flex: 1 }}>
              <h3 className="ws-section-title"><CheckSquare size={18} className="text-pms-primary" /> Application Types</h3>
              <p className="ws-section-desc">Select which types will use this approval chain</p>
              <div className="ws-type-list" style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "5px" }}>
                {Object.entries(categoryMapping).map(([category, catTypes]) => (
                  <div key={category} style={{ marginBottom: "15px" }}>
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--text-heading)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{category}</h4>
                    {catTypes.map(t => (
                      <label key={t} className={`ws-type-item ${selectedTypes.includes(t) ? 'selected' : ''}`}>
                        <input 
                          type="checkbox" 
                          checked={selectedTypes.includes(t)}
                          onChange={() => handleTypeToggle(t)}
                        />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ws-content">
          {!selectedDepartment ? (
            <div className="ws-empty-state">
              <div className="ws-empty-icon">
                <Settings size={32} />
              </div>
              <div className="ws-empty-text">
                Select a department from the sidebar to start configuring its application approval workflow.
              </div>
            </div>
          ) : (
            <div className="wb-steps-container">
              <div className="wb-steps-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h3>Approval Chain for {selectedDepartment}</h3>
                  <div 
                    style={{ marginTop: '10px', fontSize: '14px', color: '#64748b', position: 'relative' }}
                    ref={submitterRef}
                  >
                    <div style={{ marginBottom: '6px', fontWeight: '500' }}>Applies to requests submitted by:</div>
                    <div 
                      className="ws-multiselect-trigger" 
                      onClick={() => setSubmitterDropdownOpen(!submitterDropdownOpen)}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                        {submitterRole.length === 0 ? (
                          <span style={{ color: '#94a3b8', fontSize: '14px' }}>Select Submitter Users...</span>
                        ) : (
                          submitterRole.map(r => {
                            const u = users.find(user => String(user.id) === String(r));
                            return <span key={r} className="ws-badge ws-badge-selected">{u ? u.name : r}</span>;
                          })
                        )}
                      </div>
                      <ChevronDown size={18} color="#94a3b8" />
                    </div>
                    {submitterDropdownOpen && (
                      <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '250px' }}>
                        {users.map(u => {
                          const isMgr = u.role === 'manager' || u.designation === 'Manager';
                          const isTL = !isMgr && u.role === 'team_lead';
                          return (
                           <label key={u.id} className="ws-multiselect-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <input 
                               type="checkbox" 
                               checked={submitterRole.includes(String(u.id))} 
                               onChange={() => toggleSubmitterRole(String(u.id))} 
                             />
                             <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, justifyContent: 'space-between' }}>
                               <span>{u.name} <small style={{ color: '#64748b', fontSize: '11px', marginLeft: '4px' }}>({u.designation || 'Staff'})</small></span>
                               <div style={{ display: 'flex', gap: '4px' }}>
                                 {isMgr ? <span className="ws-mgr-badge">Department Manager</span> : isTL ? <span className="ws-tl-badge">Team Leader</span> : null}
                               </div>
                             </div>
                           </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <span className="att-live-pill">{steps.length} Steps Defined</span>
              </div>
              
              {loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading workflow data...</div>
              ) : steps.length === 0 ? (
                <div className="ws-empty-state" style={{ height: "auto", padding: "60px 0" }}>
                  <div className="ws-empty-icon" style={{ background: "#f0fdf4", color: "#22c55e" }}>
                    <Users size={32} />
                  </div>
                  <div className="ws-empty-text">
                    No approval steps defined for this department. Click below to add the first step.
                  </div>
                </div>
              ) : (
                <div className="wb-steps-list">
                  {steps.map((step, index) => (
                    <div key={step.id} className="wb-step-card" style={{ zIndex: steps.length - index, position: 'relative' }}>
                      <div className="wb-step-drag">
                        <GripVertical size={16} />
                      </div>
                      <div className="wb-step-order">{index + 1}</div>
                      
                      <div className="wb-step-controls">
                        <select 
                          value={step.approver_type} 
                          onChange={(e) => {
                            const newType = e.target.value;
                            const newSteps = steps.map(s => {
                              if (s.id === step.id) {
                                return { ...s, approver_type: newType, approver_id: newType === 'Designation' ? 'Manager' : '' };
                              }
                              return s;
                            });
                            setSteps(newSteps);
                          }}
                          className="wb-step-select"
                          style={{ maxWidth: '200px' }}
                        >
                          <option value="Designation">By Designation</option>
                          <option value="User">Specific User</option>
                        </select>
                        
                        {step.approver_type === 'Designation' ? (
                          <div className="custom-user-select-container" style={{ position: 'relative', flex: 1 }} ref={designationRef}>
                            <div 
                              className="wb-step-select" 
                              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'white' }}
                              onClick={() => setOpenDesignationSelect(openDesignationSelect === step.id ? null : step.id)}
                            >
                              {step.approver_id ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                  <span>{step.approver_id}</span>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    {users.some(u => u.designation === step.approver_id && u.role === 'team_lead') && (
                                      <span className="ws-tl-badge">Team Leader</span>
                                    )}
                                    {(step.approver_id === 'Manager' || users.some(u => u.designation === step.approver_id && (u.role === 'manager' || u.designation === 'Manager'))) && (
                                      <span className="ws-mgr-badge">Department Manager</span>
                                    )}
                                  </div>
                                </div>
                              ) : <span style={{ color: '#94a3b8' }}>Select Designation...</span>}
                              <ChevronDown size={18} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                            </div>
                            {openDesignationSelect === step.id && (
                              <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '200px' }}>
                                {Array.from(new Set([...orgRoles, 'Admin', 'Manager'])).map(r => {
                                  const isMgr = r === 'Manager';
                                  const isSubmitter = users.some(u => u.designation === r && submitterRole.includes(String(u.id)));
                                  return (
                                    <div 
                                      key={r} 
                                      className="ws-multiselect-option" 
                                      style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        opacity: isSubmitter ? 0.4 : 1,
                                        cursor: isSubmitter ? 'not-allowed' : 'pointer',
                                        background: isSubmitter ? '#f8fafc' : undefined
                                      }}
                                      title={isSubmitter ? 'Includes a selected submitter user' : ''}
                                      onClick={() => {
                                        if (isSubmitter) return;
                                        updateStep(step.id, 'approver_id', r);
                                        setOpenDesignationSelect(null);
                                      }}
                                    >
                                      <span>{r}</span>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {isMgr ? <span className="ws-mgr-badge">Department Manager</span> : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="custom-user-select-container" style={{ position: 'relative', flex: 1 }} ref={userRef}>
                            <div 
                              className="wb-step-select" 
                              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', background: 'white' }}
                              onClick={() => setOpenUserSelect(openUserSelect === step.id ? null : step.id)}
                            >
                              {step.approver_id ? (() => {
                                const u = users.find(user => String(user.id) === String(step.approver_id));
                                return u ? (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <span>{u.name} {u.designation ? `- ${u.designation}` : (u.role === 'admin' ? '- Admin' : '')}</span>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      {(u.role === 'manager' || u.designation === 'Manager') ? (
                                        <span className="ws-mgr-badge">Department Manager</span>
                                      ) : u.role === 'team_lead' ? (
                                        <span className="ws-tl-badge">Team Leader</span>
                                      ) : null}
                                    </div>
                                  </div>
                                ) : <span style={{ color: '#94a3b8' }}>Select User...</span>;
                              })() : <span style={{ color: '#94a3b8' }}>Select User...</span>}
                              <ChevronDown size={18} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                            </div>
                            {openUserSelect === step.id && (
                              <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '200px' }}>
                                {users.filter(u => !steps.some(s => s.approver_type === 'User' && s.id !== step.id && String(s.approver_id) === String(u.id))).map(u => {
                                  const isSubmitter = submitterRole.includes(String(u.id));
                                  const isMgr = u.role === 'manager' || u.designation === 'Manager';
                                  const isTL = !isMgr && u.role === 'team_lead';
                                  return (
                                    <div 
                                      key={u.id} 
                                      className="ws-multiselect-option" 
                                      style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        opacity: isSubmitter ? 0.4 : 1,
                                        cursor: isSubmitter ? 'not-allowed' : 'pointer',
                                        background: isSubmitter ? '#f8fafc' : undefined
                                      }}
                                      title={isSubmitter ? 'Cannot approve their own request' : ''}
                                      onClick={() => {
                                        if (isSubmitter) return;
                                        updateStep(step.id, 'approver_id', String(u.id));
                                        setOpenUserSelect(null);
                                      }}
                                    >
                                      <span>{u.name} {u.designation ? `- ${u.designation}` : (u.role === 'admin' ? '- Admin' : '')}</span>
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        {isMgr ? <span className="ws-mgr-badge">Department Manager</span> : isTL ? <span className="ws-tl-badge">Team Leader</span> : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="wb-step-actions">
                        <button 
                          className="wb-action-btn" 
                          onClick={() => moveStep(index, -1)} 
                          disabled={index === 0}
                          title="Move Up"
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button 
                          className="wb-action-btn" 
                          onClick={() => moveStep(index, 1)} 
                          disabled={index === steps.length - 1}
                          title="Move Down"
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button 
                          className="wb-action-btn delete" 
                          onClick={() => removeStep(step.id)}
                          title="Remove Step"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <button className="wb-add-btn" onClick={addStep}>
                <Plus size={18} /> Add New Approval Step
              </button>

              <div className="wb-save-section">
                <button className="pms-btn pms-btn-primary" onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Save size={16} /> {saving ? "Saving Workflow..." : "Save Workflow"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
