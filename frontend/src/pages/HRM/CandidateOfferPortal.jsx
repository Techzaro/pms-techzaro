import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  FileText, CheckCircle2, XCircle, Clock, ShieldCheck,
  Send, MessageSquare, AlertCircle, Calendar, User, MapPin, Building, Printer
} from 'lucide-react';

import API_URL from "../../config/api";
import './Offerletters.css';

const CandidateOfferPortal = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const [signModal, setSignModal] = useState(false);
  const [declineModal, setDeclineModal] = useState(false);
  const [negotiateModal, setNegotiateModal] = useState(false);

  const [signatureName, setSignatureName] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [discussionNotes, setDiscussionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const fetchOffer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/public/offer-letters/${id}?token=${token || ''}`);
      if (!res.ok) throw new Error('Offer letter not found or link expired.');
      const result = await res.json();
      setData(result);
      if (result.offer?.candidateName) {
        setSignatureName(result.offer.candidateName);
      }
    } catch (e) {
      setError(e.message || 'Failed to load offer letter.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOffer();
  }, [id, token]);

  const handleRespond = async (action, payload = {}) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/public/offer-letters/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || 'Action failed.');
      
      setToast({ message: result.message || 'Response submitted successfully!', kind: 'success' });
      setSignModal(false);
      setDeclineModal(false);
      setNegotiateModal(false);
      fetchOffer();
    } catch (e) {
      setToast({ message: e.message || 'Error submitting response', kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="ol-portal-container">
        <div className="ol-loading-state">
          <div className="ol-spinner" />
          <p>Loading your official offer letter...</p>
        </div>
      </div>
    );
  }

  if (error || !data || !data.offer) {
    return (
      <div className="ol-portal-container">
        <div className="ol-error-card">
          <AlertCircle size={48} className="ol-icon-danger" />
          <h2>Unable to Load Offer Letter</h2>
          <p>{error || 'The requested offer letter link is invalid or has expired.'}</p>
        </div>
      </div>
    );
  }

  const { offer, company } = data;
  const isExpired = offer.status === 'Expired';
  const isAccepted = offer.status === 'Accepted';
  const isDeclined = offer.status === 'Declined';
  const isNegotiating = offer.status === 'Negotiating';

  return (
    <div className="ol-portal-wrapper">
      {toast && (
        <div className={`ol-toast ol-toast--${toast.kind}`}>{toast.message}</div>
      )}

      <div className="ol-portal-card">
        {/* Banner Alert for Status */}
        {isExpired && (
          <div className="ol-portal-banner ol-portal-banner--danger">
            <Clock size={20} />
            <div>
              <strong>Offer Letter Expired</strong>
              <p>This employment offer expired on {offer.expiryDate}. Please contact HR at {company.email} for assistance.</p>
            </div>
          </div>
        )}

        {isAccepted && (
          <div className="ol-portal-banner ol-portal-banner--success">
            <ShieldCheck size={20} />
            <div>
              <strong>Offer Digitally Signed &amp; Accepted</strong>
              <p>Signed by {offer.signatureName} on {offer.signedAt ? new Date(offer.signedAt).toLocaleString() : offer.respondedDate} (IP: {offer.signedIp || 'Verified'})</p>
            </div>
          </div>
        )}

        {isDeclined && (
          <div className="ol-portal-banner ol-portal-banner--danger">
            <XCircle size={20} />
            <div>
              <strong>Offer Declined</strong>
              <p>You declined this offer. Reason: {offer.rejectionReason || 'No reason provided'}</p>
            </div>
          </div>
        )}

        {isNegotiating && (
          <div className="ol-portal-banner ol-portal-banner--info">
            <MessageSquare size={20} />
            <div>
              <strong>Discussion Notes Submitted</strong>
              <p>Your notes: "{offer.discussionNotes}" — Our HR team will review and contact you shortly.</p>
            </div>
          </div>
        )}

        {/* Company Header */}
        <div className="ol-document-header">
          <div className="ol-company-brand">
            <img src="/techxaro-logo.png" alt="TechXaro Logo" className="ol-company-logo-img" style={{ height: '42px', width: 'auto', marginBottom: '8px' }} />
            <p><MapPin size={13} /> Lahore, Pakistan</p>
            <p><Send size={13} /> {company.email || 'hr@techxaro.com'} • {company.phone || '+923119121134'}</p>
          </div>
          <div className="ol-document-meta">
            <div className="ol-doc-pill">OFFICIAL OFFER LETTER</div>
            <p>Date: <strong>{offer.issuedDate}</strong></p>
            <p>Ref: <strong>{offer.id}</strong></p>
          </div>
        </div>

        <hr className="ol-divider" />

        {/* Candidate & Position Summary */}
        <div className="ol-candidate-summary">
          <h3>Employment Offer for {offer.candidateName}</h3>
          <p>Dear {offer.candidateName},</p>
          <p>
            We are pleased to extend an offer of employment for the position of <strong>{offer.jobTitle}</strong> in our <strong>{offer.department}</strong> department at {company.name}.
          </p>
        </div>

        {/* Key Offer Details Table */}
        <div className="ol-details-grid">
          <div className="ol-grid-item">
            <span className="ol-grid-label">Job Title</span>
            <span className="ol-grid-value">{offer.jobTitle}</span>
          </div>
          <div className="ol-grid-item">
            <span className="ol-grid-label">Department</span>
            <span className="ol-grid-value">{offer.department}</span>
          </div>
          <div className="ol-grid-item">
            <span className="ol-grid-label">Employment Type</span>
            <span className="ol-grid-value">{offer.employmentType}</span>
          </div>
          <div className="ol-grid-item">
            <span className="ol-grid-label">Base Salary</span>
            <span className="ol-grid-value">PKR {Number(offer.baseSalary).toLocaleString()} / month</span>
          </div>
          {offer.bonus > 0 && (
            <div className="ol-grid-item">
              <span className="ol-grid-label">Annual / Performance Bonus</span>
              <span className="ol-grid-value">PKR {Number(offer.bonus).toLocaleString()}</span>
            </div>
          )}
          <div className="ol-grid-item">
            <span className="ol-grid-label">Start Date</span>
            <span className="ol-grid-value">{offer.startDate}</span>
          </div>
          <div className="ol-grid-item">
            <span className="ol-grid-label">Offer Expiry Date</span>
            <span className="ol-grid-value text-danger">{offer.expiryDate}</span>
          </div>
          {offer.reportingManager && (
            <div className="ol-grid-item">
              <span className="ol-grid-label">Reporting Manager</span>
              <span className="ol-grid-value">{offer.reportingManager}</span>
            </div>
          )}
        </div>

        {/* Benefits Section */}
        {offer.benefits && (
          <div className="ol-clause-box">
            <h4>Benefits &amp; Perks</h4>
            <p>{offer.benefits}</p>
          </div>
        )}

        {/* Custom Terms & Clauses */}
        {offer.customClauses && (
          <div className="ol-clause-box">
            <h4>Terms &amp; Special Conditions</h4>
            <p>{offer.customClauses}</p>
          </div>
        )}

        {/* Signatures Footer */}
        <div className="ol-signatures-row">
          <div className="ol-sig-block">
            <div className="ol-sig-line">{company.signatory}</div>
            <p className="ol-sig-name">{company.signatory}</p>
            <p className="ol-sig-title">{company.signatoryTitle}, {company.name}</p>
          </div>

          <div className="ol-sig-block">
            {isAccepted ? (
              <>
                <div className="ol-sig-line ol-sig-line--accepted">{offer.signatureName}</div>
                <p className="ol-sig-name">{offer.signatureName}</p>
                <p className="ol-sig-title">Digitally Signed (IP: {offer.signedIp || 'Verified'})</p>
              </>
            ) : (
              <>
                <div className="ol-sig-line ol-sig-line--pending">Awaiting Acceptance</div>
                <p className="ol-sig-name">{offer.candidateName}</p>
                <p className="ol-sig-title">Candidate Signature</p>
              </>
            )}
          </div>
        </div>

        {/* Candidate Actions Bar */}
        <div className="ol-portal-actions">
          <button className="ol-btn ol-btn--outline" onClick={() => window.print()}>
            <Printer size={16} /> Print Contract / Copy
          </button>
          {!isAccepted && !isDeclined && !isExpired && (
            <>
              <button className="ol-btn ol-btn--secondary" onClick={() => setNegotiateModal(true)}>
                <MessageSquare size={16} /> Request Discussion / Negotiate
              </button>
              <button className="ol-btn ol-btn--danger" onClick={() => setDeclineModal(true)}>
                <XCircle size={16} /> Decline Offer
              </button>
              <button className="ol-btn ol-btn--primary" onClick={() => setSignModal(true)}>
                <CheckCircle2 size={16} /> Digitally Sign &amp; Accept Offer
              </button>
            </>
          )}
        </div>
      </div>

      {/* Digital Signature Acceptance Modal */}
      {signModal && (
        <div className="ol-modal-overlay">
          <div className="ol-modal-panel ol-modal-panel--md">
            <div className="ol-modal-header">
              <h3>Digitally Sign &amp; Accept Offer Letter</h3>
              <button className="ol-icon-btn" onClick={() => setSignModal(false)}>✕</button>
            </div>
            <div className="ol-modal-body">
              <p className="ol-hint-text">
                By entering your full name below, you confirm your acceptance of this employment offer from {company.name}.
                Your signature, IP address, and timestamp will be logged for record.
              </p>
              <div className="ol-field">
                <span className="ol-field-label">Full Name (Digital Signature)</span>
                <input
                  type="text"
                  className="ol-input"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="e.g. Jane Cooper"
                  required
                />
              </div>
              <div className="ol-form-actions">
                <button className="ol-btn ol-btn--ghost" onClick={() => setSignModal(false)}>Cancel</button>
                <button
                  className="ol-btn ol-btn--primary"
                  disabled={!signatureName.trim() || submitting}
                  onClick={() => handleRespond('accept', { signatureName })}
                >
                  {submitting ? 'Signing…' : 'Confirm & Digitally Sign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decline Offer Modal */}
      {declineModal && (
        <div className="ol-modal-overlay">
          <div className="ol-modal-panel ol-modal-panel--md">
            <div className="ol-modal-header">
              <h3>Decline Offer Letter</h3>
              <button className="ol-icon-btn" onClick={() => setDeclineModal(false)}>✕</button>
            </div>
            <div className="ol-modal-body">
              <p className="ol-hint-text">
                Please provide a brief reason for declining this offer (optional):
              </p>
              <div className="ol-field">
                <span className="ol-field-label">Reason for Declining</span>
                <textarea
                  className="ol-textarea"
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Accepted another position, salary expectation difference..."
                />
              </div>
              <div className="ol-form-actions">
                <button className="ol-btn ol-btn--ghost" onClick={() => setDeclineModal(false)}>Cancel</button>
                <button
                  className="ol-btn ol-btn--danger"
                  disabled={submitting}
                  onClick={() => handleRespond('decline', { rejectionReason })}
                >
                  {submitting ? 'Submitting…' : 'Decline Offer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Negotiate Modal */}
      {negotiateModal && (
        <div className="ol-modal-overlay">
          <div className="ol-modal-panel ol-modal-panel--md">
            <div className="ol-modal-header">
              <h3>Request Discussion / Negotiate Terms</h3>
              <button className="ol-icon-btn" onClick={() => setNegotiateModal(false)}>✕</button>
            </div>
            <div className="ol-modal-body">
              <p className="ol-hint-text">
                Type your questions or proposed adjustments for HR:
              </p>
              <div className="ol-field">
                <span className="ol-field-label">Discussion Comments</span>
                <textarea
                  className="ol-textarea"
                  rows={4}
                  value={discussionNotes}
                  onChange={(e) => setDiscussionNotes(e.target.value)}
                  placeholder="e.g. Can we discuss start date flexibility or bonus structure?"
                  required
                />
              </div>
              <div className="ol-form-actions">
                <button className="ol-btn ol-btn--ghost" onClick={() => setNegotiateModal(false)}>Cancel</button>
                <button
                  className="ol-btn ol-btn--primary"
                  disabled={!discussionNotes.trim() || submitting}
                  onClick={() => handleRespond('negotiate', { discussionNotes })}
                >
                  {submitting ? 'Sending…' : 'Send Discussion Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateOfferPortal;
