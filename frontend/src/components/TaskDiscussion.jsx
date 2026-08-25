import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  Pencil,
  Trash2,
  Paperclip,
  ChevronDown,
  ChevronUp,
  X,
  FileText,
} from "lucide-react";
import API_URL from "../config/api";
import { authToken, getUser } from "../utils/auth";
import RichTextEditor from "./RichTextEditor";
import ConfirmModal from "./ConfirmModal";

const API_BASE = API_URL.replace(/\/api\/?$/, "");

function fileUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return API_BASE + url;
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  const b = parseInt(bytes, 10);
  if (isNaN(b)) return bytes;
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts[1]?.[0] || "";
  return (a + b).toUpperCase() || a.toUpperCase();
}

function roleLabel(role) {
  if (!role) return "";
  if (role === "team_lead") return "Team Lead";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function renderCommentBody(text) {
  if (!text) return null;
  if (text.includes("<p>") || text.includes("<div>") || text.includes("<span>")) {
    return text;
  }
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");
  html = html.replace(/~~(.+?)~~/g, "<s>$1</s>");
  html = html.replace(/\{color:([^}]+)\}(.+?)\{\/color\}/g, '<span style="color:$1">$2</span>');
  html = html.replace(/\{highlight:([^}]+)\}(.+?)\{\/highlight\}/g, '<mark style="background:$1">$2</mark>');
  html = html.replace(/\n/g, "<br/>");
  html = html.replace(
    /@(\w+(?:\s\w+)?)/g,
    '<span class="td-comment-mention">@$1</span>'
  );
  return html;
}

