import React, { useState, useEffect } from "react";
import { MdClose, MdDescription, MdPsychology, MdEvent, MdSend, MdNoteAlt, MdSave } from "react-icons/md";

const STAGE_TABS = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];

export default function CandidateProfileModal({
  candidate,
  onClose,
  onUpdateStage,
  onRunAIScreening,
  analyzingId,
  onOpenScheduleInterview,
  onOpenDirectOffer,
  onSaveNotes,
}) {
  const [notesText, setNotesText] = useState(candidate?.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    if (candidate) {
      setNotesText(candidate.notes || "");
    }
  }, [candidate]);

  if (!candidate) return null;

  return (
    <div className="r-modal-overlay" onClick={onClose}>
      <div className="r-modal-panel r-modal-panel--lg" onClick={(e) => e.stopPropagation()}>
        <div className="r-modal-header">
          <h3>Candidate Profile: {candidate.name}</h3>
          <button className="r-icon-btn" onClick={onClose} aria-label="Close modal"><MdClose size={20} /></button>
        </div>

        <div className="r-modal-body">
          <div className="r-cand-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <p><strong>Email:</strong> {candidate.email}</p>
              <p><strong>Phone:</strong> {candidate.phone || 'N/A'}</p>
              <p><strong>CNIC:</strong> {candidate.cnic || 'N/A'}</p>
              <p><strong>Source:</strong> {candidate.source}</p>
            </div>
            <div>
              <p><strong>Stage:</strong> <span className="r-pill r-pill--sky">{candidate.stage}</span></p>
              <p><strong>Applied Date:</strong> {candidate.appliedDate}</p>
              <p>
                <strong>Resume / Document:</strong>{" "}
                {candidate.resumeFile ? (
                  <a href={candidate.resumeUrl || '#'} target="_blank" rel="noreferrer" className="r-file-chip">
                    <MdDescription size={14} /> {candidate.resumeFile}
                  </a>
                ) : (
                  <span>No file uploaded</span>
                )}
              </p>
            </div>
          </div>

          {/* Stage Changer Pipeline */}
          <div className="r-pipeline-section">
            <span className="r-field-label">Move Candidate Stage:</span>
            <div className="r-pipeline-buttons">
              {STAGE_TABS.map((stg) => (
                <button
                  key={stg}
                  className={`r-btn r-btn--xs ${candidate.stage === stg ? 'r-btn--primary' : 'r-btn--ghost'}`}
                  onClick={() => {
                    if (stg === 'Interview') {
                      onOpenScheduleInterview(candidate);
                    } else if (stg === 'Offer') {
                      onOpenDirectOffer(candidate);
                    } else {
                      onUpdateStage(candidate.id, stg);
                    }
                  }}
                >
                  {stg}
                </button>
              ))}
            </div>
          </div>

          {/* HR Candidate Notes & Custom Data Field */}
          <div className="r-hr-notes-box" style={{ marginTop: '16px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <strong style={{ fontSize: '13.5px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MdNoteAlt size={18} color="#0082ff" /> HR Candidate Notes &amp; Related Data
              </strong>
              {onSaveNotes && (
                <button
                  className="r-btn r-btn--xs r-btn--primary"
                  disabled={savingNotes}
                  onClick={async () => {
                    setSavingNotes(true);
                    await onSaveNotes(candidate.id, notesText);
                    setSavingNotes(false);
                  }}
                >
                  <MdSave size={14} /> {savingNotes ? "Saving..." : "Save HR Notes"}
                </button>
              )}
            </div>
            <textarea
              className="r-input"
              style={{ width: '100%', minHeight: '84px', fontSize: '13px', resize: 'vertical', background: '#ffffff' }}
              placeholder="Enter HR notes, interview feedback, salary expectations, notice period, or custom candidate data..."
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
          </div>

          {/* AI CV Screening Report Box */}
          <div className="r-ai-box" style={{ marginTop: '16px' }}>
            <div className="r-ai-box-header">
              <div className="r-ai-title">
                <MdPsychology size={22} className="text-primary" />
                <h4>AI CV Screening &amp; Match Engine</h4>
              </div>
              <button
                className="r-btn r-btn--xs r-btn--primary"
                disabled={analyzingId === candidate.id}
                onClick={() => onRunAIScreening(candidate.id)}
              >
                {analyzingId === candidate.id ? "Analyzing..." : "Re-run AI CV Analysis"}
              </button>
            </div>

            {candidate.aiAnalysis ? (
              <div className="r-ai-report">
                <div className="r-ai-score-row">
                  <div className="r-score-circle">
                    <span>{candidate.aiScore}%</span>
                    <small>Match</small>
                  </div>
                  <div>
                    <strong>{candidate.aiAnalysis.recommendation}</strong>
                    <p>{candidate.aiAnalysis.summary}</p>
                  </div>
                </div>

                <div className="r-skills-grid">
                  <div>
                    <span className="r-skills-label text-success">Verified Matched Skills:</span>
                    <div className="r-tags-row">
                      {candidate.aiAnalysis.matchedSkills?.map((s) => (
                        <span key={s} className="r-tag r-tag--green">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="r-skills-label text-danger">Missing / Recommended Skills:</span>
                    <div className="r-tags-row">
                      {candidate.aiAnalysis.missingSkills?.map((s) => (
                        <span key={s} className="r-tag r-tag--red">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="r-hint-text">No AI Analysis generated yet. Click "Re-run AI CV Analysis" to calculate candidate match score.</p>
            )}
          </div>
        </div>

        <div className="r-modal-footer">
          <button className="r-btn r-btn--ghost" onClick={() => onOpenScheduleInterview(candidate)}>
            <MdEvent size={16} /> Schedule Interview
          </button>
          <button className="r-btn r-btn--primary" onClick={() => onOpenDirectOffer(candidate)}>
            <MdSend size={16} /> Issue Offer Letter
          </button>
          <button className="r-btn r-btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
