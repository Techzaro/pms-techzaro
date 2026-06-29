/**
 * SubmissionLinkSection.jsx
 * Reusable component for managing a list of URLs during submission forms.
 * Supports adding links via text input, removing them, and automatic URL normalization.
 * Used in SubmitDeliverableModal, SubmitProjectModal, and SubmitTaskModal.
 */

import { useState } from "react";

/**
 * Link management section with add/remove functionality.
 * @param {Function} onLinksChange - Callback with the updated array of link objects.
 */
function SubmissionLinkSection({ onLinksChange }) {
  const [links, setLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");

  /**
   * Normalizes a URL by trimming whitespace and prepending https:// if missing.
   * @param {string} url - The raw URL string.
   * @returns {string} The normalized URL.
   */
  const normalizeUrl = (url) => {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return url;
  };

  /** Adds a new link after validation and normalization */
  const handleAddLink = () => {
    if (!linkInput.trim()) return;
    const url = normalizeUrl(linkInput);
    if (links.some((l) => l.url === url)) return;
    const updated = [...links, { url, name: url }];
    setLinks(updated);
    setLinkInput("");
    onLinksChange?.(updated);
  };

  /** Removes a link at the given index and notifies parent */
  const handleRemoveLink = (index) => {
    const updated = links.filter((_, i) => i !== index);
    setLinks(updated);
    onLinksChange?.(updated);
  };

  // Submit link on Enter key press
  const handleLinkKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddLink();
    }
  };

  return (
    <div className="sd-field">
      <label className="sd-label">Links ({links.length})</label>
      <div className="task-link-input-row">
        <input
          type="text"
          placeholder="Paste link (Drive, Figma, GitHub, etc.)"
          value={linkInput}
          onChange={(e) => setLinkInput(e.target.value)}
          onKeyDown={handleLinkKeyDown}
        />
        <button
          type="button"
          className="task-link-add-btn"
          onClick={handleAddLink}
          disabled={!linkInput.trim()}
        >
          Add Link
        </button>
      </div>
      {links.length > 0 && (
        <div className="task-attachments-list">
          {links.map((link, index) => (
            <div key={index} className="task-attachment-item">
              <span className="task-attachment-icon">🔗</span>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="task-attachment-name task-attachment-link"
              >
                {link.url.length > 45 ? link.url.substring(0, 45) + "..." : link.url}
              </a>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="task-attachment-open"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
              <button
                type="button"
                className="task-attachment-remove"
                onClick={() => handleRemoveLink(index)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SubmissionLinkSection;