function CommentItem({
  comment,
  commentsEndpoint,
  commentDeleteEndpoint,
  commentUpdateEndpoint,
  commentFileEndpoint,
  currentUser,
  onDelete,
  onEdit,
  depth,
}) {
  const [showReplies, setShowReplies] = useState(depth === 0);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body || "");
  const [editSending, setEditSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const menuRef = useRef(null);

  const isOwner =
    currentUser && parseInt(comment.user?.id || comment.user_id, 10) === parseInt(currentUser.id, 10);
  const canEdit = isOwner || currentUser?.role === "admin" || currentUser?.role === "manager";

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setReplySending(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("body", replyText.trim());
      formData.append("parent_id", comment.id);

      const res = await fetch(commentsEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReplyText("");
        setReplyOpen(false);
        onEdit();
      }
    } catch (err) { console.error("Reply failed:", err); }
    setReplySending(false);
  };

  const handleEdit = async () => {
    if (!editText.trim()) return;
    setEditSending(true);
    try {
      const token = authToken();
      const res = await fetch(commentUpdateEndpoint(comment.id), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: editText.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEditing(false);
        onEdit();
      }
    } catch (err) { console.error("Edit failed:", err); }
    setEditSending(false);
  };

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
    setShowMenu(false);
  };

  const confirmDelete = () => {
    onDelete(comment.id);
    setDeleteConfirmOpen(false);
  };

  const replies = comment.replies || [];
  const isReply = depth > 0;

  return (
    <div className={`td-comment ${isReply ? "td-comment--reply" : ""}`}>
      <div className="td-comment-avatar">
        {comment.user?.avatar ? (
          <img
            src={fileUrl(comment.user.avatar)}
            alt={comment.user?.name}
            className="td-comment-avatar-img"
          />
        ) : (
          <div className="td-comment-avatar-fallback">
            {initials(comment.user?.name)}
          </div>
        )}
      </div>
      <div className="td-comment-body">
        <div className="td-comment-header">
          <span className="td-comment-author">{comment.user?.name || "Unknown"}</span>
          <span className="td-comment-role">{roleLabel(comment.user?.role)}</span>
          <span className="td-comment-time" title={formatDateTime(comment.created_at)}>
            {timeAgo(comment.created_at)}
          </span>
          {comment.is_edited && (
            <span className="td-comment-edited">(edited)</span>
          )}
          {canEdit && !editing && (
            <div className="td-comment-actions" ref={menuRef}>
              <button
                className="td-comment-menu-btn"
                onClick={() => setShowMenu(!showMenu)}
                title="More actions"
              >
                ...
              </button>
              {showMenu && (
                <div className="td-comment-dropdown">
                  {isOwner && (
                    <button
                      onClick={() => {
                        setEditing(true);
                        setShowMenu(false);
                      }}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  )}
                  {canEdit && (
                    <button className="td-comment-dropdown-danger" onClick={handleDelete}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {editing ? (
          <div className="td-comment-edit-box">
            <textarea
              className="td-comment-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="td-comment-edit-actions">
              <button
                className="td-comment-edit-cancel"
                onClick={() => {
                  setEditing(false);
                  setEditText(comment.body);
                }}
                disabled={editSending}
              >
                Cancel
              </button>
              <button
                className="td-comment-edit-save"
                onClick={handleEdit}
                disabled={editSending || !editText.trim()}
              >
                {editSending ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="td-comment-text"
            dangerouslySetInnerHTML={{ __html: renderCommentBody(comment.body) }}
          />
        )}

        {comment.file_name && (
          <div className="td-comment-attachment">
            <FileText size={14} />
            <button
              className="td-comment-attachment-link"
              onClick={async () => {
                try {
                  const token = authToken();
                  const res = await fetch(`${API_URL}/comments/${comment.id}/file`, {
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
                  a.download = comment.file_name;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error("Download failed:", err);
                }
              }}
            >
              {comment.file_name}
            </button>
            {comment.file_size && (
              <span className="td-comment-attachment-size">
                ({formatFileSize(comment.file_size)})
              </span>
            )}
          </div>
        )}

        {!isReply && (
          <div className="td-comment-footer">
            <button
              className="td-comment-reply-btn"
              onClick={() => setReplyOpen(!replyOpen)}
            >
              Reply
              {replies.length > 0 && (
                <span className="td-comment-reply-count">{replies.length}</span>
              )}
            </button>
            {replies.length > 0 && (
              <button
                className="td-comment-toggle-replies"
                onClick={() => setShowReplies(!showReplies)}
              >
                {showReplies ? (
                  <>
                    <ChevronUp size={14} /> Hide replies
                  </>
                ) : (
                  <>
                    <ChevronDown size={14} /> Show {replies.length}{" "}
                    {replies.length === 1 ? "reply" : "replies"}
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {replyOpen && (
          <div className="td-comment-reply-input">
            <textarea
              className="td-comment-textarea"
              placeholder={`Reply to ${comment.user?.name || "comment"}...`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleReply();
                }
              }}
            />
            <div className="td-comment-reply-actions">
              <button
                className="td-comment-reply-cancel"
                onClick={() => {
                  setReplyOpen(false);
                  setReplyText("");
                }}
                disabled={replySending}
              >
                Cancel
              </button>
              <button
                className="td-comment-reply-send"
                onClick={handleReply}
                disabled={replySending || !replyText.trim()}
              >
                {replySending ? "Sending..." : "Reply"}
              </button>
            </div>
          </div>
        )}

        {showReplies && replies.length > 0 && (
          <div className="td-comment-replies">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                commentsEndpoint={commentsEndpoint}
                commentDeleteEndpoint={commentDeleteEndpoint}
                commentUpdateEndpoint={commentUpdateEndpoint}
                commentFileEndpoint={commentFileEndpoint}
                currentUser={currentUser}
                onDelete={onDelete}
                onEdit={onEdit}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Delete Comment"
        message="Are you sure you want to delete this comment? This action cannot be undone."
        confirmText="Delete"
        danger
      />
    </div>
  );
}

export default function TaskDiscussion({ taskId, deliverableId, entityType, readOnly }) {
  const isDeliverable = entityType === "deliverable" && deliverableId;
  const commentsEndpoint = isDeliverable
    ? `${API_URL}/deliverables/${deliverableId}/comments`
    : `${API_URL}/tasks/${taskId}/comments`;
  const participantsEndpoint = isDeliverable
    ? `${API_URL}/deliverables/${deliverableId}/comments-participants`
    : `${API_URL}/tasks/${taskId}/comments-participants`;
  const commentDeleteEndpoint = (id) =>
    `${API_URL}/comments/${id}`;
  const commentUpdateEndpoint = (id) =>
    `${API_URL}/comments/${id}`;
  const commentFileEndpoint = (id) =>
    `${API_URL}/comments/${id}/file`;
  const [comments, setComments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const commentsEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const quillRef = useRef(null);
  const currentUser = getUser();

  const fetchComments = useCallback(
    async (pageNum = 1, append = false) => {
      try {
        setLoading(true);
        const token = authToken();
        const res = await fetch(
          `${commentsEndpoint}?page=${pageNum}&per_page=50`,
          {
            headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
          }
        );
        if (res.ok) {
          const data = await res.json();
          if (append) {
            setComments((prev) => [...prev, ...(data.comments || [])]);
          } else {
            setComments(data.comments || []);
          }
          setTotal(data.total || 0);
          setHasMore(pageNum < (data.total_pages || 1));
        }
      } catch (err) { console.error("Failed to load comments:", err); }
      setLoading(false);
    },
    [commentsEndpoint]
  );

  const fetchParticipants = useCallback(async () => {
    try {
      const token = authToken();
      const res = await fetch(participantsEndpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setParticipants(data.participants || []);
      }
    } catch (err) { console.error("Failed to load participants:", err); }
  }, [participantsEndpoint]);

  useEffect(() => {
    if (taskId || deliverableId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchComments(1);
      fetchParticipants();
    }
  }, [taskId, deliverableId, fetchComments, fetchParticipants]);

  const handlePost = async () => {
    const stripped = newComment.replace(/<[^>]*>/g, "").trim();
    if (!stripped && !file) return;
    setSending(true);
    try {
      const token = authToken();
      const formData = new FormData();
      formData.append("body", newComment.trim());
      if (file) {
        formData.append("file", file);
      }

      const res = await fetch(commentsEndpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNewComment("");
        setFile(null);
        setFileName("");
        fetchComments(1);
      }
    } catch (err) { console.error("Post comment failed:", err); }
    setSending(false);
  };

  const handleDelete = async (commentId) => {
    try {
      const token = authToken();
      const res = await fetch(commentDeleteEndpoint(commentId), {
        method: "DELETE",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchComments(1);
        setPage(1);
      }
    } catch (err) { console.error("Delete comment failed:", err); }
  };

  const handleRefresh = () => {
    fetchComments(1);
    setPage(1);
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchComments(nextPage, true);
  };

  const handleQuillChange = (value, delta, source, editor) => {
    setNewComment(value);
    const text = editor.getText();
    const cursorPos = editor.getSelection()?.index || 0;
    const textBeforeCursor = text.substring(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1].toLowerCase());
      setShowMentions(true);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (participant) => {
    const quill = quillRef.current?.getQuill();
    if (!quill) return;
    const cursorPos = quill.getSelection()?.index || quill.getLength() - 1;
    const textBeforeCursor = quill.getText(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      const atIndex = cursorPos - atMatch[0].length;
      quill.deleteText(atIndex, atMatch[0].length);
      quill.insertText(atIndex, `@${participant.name} `, { bold: false });
      quill.setSelection(atIndex + participant.name.length + 2);
    }
    setShowMentions(false);
  };

  const filteredParticipants = participants.filter(
    (p) =>
      p.id !== currentUser?.id &&
      (p.name || "").toLowerCase().includes(mentionQuery)
  );

  const handleFileSelect = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      if (selected.size > 20 * 1024 * 1024) {
        alert("File size must be less than 20MB");
        return;
      }
      setFile(selected);
      setFileName(selected.name);
    }
  };

  const removeFile = () => {
    setFile(null);
    setFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="td-discussion">
      <div className="td-discussion-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="td-discussion-title">
          <MessageSquare size={18} />
          <h3>Task Discussion</h3>
          {total > 0 && (
            <span className="td-discussion-count">{total}</span>
          )}
        </div>
        <button className="td-discussion-toggle" title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="td-discussion-content">
          {loading && comments.length === 0 ? (
            <div className="td-discussion-loading">Loading discussion...</div>
          ) : comments.length === 0 ? (
            <div className="td-discussion-empty">
              <MessageSquare size={40} strokeWidth={1.5} />
              <p>No discussions yet.</p>
              <span>Start the conversation regarding this task.</span>
            </div>
          ) : (
            <div className="td-discussion-list">
              {hasMore && (
                <button className="td-discussion-load-more" onClick={loadMore}>
                  Load older comments
                </button>
              )}
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  commentsEndpoint={commentsEndpoint}
                  commentDeleteEndpoint={commentDeleteEndpoint}
                  commentUpdateEndpoint={commentUpdateEndpoint}
                  commentFileEndpoint={commentFileEndpoint}
                  currentUser={currentUser}
                  onDelete={handleDelete}
                  onEdit={handleRefresh}
                  depth={0}
                />
              ))}
              <div ref={commentsEndRef} />
            </div>
          )}

          {!readOnly && (
            <div className="td-discussion-input-area">
              {showMentions && filteredParticipants.length > 0 && (
                <div className="td-mention-dropdown">
                  {filteredParticipants.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      className="td-mention-item"
                      onClick={() => insertMention(p)}
                    >
                      <div className="td-mention-avatar">
                        {p.avatar ? (
                          <img src={fileUrl(p.avatar)} alt={p.name} />
                        ) : (
                          initials(p.name)
                        )}
                      </div>
                      <div className="td-mention-info">
                        <span className="td-mention-name">{p.name}</span>
                        <span className="td-mention-role">{roleLabel(p.role)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {fileName && (
                <div className="td-comment-file-preview">
                  <Paperclip size={14} />
                  <span className="td-comment-file-name">{fileName}</span>
                  <button className="td-comment-file-remove" onClick={removeFile}>
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="td-discussion-input-wrapper">
                <RichTextEditor
                  ref={quillRef}
                  value={newComment}
                  onChange={handleQuillChange}
                  placeholder="Write a comment..."
                  style={{ height: "auto" }}
                />
                <div className="td-discussion-send-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="td-discussion-file-input"
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.avi"
                  />
                  <button
                    className="td-discussion-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                  >
                    <Paperclip size={16} />
                  </button>
                  <button
                    className="td-discussion-send-btn"
                    onClick={handlePost}
                    disabled={sending || (!newComment.replace(/<[^>]*>/g, "").trim() && !file)}
                  >
                    {sending ? (
                      "Sending..."
                    ) : (
                      <>
                        <Send size={14} /> Send
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
