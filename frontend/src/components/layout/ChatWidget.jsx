import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Calendar, CalendarDays, MessageSquare, X } from "lucide-react";
import API_URL from "../../config/api";
import { authToken, getCurrentRole, rolePath } from "../../utils/auth";
import { useNotification } from "../../context/NotificationContext";
import RichTextEditor from "../RichTextEditor";
import CustomSelect from "../CustomSelect";
import "./ChatWidget.css";

function ChatFileImage({ msgId, fileName }) {
  const [src, setSrc] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/messages/${msgId}/file`, {
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
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img src={src} alt={fileName} className="cw-message-image-preview" />
    </a>
  );
}

function ChatWidget() {
  const navigate = useNavigate();
  const notify = useNotification();
  const [isOpen, setIsOpen] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
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
  const [participantSearch, setParticipantSearch] = useState("");
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const participantDropdownRef = useRef(null);
  const participantSearchRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const user = JSON.parse(localStorage.getItem(`user_${getCurrentRole()}`) || "{}");
  const speedDialTimeoutRef = useRef(null);

  const handleFabMouseEnter = () => {
    if (speedDialTimeoutRef.current) {
      clearTimeout(speedDialTimeoutRef.current);
      speedDialTimeoutRef.current = null;
    }
    setSpeedDialOpen(true);
  };

  const handleFabMouseLeave = () => {
    if (speedDialTimeoutRef.current) {
      clearTimeout(speedDialTimeoutRef.current);
    }
    speedDialTimeoutRef.current = setTimeout(() => {
      setSpeedDialOpen(false);
    }, 200);
  };

  const handleActionsMouseEnter = () => {
    if (speedDialTimeoutRef.current) {
      clearTimeout(speedDialTimeoutRef.current);
      speedDialTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (speedDialTimeoutRef.current) {
        clearTimeout(speedDialTimeoutRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    function handleClickOutside(e) {
      if (participantDropdownRef.current && !participantDropdownRef.current.contains(e.target)) {
        setShowParticipantDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(participantSearch.toLowerCase())
  );

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
    <div
      className="fab-speed-dial-container"
      onMouseLeave={handleFabMouseLeave}
    >
      {/* Vertically Stacked Speed Dial Actions */}
      <div
        className={`fab-speed-dial-actions ${speedDialOpen ? "fab-speed-dial-actions--open" : ""}`}
        onMouseEnter={handleActionsMouseEnter}
        onMouseLeave={handleFabMouseLeave}
      >
        {/* 1. Events */}
        <button
          type="button"
          className="fab-action-item"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setSpeedDialOpen(false);
            navigate(rolePath("events"));
          }}
          title="Events"
        >
          <span className="fab-action-label">Events</span>
          <div className="fab-action-btn">
            <Calendar size={18} />
          </div>
        </button>

        {/* 2. Calendar */}
        <button
          type="button"
          className="fab-action-item"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setSpeedDialOpen(false);
            navigate(rolePath("calendar"));
          }}
          title="Calendar"
        >
          <span className="fab-action-label">Calendar</span>
          <div className="fab-action-btn">
            <CalendarDays size={18} />
          </div>
        </button>

        {/* 3. Chat */}
        <button
          type="button"
          className="fab-action-item"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setIsOpen((prev) => !prev);
            setSpeedDialOpen(false);
          }}
          title="Chat"
        >
          <span className="fab-action-label">Chat</span>
          <div className="fab-action-btn">
            <MessageSquare size={18} />
          </div>
        </button>
      </div>

      {/* Main Plus (+) Trigger Button */}
      <button
        type="button"
        className={`fab-main-btn ${(speedDialOpen || isOpen) ? "fab-main-btn--open" : ""}`}
        onMouseEnter={handleFabMouseEnter}
        onMouseLeave={handleFabMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (isOpen) {
            setIsOpen(false);
            setSpeedDialOpen(false);
          } else {
            setSpeedDialOpen((prev) => !prev);
          }
        }}
        aria-label="Speed Dial Menu"
      >
        <Plus size={26} style={{ transition: "transform 0.3s ease", transform: (speedDialOpen || isOpen) ? "rotate(45deg)" : "rotate(0deg)" }} />
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
                  <button
                    type="button"
                    className="cw-close-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsOpen(false);
                      setSpeedDialOpen(false);
                    }}
                    title="Close Chat Drawer"
                  >
                    <X size={18} />
                  </button>
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
                        <CustomSelect
                          value={selectedProject}
                          onChange={(val) => setSelectedProject(val)}
                          options={projects.map((p) => ({ value: p.id, label: p.title }))}
                          placeholder="Select project"
                        />
                      )}
                    </div>
                    <div className="cw-link-to-row">
                      <label className="cw-link-toggle">
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
                    <div className="cw-link-to-row">
                      <label className="cw-link-toggle">
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
                  <div className="cw-form-group" ref={participantDropdownRef}>
                    <label>Participants *</label>
                    <div className="cw-participant-dropdown">
                      <button
                        type="button"
                        className="cw-participant-trigger"
                        onClick={() => {
                          setShowParticipantDropdown((p) => !p);
                          setTimeout(() => participantSearchRef.current?.focus(), 0);
                        }}
                      >
                        {selectedUsers.length === 0
                          ? "Select participants..."
                          : `${selectedUsers.length} selected`}
                        <span className="cw-participant-trigger-arrow">{showParticipantDropdown ? "\u25B2" : "\u25BC"}</span>
                      </button>
                      {showParticipantDropdown && (
                        <div className="cw-participant-menu">
                          <input
                            ref={participantSearchRef}
                            type="text"
                            className="cw-participant-search"
                            placeholder="Search participants..."
                            value={participantSearch}
                            onChange={(e) => {
                              setParticipantSearch(e.target.value);
                              setHighlightedIndex(-1);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowDown") {
                                e.preventDefault();
                                setHighlightedIndex((prev) =>
                                  prev < filteredUsers.length - 1 ? prev + 1 : 0
                                );
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                setHighlightedIndex((prev) =>
                                  prev > 0 ? prev - 1 : filteredUsers.length - 1
                                );
                              } else if (e.key === "Enter") {
                                e.preventDefault();
                                if (highlightedIndex >= 0 && highlightedIndex < filteredUsers.length) {
                                  const u = filteredUsers[highlightedIndex];
                                  setSelectedUsers((prev) =>
                                    prev.includes(u.id)
                                      ? prev.filter((id) => id !== u.id)
                                      : [...prev, u.id]
                                  );
                                }
                              } else if (e.key === "Escape") {
                                setShowParticipantDropdown(false);
                              }
                            }}
                          />
                          <div className="cw-participant-list">
                            {filteredUsers.map((u, idx) => (
                                <label
                                  key={u.id}
                                  className={`cw-participant-option${highlightedIndex === idx ? " highlighted" : ""}`}
                                  onMouseEnter={() => setHighlightedIndex(idx)}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedUsers.includes(u.id)}
                                    onChange={() => {
                                      setSelectedUsers((prev) =>
                                        prev.includes(u.id)
                                          ? prev.filter((id) => id !== u.id)
                                          : [...prev, u.id]
                                      );
                                    }}
                                  />
                                  {u.name}
                                </label>
                              ))}
                            {filteredUsers.length === 0 && (
                              <div className="cw-participant-empty">No users found</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    {selectedUsers.length > 0 && (
                      <div className="cw-participant-tags">
                        {users
                          .filter((u) => selectedUsers.includes(u.id))
                          .map((u) => (
                            <span key={u.id} className="cw-participant-tag">
                              {u.name}
                              <button
                                type="button"
                                className="cw-participant-tag-remove"
                                onClick={() =>
                                  setSelectedUsers((prev) => prev.filter((id) => id !== u.id))
                                }
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                  <div className="cw-form-group">
                    <label>First Message *</label>
                    <RichTextEditor value={newMessage} onChange={setNewMessage} placeholder="Type your first message..." />
                  </div>
                  <div className="cw-form-actions">
                    <button className="cw-btn-cancel" onClick={() => setShowNewChat(false)}>Cancel</button>
                    <button className="cw-btn-primary" onClick={handleCreateConversation}>Create</button>
                  </div>
                </div>
              ) : activeConversation ? (
                <>
                  <div className="cw-chat-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h4>{activeConversation.subject || activeConversation.project?.title || "Conversation"}</h4>
                      <span className="cw-participants">
                        {activeConversation.participants?.map((p) => p.name).join(", ")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="cw-close-btn"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsOpen(false);
                        setSpeedDialOpen(false);
                      }}
                      title="Close Chat Drawer"
                    >
                      <X size={18} />
                    </button>
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
                          <div className="cw-msg-body rte-display" dangerouslySetInnerHTML={{ __html: msg.body }} />
                          {msg.file_name && (
                            <div className="cw-msg-file">
                              {msg.file_name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                                <ChatFileImage msgId={msg.id} fileName={msg.file_name} />
                              ) : (
                                <button
                                  className="cw-file-download-btn"
                                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#7c3aed", textAlign: "left" }}
                                  onClick={async () => {
                                    try {
                                      const token = authToken();
                                      const res = await fetch(`${API_URL}/messages/${msg.id}/file`, {
                                        headers: { Authorization: `Bearer ${token}` },
                                      });
                                      if (!res.ok) {
                                        const err = await res.json().catch(() => null);
                                        alert(err?.message || "Failed to download file");
                                        return;
                                      }
                                      const blob = await res.blob();
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = msg.file_name;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                      URL.revokeObjectURL(url);
                                    } catch (err) {
                                      console.error("Download failed:", err);
                                    }
                                  }}
                                >
                                  📎 {msg.file_name}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="cw-input-area">
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: "none" }} />
                    {selectedFile && (
                      <div className="cw-file-preview-bar">
                        {filePreview ? (
                          <img src={filePreview} alt="Preview" className="cw-file-thumb" />
                        ) : (
                          <span className="cw-file-name-label">📎 {selectedFile.name}</span>
                        )}
                        <button className="cw-file-remove-btn" onClick={removeSelectedFile}>✕</button>
                      </div>
                    )}
                    <div className="cw-editor-row">
                      <button className="cw-attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                      <div className="cw-editor-wrapper">
                        <RichTextEditor value={newMessage} onChange={setNewMessage} placeholder="Type a message..." />
                      </div>
                      <button onClick={handleSendMessage} disabled={sending || (!newMessage.replace(/<[^>]*>/g, "").trim() && !selectedFile)} className="cw-send-btn">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    </div>
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
