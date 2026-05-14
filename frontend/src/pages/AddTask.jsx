/**
 * AddTask page component.
 * Rendered when the user navigates to /addtask or related route.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import "./AddTask.css";

/**
 * Perform the add task.
 */

/**
 * Page to add a new task inside a project.
 */
function AddTask() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("details");
  const [formData, setFormData] = useState({
    taskTitle: "",
    description: "",
    project: "",
    startDateTime: "",
    dueDateTime: "",
    priority: "Medium",
    assignTo: [],
    recurring: "None",
    markRecurring: false,
  });

  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [newLink, setNewLink] = useState("");

  /**
   * Perform the handle change.
   */

  /**
   * Handle handle change.
   */
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  /**
   * Perform the handle multi select.
   */

  /**
   * Handle handle multi select.
   */
  const handleMultiSelect = (e) => {
    const selectedOptions = Array.from(e.target.selectedOptions, (option) => option.value);
    setFormData((prev) => ({
      ...prev,
      assignTo: selectedOptions,
    }));
  };

  /**
   * Perform the handle file upload.
   */

  /**
   * Handle handle file upload.
   */
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  /**
   * Perform the handle add link.
   */

  /**
   * Handle handle add link.
   */
  const handleAddLink = () => {
    if (newLink.trim()) {
      setLinks((prev) => [...prev, newLink]);
      setNewLink("");
    }
  };

  /**
   * Perform the handle remove file.
   */

  /**
   * Handle handle remove file.
   */
  const handleRemoveFile = (index) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Perform the handle remove link.
   */

  /**
   * Handle handle remove link.
   */
  const handleRemoveLink = (index) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Perform the handle submit.
   */

  /**
   * Handle handle submit.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Task Data:", { formData, uploadedFiles, links });
    alert("Task will be created after database setup!");
  };

  /**
   * Perform the handle close.
   */

  /**
   * Handle handle close.
   */
  const handleClose = () => {
    navigate("/tasks");
  };

  return (
    <DashboardLayout>
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-header">
            <h2>Quick Create Task</h2>
            <button className="close-btn" onClick={handleClose}>
              ✕
            </button>
          </div>

          <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            className={`tab-btn ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            Upload Files
          </button>
          <button
            className={`tab-btn ${activeTab === "links" ? "active" : ""}`}
            onClick={() => setActiveTab("links")}
          >
            Add Link
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-form">
            {/* DETAILS TAB */}
            {activeTab === "details" && (
              <div className="tab-content">
                {/* PROJECT & ASSIGN TO */}
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="project">
                      Project <span className="required">*</span>
                    </label>
                    <select
                      id="project"
                      name="project"
                      value={formData.project}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select Project</option>
                      <option value="project1">Project 1</option>
                      <option value="project2">Project 2</option>
                      <option value="project3">Project 3</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="assignTo">
                      Assign To (Multi)
                    </label>
                    {formData.project ? (
                      <>
                        <select
                          id="assignTo"
                          name="assignTo"
                          value={formData.assignTo}
                          onChange={handleMultiSelect}
                          multiple
                        >
                          <option value="user1">User 1</option>
                          <option value="user2">User 2</option>
                          <option value="user3">User 3</option>
                        </select>
                        <small>Hold Ctrl/Cmd to select multiple</small>
                      </>
                    ) : (
                      <p className="info-text">Select Project First</p>
                    )}
                  </div>
                </div>

                {/* TASK TITLE */}
                <div className="form-group">
                  <label htmlFor="taskTitle">
                    Task Title <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="taskTitle"
                    name="taskTitle"
                    placeholder="Task Title"
                    value={formData.taskTitle}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* DESCRIPTION */}
                <div className="form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    name="description"
                    placeholder="Description"
                    value={formData.description}
                    onChange={handleChange}
                    rows="4"
                  ></textarea>
                </div>

                {/* START DATE & DUE DATE & PRIORITY & RECURRING */}
                <div className="form-row four-cols">
                  <div className="form-group">
                    <label htmlFor="startDateTime">Start Date</label>
                    <input
                      type="datetime-local"
                      id="startDateTime"
                      name="startDateTime"
                      value={formData.startDateTime}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="dueDateTime">Due Date & Time</label>
                    <input
                      type="datetime-local"
                      id="dueDateTime"
                      name="dueDateTime"
                      value={formData.dueDateTime}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="priority">Priority</label>
                    <select
                      id="priority"
                      name="priority"
                      value={formData.priority}
                      onChange={handleChange}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="recurring">Recurring?</label>
                    <select
                      id="recurring"
                      name="recurring"
                      value={formData.recurring}
                      onChange={handleChange}
                    >
                      <option value="None">None</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                {/* MARK AS RECURRING */}
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      name="markRecurring"
                      checked={formData.markRecurring}
                      onChange={handleChange}
                    />
                    <span>Mark as Recurring Task</span>
                  </label>
                </div>
              </div>
            )}

            {/* UPLOAD FILES TAB */}
            {activeTab === "upload" && (
              <div className="tab-content">
                <div className="upload-area">
                  <input
                    type="file"
                    id="fileInput"
                    multiple
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                  />
                  <label htmlFor="fileInput" className="file-upload-label">
                    <i className="fa-solid fa-cloud-arrow-up"></i>
                    <p>Click to upload or drag and drop</p>
                    <span>PNG, JPG, PDF, DOC up to 10MB</span>
                  </label>
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="uploaded-files">
                    <h4>Uploaded Files:</h4>
                    <ul>
                      {uploadedFiles.map((file, index) => (
                        <li key={index}>
                          <span>{file.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(index)}
                            className="remove-file-btn"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* ADD LINK TAB */}
            {activeTab === "links" && (
              <div className="tab-content">
                <div className="form-group">
                  <label htmlFor="linkInput">Add Reference Link</label>
                  <div className="link-input-group">
                    <input
                      type="url"
                      id="linkInput"
                      placeholder="https://example.com"
                      value={newLink}
                      onChange={(e) => setNewLink(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleAddLink}
                      className="add-link-btn"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {links.length > 0 && (
                  <div className="added-links">
                    <h4>Reference Links:</h4>
                    <ul>
                      {links.map((link, index) => (
                        <li key={index}>
                          <a href={link} target="_blank" rel="noopener noreferrer">
                            {link}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveLink(index)}
                            className="remove-link-btn"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* BUTTONS */}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Create Task
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AddTask;
