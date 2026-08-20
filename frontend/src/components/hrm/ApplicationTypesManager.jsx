import  { useState, useEffect } from "react";
import API_URL from "../../config/api";
import { authToken } from "../../utils/auth";
import { X, Plus, Edit2, Trash2, CheckCircle, Sliders, AlertCircle, Check } from "lucide-react";
import "./ApplicationTypesManager.css";

function ApplicationTypesManager({ isOpen, onClose, onUpdated }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit Mode State
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchTypes();
    }
  }, [isOpen]);

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-types`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setTypes(json.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch application types", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-types`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name, description })
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(json.message || "Custom application type created.");
        setName("");
        setDescription("");
        fetchTypes();
        if (onUpdated) onUpdated();
      } else {
        setError(json.message || "Failed to create application type.");
      }
    } catch (err) {
      setError("Error creating application type.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (typeObj) => {
    setEditingId(typeObj.id);
    setEditName(typeObj.name);
    setEditDescription(typeObj.description || "");
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-types/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: editName, description: editDescription })
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        setSuccess("Application type updated successfully.");
        fetchTypes();
        if (onUpdated) onUpdated();
      } else {
        alert(json.message || "Failed to update.");
      }
    } catch (err) {
      alert("Error updating application type.");
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-types/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !currentStatus })
      });
      const json = await res.json();
      if (json.success) {
        fetchTypes();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert("Error toggling status.");
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete application type "${name}"?`)) return;

    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/hrm/application-types/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        fetchTypes();
        if (onUpdated) onUpdated();
      }
    } catch (err) {
      alert("Error deleting application type.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="app-types-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Sliders size={18} /> Manage Dynamic Application Types</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert--error"><AlertCircle size={15} /> {error}</div>}
          {success && <div className="alert alert--success"><CheckCircle size={15} /> {success}</div>}

          {/* CREATE NEW TYPE FORM */}
          <form className="create-type-form" onSubmit={handleCreate}>
            <h4><Plus size={15} /> Add New Custom Application Type</h4>
            <div className="form-row">
              <input
                type="text"
                className="input-field"
                placeholder="Application Type Name (e.g. Training Request)..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <input
                type="text"
                className="input-field"
                placeholder="Brief Description (Optional)..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button type="submit" className="btn-add-type" disabled={submitting || !name.trim()}>
                {submitting ? "Saving..." : "Add Application Type"}
              </button>
            </div>
          </form>

          {/* TYPES LIST */}
          <div className="types-list-section">
            <h4>Configured Application Types ({types.length})</h4>
            {loading ? (
              <p className="loading-text">Loading application types...</p>
            ) : (
              <div className="types-grid">
                {types.map((item) => (
                  <div key={item.id} className={`type-card ${item.is_active ? "" : "type-card--inactive"}`}>
                    {editingId === item.id ? (
                      <div className="type-edit-box">
                        <input
                          type="text"
                          className="input-field"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Type Name..."
                        />
                        <input
                          type="text"
                          className="input-field"
                          style={{ marginTop: "6px" }}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description..."
                        />
                        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                          <button className="btn-toggle btn-toggle--enable" onClick={() => handleSaveEdit(item.id)}>
                            <Check size={13} /> Save
                          </button>
                          <button className="btn-toggle btn-toggle--disable" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="type-card-main">
                          <div className="type-title-row">
                            <strong>{item.name}</strong>
                            <span className={`status-pill ${item.is_active ? "status-pill--active" : "status-pill--inactive"}`}>
                              {item.is_active ? "Active" : "Disabled"}
                            </span>
                          </div>
                          <p className="type-desc">{item.description || "No description provided."}</p>
                          <span className="type-code">Code: {item.code}</span>
                        </div>

                        <div className="type-card-actions">
                          <button
                            className={`btn-toggle ${item.is_active ? "btn-toggle--disable" : "btn-toggle--enable"}`}
                            onClick={() => handleToggleActive(item.id, item.is_active)}
                          >
                            {item.is_active ? "Disable" : "Enable"}
                          </button>
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button className="btn-edit" onClick={() => handleStartEdit(item)} title="Edit Type">
                              <Edit2 size={14} />
                            </button>
                            <button className="btn-delete" onClick={() => handleDelete(item.id, item.name)} title="Delete Type">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ApplicationTypesManager;
