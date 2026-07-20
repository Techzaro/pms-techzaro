import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import API_URL from "../config/api";
import { authToken, getCurrentRole, rolePath } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import DashboardLayout from "../components/layout/DashboardLayout";
import RichTextEditor from "../components/RichTextEditor";
import CustomSelect from "../components/CustomSelect";
import "./Chat.css";

function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const notify = useNotification();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
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
  const [participantSearch, setParticipantSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const user = JSON.parse(localStorage.getItem(`user_${getCurrentRole()}`) || "{}");

  useEffect(() => {
    fetchConversations();
    if (conversationId) {
      loadConversation(conversationId);
    }
  }, [conversationId]);

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
    const cleanBody = newMessage.replace(/<[^>]*>/g, "").trim();
    if ((!cleanBody && !selectedFile) || !activeConversation) return;
    setSending(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("body", newMessage || "<p></p>");
      if (selectedFile) {
        formData.append("file", selectedFile);
      }
      const res = await fetch(`${API_URL}/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessage("");
        setSelectedFile(null);
        setFilePreview(null);
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

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => setFilePreview(ev.target.result);
        reader.readAsDataURL(file);
      } else {
        setFilePreview(null);
      }
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          navigate(rolePath(`chat/${data.conversation.id}`));
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

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <DashboardLayout hideRightSidebar>
    <div className="chat-page">
      <div className="chat-container">
        {/* Sidebar: Conversation List */}
        <div className="chat-sidebar">
          <div className="chat-sidebar-header">
            <h3>Conversations</h3>
            <button className="new-chat-btn" onClick={openNewChat}>+ New</button>
          </div>
          <div className="conversation-list">
            {conversations.length === 0 && (
              <p style={{ padding: 16, color: "#999", fontSize: 13 }}>No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeConversation?.id === conv.id ? "active" : ""}`}
                onClick={() => navigate(rolePath(`chat/${conv.id}`))}
              >
                <div className="conversation-info">
                  <div className="conversation-subject">
                    {conv.subject || conv.project?.title || conv.task?.title || conv.deliverable?.title || "Untitled"}
                  </div>
                  <div className="conversation-project">
                    {[conv.project?.title, conv.task?.title, conv.deliverable?.title].filter(Boolean).join(" / ")}
                  </div>
                  {conv.latest_message && (
                    <div className="conversation-preview">
                      <span className="preview-sender">{conv.latest_message.user?.name}: </span>
                      {conv.latest_message.body?.substring(0, 40)}
                      {conv.latest_message.body?.length > 40 ? "..." : ""}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main: Messages */}
        <div className="chat-main">
          {showNewChat ? (
            <div className="new-chat-form">
              <h3>New Conversation</h3>
              <div className="form-group">
                <label>Subject</label>
                <input
                  type="text"
                  value={chatSubject}
                  onChange={(e) => setChatSubject(e.target.value)}
                  placeholder="Optional subject"
                />
              </div>
              <div className="link-to-section">
                <label className="link-to-label">Link to (optional)</label>
                <div className="link-to-row">
                  <label className="link-toggle">
                    <input type="checkbox" checked={linkProject} onChange={(e) => { setLinkProject(e.target.checked); if (!e.target.checked) setSelectedProject(""); }} />
                    <span>Project</span>
                  </label>
                  {linkProject && (
                    <CustomSelect
                      value={selectedProject}
                      onChange={(val) => setSelectedProject(val)}
                      options={projects.map((p) => ({ value: p.id, label: p.title }))}
                      placeholder="Select project"
                    />
                  )}
                </div>
                <div className="link-to-row">
                  <label className="link-toggle">
                    <input type="checkbox" checked={linkTask} onChange={(e) => { setLinkTask(e.target.checked); if (!e.target.checked) setSelectedTask(""); }} />
                    <span>Task</span>
                  </label>
                  {linkTask && (
                    <CustomSelect
                      value={selectedTask}
                      onChange={(val) => setSelectedTask(val)}
                      options={tasks.map((t) => ({ value: t.id, label: t.title }))}
                      placeholder="Select task"
                    />
                  )}
                </div>
                <div className="link-to-row">
                  <label className="link-toggle">
                    <input type="checkbox" checked={linkSubtask} onChange={(e) => { setLinkSubtask(e.target.checked); if (!e.target.checked) setSelectedSubtask(""); }} />
                    <span>Subtask</span>
                  </label>
                  {linkSubtask && (
                    <CustomSelect
                      value={selectedSubtask}
                      onChange={(val) => setSelectedSubtask(val)}
                      options={subtasks.map((d) => ({ value: d.id, label: d.title }))}
                      placeholder="Select subtask"
                    />
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Participants *</label>
                <input
                  type="text"
                  className="participant-search"
                  placeholder="Search participants..."
                  value={participantSearch}
                  onChange={(e) => setParticipantSearch(e.target.value)}
                />
                <div className="user-checkboxes">
                  {users
                    .filter((u) => u.name.toLowerCase().includes(participantSearch.toLowerCase()))
                    .map((u) => (
                    <label key={u.id} className="checkbox-label">
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
              <div className="form-group">
                <label>First Message *</label>
                <RichTextEditor value={newMessage} onChange={setNewMessage} placeholder="Type your first message..." />
              </div>
              <div className="form-actions">
                <button className="btn-cancel" onClick={() => setShowNewChat(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateConversation}>Create</button>
              </div>
            </div>
          ) : activeConversation ? (
            <>
              <div className="chat-header">
                <div>
                  <h3>{activeConversation.subject || activeConversation.project?.title || activeConversation.task?.title || activeConversation.deliverable?.title || "Conversation"}</h3>
                  <span className="chat-participants">
                    {activeConversation.participants?.map((p) => p.name).join(", ")}
                  </span>
                </div>
              </div>
              <div className="messages-container">
                {messages.length === 0 && (
                  <p style={{ textAlign: "center", color: "#999", padding: 20 }}>No messages yet</p>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`message ${msg.user_id === user.id ? "own" : "other"}`}>
                    <div className="message-avatar">
                      {msg.user?.name?.charAt(0) || "?"}
                    </div>
                    <div className="message-content">
                      <div className="message-header">
                        <span className="message-sender">{msg.user?.name}</span>
                        <span className="message-time">{formatTime(msg.created_at)}</span>
                      </div>
                      <div className="message-body rte-display" dangerouslySetInnerHTML={{ __html: msg.body }} />
                      {msg.file_name && (
                        <div className="message-file">
                          {msg.file_name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                            <a href={`${API_URL}/messages/${msg.id}/file?token=${authToken()}`} target="_blank" rel="noopener noreferrer">
                              <img src={`${API_URL}/messages/${msg.id}/file?token=${authToken()}`} alt={msg.file_name} className="message-image-preview" />
                            </a>
                          ) : (
                            <a href={`${API_URL}/messages/${msg.id}/file?token=${authToken()}`} target="_blank" rel="noopener noreferrer">
                              📎 {msg.file_name}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <div className="message-input-area">
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
                {selectedFile && (
                  <div className="file-preview-bar">
                    {filePreview ? (
                      <img src={filePreview} alt="Preview" className="file-thumb" />
                    ) : (
                      <span className="file-name-label">📎 {selectedFile.name}</span>
                    )}
                    <button className="file-remove-btn" onClick={removeSelectedFile}>✕</button>
                  </div>
                )}
                <div className="chat-editor-row">
                  <button className="chat-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <div className="chat-editor-wrapper">
                    <RichTextEditor value={newMessage} onChange={setNewMessage} placeholder="Type a message..." style={{ height: "auto" }} />
                  </div>
                  <button onClick={handleSendMessage} disabled={sending || (!newMessage.replace(/<[^>]*>/g, "").trim() && !selectedFile)} className="send-btn">
                    {sending ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="chat-empty">
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the sidebar or start a new one.</p>
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}

export default Chat;
