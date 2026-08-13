import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API_URL from "../config/api";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import DashboardLayout from "../components/layout/DashboardLayout";
import { MessageSquare, Send, ArrowLeft, Loader2, Shield } from "lucide-react";
import "./Chat.css";

function OrgChatFileImage({ msgId, fileName }) {
  const [src, setSrc] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/org-chat/messages/${msgId}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        setSrc(URL.createObjectURL(blob));
      }
    } catch (err) {
      console.error("Failed to load image:", err);
    }
  }, [msgId]);

  useEffect(() => {
    load();
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [load]);

  if (!src) return null;

  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img src={src} alt={fileName} className="message-image-preview" />
    </a>
  );
}

function OrgChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
    if (conversationId) loadConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/org-chat/conversations`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      const data = await res.json();
      if (data.success) setConversations(data.conversations || []);
    } catch (err) {
      console.error("Failed to load conversations");
    }
  };

  const loadConversation = async (id) => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/org-chat/conversations/${id}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        skipLoader: true,
      });
      const data = await res.json();
      if (data.success) {
        setActiveConversation(data.conversation);
        setMessages(data.conversation.messages || []);
      }
    } catch (err) {
      console.error("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    setSending(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/org-chat/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: newMessage }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessage("");
        fetchConversations();
      }
    } catch (err) {
      console.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <DashboardLayout hideRightSidebar>
      <div className="chat-page">
        <div className="chat-container">
          {/* Sidebar: Conversation List */}
          <div className="chat-sidebar">
            <div className="chat-sidebar-header">
              <h3>Admin Chat</h3>
            </div>
            <div className="conversation-list">
              {conversations.length === 0 && (
                <p style={{ padding: 16, color: "#999", fontSize: 13 }}>No conversations yet</p>
              )}
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`conversation-item ${activeConversation?.id === conv.id ? "active" : ""}`}
                  onClick={() => navigate(rolePath(`org-chat/${conv.id}`))}
                >
                  <div className="conversation-info">
                    <div className="conversation-subject">
                      {conv.subject || conv.organization?.name || "Untitled"}
                    </div>
                    <div className="conversation-project">
                      <Shield size={12} style={{ display: "inline", marginRight: 4 }} />
                      Platform Admin
                    </div>
                    {conv.latest_message && (
                      <div className="conversation-preview">
                        {conv.latest_message.body?.replace(/<[^>]*>/g, "").substring(0, 40)}
                        {conv.latest_message.body?.replace(/<[^>]*>/g, "").length > 40 ? "..." : ""}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Main: Messages */}
          <div className="chat-main">
            {activeConversation ? (
              <>
                <div className="chat-header">
                  <div>
                    <h3>{activeConversation.subject || activeConversation.organization?.name || "Conversation"}</h3>
                    <span className="chat-participants">
                      <Shield size={12} style={{ display: "inline", marginRight: 4 }} />
                      Platform Admin
                    </span>
                  </div>
                </div>
                <div className="messages-container">
                  {messages.length === 0 && (
                    <p style={{ textAlign: "center", color: "#999", padding: 20 }}>No messages yet</p>
                  )}
                  {messages.map((msg) => {
                    const isOrg = msg.organization_id && !msg.user_id;
                    return (
                      <div key={msg.id} className={`message ${isOrg ? "own" : "other"}`}>
                        <div className="message-avatar">
                          {isOrg ? <Shield size={16} /> : "A"}
                        </div>
                        <div className="message-content">
                          <div className="message-header">
                            <span className="message-sender">{isOrg ? "You" : "Admin"}</span>
                            <span className="message-time">{formatTime(msg.created_at)}</span>
                          </div>
                          <div className="message-body rte-display" dangerouslySetInnerHTML={{ __html: msg.body }} />
                          {msg.file_name && (
                            <div className="message-file">
                              {msg.file_name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                                <OrgChatFileImage msgId={msg.id} fileName={msg.file_name} />
                              ) : (
                                <span>📎 {msg.file_name}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="message-input-area">
                  <div className="chat-editor-row">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border-color)", borderRadius: 6, fontSize: 14, background: "var(--bg-primary)", color: "var(--text-primary)" }}
                    />
                    <button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} className="send-btn">
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="chat-empty">
                <h3>Select a conversation</h3>
                <p>Choose a conversation from the sidebar.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default OrgChatPage;
