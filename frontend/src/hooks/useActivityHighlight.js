import { useState, useEffect, useCallback, useRef } from "react";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";

/**
 * Tracks which activities the current user has viewed for a given entity.
 *
 * - On mount: calls /activity-views/check to get lastViewedId
 * - hasUnread = maxId > lastViewedId → red border on panel
 * - isItemUnread = item.id > lastViewedId → red text on individual items
 * - markViewed: called on navigation away (popstate, beforeunload, route change)
 *   → clears red border AND red text for all items
 */
export function useActivityHighlight(entityType, entityId, activityMaxId, activities) {
  const [lastViewedId, setLastViewedId] = useState(0);
  const [checked, setChecked] = useState(false);
  const markedRef = useRef(false);
  const entityTypeRef = useRef(entityType);
  const entityIdRef = useRef(entityId);
  entityTypeRef.current = entityType;
  entityIdRef.current = entityId;

  // Fetch unread status
  useEffect(() => {
    if (!entityType || !entityId) return;
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/activity-views/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ entities: [{ type: entityType, id: entityId }] }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const key = `${entityType}:${entityId}`;
          const view = data.views?.[key];
          if (view) setLastViewedId(view.lastViewedId || 0);
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, [entityType, entityId]);

  // Mark viewed on server
  const markViewed = useCallback(() => {
    if (!entityTypeRef.current || !entityIdRef.current || markedRef.current) return;
    markedRef.current = true;
    const token = authToken();
    if (!token) return;

    fetch(`${API_URL}/activity-views/mark-viewed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ type: entityTypeRef.current, id: entityIdRef.current }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.lastViewedId) setLastViewedId(data.lastViewedId);
      })
      .catch(() => {});
  }, []);

  // Reset flag on entity change
  useEffect(() => {
    markedRef.current = false;
  }, [entityType, entityId]);

  // Mark viewed when navigating away
  useEffect(() => {
    const handlePopState = () => markViewed();
    const handleBeforeUnload = () => markViewed();
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [markViewed]);

  const isItemUnread = useCallback(
    (item) => {
      if (!checked) return false;
      const itemId = item?.id ?? 0;
      return itemId > lastViewedId && itemId > 0;
    },
    [checked, lastViewedId]
  );

  const unreadCount = checked
    ? activities.filter((a) => {
        const id = a?.id ?? 0;
        return id > lastViewedId && id > 0;
      }).length
    : 0;

  const hasUnread = checked && unreadCount > 0;

  return { hasUnread, unreadCount, isItemUnread, markViewed, checked };
}
