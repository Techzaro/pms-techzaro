import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import Breadcrumb from '../components/Breadcrumb';
import api from '../lib/api';
import { MessageSquare, Send, Plus, X, CheckCircle, Clock, AlertCircle, Circle, ChevronLeft, Filter } from 'lucide-react';

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'var(--text-muted)', bg: 'var(--bg-hover)' },
  medium: { label: 'Medium', color: 'var(--color-blue)', bg: 'var(--color-blue-bg)' },
  high: { label: 'High', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  urgent: { label: 'Urgent', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'var(--color-success)', bg: 'var(--color-success-bg)', icon: Circle },
  pending: { label: 'Pending', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', icon: Clock },
  resolved: { label: 'Resolved', color: 'var(--color-blue)', bg: 'var(--color-blue-bg)', icon: CheckCircle },
  closed: { label: 'Closed', color: 'var(--text-muted)', bg: 'var(--bg-hover)', icon: X },
};

export default function SupportPage() {
  const { t } = useTranslation();
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchTickets();
  }, [filterStatus]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const params = filterStatus ? `?status=${filterStatus}` : '';
      const json = await api.get(`/organization/support/tickets${params}`);
      if (json.success) {
        setTickets(json.tickets);
        setCounts(json.counts);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function openTicketDetail(ticket) {
    setSelectedTicket(ticket);
    setTicketLoading(true);
    try {
      const json = await api.get(`/organization/support/tickets/${ticket.id}`);
      if (json.success) {
        setTicketMessages(json.messages);
        setSelectedTicket(json.ticket);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      const json = await api.post(`/organization/support/tickets/${selectedTicket.id}/reply`, {
        message: replyText,
      });
      if (json.success) {
        setReplyText('');
        openTicketDetail(selectedTicket);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingReply(false);
    }
  }

  async function handleCloseTicket() {
    if (!selectedTicket) return;
    try {
      const json = await api.post(`/organization/support/tickets/${selectedTicket.id}/close`);
      if (json.success) {
        openTicketDetail(selectedTicket);
        fetchTickets();
      }
    } catch (err) {
      console.error(err);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  useEffect(() => {
    scrollToBottom();
  }, [ticketMessages]);

  return (
    <DashboardLayout hideRightSidebar>
      <Breadcrumb items={[{ label: t('Settings', { defaultValue: 'Settings' }) }, { label: t('Support', { defaultValue: 'Support' }) }]} />

      {selectedTicket ? (
        <TicketDetail
          ticket={selectedTicket}
          messages={ticketMessages}
          loading={ticketLoading}
          onBack={() => { setSelectedTicket(null); setTicketMessages([]); }}
          onReply={handleReply}
          onClose={handleCloseTicket}
          replyText={replyText}
          setReplyText={setReplyText}
          sendingReply={sendingReply}
          messagesEndRef={messagesEndRef}
        />
      ) : (
        <TicketList
          tickets={tickets}
          counts={counts}
          loading={loading}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          onSelectTicket={openTicketDetail}
          onShowCreate={() => setShowCreateModal(true)}
          onRefresh={fetchTickets}
        />
      )}

      {showCreateModal && (
        <CreateTicketModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); fetchTickets(); }}
        />
      )}
    </DashboardLayout>
  );
}

function TicketList({ tickets, counts, loading, filterStatus, setFilterStatus, onSelectTicket, onShowCreate, onRefresh }) {
  const { t } = useTranslation();
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('Support Tickets', { defaultValue: 'Support Tickets' })}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: '4px 0 0' }}>
            {t('Get help from our support team', { defaultValue: 'Get help from our support team' })}
          </p>
        </div>
        <button onClick={onShowCreate} style={{
          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
          borderRadius: '12px', border: 'none', cursor: 'pointer',
          background: 'var(--color-primary)', color: '#fff', fontSize: '14px', fontWeight: 600,
        }}>
          <Plus style={{ width: '16px', height: '16px' }} />
          {t('New Ticket', { defaultValue: 'New Ticket' })}
        </button>
      </div>

      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { value: '', label: t('All', { defaultValue: 'All' }), count: Object.values(counts).reduce((a, b) => a + b, 0) },
          { value: 'open', label: t('Open', { defaultValue: 'Open' }), count: counts.open || 0 },
          { value: 'pending', label: t('Pending', { defaultValue: 'Pending' }), count: counts.pending || 0 },
          { value: 'resolved', label: t('Resolved', { defaultValue: 'Resolved' }), count: counts.resolved || 0 },
          { value: 'closed', label: t('Closed', { defaultValue: 'Closed' }), count: counts.closed || 0 },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            style={{
              padding: '8px 16px', borderRadius: '10px', border: '1px solid',
              borderColor: filterStatus === tab.value ? 'var(--color-primary)' : 'var(--border-light)',
              background: filterStatus === tab.value ? 'var(--color-primary-bg)' : 'var(--bg-hover)',
              color: filterStatus === tab.value ? 'var(--color-primary)' : 'var(--text-secondary)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Tickets */}
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <MessageSquare style={{ width: '48px', height: '48px', color: 'var(--text-muted)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{t('No tickets found. Create your first support ticket.', { defaultValue: 'No tickets found. Create your first support ticket.' })}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tickets.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const priorityCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;
            const StatusIcon = statusCfg.icon;
            return (
              <div
                key={ticket.id}
                onClick={() => onSelectTicket(ticket)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px', borderRadius: '14px', background: 'var(--bg-hover)',
                  border: '1px solid var(--border-light)', cursor: 'pointer',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-light)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: statusCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <StatusIcon style={{ width: '18px', height: '18px', color: statusCfg.color }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>
                        {ticket.subject}
                      </p>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        background: statusCfg.bg, color: statusCfg.color,
                      }}>
                        {t(statusCfg.label, { defaultValue: statusCfg.label })}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        background: priorityCfg.bg, color: priorityCfg.color,
                      }}>
                        {t(priorityCfg.label, { defaultValue: priorityCfg.label })}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {ticket.ticket_number} · {t(ticket.category, { defaultValue: ticket.category })}
                      {ticket.last_message && ` · ${t('Last:', { defaultValue: 'Last:' })} ${ticket.last_message.message}`}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
                    {new Date(ticket.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TicketDetail({ ticket, messages, loading, onBack, onReply, onClose, replyText, setReplyText, sendingReply, messagesEndRef }) {
  const { t } = useTranslation();
  const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '20px', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--border-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onBack} style={{
            width: '36px', height: '36px', borderRadius: '10px', border: '1px solid var(--border-light)',
            background: 'var(--bg-hover)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeft style={{ width: '18px', height: '18px', color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>
                {ticket.subject}
              </h2>
              <span style={{
                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                background: statusCfg.bg, color: statusCfg.color,
              }}>
                {t(statusCfg.label, { defaultValue: statusCfg.label })}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                background: priorityCfg.bg, color: priorityCfg.color,
              }}>
                {t(priorityCfg.label, { defaultValue: priorityCfg.label })}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {ticket.ticket_number} · {t(ticket.category, { defaultValue: ticket.category })}
            </p>
          </div>
        </div>
        {ticket.status !== 'closed' && (
          <button onClick={onClose} style={{
            padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border-light)',
            background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            color: 'var(--text-secondary)',
          }}>
            {t('Close Ticket', { defaultValue: 'Close Ticket' })}
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ padding: '20px 24px', minHeight: '300px', maxHeight: '500px', overflowY: 'auto' }}>
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
            <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4 ml-auto" />
          </div>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>{t('No messages yet.', { defaultValue: 'No messages yet.' })}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Initial message */}
            <div style={{
              maxWidth: '80%', padding: '12px 16px', borderRadius: '14px',
              background: 'var(--color-primary-bg)', alignSelf: 'flex-start',
            }}>
              <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.message}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                {ticket.user?.name || t('You', { defaultValue: 'You' })} · {new Date(ticket.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>

            {messages.map((msg) => {
              const isOrg = msg.sender_type === 'organization';
              return (
                <div key={msg.id} style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: '14px',
                  background: isOrg ? 'var(--color-primary-bg)' : 'var(--bg-hover)',
                  alignSelf: isOrg ? 'flex-start' : 'flex-end',
                  border: isOrg ? 'none' : '1px solid var(--border-light)',
                }}>
                  <p style={{ fontSize: '13px', color: 'var(--text-dark)', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    {isOrg ? (msg.user?.name || t('You', { defaultValue: 'You' })) : t('Support Team', { defaultValue: 'Support Team' })} · {new Date(msg.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply Box */}
      {ticket.status !== 'closed' && (
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onReply()}
            placeholder={t('Type your reply...', { defaultValue: 'Type your reply...' })}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)',
              background: 'var(--bg-hover)', fontSize: '14px', color: 'var(--text-dark)', outline: 'none',
            }}
          />
          <button
            onClick={onReply}
            disabled={!replyText.trim() || sendingReply}
            style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: sendingReply ? 'not-allowed' : 'pointer',
              background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '14px', fontWeight: 600, opacity: (!replyText.trim() || sendingReply) ? 0.6 : 1,
            }}
          >
            <Send style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      )}
    </div>
  );
}

function CreateTicketModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ subject: '', message: '', priority: 'medium', category: 'general' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      const json = await api.post('/organization/support/tickets', form);
      if (json.success) onCreated();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: '20px', padding: '28px', width: '100%', maxWidth: '500px',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: 0 }}>{t('New Support Ticket', { defaultValue: 'New Support Ticket' })}</h2>
          <button onClick={onClose} style={{
            width: '32px', height: '32px', borderRadius: '8px', border: 'none',
            background: 'var(--bg-hover)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X style={{ width: '16px', height: '16px', color: 'var(--text-muted)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>{t('Subject', { defaultValue: 'Subject' })}</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder={t('Brief description of your issue', { defaultValue: 'Brief description of your issue' })}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)',
                background: 'var(--bg-hover)', fontSize: '14px', color: 'var(--text-dark)', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>{t('Message', { defaultValue: 'Message' })}</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder={t('Describe your issue in detail...', { defaultValue: 'Describe your issue in detail...' })}
              rows={4}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)',
                background: 'var(--bg-hover)', fontSize: '14px', color: 'var(--text-dark)', outline: 'none',
                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>{t('Priority', { defaultValue: 'Priority' })}</label>
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)',
                  background: 'var(--bg-hover)', fontSize: '14px', color: 'var(--text-dark)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="low">{t('Low', { defaultValue: 'Low' })}</option>
                <option value="medium">{t('Medium', { defaultValue: 'Medium' })}</option>
                <option value="high">{t('High', { defaultValue: 'High' })}</option>
                <option value="urgent">{t('Urgent', { defaultValue: 'Urgent' })}</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-dark)', marginBottom: '6px', display: 'block' }}>{t('Category', { defaultValue: 'Category' })}</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--border-light)',
                  background: 'var(--bg-hover)', fontSize: '14px', color: 'var(--text-dark)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="general">{t('General', { defaultValue: 'General' })}</option>
                <option value="billing">{t('Billing', { defaultValue: 'Billing' })}</option>
                <option value="technical">{t('Technical', { defaultValue: 'Technical' })}</option>
                <option value="feature_request">{t('Feature Request', { defaultValue: 'Feature Request' })}</option>
                <option value="bug_report">{t('Bug Report', { defaultValue: 'Bug Report' })}</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={onClose} style={{
              padding: '10px 20px', borderRadius: '10px', border: '1px solid var(--border-light)',
              background: 'var(--bg-hover)', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
              color: 'var(--text-secondary)',
            }}>
              {t('Cancel', { defaultValue: 'Cancel' })}
            </button>
            <button type="submit" disabled={submitting} style={{
              padding: '10px 20px', borderRadius: '10px', border: 'none',
              background: 'var(--color-primary)', color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600, opacity: submitting ? 0.7 : 1,
            }}>
              {submitting ? t('Creating...', { defaultValue: 'Creating...' }) : t('Create Ticket', { defaultValue: 'Create Ticket' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
