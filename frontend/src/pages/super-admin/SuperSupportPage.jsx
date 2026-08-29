import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Building2, Circle, Clock, CheckCircle, X, Loader2, Send, ArrowLeft, FileText, Star, ExternalLink, LayoutGrid, List } from 'lucide-react';
import { MdPerson, MdTimeline } from 'react-icons/md';
import { api } from './api/superAdminApi';
import DOMPurify from 'dompurify';
import '../../components/FeedbackModal.css';
import '../FeedbackCenter.css';

function parseMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/---/g, '<hr style="border:none;border-top:1px solid var(--border-light);margin:12px 0;" />');
}

function cleanSubject(subject) {
  if (!subject) return '';
  return subject.replace(/^\[Feedback\]\s*/i, '');
}

const STATUS_OPTIONS = [
  'New', 'Under Review', 'Accepted', 'Planned', 'In Development', 'Testing', 'Resolved', 'Closed', 'Rejected',
];

const STATUS_TO_FILTER = {
  'New': 'open', 'Under Review': 'under_review', 'Accepted': 'accepted',
  'Planned': 'planned', 'In Development': 'in_development', 'Testing': 'testing',
  'Resolved': 'resolved', 'Closed': 'closed', 'Rejected': 'rejected',
};

const PRIORITY_MAP = {
  low: { labelKey: 'Low', defaultLabel: 'Low', color: 'var(--text-muted)', bg: 'var(--bg-hover)' },
  medium: { labelKey: 'Medium', defaultLabel: 'Medium', color: 'var(--color-blue)', bg: 'rgba(59,130,246,0.1)' },
  high: { labelKey: 'High', defaultLabel: 'High', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
  urgent: { labelKey: 'Urgent', defaultLabel: 'Urgent', color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.1)' },
};

const STATUS_MAP = {
open: { labelKey: 'Open', defaultLabel: 'Open', color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)', icon: Circle },
  under_review: { labelKey: 'Under Review', defaultLabel: 'Under Review', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', icon: Clock },
  accepted: { labelKey: 'Accepted', defaultLabel: 'Accepted', color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)', icon: CheckCircle },
  planned: { labelKey: 'Planned', defaultLabel: 'Planned', color: 'var(--color-blue)', bg: 'rgba(59,130,246,0.1)', icon: Clock },
  in_development: { labelKey: 'In Development', defaultLabel: 'In Development', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: Clock },
  testing: { labelKey: 'Testing', defaultLabel: 'Testing', color: '#6366f1', bg: 'rgba(99,102,241,0.1)', icon: Clock },
  resolved: { labelKey: 'Resolved', defaultLabel: 'Resolved', color: 'var(--color-blue)', bg: 'rgba(59,130,246,0.1)', icon: CheckCircle },
  closed: { labelKey: 'Closed', defaultLabel: 'Closed', color: 'var(--text-muted)', bg: 'var(--bg-hover)', icon: X },
  rejected: { labelKey: 'Rejected', defaultLabel: 'Rejected', color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.1)', icon: X },
};

export default function SuperSupportPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState(() => searchParams.get('org'));
  const [tickets, setTickets] = useState([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [viewMode, setViewMode] = useState('cards');
  const [orgCounts, setOrgCounts] = useState({});
  const [confirmStatus, setConfirmStatus] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const chatEndRef = useRef(null);

  const ticketIdFromUrl = searchParams.get('ticket');

  const updateUrl = useCallback((orgId, ticketId) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      if (orgId) params.set('org', orgId); else params.delete('org');
      if (ticketId) params.set('ticket', ticketId); else params.delete('ticket');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    const el = chatEndRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticketMessages]);
  const [globalCounts, setGlobalCounts] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getOrganizations();
        setOrgs(res.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    fetchFeedbackTickets();
  }, [selectedOrgId, filterStatus, search, typeFilter, priorityFilter, dateStart, dateEnd]);

  useEffect(() => {
    if (ticketIdFromUrl && tickets.length > 0 && !selectedTicket) {
      const match = tickets.find(t => String(t.id) === String(ticketIdFromUrl));
      if (match) handleOpenTicket(match);
    }
  }, [ticketIdFromUrl, tickets]);

  async function fetchFeedbackTickets() {
    setTicketLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = STATUS_TO_FILTER[filterStatus] || filterStatus;
      if (selectedOrgId) params.organization_id = selectedOrgId;
      if (search) params.search = search;
      if (typeFilter) params.feedback_type = typeFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (dateStart) params.date_start = dateStart;
      if (dateEnd) params.date_end = dateEnd;
      const res = await api.getFeedbackTickets(params);
      setTickets(res.data || []);
      setGlobalCounts(res.counts || {});
      if (res.org_counts) setOrgCounts(res.org_counts);
    } catch (e) {
      console.error(e);
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleOpenTicket(ticket) {
    setSelectedTicket(ticket);
    setDetailLoading(true);
    const orgId = selectedOrgId || ticket.organization_id || ticket.organization?.id;
    if (orgId && !selectedOrgId) setSelectedOrgId(String(orgId));
    updateUrl(orgId, ticket.id);
    try {
      const res = await api.getFeedbackTicketDetail(ticket.id);
      setTicketMessages(res.messages || []);
      setSelectedTicket(res.ticket || ticket);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedTicket) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getFeedbackTicketDetail(selectedTicket.id);
        setTicketMessages(res.messages || []);
        setSelectedTicket(prev => ({ ...prev, ...(res.ticket || {}) }));
      } catch (e) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  async function handleReply() {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      await api.replyFeedbackTicket(selectedTicket.id, replyText);
      setReplyText('');
      handleOpenTicket(selectedTicket);
      fetchFeedbackTickets();
    } catch (e) {
      console.error(e);
    } finally {
      setSendingReply(false);
    }
  }

  async function handleCloseTicket() {
    if (!selectedTicket) return;
    setConfirmClose(true);
  }

  async function confirmCloseTicket() {
    if (!selectedTicket) return;
    setConfirmClose(false);
    try {
      await api.closeFeedbackTicket(selectedTicket.id);
      handleOpenTicket(selectedTicket);
      fetchFeedbackTickets();
    } catch (e) {
      console.error(e);
    }
  }

  async function handleStatusChange(newStatus) {
    if (!selectedTicket || newStatus === selectedTicket.status) return;
    setConfirmStatus(newStatus);
  }

  async function confirmStatusChange() {
    if (!selectedTicket || !confirmStatus) return;
    const newStatus = confirmStatus;
    setConfirmStatus(null);
    try {
      await api.updateFeedbackTicketStatus(selectedTicket.id, newStatus);
      handleOpenTicket(selectedTicket);
      fetchFeedbackTickets();
    } catch (e) {
      console.error(e);
    }
  }

  function getOrgFeedbackCounts(orgId) {
    return orgCounts[orgId] || { open: 0, under_review: 0, accepted: 0, planned: 0, in_development: 0, testing: 0, resolved: 0, closed: 0, rejected: 0, total: 0 };
  }

  const selectedOrg = selectedOrgId ? orgs.find(o => o.id === selectedOrgId) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('Loading support data...', { defaultValue: 'Loading support data...' })}</span>
      </div>
    );
  }

  // Feedback Ticket Detail View
  if (selectedTicket) {
    const metadata = selectedTicket.feedback_metadata || {};
    const statusLogs = (ticketMessages || []).filter((msg) => {
      const d = (msg.message || "").toLowerCase();
      return d.includes("status changed") || d.includes("status set");
    });

    return (
<div className="fbc-page">
        <div className="fbc-detail-page">
          <div className="fbc-detail-page-header">
            <button onClick={() => { setSelectedTicket(null); setTicketMessages([]); updateUrl(selectedOrgId, null); }} className="fb-btn-cancel">
              <ArrowLeft size={18} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
              <h3 style={{ margin: 0, color: "#0f172a", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: "1rem", fontWeight: 700 }}>{t('Feedback', { defaultValue: 'Feedback' })}</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#64748b", marginLeft: 8 }}>{selectedTicket.feedback_reference_number || selectedTicket.ticket_number}</span>
              </h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <select
                value={selectedTicket.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  border: "1px solid var(--border-light)",
                  cursor: "pointer",
                  outline: "none",
                  background: STATUS_MAP[selectedTicket.status]?.bg || '#f1f5f9',
                  color: STATUS_MAP[selectedTicket.status]?.color || '#475569',
                }}
              >
                <option value="open">{t('Open', { defaultValue: 'Open' })}</option>
                <option value="under_review">{t('Under Review', { defaultValue: 'Under Review' })}</option>
                <option value="accepted">{t('Accepted', { defaultValue: 'Accepted' })}</option>
                <option value="planned">{t('Planned', { defaultValue: 'Planned' })}</option>
                <option value="in_development">{t('In Development', { defaultValue: 'In Development' })}</option>
                <option value="testing">{t('Testing', { defaultValue: 'Testing' })}</option>
                <option value="resolved">{t('Resolved', { defaultValue: 'Resolved' })}</option>
                <option value="closed">{t('Closed', { defaultValue: 'Closed' })}</option>
                <option value="rejected">{t('Rejected', { defaultValue: 'Rejected' })}</option>
              </select>
              {selectedTicket.status !== 'closed' && (
                <button
                  onClick={handleCloseTicket}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    border: "none",
                    background: "#3b82f6",
                    color: "#fff",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t('Close Ticket', { defaultValue: 'Close Ticket' })}
                </button>
              )}
            </div>
          </div>

          <div className="fbc-detail-two-col">
            {/* LEFT — Main Content */}
            <div className="fbc-detail-left">
              {metadata.rating && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "#fffbe6", border: "1px solid #ffe58f", padding: "10px 14px", borderRadius: 8 }}>
                  <strong style={{ color: "#873800", fontSize: "0.88rem" }}>{t('Feature Rating:', { defaultValue: 'Feature Rating:' })}</strong>
                  <div style={{ color: "#faad14", fontSize: "1.2rem", display: "flex", gap: 2 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <span key={s} style={{ color: s <= metadata.rating ? "#faad14" : "#d9d9d9" }}>★</span>
                    ))}
                  </div>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d48806", marginLeft: 4 }}>
                    ({metadata.rating} / 5 {t('Stars', { defaultValue: 'Stars' })})
                  </span>
                </div>
              )}

              <h4 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>
                {cleanSubject(selectedTicket.subject)}
              </h4>
              <div className="fbc-section-title" style={{ marginTop: 0 }}>{t('Description', { defaultValue: 'Description' })}</div>
              <div
                className="rte-display"
                style={{ background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0", margin: "0 0 16px 0" }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedTicket.description || "") }}
              />

              <div className="fbc-section-title">
                <MdPerson /> {t('Auto-Captured System Information', { defaultValue: 'Auto-Captured System Information' })}
              </div>
              <div className="fbc-auto-info-grid">
                <div className="fbc-info-cell">
                  <span>{t('Submitted By', { defaultValue: 'Submitted By' })}</span>
                  <strong>{metadata.user_name || selectedTicket.user?.name} ({metadata.user_role})</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Organization', { defaultValue: 'Organization' })}</span>
                  <strong>{selectedTicket.organization?.name}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Module', { defaultValue: 'Module' })}</span>
                  <strong>{metadata.module || "General"}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Current Page Route', { defaultValue: 'Current Page Route' })}</span>
                  <strong>{metadata.current_page}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Operating System', { defaultValue: 'Operating System' })}</span>
                  <strong>{metadata.operating_system}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Browser', { defaultValue: 'Browser' })}</span>
                  <strong>{metadata.browser}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('Device Type', { defaultValue: 'Device Type' })}</span>
                  <strong>{metadata.device_type}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('IP Address', { defaultValue: 'IP Address' })}</span>
                  <strong>{metadata.ip_address || "Captured"}</strong>
                </div>
                <div className="fbc-info-cell">
                  <span>{t('App Version', { defaultValue: 'App Version' })}</span>
                  <strong>{metadata.app_version}</strong>
                </div>
              </div>

              {(metadata.screenshot_path || metadata.recording_path || metadata.attachment_path) && (
                <>
                  <div className="fbc-section-title">
                    <FileText size={16} /> {t('Downloadable Media Attachments', { defaultValue: 'Downloadable Media Attachments' })}
                  </div>
                  <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                    {metadata.screenshot_path && (
                      <a href={metadata.screenshot_url || `/storage/${metadata.screenshot_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                        {t('View Screenshot', { defaultValue: 'View Screenshot' })}
                      </a>
                    )}
                    {metadata.recording_path && (
                      <a href={metadata.recording_url || `/storage/${metadata.recording_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                        {t('View Recording', { defaultValue: 'View Recording' })}
                      </a>
                    )}
                    {metadata.attachment_path && (
                      <a href={metadata.attachment_url || `/storage/${metadata.attachment_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                        {t('View Attachment', { defaultValue: 'View Attachment' })}
                      </a>
                    )}
                  </div>
                </>
              )}

              {/* Chat Conversation */}
              <div className="fbc-section-title">{t('Conversation', { defaultValue: 'Conversation' })}</div>
              <div className="fbc-chat-container">
                <div className="fbc-chat-messages">
                  {detailLoading ? (
                    <div style={{ textAlign: "center", padding: 16, color: "#64748b", fontSize: "0.82rem" }}>{t('Loading messages...', { defaultValue: 'Loading messages...' })}</div>
                  ) : ticketMessages.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 16, color: "#64748b", fontSize: "0.82rem" }}>{t('No messages yet. Start a conversation below.', { defaultValue: 'No messages yet. Start a conversation below.' })}</div>
                  ) : (
                    ticketMessages.map((msg) => {
                      const d = (msg.message || "").toLowerCase();
                      if (d.includes("status changed") || d.includes("status set")) return null;
                      const isMine = msg.sender_type === "support";
                      return (
                        <div key={msg.id} className={`fbc-chat-bubble ${isMine ? "fbc-chat-mine" : "fbc-chat-theirs"}`}>
                          <div className="fbc-chat-bubble-text">{msg.message}</div>
                          <div className="fbc-chat-bubble-meta">
                            {isMine ? (msg.user?.name || t('Support', { defaultValue: 'Support' })) : (msg.user?.name || t('User', { defaultValue: 'User' }))} · {new Date(msg.created_at).toLocaleString()}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {selectedTicket.status !== 'closed' && (
                  <form className="fbc-chat-input" onSubmit={(e) => { e.preventDefault(); handleReply(); }}>
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={t('Reply to user...', { defaultValue: 'Reply to user...' })}
                      disabled={sendingReply}
                    />
                    <button type="submit" disabled={!replyText.trim() || sendingReply} className="fb-btn-submit">
                      <Send size={16} />
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* RIGHT — Status Timeline */}
            <div className="fbc-detail-right">
              <div className="fbc-sidebar-card">
                <div className="fbc-sidebar-card-header">
                  <Clock size={16} /> {t('Status Timeline', { defaultValue: 'Status Timeline' })}
                </div>
                <ul className="fbc-timeline">
                  {statusLogs.length > 0 ? (
                    statusLogs.map((log, idx) => (
                      <li key={idx} className="fbc-timeline-item">
                        <div className="fbc-timeline-dot" />
                        <div className="fbc-timeline-content">
                          <span style={{ fontSize: "0.82rem", color: "#334155" }}>{log.message}</span>
                          <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                            {log.user?.name || t('System', { defaultValue: 'System' })}
                          </div>
                          <span className="fbc-timeline-time">
                            {new Date(log.created_at).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))
                  ) : (
                    <div style={{ fontSize: "0.82rem", color: "#64748b", padding: "8px 0" }}>{t('No status changes recorded yet.', { defaultValue: 'No status changes recorded yet.' })}</div>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Status Change Confirmation Modal */}
        {confirmStatus && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}>
            <div style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px", minWidth: 380,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
                background: STATUS_MAP[confirmStatus]?.bg || '#f1f5f9',
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
<Loader2 size={24} className="animate-spin" style={{ color: STATUS_MAP[confirmStatus]?.color || '#475569' }} />
              </div>
              <h4 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "1rem" }}>Confirm Status Change</h4>
              <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.5 }}>
                Are you sure you want to change status to<br />
                <strong style={{ color: STATUS_MAP[confirmStatus]?.color || '#0f172a' }}>
                  {STATUS_MAP[confirmStatus]?.label || confirmStatus}
                </strong>?
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setConfirmStatus(null)}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
                    border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStatusChange}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
                    border: "none", background: STATUS_MAP[confirmStatus]?.color || 'var(--color-primary)',
                    color: "#fff", cursor: "pointer",
                  }}
                >
                  Yes, Change
                </button>
              </div>
            </div>
          </div>
        )}

{/* Close Ticket Confirmation Modal */}
        {confirmClose && (
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 9999,
          }}>
            <div style={{
              background: "#fff", borderRadius: 12, padding: "28px 32px", minWidth: 380,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)", textAlign: "center",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
                background: "rgba(59,130,246,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <X size={24} style={{ color: "#3b82f6" }} />
              </div>
              <h4 style={{ margin: "0 0 8px", color: "#0f172a", fontSize: "1rem" }}>
                {t('Close Ticket', { defaultValue: 'Close Ticket' })}
              </h4>
              <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.5 }}>
                {t('Are you sure you want to close this feedback ticket?', { defaultValue: 'Are you sure you want to close this feedback ticket?' })}<br />
                <strong style={{ color: "#3b82f6" }}>
                  {selectedTicket?.feedback_reference_number || selectedTicket?.ticket_number}
                </strong>?
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setConfirmClose(false)}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
                    border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer",
                  }}
                >
                  {t('Cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                  onClick={confirmCloseTicket}
                  style={{
                    padding: "8px 20px", borderRadius: 8, fontSize: "0.85rem", fontWeight: 600,
                    border: "none", background: "#3b82f6",
                    color: "#fff", cursor: "pointer",
                  }}
                >
                  {t('Yes, Close', { defaultValue: 'Yes, Close' })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main View
  return (
    <div className="space-y-6">
      {/* Header with Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>Support Center</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Manage feedback tickets across all organizations</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
          <button
            onClick={() => { setViewMode('cards'); setSelectedOrgId(null); setSelectedTicket(null); updateUrl(null, null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: viewMode === 'cards' ? 'var(--color-primary)' : 'transparent',
              color: viewMode === 'cards' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <LayoutGrid size={14} /> Cards
          </button>
          <button
            onClick={() => { setViewMode('list'); setSelectedOrgId(null); setSelectedTicket(null); updateUrl(null, null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
            style={{
              background: viewMode === 'list' ? 'var(--color-primary)' : 'transparent',
              color: viewMode === 'list' ? '#fff' : 'var(--text-secondary)',
            }}
          >
            <List size={14} /> List
          </button>
        </div>
      </div>

{/* Cards View */}
      {viewMode === 'cards' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {orgs.map((org) => {
              const oc = getOrgFeedbackCounts(org.id);
              const isActive = selectedOrgId === org.id;
              return (
                <div
                  key={org.id}
                  onClick={() => { setSelectedOrgId(isActive ? null : org.id); setSelectedTicket(null); updateUrl(isActive ? null : org.id, null); }}
                  className="rounded-xl p-3 shadow-sm cursor-pointer transition-all hover:shadow-md"
                  style={{
                    background: isActive ? 'var(--color-primary-bg)' : 'var(--bg-card)',
                    border: isActive ? '2px solid var(--color-primary)' : '1px solid var(--border-light)',
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                      <Building2 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{org.name}</p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {oc.total} {t('tickets', { defaultValue: 'tickets' })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-x-2 gap-y-1 mt-2">
                    {[
                      { key: 'New', defaultLabel: 'New', value: oc.open, color: '#10b981' },
                      { key: 'Review', defaultLabel: 'Review', value: oc.under_review, color: '#8b5cf6' },
                      { key: 'Accepted', defaultLabel: 'Accepted', value: oc.accepted, color: '#10b981' },
                      { key: 'Planned', defaultLabel: 'Planned', value: oc.planned, color: '#3b82f6' },
                      { key: 'In Dev', defaultLabel: 'In Dev', value: oc.in_development, color: '#f59e0b' },
                      { key: 'Testing', defaultLabel: 'Testing', value: oc.testing, color: '#6366f1' },
                      { key: 'Resolved', defaultLabel: 'Resolved', value: oc.resolved, color: '#3b82f6' },
                      { key: 'Closed', defaultLabel: 'Closed', value: oc.closed, color: '#94a3b8' },
                      { key: 'Rejected', defaultLabel: 'Rejected', value: oc.rejected, color: '#ef4444' },
                    ].map((item) => (
                      <div key={item.key} className="text-center leading-tight">
                        <span className="font-bold text-sm" style={{ color: item.color }}>{item.value}</span>
                        <span className="text-sm ml-0.5" style={{ color: 'var(--text-muted)' }}>
                          {t(item.key, { defaultValue: item.defaultLabel })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

{/* Selected Org Ticket List */}
          {selectedOrgId && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>
                {selectedOrg?.name} - {t('Feedback Tickets', { defaultValue: 'Feedback Tickets' })}
              </h2>

              {/* Filters for Cards View (no Org filter) */}
              <div className="fbc-filters-card">
                <div className="fbc-filter-grid">
                  <div className="fbc-filter-item">
                    <label>{t('Search', { defaultValue: 'Search' })}</label>
                    <input type="text" className="fbc-input" placeholder={t('Search ref #, subject, user...', { defaultValue: 'Search ref #, subject, user...' })} value={search} onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  <div className="fbc-filter-item">
                    <label>{t('Feedback Type', { defaultValue: 'Feedback Type' })}</label>
                    <select className="fbc-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                      <option value="">{t('All Types', { defaultValue: 'All Types' })}</option>
                      <option value="Bug Report">{t('Bug Report', { defaultValue: 'Bug Report' })}</option>
                      <option value="Feature Request">{t('Feature Request', { defaultValue: 'Feature Request' })}</option>
                      <option value="General Suggestion">{t('General Suggestion', { defaultValue: 'General Suggestion' })}</option>
                      <option value="Feature Rating">{t('Feature Rating', { defaultValue: 'Feature Rating' })}</option>
                      <option value="General Feedback">{t('General Feedback', { defaultValue: 'General Feedback' })}</option>
                    </select>
                  </div>
                  <div className="fbc-filter-item">
                    <label>{t('Status', { defaultValue: 'Status' })}</label>
                    <select className="fbc-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option value="">{t('All Statuses', { defaultValue: 'All Statuses' })}</option>
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{t(s, { defaultValue: s })}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fbc-filter-item">
                    <label>{t('Priority', { defaultValue: 'Priority' })}</label>
                    <select className="fbc-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="">{t('All Priorities', { defaultValue: 'All Priorities' })}</option>
                      <option value="Low">{t('Low', { defaultValue: 'Low' })}</option>
                      <option value="Medium">{t('Medium', { defaultValue: 'Medium' })}</option>
                      <option value="High">{t('High', { defaultValue: 'High' })}</option>
                      <option value="Urgent">{t('Urgent', { defaultValue: 'Urgent' })}</option>
                    </select>
                  </div>
                  <div className="fbc-filter-item">
                    <label>{t('From Date', { defaultValue: 'From Date' })}</label>
                    <input type="date" className="fbc-input" value={dateStart} max={dateEnd || undefined} onChange={(e) => setDateStart(e.target.value)} />
                  </div>
                  <div className="fbc-filter-item">
                    <label>{t('To Date', { defaultValue: 'To Date' })}</label>
                    <input type="date" className="fbc-input" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} />
                  </div>
                </div>
              </div>

              {ticketLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-12 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                  <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {t('No feedback tickets found for this organization', { defaultValue: 'No feedback tickets found for this organization' })}
                  </p>
                </div>
              ) : (
                <div className="fbc-table-card">
                  <table className="fbc-table">
                    <thead>
                      <tr>
                        <th>{t('Reference #', { defaultValue: 'Reference #' })}</th>
                        <th>{t('Type', { defaultValue: 'Type' })}</th>
                        <th>{t('Subject', { defaultValue: 'Subject' })}</th>
                        <th>{t('User', { defaultValue: 'User' })}</th>
                        <th>{t('Module', { defaultValue: 'Module' })}</th>
                        <th>{t('Priority', { defaultValue: 'Priority' })}</th>
                        <th>{t('Status', { defaultValue: 'Status' })}</th>
                        <th>{t('Submitted', { defaultValue: 'Submitted' })}</th>
                        <th>{t('Action', { defaultValue: 'Action' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((ticket) => {
                        const stCfg = STATUS_MAP[ticket.status] || STATUS_MAP.open;
                        const prCfg = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.medium;
                        const metadata = ticket.feedback_metadata || {};
                        return (
                          <tr key={ticket.id}>
                            <td><strong style={{ color: '#2563eb' }}>{ticket.feedback_reference_number}</strong></td>
                            <td>{metadata.feedback_type || '-'}</td>
                            <td style={{ fontWeight: 600, maxWidth: 220 }}>{cleanSubject(ticket.subject)}</td>
                            <td>
                              <div><strong>{metadata.user_name || t('User', { defaultValue: 'User' })}</strong></div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{metadata.user_role || ''}</div>
                            </td>
                            <td>{metadata.module || '-'}</td>
                            <td><span style={{ fontSize: '0.78rem', fontWeight: 700, color: prCfg.color }}>{t(prCfg.labelKey, { defaultValue: prCfg.defaultLabel })}</span></td>
                            <td><span className={`fbc-badge fbc-status-${ticket.status.replace(/_/g, '-')}`}>{t(stCfg.labelKey, { defaultValue: stCfg.defaultLabel })}</span></td>
                            <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                              <div>{new Date(ticket.created_at).toLocaleDateString()}</div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{new Date(ticket.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                            </td>
                            <td>
                              <button className="fb-btn-cancel" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleOpenTicket(ticket)}>
                                {t('View Detail', { defaultValue: 'View Detail' })}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!selectedOrgId && (
            <div className="text-center py-8 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
              <Building2 className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Click an organization card to view its feedback tickets</p>
            </div>
          )}
        </>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <>
          {/* Advanced Filters */}
          <div className="fbc-filters-card">
            <div className="fbc-filter-grid">
              <div className="fbc-filter-item">
                <label>Search</label>
                <input type="text" className="fbc-input" placeholder="Search ref #, subject, user..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
<div className="fbc-filter-item">
                <label>{t('Feedback Type', { defaultValue: 'Feedback Type' })}</label>
                <select className="fbc-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">{t('All Types', { defaultValue: 'All Types' })}</option>
                  <option value="Bug Report">{t('Bug Report', { defaultValue: 'Bug Report' })}</option>
                  <option value="Feature Request">{t('Feature Request', { defaultValue: 'Feature Request' })}</option>
                  <option value="General Suggestion">{t('General Suggestion', { defaultValue: 'General Suggestion' })}</option>
                  <option value="Feature Rating">{t('Feature Rating', { defaultValue: 'Feature Rating' })}</option>
                  <option value="General Feedback">{t('General Feedback', { defaultValue: 'General Feedback' })}</option>
                </select>
              </div>
              <div className="fbc-filter-item">
                <label>{t('Organization', { defaultValue: 'Organization' })}</label>
                <select className="fbc-select" value={selectedOrgId || ''} onChange={(e) => setSelectedOrgId(e.target.value || null)}>
                  <option value="">{t('All Organizations', { defaultValue: 'All Organizations' })}</option>
                  {orgs.map((org) => (
                    <option key={org.id} value={org.id}>{org.name}</option>
                  ))}
                </select>
              </div>
              <div className="fbc-filter-item">
                <label>{t('Status', { defaultValue: 'Status' })}</label>
                <select className="fbc-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="">{t('All Statuses', { defaultValue: 'All Statuses' })}</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{t(s, { defaultValue: s })}</option>
                  ))}
                </select>
              </div>
              <div className="fbc-filter-item">
                <label>{t('Priority', { defaultValue: 'Priority' })}</label>
                <select className="fbc-select" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option value="">{t('All Priorities', { defaultValue: 'All Priorities' })}</option>
                  <option value="Low">{t('Low', { defaultValue: 'Low' })}</option>
                  <option value="Medium">{t('Medium', { defaultValue: 'Medium' })}</option>
                  <option value="High">{t('High', { defaultValue: 'High' })}</option>
                  <option value="Urgent">{t('Urgent', { defaultValue: 'Urgent' })}</option>
                </select>
              </div>
              <div className="fbc-filter-item">
                <label>{t('From Date', { defaultValue: 'From Date' })}</label>
                <input type="date" className="fbc-input" value={dateStart} max={dateEnd || undefined} onChange={(e) => setDateStart(e.target.value)} />
              </div>
              <div className="fbc-filter-item">
                <label>{t('To Date', { defaultValue: 'To Date' })}</label>
                <input type="date" className="fbc-input" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Ticket Table */}
          {ticketLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} /></div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-12 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
              <FileText className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No feedback tickets found</p>
            </div>
          ) : (
            <div className="fbc-table-card">
              <table className="fbc-table">
                <thead>
                  <tr>
                    <th>Reference #</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>User & Organization</th>
                    <th>Module</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => {
                    const stCfg = STATUS_MAP[ticket.status] || STATUS_MAP.open;
                    const prCfg = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.medium;
                    const metadata = ticket.feedback_metadata || {};
                    return (
                      <tr key={ticket.id}>
                        <td><strong style={{ color: '#2563eb' }}>{ticket.feedback_reference_number}</strong></td>
                        <td>{metadata.feedback_type || '-'}</td>
                        <td style={{ fontWeight: 600, maxWidth: 220 }}>{cleanSubject(ticket.subject)}</td>
                        <td>
                          <div><strong>{metadata.user_name || 'User'}</strong></div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {ticket.organization?.name || 'Org'} ({metadata.user_role || ''})
                          </div>
                        </td>
                        <td>{metadata.module || '-'}</td>
                        <td><span style={{ fontSize: '0.78rem', fontWeight: 700, color: prCfg.color }}>{t(prCfg.labelKey, { defaultValue: prCfg.defaultLabel })}</span></td>
                        <td><span className={`fbc-badge fbc-status-${ticket.status.replace(/_/g, '-')}`}>{t(stCfg.labelKey, { defaultValue: stCfg.defaultLabel })}</span></td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          <div>{new Date(ticket.created_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{new Date(ticket.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td>
                          <button className="fb-btn-cancel" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleOpenTicket(ticket)}>
                            View Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
