import { useState, useEffect, useRef } from "react";
import API_URL from "../../config/api";
import { authToken, getCurrentRole, rolePath } from "../../utils/auth";
import { useNotification } from "../../context/NotificationContext";
import "./ChatWidget.css";

function ChatWidget() {
  const notify = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedSubtask, setSelectedSubtask] = useState("");
  const [linkProject, setLinkProject] = useState(false);
  const [linkTask, setLinkTask] = useState(false);
  const [linkSubtask, setLinkSubtask] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [chatSubject, setChatSubject] = useState("");
  const messagesEndRef = useRef(null);
  const user = JSON.parse(localStorage.getItem(`user_${getCurrentRole()}`) || "{}");

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleChatWidgetOpen = (e) => {
      const { conversationId } = e.detail || {};
      setIsOpen(true);
      setShowNewChat(false);
      if (conversationId) {
        setTimeout(() => loadConversation(conversationId), 400);
      }
    };
    window.addEventListener("chat-widget-open", handleChatWidgetOpen);
    return () => window.removeEventListener("chat-widget-open", handleChatWidgetOpen);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/conversations`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error("Failed to load conversations");
    }
  };

  const loadConversation = async (id) => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/conversations/${id}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setActiveConversation(data.conversation);
        setMessages(data.conversation.messages || []);
      }
    } catch (err) {
      notify.error("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    setSending(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: newMessage }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessage("");
        fetchConversations();
      }
    } catch (err) {
      notify.error("Failed to send message");
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

  const openNewChat = async () => {
    setShowNewChat(true);
    setLinkProject(false);
    setLinkTask(false);
    setLinkSubtask(false);
    setSelectedProject("");
    setSelectedTask("");
    setSelectedSubtask("");
    try {
      const token = authToken();
      const [usersRes, itemsRes] = await Promise.all([
        fetch(`${API_URL}/team-users`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/chat-items`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } }),
      ]);
      const usersData = await usersRes.json();
      const itemsData = await itemsRes.json();
      if (usersData.success) setUsers(usersData.users || []);
      if (itemsData.success) {
        setProjects(itemsData.projects || []);
        setTasks(itemsData.tasks || []);
        setSubtasks(itemsData.deliverables || []);
      }
    } catch (err) {
      notify.error("Failed to load data");
    }
  };

  const handleCreateConversation = async () => {
    if (selectedUsers.length === 0) {
      notify.error("Please select at least one participant");
      return;
    }
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/conversations`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project_id: linkProject && selectedProject ? selectedProject : null,
          task_id: linkTask && selectedTask ? selectedTask : null,
          deliverable_id: linkSubtask && selectedSubtask ? selectedSubtask : null,
          participant_ids: selectedUsers,
          subject: chatSubject || null,
          message: newMessage || "Conversation started",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewChat(false);
        setNewMessage("");
        setChatSubject("");
        setSelectedProject("");
        setSelectedTask("");
        setSelectedSubtask("");
        setLinkProject(false);
        setLinkTask(false);
        setLinkSubtask(false);
        setSelectedUsers([]);
        fetchConversations();
        if (data.conversation) {
          loadConversation(data.conversation.id);
        }
        notify.success("Conversation created");
      }
    } catch (err) {
      notify.error("Failed to create conversation");
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="chat-widget">
      {/* Floating Bubble */}
      <button
        className={`chat-widget-bubble ${isOpen ? "chat-widget-bubble--open" : ""}`}
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
        <div className="chat-widget-panel">
          <div className="chat-widget-container">
            {/* Sidebar: Conversations */}
            <div className="cw-sidebar">
              <div className="cw-sidebar-header">
                <h3>Chats</h3>
                <div className="cw-header-actions">
                  <button className="cw-expand-btn" onClick={() => window.open(rolePath("chat"), "_blank")} title="Open in new tab">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </button>
                  <button className="cw-new-btn" onClick={openNewChat}>+ New</button>
                </div>
              </div>
              <div className="cw-conversation-list">
                {conversations.length === 0 && (
                  <p className="cw-empty-text">No conversations yet</p>
                )}
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`cw-conversation-item ${activeConversation?.id === conv.id ? "active" : ""}`}
                    onClick={() => { loadConversation(conv.id); setShowNewChat(false); }}
                  >
                    <div className="cw-conv-info">
                      <div className="cw-conv-subject">
                        {conv.subject || conv.project?.title || "Untitled"}
                      </div>
                      <div className="cw-conv-project">{conv.project?.title}</div>
                      {conv.latest_message && (
                        <div className="cw-conv-preview">
                          <span className="cw-preview-sender">{conv.latest_message.user?.name}: </span>
                          {conv.latest_message.body?.substring(0, 35)}
                          {conv.latest_message.body?.length > 35 ? "..." : ""}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main: Messages */}
            <div className="cw-main">
              {showNewChat ? (
                <div className="cw-new-chat-form">
                  <h4>New Conversation</h4>
                  <div className="cw-form-group">
                    <label>Subject</label>
                    <input
                      type="text"
                      value={chatSubject}
                      onChange={(e) => setChatSubject(e.target.value)}
                      placeholder="Optional subject"
                    />
                  </div>
                  <div className="cw-link-to-section">
                    <label className="cw-link-to-label">Link to (optional)</label>
                    <div className="cw-link-to-row">
                      <label className="cw-link-toggle">
                        <input type="checkbox" checked={linkProject} onChange={(e) => { setLinkProject(e.target.checked); if (!e.target.checked) setSelectedProject(""); }} />
                        <span>Project</span>
                      </label>
                      {linkProject && (
                        <select className="cw-link-select" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
                          <option value="">Select project</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="cw-link-to-row">
                      <label className="cw-link-toggle">
                        <input type="checkbox" checked={linkTask} onChange={(e) => { setLinkTask(e.target.checked); if (!e.target.checked) setSelectedTask(""); }} />
                        <span>Task</span>
                      </label>
                      {linkTask && (
                        <select className="cw-link-select" value={selectedTask} onChange={(e) => setSelectedTask(e.target.value)}>
                          <option value="">Select task</option>
                          {tasks.map((t) => (
                            <option key={t.id} value={t.id}>{t.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="cw-link-to-row">
                      <label className="cw-link-toggle">
                        <input type="checkbox" checked={linkSubtask} onChange={(e) => { setLinkSubtask(e.target.checked); if (!e.target.checked) setSelectedSubtask(""); }} />
                        <span>Subtask</span>
                      </label>
                      {linkSubtask && (
                        <select className="cw-link-select" value={selectedSubtask} onChange={(e) => setSelectedSubtask(e.target.value)}>
                          <option value="">Select subtask</option>
                          {subtasks.map((d) => (
                            <option key={d.id} value={d.id}>{d.title}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                  <div className="cw-form-group">
                    <label>Participants *</label>
                    <div className="cw-user-checkboxes">
                      {users.map((u) => (
                        <label key={u.id} className="cw-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedUsers.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUsers((prev) => [...prev, u.id]);
                              } else {
                                setSelectedUsers((prev) => prev.filter((id) => id !== u.id));
                              }
                            }}
                          />
                          {u.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="cw-form-group">
                    <label>First Message *</label>
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type your first message..."
                      rows={2}
                    />
                  </div>
                  <div className="cw-form-actions">
                    <button className="cw-btn-cancel" onClick={() => setShowNewChat(false)}>Cancel</button>
                    <button className="cw-btn-primary" onClick={handleCreateConversation}>Create</button>
                  </div>
                </div>
              ) : activeConversation ? (
                <>
                  <div className="cw-chat-header">
                    <div>
                      <h4>{activeConversation.subject || activeConversation.project?.title || "Conversation"}</h4>
                      <span className="cw-participants">
                        {activeConversation.participants?.map((p) => p.name).join(", ")}
                      </span>
                    </div>
                  </div>
                  <div className="cw-messages">
                    {messages.length === 0 && (
                      <p className="cw-no-msgs">No messages yet</p>
                    )}
                    {messages.map((msg) => (
                      <div key={msg.id} className={`cw-message ${msg.user_id === user.id ? "own" : "other"}`}>
                        <div className="cw-msg-avatar">
                          {msg.user?.name?.charAt(0) || "?"}
                        </div>
                        <div className="cw-msg-content">
                          <div className="cw-msg-header">
                            <span className="cw-msg-sender">{msg.user?.name}</span>
                            <span className="cw-msg-time">{formatTime(msg.created_at)}</span>
                          </div>
                          <div className="cw-msg-body">{msg.body}</div>
                          {msg.file_name && (
                            <div className="cw-msg-file">
                              <a href={`${API_URL}/messages/${msg.id}/file?token=${authToken()}`} target="_blank" rel="noopener noreferrer">
                                📎 {msg.file_name}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="cw-input-area">
                    <textarea
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      rows={1}
                      disabled={sending}
                    />
                    <button onClick={handleSendMessage} disabled={sending || !newMessage.trim()} className="cw-send-btn">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="cw-empty-state">
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

export default ChatWidget;
