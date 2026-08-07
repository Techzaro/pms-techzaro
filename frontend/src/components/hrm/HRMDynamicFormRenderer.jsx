import React, { useState, useEffect } from "react";
import HRMFieldRenderer from "./HRMFieldRenderer";
import "./HRMDynamicFormRenderer.css";

// Form configurations mapping
const formConfigs = {
  // 1. Attendance Requests
  "Attendance Correction": [
    { id: "corrDate", type: "date", label: "Date", required: true },
    { id: "corrTime", type: "text", label: "Correction", required: true }
  ],
  "Missing Punch": [
    { id: "punchDate", type: "date", label: "Date", required: true },
    { id: "punchType", type: "dropdown", label: "Punch Type", options: ["Check In", "Check Out"], required: true }
  ],
  "Late Arrival Justification": [
    { id: "lateDate", type: "date", label: "Date", required: true },
    { id: "expectedTime", type: "time", label: "Expected Time", required: true }
  ],
  "Overtime Request": [
    { id: "otDate", type: "date", label: "Date", required: true },
    { id: "otHours", type: "number", label: "Hours", required: true },
    { id: "project", type: "text", label: "Project", required: true }
  ],
  "Overtime Approval": [
    { id: "employee", type: "text", label: "Employee", required: true },
    { id: "otHours", type: "number", label: "Hours", required: true }
  ],
  "Shift Swap": [
    { id: "swapWith", type: "text", label: "Swap With", required: true },
    { id: "swapDate", type: "date", label: "Date", required: true }
  ],
  "Shift Change": [
    { id: "currentShift", type: "text", label: "Current Shift", required: true },
    { id: "reqShift", type: "text", label: "Requested Shift", required: true }
  ],
  "Work From Home Request": [
    { id: "wfhDate", type: "date", label: "Date", required: true }
  ],

  // 2. Leave Requests
  "Full Day Leave": [
    { id: "leaveType", type: "dropdown", label: "Leave Type", options: ["Annual", "Casual", "Sick", "Maternity", "Paternity", "Marriage", "Pilgrimage", "Study", "Bereavement"], required: true },
    { id: "leaveDate", type: "daterange", label: "Date", required: true }
  ],
  "Half Day Leave": [
    { id: "leaveDate", type: "date", label: "Date", required: true },
    { id: "leaveTime", type: "text", label: "Time", required: true }
  ],
  "Leave Encashment": [
    { id: "numLeaves", type: "number", label: "No. of leaves", required: true },
    { id: "leaveTypes", type: "text", label: "Types of leaves", required: true }
  ],

  // 3. Payroll Requests
  "Salary Advance": [
    { id: "amount", type: "amount", label: "Amount", required: true },
    { id: "month", type: "text", label: "Salary Month", required: true }
  ],
  "Loan Request": [
    { id: "amount", type: "amount", label: "Loan Amount", required: true },
    { id: "schedule", type: "text", label: "Repayment Schedule", required: true }
  ],
  "Increment Request": [
    { id: "reason", type: "richtext", label: "Reason for Increment", required: true }
  ],
  "Expense Reimbursement": [
    { id: "amount", type: "amount", label: "Amount", required: true },
    { id: "month", type: "text", label: "Month", required: true }
  ],
  "Allowance Request": [
    { id: "allowanceType", type: "dropdown", label: "Allowance Type", options: ["Travel", "Fuel", "Mobile", "Housing", "Internet", "Meal"], required: true },
    { id: "amount", type: "amount", label: "Requested Amount", required: true },
    { id: "month", type: "text", label: "Month", required: true }
  ],
  "Performance Bonus Claim": [
    { id: "amount", type: "amount", label: "Amount", required: true },
    { id: "month", type: "text", label: "Month", required: true }
  ],
  "Commission Request": [
    { id: "amount", type: "amount", label: "Amount", required: true },
    { id: "month", type: "text", label: "Month", required: true }
  ],
  "Salary Correction": [
    { id: "amount", type: "amount", label: "Amount", required: true },
    { id: "month", type: "text", label: "Month", required: true }
  ],
  "Bank Account Change": [
    { id: "newBankDetails", type: "richtext", label: "New Bank Details", required: true }
  ],
  "Final Settlement Request": [
    { id: "details", type: "richtext", label: "Details", required: true }
  ],
  "Health Insurance Enrollment": [
    { id: "enrollType", type: "dropdown", label: "Type", options: ["Add Dependent", "Remove Dependent", "Claim"], required: true },
    { id: "amount", type: "amount", label: "Amount (if claim)", required: false },
    { id: "month", type: "text", label: "Month", required: false },
    { id: "depName", type: "text", label: "Dependent Name", required: false }
  ],

  // 4. HR Requests
  "Promotion Request": [
    { id: "currPos", type: "text", label: "Current Position", required: true },
    { id: "newPos", type: "text", label: "Requested Position", required: true }
  ],
  "Issue Of Document": [
    { id: "docType", type: "dropdown", label: "Document Type", options: ["Employment Certificate", "Payslip", "Experience Letter", "NOC", "Visa"], required: true },
    { id: "details", type: "richtext", label: "Details", required: true }
  ],
  "Change/Transfer Request": [
    { id: "transferType", type: "dropdown", label: "Transfer Type", options: ["Department", "Manager", "Designation"], required: true },
    { id: "details", type: "richtext", label: "Details", required: true }
  ],
  "Resignation": [
    { id: "reason", type: "richtext", label: "Reason", required: true }
  ],
  "Resignation Withdrawal": [
    { id: "reason", type: "richtext", label: "Reason", required: true }
  ],
  "Retirement Request": [
    { id: "details", type: "richtext", label: "Details", required: true }
  ],

  // 5. Asset Requests
  "Company Assets Issue": [
    { id: "assetType", type: "dropdown", label: "Asset Type", options: ["Laptop", "Desktop", "Mobile Phone", "SIM Card", "Headset", "Keyboard", "Mouse", "Monitor", "Chair", "Docking Station", "Access Card"], required: true }
  ],
  "Asset Replacement": [
    { id: "assetDetails", type: "text", label: "Asset Details", required: true },
    { id: "reason", type: "richtext", label: "Reason for Replacement", required: true }
  ],

  // 6. IT Requests
  "Password Reset": [{ id: "system", type: "text", label: "System Name", required: true }],
  "Email Creation": [{ id: "details", type: "text", label: "Details", required: true }],
  "Email Access": [{ id: "details", type: "text", label: "Details", required: true }],
  "Software Installation": [
    { id: "software", type: "text", label: "Software Name", required: true },
    { id: "action", type: "dropdown", label: "Action", options: ["Installation", "Removal"], required: true }
  ],
  "Shared Folder Access": [{ id: "folderName", type: "text", label: "Folder Name", required: true }],
  "Network Access": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Internet Issue": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "New User Setup": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Computer Repair": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Hardware Upgrade": [{ id: "details", type: "richtext", label: "Details", required: true }],

  // 7. Finance Requests
  "Purchase Request": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Vendor Payment": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Budget Approval": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Cash Advance": [
    { id: "amount", type: "amount", label: "Amount", required: true }
  ],
  "Expense Claim": [
    { id: "amount", type: "amount", label: "Amount", required: true }
  ],
  "Refund Request": [
    { id: "amount", type: "amount", label: "Amount", required: true }
  ],

  // 8. Travel Requests
  "Business Trip": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Flight Booking": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Hotel Booking": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Visa Request": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Airport Pickup": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Travel Insurance": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Travel Extension": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Travel Expense Claim": [
    { id: "amount", type: "amount", label: "Amount", required: true }
  ],

  // 9. Training Requests
  "Course Registration": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Certification Request": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Mentorship Request": [{ id: "mentor", type: "text", label: "Mentor Name/Position", required: true }],
  "Seminar Attendance": [
    { id: "seminarName", type: "text", label: "Seminar Name", required: true },
    { id: "seminarDate", type: "date", label: "Date", required: true }
  ],

  // 10. Facilities Requests
  "Meeting Room Booking": [
    { id: "meetDate", type: "date", label: "Date", required: true },
    { id: "meetTime", type: "time", label: "Time", required: true }
  ],
  "Cleaning Request": [{ id: "details", type: "richtext", label: "Details", required: true }],
  "Stationery Request": [{ id: "details", type: "richtext", label: "Details", required: true }],

  // 11. Compliance Requests
  "Harassment Complaint": [{ id: "details", type: "richtext", label: "Details", required: true }],

  // 12. Miscellaneous
  "Miscellaneous Request": [{ id: "details", type: "richtext", label: "Details", required: true }]
};

