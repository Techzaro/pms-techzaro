import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Building2, Circle, Clock, CheckCircle, X, Loader2, Send, ArrowLeft } from 'lucide-react';
import { api } from './api/superAdminApi';

const PRIORITY_MAP = {
  low: { labelKey: 'Low', defaultLabel: 'Low', color: 'var(--text-muted)', bg: 'var(--bg-hover)' },
  medium: { labelKey: 'Medium', defaultLabel: 'Medium', color: 'var(--color-blue)', bg: 'rgba(59,130,246,0.1)' },
  high: { labelKey: 'High', defaultLabel: 'High', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)' },
  urgent: { labelKey: 'Urgent', defaultLabel: 'Urgent', color: 'var(--color-danger)', bg: 'rgba(239,68,68,0.1)' },
};

const STATUS_MAP = {
  open: { labelKey: 'Open', defaultLabel: 'Open', color: 'var(--color-success)', bg: 'rgba(16,185,129,0.1)', icon: Circle },
  pending: { labelKey: 'Pending', defaultLabel: 'Pending', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', icon: Clock },
  resolved: { labelKey: 'Resolved', defaultLabel: 'Resolved', color: 'var(--color-blue)', bg: 'rgba(59,130,246,0.1)', icon: CheckCircle },
  closed: { labelKey: 'Closed', defaultLabel: 'Closed', color: 'var(--text-muted)', bg: 'var(--bg-hover)', icon: X },
};

export default function SuperSupportPage() {
  const { t } = useTranslation();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const res = await api.getOrganizations();
        const orgList = res.data || [];
        const enriched = await Promise.all(
          orgList.map(async (org) => {
            try {
              const support = await api.getOrgSupportTickets(org.id);
              return { ...org, support };
            } catch {
              return { ...org, support: { tickets: [], counts: {} } };
            }
          })
        );
        setOrgs(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSelectOrg(org) {
    setSelectedOrg(org);
    setTicketLoading(true);
    setSelectedTicket(null);
    setTicketMessages([]);
    try {
      const res = await api.getOrgSupportTickets(org.id);
      setTickets(res.tickets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setTicketLoading(false);
    }
  }

  async function handleOpenTicket(ticket) {
    setSelectedTicket(ticket);
    setDetailLoading(true);
    try {
      const res = await api.getOrgSupportTicketDetail(selectedOrg.id, ticket.id);
      setTicketMessages(res.messages || []);
      setSelectedTicket(res.ticket || ticket);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !selectedTicket) return;
    setSendingReply(true);
    try {
      await api.replyOrgSupportTicket(selectedOrg.id, selectedTicket.id, replyText);
      setReplyText('');
      handleOpenTicket(selectedTicket);
      const res = await api.getOrgSupportTickets(selectedOrg.id);
      setTickets(res.tickets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setSendingReply(false);
    }
  }

  async function handleCloseTicket() {
    if (!selectedTicket) return;
    try {
      await api.closeOrgSupportTicket(selectedOrg.id, selectedTicket.id);
      handleOpenTicket(selectedTicket);
      const res = await api.getOrgSupportTickets(selectedOrg.id);
      setTickets(res.tickets || []);
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} />
        <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{t('Loading support data...', { defaultValue: 'Loading support data...' })}</span>
      </div>
    );
  }

  // Ticket Detail View
  if (selectedTicket) {
    const stCfg = STATUS_MAP[selectedTicket.status] || STATUS_MAP.open;
    const prCfg = PRIORITY_MAP[selectedTicket.priority] || PRIORITY_MAP.medium;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedTicket(null); setTicketMessages([]); }} className="p-2 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>{selectedTicket.subject}</h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: stCfg.bg, color: stCfg.color }}>{t(stCfg.labelKey, { defaultValue: stCfg.defaultLabel })}</span>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: prCfg.bg, color: prCfg.color }}>{t(prCfg.labelKey, { defaultValue: prCfg.defaultLabel })}</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{selectedTicket.ticket_number} · {t(selectedTicket.category, { defaultValue: selectedTicket.category })} · {selectedOrg?.name}</p>
          </div>
          {selectedTicket.status !== 'closed' && (
            <button onClick={handleCloseTicket} className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>{t('Close Ticket', { defaultValue: 'Close Ticket' })}</button>
          )}
        </div>

        <div className="rounded-xl p-5 shadow-sm space-y-3 max-h-96 overflow-y-auto" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
          <div className="max-w-3/4 p-3 rounded-lg" style={{ background: 'var(--color-primary-bg)' }}>
            <p className="text-sm" style={{ color: 'var(--text-dark)' }}>{selectedTicket.message}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{selectedTicket.user?.name || t('User', { defaultValue: 'User' })} · {new Date(selectedTicket.created_at).toLocaleString()}</p>
          </div>

          {detailLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} /></div>
          ) : ticketMessages.map((msg) => {
            const isOrg = msg.sender_type === 'organization';
            return (
              <div key={msg.id} className={`max-w-3/4 p-3 rounded-lg ${isOrg ? '' : 'ml-auto'}`} style={{
                background: isOrg ? 'var(--color-primary-bg)' : 'var(--bg-hover)',
                border: isOrg ? 'none' : '1px solid var(--border-light)',
              }}>
                <p className="text-sm" style={{ color: 'var(--text-dark)' }}>{msg.message}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{isOrg ? (msg.user?.name || t('User', { defaultValue: 'User' })) : t('Support', { defaultValue: 'Support' })} · {new Date(msg.created_at).toLocaleString()}</p>
              </div>
            );
          })}
        </div>

        {selectedTicket.status !== 'closed' && (
          <div className="flex gap-2">
            <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleReply()}
              placeholder={t("Type your reply...", { defaultValue: "Type your reply..." })}
              className="flex-1 px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)', color: 'var(--text-dark)' }} />
            <button onClick={handleReply} disabled={!replyText.trim() || sendingReply}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-1">
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  // Org List or Ticket List
  if (selectedOrg) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedOrg(null); setTickets([]); }} className="p-2 rounded-lg" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-light)' }}>
            <ArrowLeft className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{selectedOrg.name} - {t('Support', { defaultValue: 'Support' })}</h1>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {t('{{open}} open, {{pending}} pending', {
                open: selectedOrg.support?.counts?.open || 0,
                pending: selectedOrg.support?.counts?.pending || 0,
                defaultValue: `${selectedOrg.support?.counts?.open || 0} open, ${selectedOrg.support?.counts?.pending || 0} pending`
              })}
            </p>
          </div>
        </div>

        {ticketLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary)' }} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
            <MessageSquare className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{t('No support tickets', { defaultValue: 'No support tickets' })}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => {
              const stCfg = STATUS_MAP[ticket.status] || STATUS_MAP.open;
              const prCfg = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.medium;
              const StIcon = stCfg.icon;
              return (
                <div key={ticket.id} onClick={() => handleOpenTicket(ticket)}
                  className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all hover:shadow-sm"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: stCfg.bg }}>
                      <StIcon className="w-5 h-5" style={{ color: stCfg.color }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{ticket.subject}</p>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: stCfg.bg, color: stCfg.color }}>{t(stCfg.labelKey, { defaultValue: stCfg.defaultLabel })}</span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full" style={{ background: prCfg.bg, color: prCfg.color }}>{t(prCfg.labelKey, { defaultValue: prCfg.defaultLabel })}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{ticket.ticket_number} · {t(ticket.category, { defaultValue: ticket.category })}</p>
                    </div>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(ticket.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Organization Grid
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-heading)' }}>{t('Support Tickets', { defaultValue: 'Support Tickets' })}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{t('Manage support tickets across all organizations', { defaultValue: 'Manage support tickets across all organizations' })}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((org) => {
          const counts = org.support?.counts || {};
          const total = (counts.open || 0) + (counts.pending || 0) + (counts.resolved || 0) + (counts.closed || 0);
          return (
            <div key={org.id} onClick={() => handleSelectOrg(org)}
              className="rounded-xl p-5 shadow-sm cursor-pointer transition-all hover:shadow-md"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-primary-bg)' }}>
                  <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-heading)' }}>{org.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('{{count}} tickets', { count: total, defaultValue: `${total} tickets` })}</p>
                </div>
              </div>
              <div className="flex gap-3">
                {[
                  { labelKey: 'Open', defaultLabel: 'Open', value: counts.open || 0, color: 'var(--color-success)' },
                  { labelKey: 'Pending', defaultLabel: 'Pending', value: counts.pending || 0, color: 'var(--color-warning)' },
                  { labelKey: 'Closed', defaultLabel: 'Closed', value: counts.closed || 0, color: 'var(--text-muted)' },
                ].map((item) => (
                  <div key={item.labelKey} className="text-center flex-1">
                    <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{t(item.labelKey, { defaultValue: item.defaultLabel })}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
