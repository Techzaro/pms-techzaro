import React from "react";
import { useState, useEffect } from "react";
import { X, Shield, Upload, FileText, Award } from "lucide-react";

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
            <X size={22} />
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
                  <label>Email Address</label>
                  <input
                    className="wf-input"
                    type="email"
                    value={editForm.email || ""}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Phone / WhatsApp Number</label>
                  <input
                    className="wf-input"
                    value={editForm.phone_number || editForm.contact_no || editForm.phone || ""}
                    onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value, phone: e.target.value })}
                    placeholder="+92 300 1234567"
                  />
                </div>
                <div className="wf-field">
                  <label>CNIC Number (13 Digits)</label>
                  <input
                    className="wf-input"
                    value={editForm.id_card_number || editForm.cnic || ""}
                    onChange={(e) => setEditForm({ ...editForm, id_card_number: e.target.value, cnic: e.target.value })}
                    placeholder="35202-1234567-1"
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Official Designation</label>
                  <input
                    className="wf-input"
                    value={editForm.designation || ""}
                    onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                    placeholder="e.g. Senior Frontend Engineer"
                  />
                </div>
                <div className="wf-field">
                  <label>Department</label>
                  <input
                    className="wf-input"
                    value={editForm.department || ""}
                    onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    placeholder="e.g. Engineering"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contacts & Permanent Address */}
            <div className="wf-form-section">
              <h4>Emergency Contacts &amp; Residence</h4>
              <div className="wf-form-row">
                <div className="wf-field">
                  <label>Emergency Contact Person</label>
                  <input
                    className="wf-input"
                    value={editForm.emergency_contact_name || ""}
                    onChange={(e) => setEditForm({ ...editForm, emergency_contact_name: e.target.value })}
                    placeholder="e.g. Guardian / Next of Kin"
                  />
                </div>
                <div className="wf-field">
                  <label>Emergency Contact Number</label>
                  <input
                    className="wf-input"
                    value={editForm.emergency_contact_phone || ""}
                    onChange={(e) => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })}
                    placeholder="+92 312 9876543"
                  />
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field wf-field--full">
                  <label>Permanent Residential Address</label>
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
              <h4><FileText size={18} /> Employee Compliance Documents &amp; Certificates</h4>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>🪪 CNIC Front Image Copy</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "cnic_front_image")} />
                    <span><Upload size={16} /> {editForm.cnic_front_image ? "Uploaded ✔ (Click to Replace)" : "Upload CNIC Front Copy"}</span>
                  </div>
                </div>

                <div className="wf-field">
                  <label>🪪 CNIC Back Image Copy</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "cnic_back_image")} />
                    <span><Upload size={16} /> {editForm.cnic_back_image ? "Uploaded ✔ (Click to Replace)" : "Upload CNIC Back Copy"}</span>
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
                    <span><Upload size={16} /> {editForm.criminal_record_file ? "Uploaded ✔ (Click to Replace)" : "Upload Certificate PDF/Image"}</span>
                  </div>
                </div>
              </div>

              <div className="wf-form-row">
                <div className="wf-field">
                  <label>🎓 Educational Degrees &amp; Certificates</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "educational_documents")} />
                    <span><Upload size={16} /> {editForm.educational_documents ? "Uploaded ✔ (Click to Replace)" : "Upload Degree PDF/Image"}</span>
                  </div>
                </div>

                <div className="wf-field">
                  <label>💼 Experience &amp; Other Documents</label>
                  <div className="wf-upload-box">
                    <input type="file" onChange={(e) => handleFileUpload(e, "other_document")} />
                    <span><Upload size={16} /> {editForm.other_document ? "Uploaded ✔ (Click to Replace)" : "Upload Experience Document"}</span>
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