// Category to Request Type Mapping
const categoryMapping = {
  "Attendance Requests": [
    "Attendance Correction", "Missing Punch", "Late Arrival Justification", 
    "Overtime Request", "Overtime Approval", "Shift Swap", "Shift Change", "Work From Home Request"
  ],
  "Leave Requests": [
    "Full Day Leave", "Half Day Leave", "Leave Encashment"
  ],
  "Payroll Requests": [
    "Salary Advance", "Loan Request", "Increment Request", "Expense Reimbursement", 
    "Allowance Request", "Performance Bonus Claim", "Commission Request", 
    "Salary Correction", "Bank Account Change", "Final Settlement Request", "Health Insurance Enrollment"
  ],
  "HR Requests": [
    "Promotion Request", "Issue Of Document", "Change/Transfer Request", 
    "Resignation", "Resignation Withdrawal", "Retirement Request"
  ],
  "Asset Requests": [
    "Company Assets Issue", "Asset Replacement"
  ],
  "IT Requests": [
    "Password Reset", "Email Creation", "Email Access", "Software Installation", 
    "Shared Folder Access", "Network Access", "Internet Issue", "New User Setup", "Computer Repair", "Hardware Upgrade"
  ],
  "Finance Requests": [
    "Purchase Request", "Vendor Payment", "Budget Approval", "Cash Advance", "Expense Claim", "Refund Request"
  ],
  "Travel Requests": [
    "Business Trip", "Flight Booking", "Hotel Booking", "Visa Request", "Airport Pickup", "Travel Insurance", "Travel Extension", "Travel Expense Claim"
  ],
  "Training Requests": [
    "Course Registration", "Certification Request", "Mentorship Request", "Seminar Attendance"
  ],
  "Facilities Requests": [
    "Meeting Room Booking", "Cleaning Request", "Stationery Request"
  ],
  "Compliance Requests": [
    "Harassment Complaint"
  ],
  "Miscellaneous / Custom Request": [
    "Miscellaneous Request"
  ]
};

