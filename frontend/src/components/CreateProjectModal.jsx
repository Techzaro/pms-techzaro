import "./layout/CreateProjectModal.css";

const CreateProjectModal = ({ onClose }) => {
  return (
    <div className="cp-overlay">
      <div className="cp-modal">

        {/* HEADER */}
        <div className="cp-header">
          <div className="cp-header-left">

            <div className="cp-icon-box">
              📁
            </div>

            <div>
              <h2>Create New Project</h2>

              <p>
                Add project details and assign it to team members.
              </p>
            </div>

          </div>

          <button
            className="cp-close-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="cp-body">

          {/* LEFT */}
          <div className="cp-left">

            <div className="cp-field">
              <label>
                Project Name <span>*</span>
              </label>

              <input
                type="text"
                placeholder="Enter project name..."
              />
            </div>

            <div className="cp-field">
              <label>Description</label>

              <textarea
                placeholder="Enter project description..."
              ></textarea>
            </div>

            <div className="cp-grid-2">

              <div className="cp-field">
                <label>Category (Optional)</label>

                <select>
                  <option>Web Development</option>
                  <option>Mobile App</option>
                  <option>UI/UX Design</option>
                </select>
              </div>

              <div className="cp-field">
                <label>Project Goals</label>

                <input
                  type="text"
                  placeholder="Enter project goals"
                />
              </div>

            </div>

            <div className="cp-grid-2">

              <div className="cp-field">
                <label>Team (Optional)</label>

                <select>
                  <option>Select team</option>
                </select>
              </div>

              <div className="cp-field">
                <label>Team Members</label>

                <select>
                  <option>Select user(s)</option>
                </select>

                <small>
                  Hold Ctrl/Cmd to select multiple
                </small>
              </div>

            </div>

          </div>

          {/* RIGHT */}
          <div className="cp-right">

            {/* STATUS */}
            <div className="cp-card">

              <div className="cp-card-top">
                <span>Status</span>
              </div>

              <select>
                <option>To Do</option>
                <option>In Progress</option>
                <option>Done</option>
              </select>

            </div>

            {/* PRIORITY */}
            <div className="cp-card">

              <div className="cp-card-top">
                <span>Priority</span>
              </div>

              <select>
                <option>Medium</option>
                <option>Low</option>
                <option>High</option>
              </select>

            </div>

            {/* DEADLINES */}
            <div className="cp-card">

              <div className="cp-card-top">
                <span>Deadlines</span>
              </div>

              <div className="cp-deadline-grid">

                <select>
                  <option>Add Phase</option>
                </select>

                <input type="date" />

              </div>

              <div className="cp-phase-item">
                <span>🟢 Design Phase</span>
                <span>24 May, 2026</span>
              </div>

            </div>

            {/* ATTACHMENTS */}
            <div className="cp-card">

              <div className="cp-card-top">
                <span>Attachments</span>
              </div>

              <div className="cp-upload-box">
                <p>Drag & drop files here</p>
                <span>or browse</span>
              </div>

              <div className="cp-or">
                OR
              </div>

              <div className="cp-link-box">

                <input
                  type="text"
                  placeholder="Paste link (Drive, Figma, Website, etc.)"
                />

                <button>
                  Add Link
                </button>

              </div>

            </div>

          </div>

        </div>

        {/* FOOTER */}
        <div className="cp-footer">

          <button
            className="cp-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>

          <button className="cp-create-btn">
            + Create Project
          </button>

        </div>

      </div>
    </div>
  );
};

export default CreateProjectModal;