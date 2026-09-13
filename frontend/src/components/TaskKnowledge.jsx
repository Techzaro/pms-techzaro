import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ExternalLink, FileText, Plus, Search, Trash2, X, Check, Eye } from "lucide-react";
import API_URL from "../config/api";
import { authToken, rolePath } from "../utils/auth";
import { publish } from "../utils/eventBus";
import ConfirmModal from "./ConfirmModal";

export default function TaskKnowledge({ task, taskId, initialKnowledgeBases = [], readOnly = false, onUpdate }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(initialKnowledgeBases);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Link Modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [allArticles, setAllArticles] = useState([]);
  const [modalSearch, setModalSearch] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [linkingId, setLinkingId] = useState(null);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const [unlinkTargetId, setUnlinkTargetId] = useState(null);

  useEffect(() => {
    if (initialKnowledgeBases && initialKnowledgeBases.length > 0) {
      setItems(initialKnowledgeBases);
    } else if (taskId) {
      fetchKnowledgeBases();
    }
  }, [taskId, initialKnowledgeBases]);

  const fetchKnowledgeBases = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/knowledge-bases`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data.knowledge_bases) ? data.knowledge_bases : [];
        setItems(list);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge bases", err);
    } finally {
      setLoading(false);
    }
  };

  const openLinkModal = async () => {
    setShowLinkModal(true);
    setModalLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/knowledge-base?per_page=100`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const docs = Array.isArray(data)
          ? data
          : data.data || data.knowledge_bases || data.articles || [];
        setAllArticles(docs);
      }
    } catch (err) {
      console.error("Failed to load all knowledge base articles", err);
    } finally {
      setModalLoading(false);
    }
  };

  const handleLink = async (kbId) => {
    setLinkingId(kbId);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/knowledge-bases`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: JSON.stringify({ knowledge_base_ids: [kbId] }),
      });
      if (res.ok) {
        const data = await res.json();
        const added = allArticles.find((a) => a.id === kbId);
        if (added) {
          setItems((prev) => [...(prev || []), added]);
        }
        if (onUpdate) onUpdate(data?.task || data);
        publish("task:updated", { taskId, type: "kb_linked" });
        setShowLinkModal(false);
      }
    } catch (err) {
      console.error("Failed to link knowledge base article", err);
    } finally {
      setLinkingId(null);
    }
  };

  const confirmUnlink = async () => {
    if (!unlinkTargetId) return;
    const kbId = unlinkTargetId;
    setUnlinkConfirmOpen(false);
    setUnlinkTargetId(null);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${taskId}/knowledge-bases/${kbId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => (prev || []).filter((k) => k.id !== kbId));
        if (onUpdate) onUpdate(data?.task || data);
        publish("task:updated", { taskId, type: "kb_unlinked" });
      }
    } catch (err) {
      console.error("Failed to unlink knowledge base", err);
    }
  };

  const filtered = items.filter((k) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (k.title || "").toLowerCase().includes(q) || (k.category || "").toLowerCase().includes(q);
  });

  const modalFiltered = allArticles.filter((k) => {
    if (!modalSearch) return true;
    const q = modalSearch.toLowerCase();
    return (k.title || "").toLowerCase().includes(q) || (k.category || "").toLowerCase().includes(q);
  });

  const linkedIds = new Set(items.map((i) => i.id));

  return (
    <div className="td-overview" style={{ padding: "20px" }}>
      <div className="td-section-header" style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <h2 className="td-section-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
          <BookOpen size={18} color="#2563eb" />
          {t("Knowledge Base", { defaultValue: "Knowledge Base" })}
          <span className="td-section-count">({items.length})</span>
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="pd-files-search" style={{ margin: 0 }}>
            <Search size={15} />
            <input
              type="text"
              placeholder={t("Search knowledge base...", { defaultValue: "Search knowledge base..." })}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!readOnly && (
            <>
              <button
                type="button"
                onClick={openLinkModal}
                className="pd-btn-tx pd-btn-tx--outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  background: "var(--bg-card, #ffffff)",
                  color: "var(--text-primary, #1e293b)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <BookOpen size={15} />
                {t("Link Document", { defaultValue: "Link Document" })}
              </button>
              <button
                type="button"
                onClick={() => navigate(rolePath("knowledge-base/create"), {
                  state: {
                    taskId: task?.id || taskId,
                    taskTitle: task?.title,
                    projectId: task?.project?.id || task?.project_id,
                    projectTitle: task?.project?.title,
                  }
                })}
                className="pd-btn-tx pd-btn-tx--primary"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  background: "var(--color-primary, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <Plus size={16} />
                {t("Add Document", { defaultValue: "Add Document" })}
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="td-muted">{t("Loading knowledge base articles...", { defaultValue: "Loading knowledge base articles..." })}</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "36px 16px", textAlign: "center", background: "var(--bg-card-alt, #f9fafb)", borderRadius: "8px", border: "1px dashed var(--border-color, #e5e7eb)" }}>
          <BookOpen size={36} style={{ color: "#9ca3af", marginBottom: "10px" }} />
          <p style={{ margin: "0 0 14px", color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
            {search ? t("No articles match your search.", { defaultValue: "No articles match your search." }) : t("No knowledge base articles linked to this task yet.", { defaultValue: "No knowledge base articles linked to this task yet." })}
          </p>
          {!readOnly && !search && (
            <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
              <button
                type="button"
                onClick={openLinkModal}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  borderRadius: "6px",
                  background: "var(--bg-card, #fff)",
                  color: "var(--color-primary, #2563eb)",
                  border: "1px solid var(--border-color, #d1d5db)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <BookOpen size={14} /> {t("Link Existing Document", { defaultValue: "Link Existing Document" })}
              </button>
              <button
                type="button"
                onClick={() => navigate(rolePath("knowledge-base/create"), {
                  state: {
                    taskId: task?.id || taskId,
                    taskTitle: task?.title,
                    projectId: task?.project?.id || task?.project_id,
                    projectTitle: task?.project?.title,
                  }
                })}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 16px",
                  borderRadius: "6px",
                  background: "var(--color-primary, #2563eb)",
                  color: "#ffffff",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={14} /> {t("Add Document", { defaultValue: "Add Document" })}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {filtered.map((k) => (
            <div
              key={k.id}
              style={{
                background: "var(--bg-card, #ffffff)",
                border: "1px solid var(--border-color, #e5e7eb)",
                borderRadius: "8px",
                padding: "16px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <Link
                  to={rolePath(`knowledge-base/${k.id}`)}
                  style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "var(--text-primary, #111827)",
                    textDecoration: "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-primary, #2563eb)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-primary, #111827)")}
                >
                  {k.title}
                </Link>
                {!readOnly && (
                  <button
                    onClick={() => { setUnlinkTargetId(k.id); setUnlinkConfirmOpen(true); }}
                    title={t("Unlink Document", { defaultValue: "Unlink Document" })}
                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "2px" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {k.category && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: "#EFF6FF",
                      color: "#2563EB",
                      fontWeight: 600,
                    }}
                  >
                    {k.category}
                  </span>
                </div>
              )}

              {k.file_name && (
                <div style={{ fontSize: "12px", color: "#2563eb", display: "flex", alignItems: "center", gap: "6px" }}>
                  <FileText size={13} />
                  <span>{k.file_name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Link Document Modal */}
      {showLinkModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowLinkModal(false); }}
        >
          <div
            style={{
              background: "var(--bg-card, #ffffff)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "520px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
              overflow: "hidden",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-color, #e5e7eb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--text-heading, #111827)", display: "flex", alignItems: "center", gap: "8px" }}>
                <BookOpen size={18} />
                {t("Link Knowledge Base Document", { defaultValue: "Link Knowledge Base Document" })}
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Search */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-color, #f3f4f6)" }}>
              <div className="pd-files-search" style={{ margin: 0, width: "100%" }}>
                <Search size={15} />
                <input
                  type="text"
                  placeholder={t("Search documents by title or category...", { defaultValue: "Search documents by title or category..." })}
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Modal List */}
            <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
              {modalLoading ? (
                <p className="td-muted" style={{ textAlign: "center", padding: "20px 0" }}>
                  {t("Loading documents...", { defaultValue: "Loading documents..." })}
                </p>
              ) : modalFiltered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted, #6b7280)", fontSize: "14px" }}>
                  {t("No knowledge base documents found.", { defaultValue: "No knowledge base documents found." })}
                </div>
              ) : (
                modalFiltered.map((doc) => {
                  const isAlreadyLinked = linkedIds.has(doc.id);
                  return (
                    <div
                      key={doc.id}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-color, #e5e7eb)",
                        background: isAlreadyLinked ? "#F0FDF4" : "var(--bg-card, #ffffff)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary, #111827)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {doc.title}
                        </div>
                        {doc.category && (
                          <div style={{ fontSize: "11px", color: "var(--text-muted, #6b7280)", marginTop: "2px" }}>
                            {doc.category}
                          </div>
                        )}
                      </div>

                      <div>
                        {isAlreadyLinked ? (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "#16A34A",
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <Check size={14} /> {t("Linked", { defaultValue: "Linked" })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLink(doc.id)}
                            disabled={linkingId === doc.id}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              background: "var(--color-primary, #2563eb)",
                              color: "#ffffff",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: linkingId === doc.id ? "not-allowed" : "pointer",
                              opacity: linkingId === doc.id ? 0.7 : 1,
                            }}
                          >
                            {linkingId === doc.id ? t("Linking...", { defaultValue: "Linking..." }) : t("Link", { defaultValue: "Link" })}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid var(--border-color, #e5e7eb)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--bg-card-alt, #f9fafb)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowLinkModal(false);
                  navigate(rolePath("knowledge-base/create"));
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-primary, #2563eb)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Plus size={13} /> {t("Create New Document", { defaultValue: "Create New Document" })}
              </button>

              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "transparent",
                  color: "var(--text-primary, #374151)",
                  fontSize: "12px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {t("Close", { defaultValue: "Close" })}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={unlinkConfirmOpen}
        onClose={() => { setUnlinkConfirmOpen(false); setUnlinkTargetId(null); }}
        onConfirm={confirmUnlink}
        title={t("Confirm Unlink", { defaultValue: "Confirm Unlink" })}
        message={t("Are you sure you want to unlink this knowledge base article?", { defaultValue: "Are you sure you want to unlink this knowledge base article?" })}
        confirmText={t("Unlink", { defaultValue: "Unlink" })}
        cancelText={t("Cancel", { defaultValue: "Cancel" })}
        danger
      />
    </div>
  );
}