const categories = Object.keys(categoryMapping);

export default function HRMDynamicFormRenderer({ onSubmit }) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [requestType, setRequestType] = useState("");
  const [formData, setFormData] = useState({});
  const [step, setStep] = useState(1); // 1: Fill form, 2: Review

  // Reset requestType when category changes
  useEffect(() => {
    setRequestType("");
    setFormData({});
    setStep(1);
  }, [selectedCategory]);

  // Reset form when request type changes
  useEffect(() => {
    setFormData({});
    setStep(1);
  }, [requestType]);

  const rawFields = formConfigs[requestType] || [];
  // Filter out any existing comments or attachment fields from the hardcoded config to prevent duplication
  const filteredFields = rawFields.filter(f => f.type !== 'attachment' && f.id !== 'comments' && f.id !== 'details');
  
  const fields = requestType ? [
    { id: "subject", type: "text", label: "Subject", required: true },
    ...filteredFields,
    { id: "comments", type: "richtext", label: "Comments / Additional Notes", required: false },
    { id: "global_attachment", type: "attachment", label: "Supporting Documents (Optional)", required: false }
  ] : [];

  const handleFieldChange = (id, value) => {
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleNext = () => {
    // Basic validation
    const missing = fields.filter(f => f.required && (!formData[f.id] || (Array.isArray(formData[f.id]) && formData[f.id].length === 0)));
    if (missing.length > 0) {
      alert(`Please fill all required fields: ${missing.map(m => m.label).join(", ")}`);
      return;
    }
    setStep(2);
  };

  const handleSubmit = () => {
    if (onSubmit) {
      onSubmit({ requestType, data: formData });
    }
  };

  const renderReviewValue = (field, val) => {
    if (!val) return "N/A";
    if (field.type === "daterange") {
      return `${val.start || "N/A"} to ${val.end || "N/A"}`;
    }
    if (field.type === "attachment") {
      return val.map(f => f.name).join(", ");
    }
    if (field.type === "richtext") {
      return <div dangerouslySetInnerHTML={{ __html: val }} className="hrm-review-html" />;
    }
    return String(val);
  };

  const dependentTypes = selectedCategory ? categoryMapping[selectedCategory] : [];

  return (
    <div className="hrm-dynamic-form-container">
      {step === 1 && (
        <div className="hrm-dynamic-form-fill">
          <div className="hrm-form-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
            <div>
              <label className="hrm-dynamic-label">Application Category</label>
              <select 
                className="hrm-dynamic-select"
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">-- Select Category --</option>
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            {selectedCategory && (
              <div>
                <label className="hrm-dynamic-label">Request Type</label>
                <select 
                  className="hrm-dynamic-select"
                  value={requestType} 
                  onChange={(e) => setRequestType(e.target.value)}
                >
                  <option value="">-- Choose Request Type --</option>
                  {dependentTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {requestType && (
            <div className="hrm-form-fields" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <h3 className="hrm-dynamic-title">{requestType} Details</h3>
              <div className="hrm-fields-grid">
                {fields.map(field => (
                  <div key={field.id} className="hrm-field-wrapper" style={{ gridColumn: field.type === 'richtext' ? '1 / -1' : 'auto' }}>
                    <HRMFieldRenderer 
                      field={field} 
                      value={formData[field.id]} 
                      onChange={(val) => handleFieldChange(field.id, val)} 
                    />
                  </div>
                ))}
              </div>
              <div className="hrm-form-actions">
                <button type="button" className="hrm-btn hrm-btn-primary" onClick={handleNext}>
                  Review Request
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && requestType && (
        <div className="hrm-dynamic-form-review">
          <h3 className="hrm-dynamic-title">Request Summary</h3>
          <div className="hrm-review-list">
            <div className="hrm-review-item">
              <span className="hrm-review-label">Category:</span>
              <span className="hrm-review-val"><strong>{selectedCategory}</strong></span>
            </div>
            <div className="hrm-review-item">
              <span className="hrm-review-label">Request Type:</span>
              <span className="hrm-review-val"><strong>{requestType}</strong></span>
            </div>
            <div className="hrm-review-item">
              <span className="hrm-review-label">Submission Date:</span>
              <span className="hrm-review-val">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            {fields.map(field => (
              <div key={field.id} className="hrm-review-item" style={{ gridColumn: field.type === 'richtext' ? '1 / -1' : 'auto' }}>
                <span className="hrm-review-label">{field.label}:</span>
                <span className="hrm-review-val">{renderReviewValue(field, formData[field.id])}</span>
              </div>
            ))}
          </div>
          <div className="hrm-form-actions hrm-review-actions">
            <button type="button" className="hrm-btn hrm-btn-secondary" onClick={() => setStep(1)}>
              Edit
            </button>
            <button type="button" className="hrm-btn hrm-btn-success" onClick={handleSubmit}>
              Submit Request
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
