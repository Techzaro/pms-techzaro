import React from "react";
import { MdClose, MdSecurity, MdCloudUpload, MdBadge, MdSchool, MdDescription } from "react-icons/md";

export default function WorkforceEmployeeModal({
  open,
  onClose,
  editForm,
  setEditForm,
  onSave,
  handleFileUpload,
  uploading,
}) {
  if (!open || !editForm) return null;

  return (
    <div className="wf-modal-overlay" onClick={onClose}>
      <div className="wf-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wf-modal-header">
          <h3>Workforce Profile &amp; Document Verification</h3>
          <button className="wf-close-btn" onClick={onClose} aria-label="Close Modal">
            <MdClose size={22} />
          </button>
        </div>

        <form className="wf-modal-form" onSubmit={onSave}>
          <div className="wf-modal-body">
            {/* Personal Details */}
            <div className="wf-form-section">
              <h4>Personal &amp; Contact Details</h4>
              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Full Name</label>
                  <input
                    className="wf-input"
                    value={editForm.name || ""}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="wf-field">
                  <label>Father's Name</label>
                  <input
                    className="wf-input"
                    value={editForm.father_name || ""}
                    onChange={(e) => setEditForm({ ...editForm, father_name: e.target.value })}
                    placeholder="Father Name"
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Email Address</label>
                  <input
                    className="wf-input"
                    type="email"
                    value={editForm.email || ""}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="wf-field">
                  <label>Contact Phone Number</label>
                  <input
                    className="wf-input"
                    value={editForm.phone_number || editForm.contact_no || ""}
                    onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value, contact_no: e.target.value })}
                    placeholder="+923119121134"
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>CNIC Number</label>
                  <input
                    className="wf-input"
                    value={editForm.id_card_number || ""}
                    onChange={(e) => setEditForm({ ...editForm, id_card_number: e.target.value })}
                    placeholder="12101-1234567-1"
                  />
                </div>
                <div className="wf-field">
                  <label>Department</label>
                  <input
                    className="wf-input"
                    value={editForm.department || ""}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Designation / Title</label>
                  <input
                    className="wf-input"
                    value={editForm.designation || ""}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  />
                </div>
                <div className="wf-field">
                  <label>Employee Code</label>
                  <input
                    className="wf-input"
                    value={editForm.employee_code || ""}
                    onChange={(e) => setEditForm({ ...editForm, employee_code: e.target.value })}
                    placeholder="EMP-1001"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact & Addresses */}
            <div className="wf-form-section">
              <h4>Emergency Contact &amp; Addresses</h4>
              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Emergency Contact Person</label>
                  <input
                    className="wf-input"
                    value={editForm.emergency_contact_name || ""}
                    onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                  />
                </div>
                <div className="wf-field">
                  <label>Emergency Contact Phone</label>
                  <input
                    className="wf-input"
                    value={editForm.emergency_contact_phone || ""}
                    onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Present Address</label>
                  <input
                    className="wf-input"
                    value={editForm.present_address || editForm.address || ""}
                    onChange={(e) => setEditForm({ ...editForm, present_address: e.target.value, address: e.target.value })}
                    placeholder="Lahore, Pakistan"
                  />
                </div>
                <div className="wf-field">
                  <label>Permanent Address</label>
                  <input
                    className="wf-input"
                    value={editForm.permanent_address || ""}
                    onChange={(e) => setEditForm({ ...editForm, permanent_address: e.target.value })}
                    placeholder="Lahore, Pakistan"
                  />
                </div>
              </div>
            </div>

            {/* Complete Document Upload & Compliance Vault Section */}
            <div className="wf-form-section wf-form-section--highlight">
              <h4><MdBadge size={18} /> Employee Compliance Documents &amp; Certificates</h4>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>🪪 CNIC Front Image Copy</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "cnic_front_image")} />
                    <span><MdCloudUpload size={16} /> {editForm.cnic_front_image ? "Uploaded ✔ (Click to Replace)" : "Upload CNIC Front Copy"}</span>
                  </div>
                </div>

                <div className="wf-field">
                  <label>🪪 CNIC Back Image Copy</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "cnic_back_image")} />
                    <span><MdCloudUpload size={16} /> {editForm.cnic_back_image ? "Uploaded ✔ (Click to Replace)" : "Upload CNIC Back Copy"}</span>
                  </div>
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>👮 Police Verification Status</label>
                  <select
                    className="wf-input"
                    value={editForm.criminal_check_status || "Pending"}
                    onChange={(e) => setEditForm({ ...editForm, criminal_check_status: e.target.value })}
                  >
                    <option value="Cleared">Cleared (Police Clearance Verified)</option>
                    <option value="Pending">Pending Verification</option>
                    <option value="Flagged">Flagged / Under Review</option>
                  </select>
                </div>

                <div className="wf-field">
                  <label>👮 Police Clearance Certificate File</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "criminal_record_file")} />
                    <span><MdCloudUpload size={16} /> {editForm.criminal_record_file ? "Uploaded ✔ (Click to Replace)" : "Upload Certificate PDF/Image"}</span>
                  </div>
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>🎓 Educational Degrees &amp; Certificates</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "educational_documents")} />
                    <span><MdCloudUpload size={16} /> {editForm.educational_documents ? "Uploaded ✔ (Click to Replace)" : "Upload Degree PDF/Image"}</span>
                  </div>
                </div>

                <div className="wf-field">
                  <label>💼 Experience &amp; Other Documents</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "other_document")} />
                    <span><MdCloudUpload size={16} /> {editForm.other_document ? "Uploaded ✔ (Click to Replace)" : "Upload Experience Document"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="wf-modal-footer">
            <button type="button" className="wf-btn wf-btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="wf-btn wf-btn--primary">Save Complete Employee Record</button>
          </div>
        </form>
      </div>
    </div>
  );
}
