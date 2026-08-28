import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAutoCapturedMetadata } from "../utils/feedbackAutoCapture";
import { authToken } from "../utils/auth";
import API_URL from "../config/api";
import {
  MdOutlineFeedback,
  MdClose,
  MdCloudUpload,
  MdCheckCircle,
  MdStar,
  MdStarBorder,
} from "react-icons/md";
import RichTextEditor from "./RichTextEditor";
import "./FeedbackModal.css";

const FEEDBACK_TYPES = [
  "Bug Report",
  "Feature Request",
  "General Suggestion",
  "Feature Rating",
  "General Feedback",
];

const MODULE_OPTIONS = [
  "General",
  "Tasks",
  "Projects",
  "Deliverables",
  "Reports",
  "Chat",
  "Users",
  "Settings",
];

export default function FeedbackModal({ isOpen, onClose }) {
  const { t } = useTranslation();
  const location = useLocation();

  const [feedbackType, setFeedbackType] = useState("Bug Report");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [moduleName, setModuleName] = useState("General");
  const [priority, setPriority] = useState("Medium");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  const [screenshot, setScreenshot] = useState(null);
  const [recording, setRecording] = useState(null);
  const [attachment, setAttachment] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmationData, setConfirmationData] = useState(null);

  const ratingLabels = {
    1: t("1 Star - Very Poor", { defaultValue: "1 Star - Very Poor" }),
    2: t("2 Stars - Poor / Needs Work", { defaultValue: "2 Stars - Poor / Needs Work" }),
    3: t("3 Stars - Average", { defaultValue: "3 Stars - Average" }),
    4: t("4 Stars - Good / Satisfactory", { defaultValue: "4 Stars - Good / Satisfactory" }),
    5: t("5 Stars - Excellent / Amazing", { defaultValue: "5 Stars - Excellent / Amazing" }),
  };

  // Auto-detect module from URL path and reset state when opening
  useEffect(() => {
    if (isOpen) {
      const path = location.pathname.toLowerCase();
      if (path.includes("task")) setModuleName("Tasks");
      else if (path.includes("project")) setModuleName("Projects");
      else if (path.includes("deliver")) setModuleName("Deliverables");
      else if (path.includes("report")) setModuleName("Reports");
      else if (path.includes("chat")) setModuleName("Chat");
      else if (path.includes("user")) setModuleName("Users");
      else if (path.includes("setting")) setModuleName("Settings");
      else setModuleName("General");

      // Reset form state
      setSubject("");
      setDescription("");
      setFeedbackType("Bug Report");
      setPriority("Medium");
      setRating(0);
      setHoverRating(0);
      setScreenshot(null);
      setRecording(null);
      setAttachment(null);
      setErrorMsg("");
      setConfirmationData(null);
    }
  }, [isOpen, location.pathname]);

  if (!isOpen) return null;

  const autoCaptured = getAutoCapturedMetadata(location.pathname);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const isDescriptionEmpty = !description || description.replace(/<[^>]*>/g, "").trim() === "";
    if (!subject.trim() || isDescriptionEmpty) {
      setErrorMsg(t("Subject and Detailed Description are required.", { defaultValue: "Subject and Detailed Description are required." }));
      return;
    }

    if (feedbackType === "Feature Rating" && rating === 0) {
      setErrorMsg(t("Please select a star rating (1 to 5) for your feature rating.", { defaultValue: "Please select a star rating (1 to 5) for your feature rating." }));
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const formData = new FormData();
      formData.append("feedback_type", feedbackType);
      formData.append("subject", subject.trim());
      formData.append("description", description);
      formData.append("module", moduleName);
      formData.append("priority", priority);

      if (feedbackType === "Feature Rating" && rating > 0) {
        formData.append("rating", rating);
      }

      // Metadata
      formData.append("page_url", autoCaptured.page_url);
      formData.append("current_page", autoCaptured.current_page);
      formData.append("browser", autoCaptured.browser);
      formData.append("operating_system", autoCaptured.operating_system);
      formData.append("device_type", autoCaptured.device_type);
      formData.append("screen_resolution", autoCaptured.screen_resolution);
      formData.append("viewport_size", autoCaptured.viewport_size);

      if (autoCaptured.organization_id) {
        formData.append("organization_id", autoCaptured.organization_id);
      }
      if (autoCaptured.organization_name) {
        formData.append("organization_name", autoCaptured.organization_name);
      }

      if (screenshot) formData.append("screenshot", screenshot);
      if (recording) formData.append("recording", recording);
      if (attachment) formData.append("attachment", attachment);

      const token = authToken();
      const res = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || t("Failed to submit feedback.", { defaultValue: "Failed to submit feedback." }));
      }

      // Show confirmation modal view
      setConfirmationData(json.data);
    } catch (err) {
      setErrorMsg(err.message || t("Something went wrong. Please try again.", { defaultValue: "Something went wrong. Please try again." }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fb-modal-overlay" onClick={onClose}>
      <div className="fb-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="fb-modal-header">
          <h3>
            <MdOutlineFeedback color="#2563eb" size={22} />
            {t("User Feedback & Product Improvement", { defaultValue: "User Feedback & Product Improvement" })}
          </h3>
          <button className="fb-modal-close" onClick={onClose}>
            <MdClose />
          </button>
        </div>

        {/* Confirmation Screen */}
        {confirmationData ? (
          <div className="fb-modal-body">
            <div className="fb-confirm-box">
              <div className="fb-confirm-icon">
                <MdCheckCircle />
              </div>
              <h3 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>
                {t("Thank You for Your Feedback!", { defaultValue: "Thank You for Your Feedback!" })}
              </h3>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                {t("Your submission has been logged and routed to the Product Improvement Team.", { defaultValue: "Your submission has been logged and routed to the Product Improvement Team." })}
              </p>

              <div className="fb-confirm-ref">
                {confirmationData.reference_number}
              </div>

              <div className="fb-confirm-meta">
                <div className="fb-confirm-meta-item">
                  <span>{t("Submission Date", { defaultValue: "Submission Date" })}</span>
                  <strong>
                    {new Date(confirmationData.submitted_at).toLocaleString()}
                  </strong>
                </div>
                <div className="fb-confirm-meta-item">
                  <span>{t("Feedback Type", { defaultValue: "Feedback Type" })}</span>
                  <strong>{t(confirmationData.feedback_type)}</strong>
                </div>
                <div className="fb-confirm-meta-item">
                  <span>{t("Status")}</span>
                  <strong style={{ color: "#2563eb" }}>
                    {t(confirmationData.status)}
                  </strong>
                </div>
                <div className="fb-confirm-meta-item">
                  <span>{t("Module", { defaultValue: "Module" })}</span>
                  <strong>{t(moduleName)}</strong>
                </div>
              </div>
            </div>

            <div className="fb-modal-footer">
              <button className="fb-btn-submit" onClick={onClose}>
                {t("Done", { defaultValue: "Done" })}
              </button>
            </div>
          </div>
        ) : (
          /* Form Screen wrapped in flex column container */
          <form className="fb-modal-form-wrap" onSubmit={handleSubmit}>
            <div className="fb-modal-body">
              {errorMsg && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#991b1b",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: "0.85rem",
                    marginBottom: 16,
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Auto-Captured Info Banner */}
              <div className="fb-auto-badge">
                <span>💻 <strong>{t("OS", { defaultValue: "OS" })}:</strong> {autoCaptured.operating_system}</span>
                <span>🌐 <strong>{t("Browser", { defaultValue: "Browser" })}:</strong> {autoCaptured.browser}</span>
                <span>📍 <strong>{t("Page", { defaultValue: "Page" })}:</strong> {autoCaptured.current_page}</span>
              </div>

              {/* Grid: Type & Module */}
              <div className="fb-form-grid">
                <div className="fb-form-group">
                  <label>{t("Feedback Type *", { defaultValue: "Feedback Type *" })}</label>
                  <select
                    className="fb-form-select"
                    value={feedbackType}
                    onChange={(e) => {
                      setFeedbackType(e.target.value);
                      setErrorMsg("");
                    }}
                  >
                    {FEEDBACK_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(type)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="fb-form-group">
                  <label>{t("Module / Area", { defaultValue: "Module / Area" })}</label>
                  <select
                    className="fb-form-select"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                  >
                    {MODULE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {t(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5-Star Interactive Rating UI (Conditional for Feature Rating) */}
              {feedbackType === "Feature Rating" && (
                <div className="fb-rating-block">
                  <div className="fb-rating-label">
                    {t("Rate Your Experience with this Feature *", { defaultValue: "Rate Your Experience with this Feature *" })}
                  </div>
                  <div className="fb-rating-stars">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = star <= (hoverRating || rating);
                      return (
                        <button
                          key={star}
                          type="button"
                          className={`fb-star-btn ${isFilled ? "active" : ""}`}
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          title={`${star} Star${star > 1 ? "s" : ""}`}
                        >
                          {isFilled ? <MdStar /> : <MdStarBorder />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="fb-rating-text">
                    {ratingLabels[hoverRating || rating] || t("Click stars to select rating (1 - 5)", { defaultValue: "Click stars to select rating (1 - 5)" })}
                  </div>
                </div>
              )}

              {/* Subject */}
              <div className="fb-form-group full-width">
                <label>{t("Subject *", { defaultValue: "Subject *" })}</label>
                <input
                  type="text"
                  className="fb-form-input"
                  placeholder={t("Brief summary of your feedback or feature rating...", { defaultValue: "Brief summary of your feedback or feature rating..." })}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div className="fb-form-group full-width">
                <label>{t("Detailed Description *", { defaultValue: "Detailed Description *" })}</label>
                <RichTextEditor
                  value={description}
                  onChange={(content) => setDescription(content)}
                  placeholder={t("Describe your feedback, feature rating justification, or steps to reproduce in detail...", { defaultValue: "Describe your feedback, feature rating justification, or steps to reproduce in detail..." })}
                />
              </div>

              {/* Priority Selector */}
              <div className="fb-form-group full-width">
                <label>{t("Priority (Optional)", { defaultValue: "Priority (Optional)" })}</label>
                <select
                  className="fb-form-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="Low">{t("Low - Cosmetic or minor suggestion", { defaultValue: "Low - Cosmetic or minor suggestion" })}</option>
                  <option value="Medium">{t("Medium - General improvement or feature request", { defaultValue: "Medium - General improvement or feature request" })}</option>
                  <option value="High">{t("High - Significant feature gap or workflow issue", { defaultValue: "High - Significant feature gap or workflow issue" })}</option>
                  <option value="Urgent">{t("Urgent - Blocking bug or critical failure", { defaultValue: "Urgent - Blocking bug or critical failure" })}</option>
                </select>
              </div>

              {/* Attachments Section with EXPLICIT File Inputs */}
              <div className="fb-form-group full-width">
                <label>{t("Attachments (Optional)", { defaultValue: "Attachments (Optional)" })}</label>
                <div className="fb-file-inputs">
                  {/* 1. Screenshot File Input */}
                  <label className="fb-file-box">
                    <MdCloudUpload size={24} color="#3b82f6" />
                    <div className="fb-file-box-title">{t("Upload Screenshot", { defaultValue: "Upload Screenshot" })}</div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>PNG, JPG, WEBP</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setScreenshot(e.target.files[0] || null)}
                    />
                    {screenshot && (
                      <div className="fb-file-selected">✓ {screenshot.name}</div>
                    )}
                  </label>

                  {/* 2. Screen Recording File Input */}
                  <label className="fb-file-box">
                    <MdCloudUpload size={24} color="#8b5cf6" />
                    <div className="fb-file-box-title">{t("Screen Recording", { defaultValue: "Screen Recording" })}</div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>MP4, WEBM, MOV</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => setRecording(e.target.files[0] || null)}
                    />
                    {recording && (
                      <div className="fb-file-selected">✓ {recording.name}</div>
                    )}
                  </label>

                  {/* 3. Document / General File Input */}
                  <label className="fb-file-box">
                    <MdCloudUpload size={24} color="#10b981" />
                    <div className="fb-file-box-title">{t("File Attachment", { defaultValue: "File Attachment" })}</div>
                    <span style={{ fontSize: "0.72rem", color: "#64748b" }}>PDF, DOCX, ZIP</span>
                    <input
                      type="file"
                      onChange={(e) => setAttachment(e.target.files[0] || null)}
                    />
                    {attachment && (
                      <div className="fb-file-selected">✓ {attachment.name}</div>
                    )}
                  </label>
                </div>
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div className="fb-modal-footer">
              <button
                type="button"
                className="fb-btn-cancel"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t("Cancel")}
              </button>
              <button
                type="submit"
                className="fb-btn-submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? t("Submitting...", { defaultValue: "Submitting..." }) : t("Submit Feedback", { defaultValue: "Submit Feedback" })}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
