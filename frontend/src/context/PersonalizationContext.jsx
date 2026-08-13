/**
 * PersonalizationContext.jsx
 * Provides user widget personalization preferences across Dashboard, Tasks, and Projects pages.
 * Persists settings to localStorage under key 'pms_widget_preferences'.
 */
import { createContext, useContext, useState, useEffect } from "react";

const STORAGE_KEY = "pms_widget_preferences";

export const DEFAULT_PREFERENCES = {
  dashboard: {
    summary_cards: true,
    today_tasks: true,
    active_projects: true,
    activity_feed: true,
  },
  tasks: {
    stats_cards: true,
    filter_bar: true,
    task_list: true,
  },
  projects: {
    overview_cards: true,
    project_list: true,
  },
};

const PersonalizationContext = createContext({
  preferences: DEFAULT_PREFERENCES,
  updatePreference: () => {},
  resetPreferences: () => {},
  isWidgetEnabled: () => true,
});

export function PersonalizationProvider({ children }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          dashboard: { ...DEFAULT_PREFERENCES.dashboard, ...(parsed.dashboard || {}) },
          tasks: { ...DEFAULT_PREFERENCES.tasks, ...(parsed.tasks || {}) },
          projects: { ...DEFAULT_PREFERENCES.projects, ...(parsed.projects || {}) },
        };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_PREFERENCES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (e) {
      console.error("Failed to save widget preferences to localStorage", e);
    }
  }, [preferences]);

  const updatePreference = (page, widgetKey, enabled) => {
    setPreferences((prev) => ({
      ...prev,
      [page]: {
        ...(prev[page] || {}),
        [widgetKey]: enabled,
      },
    }));
  };

  const resetPreferences = () => {
    setPreferences(DEFAULT_PREFERENCES);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const isWidgetEnabled = (page, widgetKey) => {
    if (!preferences || !preferences[page]) return true;
    return preferences[page][widgetKey] !== false;
  };

  return (
    <PersonalizationContext.Provider
      value={{ preferences, updatePreference, resetPreferences, isWidgetEnabled }}
    >
      {children}
    </PersonalizationContext.Provider>
  );
}

export function usePersonalization() {
  return useContext(PersonalizationContext);
}
