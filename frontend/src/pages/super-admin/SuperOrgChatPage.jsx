import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Building2, Send, Plus, X, ArrowLeft, Loader2 } from 'lucide-react';
import { api } from './api/superAdminApi';

export default function SuperOrgChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [chatSubject, setChatSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [orgSearch, setOrgSearch] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    if (conversationId) loadConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const data = await api.getOrgChatConversations();
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  };

  const loadConversation = async (id) => {
    setLoading(true);
    try {
      const data = await api.getOrgChatConversation(id);
      setActiveConversation(data.conversation);
      setMessages(data.conversation.messages || []);
    } catch (err) {
      console.error('Failed to load conversation', err);
    } finally {
      setLoading(false);
    }
  };

  const openNewChat = async () => {
    setShowNewChat(true);
    setSelectedOrg(null);
    setChatSubject('');
    setNewMessage('');
    try {
      const data = await api.getOrganizations();
      setOrganizations(data.data || data || []);
    } catch (err) {
      console.error('Failed to load organizations', err);
    }
  };

  const handleCreateConversation = async () => {
    if (!selectedOrg) return;
    try {
      const data = await api.createOrgChatConversation({
        organization_id: selectedOrg,
        subject: chatSubject || null,
        message: newMessage || 'Conversation started',
      });
      setShowNewChat(false);
      fetchConversations();
      if (data.conversation) {
        navigate(`/super-admin/chat/${data.conversation.id}`);
      }
    } catch (err) {
      console.error('Failed to create conversation', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    setSending(true);
    try {
      const data = await api.sendOrgChatMessage(activeConversation.id, newMessage);
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessage('');
        fetchConversations();
      }
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredOrgs = organizations.filter(o =>
    o.name?.toLowerCase().includes(orgSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: 'var(--bg-primary)' }}>
      {/* Sidebar: Conversation List */}
      <div style={{ width: 320, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Org Chat</h3>
          <button onClick={openNewChat} style={{ background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Plus size={14} /> New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && (
            <p style={{ padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>No conversations yet</p>
          )}
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => navigate(`/super-admin/chat/${conv.id}`)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid var(--border-color)',
                background: activeConversation?.id === conv.id ? 'var(--bg-hover)' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 2 }}>{conv.subject || conv.organization?.name || 'Untitled'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                {conv.organization?.name || 'Unknown Org'}
              </div>
              {conv.latest_message && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conv.latest_message.body?.replace(/<[^>]*>/g, '').substring(0, 50)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main: Messages or New Chat Form */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {showNewChat ? (
          <div style={{ padding: 24, maxWidth: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <button onClick={() => setShowNewChat(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <ArrowLeft size={20} />
              </button>
              <h3 style={{ margin: 0 }}>New Conversation</h3>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Organization *</label>
              <input
                type="text"
                placeholder="Search organizations..."
                value={orgSearch}
                onChange={(e) => setOrgSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 6, marginTop: 4 }}>
                {filteredOrgs.map((org) => (
                  <label key={org.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: selectedOrg === org.id ? 'var(--bg-hover)' : 'transparent' }}>
                    <input
                      type="radio"
                      name="org-select"
                      checked={selectedOrg === org.id}
                      onChange={() => setSelectedOrg(org.id)}
                    />
                    {org.name}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Subject</label>
              <input
                type="text"
                value={chatSubject}
                onChange={(e) => setChatSubject(e.target.value)}
                placeholder="Optional subject"
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Message *</label>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                rows={4}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowNewChat(false)} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>Cancel</button>
              <button onClick={handleCreateConversation} disabled={!selectedOrg} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: selectedOrg ? 'pointer' : 'not-allowed', opacity: selectedOrg ? 1 : 0.5 }}>Create</button>
            </div>
          </div>
        ) : activeConversation ? (
          <>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => { setActiveConversation(null); navigate('/super-admin/chat'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <ArrowLeft size={18} />
              </button>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{activeConversation.subject || activeConversation.organization?.name || 'Conversation'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {activeConversation.organization?.name}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {messages.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No messages yet</p>}
              {messages.map((msg) => {
                const isOrg = msg.organization_id && !msg.user_id;
                return (
                  <div key={msg.id} style={{ display: 'flex', gap: 8, marginBottom: 16, flexDirection: isOrg ? 'row' : 'row-reverse' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isOrg ? 'var(--color-primary)' : 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: isOrg ? '#fff' : 'var(--text-primary)', flexShrink: 0 }}>
                      {isOrg ? <Building2 size={16} /> : (msg.user_id ? 'A' : '?')}
                    </div>
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                        {isOrg ? msg.organization?.name : 'Admin'} · {formatTime(msg.created_at)}
                      </div>
                      <div style={{ padding: '8px 12px', borderRadius: 12, background: isOrg ? 'var(--bg-hover)' : 'var(--color-primary)', color: isOrg ? 'var(--text-primary)' : '#fff', fontSize: 14 }} dangerouslySetInnerHTML={{ __html: msg.body }} />
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 14, background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
              <button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending || !newMessage.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <div style={{ textAlign: 'center' }}>
              <MessageSquare size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
              <h3 style={{ margin: 0, fontWeight: 500 }}>Select a conversation</h3>
              <p style={{ fontSize: 13 }}>Choose a conversation from the sidebar or start a new one.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
