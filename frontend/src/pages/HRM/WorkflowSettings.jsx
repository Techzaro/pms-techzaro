import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Save, GripVertical, Settings, Users, ArrowUp, ArrowDown, Building2, CheckSquare, ChevronDown, Search } from "lucide-react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import Breadcrumb from "../../components/Breadcrumb";
import { rolePath } from "../../utils/auth";
import { categoryMapping } from "../../utils/applicationTypes";
import "./WorkflowSettings.css";

export default function WorkflowSettings() {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments");
  const [submitterRole, setSubmitterRole] = useState([]);
  const [submitterDropdownOpen, setSubmitterDropdownOpen] = useState(false);
  const [openUserSelect, setOpenUserSelect] = useState(null);
  const [openDesignationSelect, setOpenDesignationSelect] = useState(null);
  const [departmentWorkflows, setDepartmentWorkflows] = useState([]);
  
  const [selectedTypes, setSelectedTypes] = useState([]);
  
  const [users, setUsers] = useState([]);
  const [steps, setSteps] = useState([]);
  const [orgRoles, setOrgRoles] = useState([]);
  
  const [submitterSearch, setSubmitterSearch] = useState("");
  const [stepUserSearch, setStepUserSearch] = useState("");
  
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
    fetchOrgRoles("All Departments");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment]);

  useEffect(() => {
    applyWorkflowData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitterRole, departmentWorkflows]);

  const fetchDepartments = async () => {
    try {
      const token = authToken();
      const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
      const res = await fetch(`${API_URL}/hrm/workflows/departments`, { headers });
      const json = await res.json();
      if (json.success) {
        setDepartments(json.data);
        if (!selectedDepartment && json.data.length > 0) {
          setSelectedDepartment(json.data[0]);
        }
      }
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
      return;
    }
    const currentRole = submitterRole.length === 0 ? null : submitterRole;
    const wf = departmentWorkflows.find(w => {
      if (!w.submitter_role && !currentRole) return true;
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
      if (steps[i].approver_type === 'User') {
        if (!steps[i].approver_id) {
          return alert(`Please select a specific user for Step ${i + 1}`);
        }
        const u = users.find(user => String(user.id) === String(steps[i].approver_id));
        if (u) {
          if (submitterRole.includes(String(u.id))) {
            return alert(`Step ${i + 1}: ${u.name} is selected as a submitter and cannot approve their own request.`);
          }
          if (u.role === 'member') {
            return alert(`Step ${i + 1}: ${u.name} is a regular member and does not have application approval access in their sidebar.`);
          }
        }
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
    setSteps([...steps, { id: Date.now(), approver_type: "User", approver_id: "" }]);
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
                            return <span key={r} className="ws-badge ws-badge-selected">{u ? `${u.name} (${u.designation || 'Staff'} • ${u.department || 'General'})` : r}</span>;
                          })
                        )}
                      </div>
                      <ChevronDown size={18} color="#94a3b8" />
                    </div>
                    {submitterDropdownOpen && (
                      <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '280px', overflowY: 'auto' }}>
                        <div className="ws-dropdown-search">
                          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
                            <input 
                              type="text" 
                              placeholder="Search user, department, or designation..." 
                              value={submitterSearch}
                              onChange={(e) => setSubmitterSearch(e.target.value)}
                              className="ws-dropdown-search-input"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {(selectedDepartment && selectedDepartment !== 'All Departments' && selectedDepartment !== 'All' 
                          ? users.filter(u => u.department === selectedDepartment) 
                          : users)
                          .filter(u => {
                            if (!submitterSearch.trim()) return true;
                            const q = submitterSearch.toLowerCase();
                            return (
                              u.name?.toLowerCase().includes(q) ||
                              u.department?.toLowerCase().includes(q) ||
                              u.designation?.toLowerCase().includes(q)
                            );
                          })
                          .map(u => (
                            <label key={u.id} className="ws-multiselect-option" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input 
                                type="checkbox" 
                                checked={submitterRole.includes(String(u.id))} 
                                onChange={() => toggleSubmitterRole(String(u.id))} 
                              />
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, justifyContent: 'space-between' }}>
                                <span>{u.name} <small style={{ color: '#64748b', fontSize: '11px', marginLeft: '4px' }}>({u.designation || 'Staff'} • {u.department || 'General'})</small></span>
                              </div>
                            </label>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
                <span className="att-live-pill">{steps.length} Steps Defined</span>
              </div>
              
              {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '12px 0' }}>
                  <div className="ws-skeleton" style={{ width: '40%', height: '24px', marginBottom: '8px' }}></div>
                  <div className="ws-skeleton-card">
                    <div className="ws-skeleton" style={{ width: '30%', height: '16px' }}></div>
                    <div className="ws-skeleton" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                  <div className="ws-skeleton-card">
                    <div className="ws-skeleton" style={{ width: '25%', height: '16px' }}></div>
                    <div className="ws-skeleton" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                  <div className="ws-skeleton-card">
                    <div className="ws-skeleton" style={{ width: '35%', height: '16px' }}></div>
                    <div className="ws-skeleton" style={{ width: '100%', height: '42px', borderRadius: '10px' }}></div>
                  </div>
                </div>
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
                              {step.approver_id ? (() => {
                                const matching = users.filter(u => u.designation === step.approver_id);
                                const userText = matching.length > 0
                                  ? matching.map(u => `${u.name} • ${u.department || 'General'}`).join(', ')
                                  : '';
                                return (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                    <span><strong>{step.approver_id}</strong>{userText && <small style={{ color: '#64748b', fontSize: '12px', marginLeft: '6px' }}>— {userText}</small>}</span>
                                  </div>
                                );
                              })() : <span style={{ color: '#94a3b8' }}>Select Designation...</span>}
                              <ChevronDown size={18} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                            </div>
                            {openDesignationSelect === step.id && (
                              <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '220px', overflowY: 'auto' }}>
                                {orgRoles.map(r => {
                                  const desigUsers = users.filter(u => u.designation === r);
                                  const userText = desigUsers.length > 0
                                    ? desigUsers.map(u => `${u.name} • ${u.department || 'General'}`).join(', ')
                                    : '';
                                  const isSubmitterDesig = desigUsers.length > 0 && desigUsers.some(u => submitterRole.includes(String(u.id)));
                                  const allUsersAreMembers = desigUsers.length > 0 && desigUsers.every(u => u.role === 'member');
                                  const isDesigAlreadyAdded = steps.some(s => 
                                    s.id !== step.id && 
                                    (
                                      (s.approver_type === 'Designation' && s.approver_id === r) ||
                                      (s.approver_type === 'User' && desigUsers.some(u => String(u.id) === String(s.approver_id)))
                                    )
                                  );
                                  const isDisabled = isSubmitterDesig || allUsersAreMembers || isDesigAlreadyAdded;

                                  let disableTitle = "";
                                  if (isSubmitterDesig) disableTitle = "All users under this designation are submitters";
                                  else if (allUsersAreMembers) disableTitle = "Users with the Member role do not have access to approve applications in their portal.";
                                  else if (isDesigAlreadyAdded) disableTitle = "This designation or user is already added in another approval step.";

                                  return (
                                    <div 
                                      key={r} 
                                      className="ws-multiselect-option" 
                                      style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '8px 12px',
                                        opacity: isDisabled ? 0.5 : 1,
                                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                                        background: isDisabled ? '#f8fafc' : undefined
                                      }}
                                      title={disableTitle}
                                      onClick={() => {
                                        if (isDisabled) return;
                                        updateStep(step.id, 'approver_id', r);
                                        setOpenDesignationSelect(null);
                                      }}
                                    >
                                      <span>
                                        <strong style={{ fontWeight: '600' }}>{r}</strong>
                                        {userText && <small style={{ color: '#64748b', fontSize: '11px', marginLeft: '6px' }}>({userText})</small>}
                                      </span>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                        {isSubmitterDesig && (
                                          <span style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            Submitter
                                          </span>
                                        )}
                                        {isDesigAlreadyAdded && !isSubmitterDesig && (
                                          <span style={{ fontSize: '11px', color: '#d97706', background: '#fffbeb', border: '1px solid #fef3c7', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            Already Added
                                          </span>
                                        )}
                                        {allUsersAreMembers && !isSubmitterDesig && !isDesigAlreadyAdded && (
                                          <span style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                            No Approval Rights (Member Role)
                                          </span>
                                        )}
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
                                    <span><strong>{u.name}</strong> <small style={{ color: '#64748b', fontSize: '12px', marginLeft: '6px' }}>({u.designation || 'Staff'} • {u.department || 'General'})</small></span>
                                    {u.role === 'member' && (
                                      <span style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                                        No Approval Rights (Member Role)
                                      </span>
                                    )}
                                  </div>
                                ) : <span style={{ color: '#94a3b8' }}>Select User...</span>;
                              })() : <span style={{ color: '#94a3b8' }}>Select User...</span>}
                              <ChevronDown size={18} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                            </div>
                            {openUserSelect === step.id && (
                              <div className="ws-multiselect-dropdown" style={{ zIndex: 100, maxHeight: '280px', overflowY: 'auto' }}>
                                <div className="ws-dropdown-search">
                                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
                                    <input 
                                      type="text" 
                                      placeholder="Search approver by name, designation, or department..." 
                                      value={stepUserSearch}
                                      onChange={(e) => setStepUserSearch(e.target.value)}
                                      className="ws-dropdown-search-input"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                                {users
                                  .filter(u => {
                                    if (!stepUserSearch.trim()) return true;
                                    const q = stepUserSearch.toLowerCase();
                                    return (
                                      u.name?.toLowerCase().includes(q) ||
                                      u.department?.toLowerCase().includes(q) ||
                                      u.designation?.toLowerCase().includes(q)
                                    );
                                  })
                                  .map(u => {
                                    const isSubmitter = submitterRole.includes(String(u.id));
                                    const isAlreadyAdded = steps.some(s => 
                                      s.id !== step.id && 
                                      (
                                        (s.approver_type === 'User' && String(s.approver_id) === String(u.id)) ||
                                        (s.approver_type === 'Designation' && s.approver_id === u.designation)
                                      )
                                    );
                                    const isMemberRole = u.role === 'member';
                                    const isDisabled = isSubmitter || isAlreadyAdded || isMemberRole;

                                    let disableReason = "";
                                    if (isSubmitter) disableReason = "Cannot approve their own request";
                                    else if (isAlreadyAdded) disableReason = "Already added in another step";
                                    else if (isMemberRole) disableReason = "Users with the Member role do not have access to approve applications in their portal.";

                                    return (
                                      <div 
                                        key={u.id} 
                                        className="ws-multiselect-option" 
                                        style={{ 
                                          display: 'flex', 
                                          justifyContent: 'space-between', 
                                          alignItems: 'center',
                                          gap: '12px',
                                          padding: '8px 12px',
                                          opacity: isDisabled ? 0.5 : 1,
                                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                                          background: isDisabled ? '#f8fafc' : undefined
                                        }}
                                        title={disableReason}
                                        onClick={() => {
                                          if (isDisabled) return;
                                          updateStep(step.id, 'approver_id', String(u.id));
                                          setOpenUserSelect(null);
                                          setStepUserSearch("");
                                        }}
                                      >
                                        <span>{u.name} <small style={{ color: '#64748b', fontSize: '11px', marginLeft: '4px' }}>({u.designation || 'Staff'} • {u.department || 'General'})</small></span>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                          {isSubmitter && (
                                            <span style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                              Submitter
                                            </span>
                                          )}
                                          {isAlreadyAdded && !isSubmitter && (
                                            <span style={{ fontSize: '11px', color: '#d97706', background: '#fffbeb', border: '1px solid #fef3c7', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                              Already Added
                                            </span>
                                          )}
                                          {isMemberRole && !isSubmitter && !isAlreadyAdded && (
                                            <span style={{ fontSize: '11px', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', whiteSpace: 'nowrap' }}>
                                              No Approval Rights (Member Role)
                                            </span>
                                          )}
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
