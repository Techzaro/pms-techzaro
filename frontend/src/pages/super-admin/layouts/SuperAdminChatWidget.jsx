import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Send, Plus, ArrowLeft, Loader2, ExternalLink } from 'lucide-react';
import { api } from '../api/superAdminApi';
import './SuperAdminChatWidget.css';

export default function SuperAdminChatWidget() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
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
  const user = JSON.parse(localStorage.getItem('user_super-admin') || '{}');

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

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
        loadConversation(data.conversation.id);
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
    <div className="sacw">
      {/* Floating Bubble */}
      <button
        className={`sacw-bubble ${isOpen ? 'sacw-bubble--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle chat"
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="sacw-panel">
          <div className="sacw-container">
            {/* Sidebar: Conversations */}
            <div className="sacw-sidebar">
              <div className="sacw-sidebar-header">
                <h3>Org Chat</h3>
                <div className="sacw-header-actions">
                  <button className="sacw-expand-btn" onClick={() => navigate('/super-admin/chat')} title="Open full page">
                    <ExternalLink size={14} />
                  </button>
                  <button className="sacw-new-btn" onClick={openNewChat}>+ New</button>
                </div>
              </div>
              <div className="sacw-conversation-list">
                {conversations.length === 0 && (
                  <p className="sacw-empty-text">No conversations yet</p>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`sacw-conversation-item ${activeConversation?.id === conv.id ? 'active' : ''}`}
                    onClick={() => { loadConversation(conv.id); setShowNewChat(false); }}
                  >
                    <div className="sacw-conv-info">
                      <div className="sacw-conv-subject">
                        {conv.subject || conv.organization?.name || 'Untitled'}
                      </div>
                      <div className="sacw-conv-org">
                        <Building2 size={11} style={{ display: 'inline', marginRight: 3 }} />
                        {conv.organization?.name || 'Unknown Org'}
                      </div>
                      {conv.latest_message && (
                        <div className="sacw-conv-preview">
                          {conv.latest_message.body?.replace(/<[^>]*>/g, '').substring(0, 40)}
                          {conv.latest_message.body?.replace(/<[^>]*>/g, '').length > 40 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main: Messages */}
            <div className="sacw-main">
              {showNewChat ? (
                <div className="sacw-new-chat-form">
                  <div className="sacw-form-header">
                    <button onClick={() => setShowNewChat(false)} className="sacw-back-btn">
                      <ArrowLeft size={18} />
                    </button>
                    <h4>New Conversation</h4>
                  </div>
                  <div className="sacw-form-group">
                    <label>Organization *</label>
                    <input
                      type="text"
                      placeholder="Search organizations..."
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                    />
                    <div className="sacw-org-list">
                      {filteredOrgs.map((org) => (
                        <label key={org.id} className={`sacw-org-option ${selectedOrg === org.id ? 'selected' : ''}`}>
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
                  <div className="sacw-form-group">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={chatSubject}
                      onChange={(e) => setChatSubject(e.target.value)}
                      placeholder="Optional subject"
                    />
                  </div>
                  <div className="sacw-form-group">
                    <label>Message *</label>
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={3}
                    />
                  </div>
                  <div className="sacw-form-actions">
                    <button className="sacw-btn-cancel" onClick={() => setShowNewChat(false)}>Cancel</button>
                    <button className="sacw-btn-primary" onClick={handleCreateConversation} disabled={!selectedOrg}>Create</button>
                  </div>
                </div>
              ) : activeConversation ? (
                <>
                  <div className="sacw-chat-header">
                    <div>
                      <h4>{activeConversation.subject || activeConversation.organization?.name || 'Conversation'}</h4>
                      <span className="sacw-participants">
                        <Building2 size={12} style={{ display: 'inline', marginRight: 3 }} />
                        {activeConversation.organization?.name}
                      </span>
                    </div>
                  </div>
                  <div className="sacw-messages">
                    {messages.length === 0 && (
                      <p className="sacw-no-msgs">No messages yet</p>
                    )}
                    {messages.map((msg) => {
                      const isOrg = msg.organization_id && !msg.user_id;
                      return (
                        <div key={msg.id} className={`sacw-message ${isOrg ? 'org' : 'admin'}`}>
                          <div className="sacw-msg-avatar">
                            {isOrg ? <Building2 size={14} /> : (msg.user?.name?.charAt(0) || 'A')}
                          </div>
                          <div className="sacw-msg-content">
                            <div className="sacw-msg-header">
                              <span className="sacw-msg-sender">{isOrg ? msg.organization?.name : 'Admin'}</span>
                              <span className="sacw-msg-time">{formatTime(msg.created_at)}</span>
                            </div>
                            <div className="sacw-msg-body" dangerouslySetInnerHTML={{ __html: msg.body }} />
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="sacw-input-area">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      className="sacw-msg-input"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="sacw-send-btn"
                    >
                      {sending ? <Loader2 size={16} className="sacw-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </>
              ) : (
                <div className="sacw-empty-state">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                  <p>Select a conversation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
