import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import DashboardLayout from "../components/layout/DashboardLayout";
import Breadcrumb from "../components/Breadcrumb";
import { authToken, rolePath, getUser } from "../utils/auth";
import API_URL from "../config/api";
import {
  MdArrowBack,
  MdTimeline,
  MdDownload,
  MdSend,
} from "react-icons/md";
import DOMPurify from "dompurify";
import "./FeedbackCenter.css";

export default function FeedbackDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);

  const [detailData, setDetailData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendError, setSendError] = useState("");

  const currentUser = getUser();

  const getStatusClass = (st) => {
    if (!st) return "fbc-status-new";
    const s = st.toLowerCase();
    if (s === "new") return "fbc-status-new";
    if (s === "under review") return "fbc-status-review";
    if (s === "accepted") return "fbc-status-accepted";
    if (s === "planned") return "fbc-status-planned";
    if (s === "in development") return "fbc-status-dev";
    if (s === "testing") return "fbc-status-testing";
    if (s === "resolved") return "fbc-status-resolved";
    if (s === "closed") return "fbc-status-closed";
    if (s === "rejected") return "fbc-status-rejected";
    return "fbc-status-new";
  };

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    const token = authToken();

    Promise.all([
      fetch(`${API_URL}/feedback/${id}`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : null)),
      fetch(`${API_URL}/feedback/${id}/messages`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      }).then((res) => (res.ok ? res.json() : { messages: [] })),
    ])
      .then(([detailRes, msgRes]) => {
        if (detailRes && detailRes.success) {
          setDetailData(detailRes.data);
        }
        if (msgRes && msgRes.messages) {
          setMessages(msgRes.messages);
        }
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    const el = chatEndRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      try {
        const token = authToken();
        const res = await fetch(`${API_URL}/feedback/${id}/messages`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.messages) setMessages(json.messages);
        }
      } catch (e) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !id) return;

    setSendingReply(true);
    setSendError("");
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/feedback/${id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: replyText }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setMessages((prev) => [...prev, json.data]);
        setReplyText("");
        setSendError("");
      } else {
        setSendError(json.message || "Failed to send message.");
      }
    } catch (err) {
      console.error("Send message error:", err);
      setSendError("Network error. Please try again.");
    } finally {
      setSendingReply(false);
    }
  };

  const statusLogsFromMessages = (messages || []).filter((msg) => {
    const d = (msg.message || "").toLowerCase();
    return d.includes("status changed") || d.includes("status set");
  }).map((msg) => ({
    id: "msg-" + msg.id,
    details: msg.message,
    user: msg.user || null,
    created_at: msg.created_at,
  }));

  const statusLogsFromActivity = (detailData?.activity_logs || []).filter((log) => {
    const d = (log.details || "").toLowerCase();
    return d.includes("status changed") || d.includes("status set") || d.includes("submitted");
  });

  const statusLogs = [...statusLogsFromMessages, ...statusLogsFromActivity]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .filter((log, idx, arr) => {
      if (idx === 0) return true;
      const prev = arr[idx - 1];
      return !(log.details === prev.details && log.created_at === prev.created_at);
    });

  const isSupport = currentUser && ["admin", "manager"].includes(currentUser.role);

  return (
    <DashboardLayout>
      <div className="fbc-page">
        <Breadcrumb
          items={[
            { label: "Dashboard", path: rolePath("dashboard") },
            { label: "Feedback", path: rolePath("feedback") },
            { label: detailData?.reference_number || "Detail" },
          ]}
        />

        <div className="fbc-detail-page">
          <div className="fbc-detail-page-header">
            <button className="fb-btn-cancel" onClick={() => navigate(rolePath("feedback"))}>
              <MdArrowBack size={18} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0, color: "#0f172a", whiteSpace: "nowrap" }}>
                <span style={{ fontSize: "1rem", fontWeight: 700 }}>Feedback</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#64748b", marginLeft: 8 }}>{detailData?.reference_number || `#${id}`}</span>
              </h3>
              <span className={`fbc-badge ${getStatusClass(detailData?.status)}`}>
                {detailData?.status}
              </span>
            </div>
          </div>

          {isLoading || !detailData ? (
            <div className="fbc-detail-page-body" style={{ padding: 40, textAlign: "center" }}>
              Loading detailed record...
            </div>
          ) : (
            <div className="fbc-detail-two-col">
              {/* LEFT — Main Content */}
              <div className="fbc-detail-left">
                {detailData.rating > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: "#fffbe6", border: "1px solid #ffe58f", padding: "10px 14px", borderRadius: 8 }}>
                    <strong style={{ color: "#873800", fontSize: "0.88rem" }}>Feature Rating:</strong>
                    <div style={{ color: "#faad14", fontSize: "1.2rem", display: "flex", gap: 2 }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span key={s} style={{ color: s <= detailData.rating ? "#faad14" : "#d9d9d9" }}>★</span>
                      ))}
                    </div>
                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#d48806", marginLeft: 4 }}>
                      ({detailData.rating} / 5 Stars)
                    </span>
                  </div>
                )}

                <h4 style={{ margin: "0 0 8px 0", color: "#0f172a" }}>
                  {detailData.subject}
                </h4>
                <div className="fbc-section-title" style={{ marginTop: 0 }}>Description</div>
                <div
                  className="rte-display"
                  style={{ background: "#f8fafc", padding: 14, borderRadius: 8, border: "1px solid #e2e8f0", margin: "0 0 16px 0" }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(detailData.description || "") }}
                />

                {(detailData.screenshot_path || detailData.recording_path || detailData.attachment_path) && (
                  <>
                    <div className="fbc-section-title">
                      <MdDownload /> Downloadable Media Attachments
                    </div>
                    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                      {detailData.screenshot_path && (
                        <a href={detailData.screenshot_url || `/storage/${detailData.screenshot_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                          View Screenshot
                        </a>
                      )}
                      {detailData.recording_path && (
                        <a href={detailData.recording_url || `/storage/${detailData.recording_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                          View Recording
                        </a>
                      )}
                      {detailData.attachment_path && (
                        <a href={detailData.attachment_url || `/storage/${detailData.attachment_path}`} target="_blank" rel="noreferrer" className="fb-btn-cancel" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
                          View Attachment
                        </a>
                      )}
                    </div>
                  </>
                )}

                {/* Chat Conversation */}
                <div className="fbc-section-title">
                  Conversation
                </div>
                <div className="fbc-chat-container">
                  <div className="fbc-chat-messages">
                    {loadingMessages ? (
                      <div style={{ textAlign: "center", padding: 16, color: "#64748b", fontSize: "0.82rem" }}>Loading messages...</div>
                    ) : messages.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 16, color: "#64748b", fontSize: "0.82rem" }}>No messages yet. Start a conversation below.</div>
                    ) : (
                      messages.map((msg) => {
                        const d = (msg.message || "").toLowerCase();
                        if (d.includes("status changed") || d.includes("status set")) return null;
                        const isMine = msg.sender_type === "organization";
                        return (
                          <div key={msg.id} className={`fbc-chat-bubble ${isMine ? "fbc-chat-mine" : "fbc-chat-theirs"}`}>
                            <div className="fbc-chat-bubble-text">{msg.message}</div>
                            <div className="fbc-chat-bubble-meta">
                              {isMine ? (msg.user?.name || "You") : (msg.user?.name || "Support")} · {new Date(msg.created_at).toLocaleString()}
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {detailData.status !== "Closed" && (
                    <>
                    {sendError && (
                      <div style={{ padding: "8px 16px", background: "#fef2f2", color: "#dc2626", fontSize: "0.8rem", borderRadius: 6, marginBottom: 8 }}>
                        {sendError}
                      </div>
                    )}
                    <form className="fbc-chat-input" onSubmit={handleSendReply}>
                      <input
                        type="text"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={isSupport ? "Reply to user..." : "Type your message..."}
                        disabled={sendingReply}
                      />
                      <button type="submit" disabled={!replyText.trim() || sendingReply} className="fb-btn-submit">
                        <MdSend size={16} />
                      </button>
                    </form>
                    </>
                  )}
                </div>
              </div>

              {/* RIGHT — Status Timeline */}
              <div className="fbc-detail-right">
                <div className="fbc-sidebar-card">
                  <div className="fbc-sidebar-card-header">
                    <MdTimeline /> Status Timeline
                  </div>
                  <ul className="fbc-timeline">
                    {statusLogs.length > 0 ? (
                      statusLogs.map((log) => (
                        <li key={log.id} className="fbc-timeline-item">
                          <div className="fbc-timeline-dot" />
                          <div className="fbc-timeline-content">
                            <span style={{ fontSize: "0.82rem", color: "#334155" }}>{log.details}</span>
                            <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: 4 }}>
                              {log.user?.name || "System"}
                            </div>
                            <span className="fbc-timeline-time">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                        </li>
                      ))
                    ) : (
                      <div style={{ fontSize: "0.82rem", color: "#64748b", padding: "8px 0" }}>No status changes recorded yet.</div>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
