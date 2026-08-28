import { useState } from "react";
import { useTranslation } from "react-i18next";
import ConfirmationDialog from "./ConfirmationDialog";
import API_URL from "../config/api";
import { authToken } from "../utils/auth";
import { useNotification } from "../context/NotificationContext";
import { publish } from "../utils/eventBus";

export default function DeleteRecurrenceModal({ isOpen, onClose, task, onSuccess }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const notify = useNotification();

  if (!isOpen || !task) return null;

  const handleDelete = async () => {
    setLoading(true);
    try {
      const token = authToken();
      const res = await fetch(`${API_URL}/tasks/${task.id}/recurrence`, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || t("Failed to delete recurrence series.", { defaultValue: "Failed to delete recurrence series." }));
      }

      notify.success(data.message || t("Recurrence rule deleted successfully.", { defaultValue: "Recurrence rule deleted successfully." }));
      publish("task:updated", { taskId: task.id });
      publish("data:changed", { type: "task", action: "recurrence_deleted" });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      notify.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfirmationDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleDelete}
      title={t("Delete Recurrence Series", { defaultValue: "Delete Recurrence Series" })}
      message={t('Are you sure you want to delete the recurrence rule for "{{title}}"? Future pending task instances will be removed, but all completed instances will be preserved.', {
        defaultValue: `Are you sure you want to delete the recurrence rule for "${task.title}"? Future pending task instances will be removed, but all completed instances will be preserved.`,
        title: task.title,
      })}
      confirmText={t("Delete Recurrence", { defaultValue: "Delete Recurrence" })}
      confirmColor="#dc2626"
      loading={loading}
    />
  );
}
