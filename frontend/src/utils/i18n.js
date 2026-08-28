/**
 * @file i18n.js
 * @description Central Internationalization & Localization Coordinator using i18next & react-i18next.
 * Synchronizes react-i18next translations, Dayjs locales, and document direction (LTR/RTL).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/es";
import "dayjs/locale/fr";
import "dayjs/locale/de";
import "dayjs/locale/ar";
import "dayjs/locale/ur";
import "dayjs/locale/hi";
import "dayjs/locale/zh-cn";
import "dayjs/locale/ja";

import en from "../locales/en.json";
import ur from "../locales/ur.json";
import ar from "../locales/ar.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import hi from "../locales/hi.json";
import zh from "../locales/zh.json";
import ja from "../locales/ja.json";
import { getUser, setUser, getCurrentRole } from "./auth";

export const resources = {
  en: { translation: en },
  ur: { translation: ur },
  ar: { translation: ar },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  hi: { translation: hi },
  zh: { translation: zh },
  ja: { translation: ja },
  // Aliases for human-readable language names to prevent fallback crashes
  English: { translation: en },
  Urdu: { translation: ur },
  Arabic: { translation: ar },
  Spanish: { translation: es },
  French: { translation: fr },
  German: { translation: de },
  Hindi: { translation: hi },
  Chinese: { translation: zh },
  Japanese: { translation: ja },
};

/**
 * Language name to locale config map.
 */
export const LANGUAGE_LOCALE_MAP = {
  English: { code: "en", i18nCode: "en", dayjsCode: "en", name: "English", dir: "ltr" },
  Spanish: { code: "es", i18nCode: "es", dayjsCode: "es", name: "Spanish", dir: "ltr" },
  French: { code: "fr", i18nCode: "fr", dayjsCode: "fr", name: "French", dir: "ltr" },
  German: { code: "de", i18nCode: "de", dayjsCode: "de", name: "German", dir: "ltr" },
  Arabic: { code: "ar", i18nCode: "ar", dayjsCode: "ar", name: "Arabic", dir: "rtl" },
  Urdu: { code: "ur", i18nCode: "ur", dayjsCode: "ur", name: "Urdu", dir: "rtl" },
  Hindi: { code: "hi", i18nCode: "hi", dayjsCode: "hi", name: "Hindi", dir: "ltr" },
  Chinese: { code: "zh", i18nCode: "zh", dayjsCode: "zh-cn", name: "Chinese", dir: "ltr" },
  Japanese: { code: "ja", i18nCode: "ja", dayjsCode: "ja", name: "Japanese", dir: "ltr" },
  en: { code: "en", i18nCode: "en", dayjsCode: "en", name: "English", dir: "ltr" },
  es: { code: "es", i18nCode: "es", dayjsCode: "es", name: "Spanish", dir: "ltr" },
  fr: { code: "fr", i18nCode: "fr", dayjsCode: "fr", name: "French", dir: "ltr" },
  de: { code: "de", i18nCode: "de", dayjsCode: "de", name: "German", dir: "ltr" },
  ar: { code: "ar", i18nCode: "ar", dayjsCode: "ar", name: "Arabic", dir: "rtl" },
  ur: { code: "ur", i18nCode: "ur", dayjsCode: "ur", name: "Urdu", dir: "rtl" },
  hi: { code: "hi", i18nCode: "hi", dayjsCode: "hi", name: "Hindi", dir: "ltr" },
  zh: { code: "zh", i18nCode: "zh", dayjsCode: "zh-cn", name: "Chinese", dir: "ltr" },
  "zh-cn": { code: "zh", i18nCode: "zh", dayjsCode: "zh-cn", name: "Chinese", dir: "ltr" },
  ja: { code: "ja", i18nCode: "ja", dayjsCode: "ja", name: "Japanese", dir: "ltr" },
};

/**
 * Resolve language config safely.
 */
export function resolveLanguageConfig(language) {
  if (!language) return LANGUAGE_LOCALE_MAP.English;
  const normalized = String(language).trim();
  return (
    LANGUAGE_LOCALE_MAP[normalized] ||
    LANGUAGE_LOCALE_MAP[normalized.toLowerCase()] ||
    LANGUAGE_LOCALE_MAP.English
  );
}

// Initial resolution from user session or persistent storage
const getStoredLanguageName = () => {
  try {
    const user = getUser();
    if (user?.language) return user.language;
    const persistent = localStorage.getItem("pms_active_language");
    if (persistent) return persistent;
  } catch {}
  return "English";
};

const initialLangConfig = resolveLanguageConfig(getStoredLanguageName());

// Initialize i18next
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: initialLangConfig.i18nCode,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

// Decorate i18n.changeLanguage so direct calls on the i18n instance safely resolve aliases & sync Dayjs/DOM
const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = (language, ...args) => {
  if (!language) return Promise.resolve();
  const config = resolveLanguageConfig(language);
  currentLanguage = config.name;

  try {
    localStorage.setItem("pms_active_language", config.name);
  } catch {}

  try {
    dayjs.locale(config.dayjsCode);
    if (typeof document !== "undefined") {
      document.documentElement.lang = config.code;
      document.documentElement.dir = config.dir;
    }
  } catch (err) {
    console.warn("Failed to set Dayjs locale or HTML attributes:", err);
  }

  return originalChangeLanguage(config.i18nCode, ...args);
};

// Set initial dayjs locale and document direction
try {
  dayjs.locale(initialLangConfig.dayjsCode);
  if (typeof document !== "undefined") {
    document.documentElement.lang = initialLangConfig.code;
    document.documentElement.dir = initialLangConfig.dir;
  }
} catch {}

let currentLanguage = initialLangConfig.name;

/**
 * Changes the active application language across react-i18next, Dayjs, and document attributes.
 *
 * @param {string} language - Name or code of the language (e.g. 'English', 'Urdu', 'Arabic', 'ur', 'ar')
 * @param {boolean} [persist=false] - Whether to update the current user object in session storage
 */
export function changeLanguage(language, persist = false) {
  if (!language) return;

  const config = resolveLanguageConfig(language);
  currentLanguage = config.name;

  try {
    localStorage.setItem("pms_active_language", config.name);
  } catch {}

  // 1. Update react-i18next via decorated method
  i18n.changeLanguage(config.i18nCode);

  // 2. Set Dayjs global locale
  try {
    dayjs.locale(config.dayjsCode);
  } catch (err) {
    console.warn("Failed to set Dayjs locale for", config.dayjsCode, err);
  }

  // 3. Set document HTML attributes
  if (typeof document !== "undefined") {
    document.documentElement.lang = config.code;
    document.documentElement.dir = config.dir;
  }

  // 4. Persist to user session if requested
  if (persist) {
    try {
      const role = getCurrentRole();
      const user = getUser(role);
      if (user && user.language !== currentLanguage) {
        user.language = currentLanguage;
        setUser(role, user);
      }
    } catch {}
  }

  // 5. Dispatch global event for custom non-hook components
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("language-changed", {
        detail: {
          language: currentLanguage,
          localeCode: config.code,
          dir: config.dir,
        },
      })
    );
  }
}

/**
 * Gets the current active language name.
 * @returns {string} (e.g., 'English', 'Spanish', 'Arabic', 'Urdu')
 */
export function getLanguage() {
  const user = getUser();
  if (user?.language) return user.language;
  try {
    const saved = localStorage.getItem("pms_active_language");
    if (saved) return saved;
  } catch {}
  return currentLanguage || "English";
}

/**
 * Gets the ISO code for the current language.
 * @returns {string} (e.g., 'en', 'es', 'ar', 'ur')
 */
export function getLocaleCode() {
  const lang = getLanguage();
  const config = resolveLanguageConfig(lang);
  return config.code;
}

/**
 * Checks whether the active language is Right-to-Left (RTL).
 * @returns {boolean}
 */
export function isRTL() {
  const lang = getLanguage();
  const config = resolveLanguageConfig(lang);
  return config.dir === "rtl";
}

/**
 * Initializes the i18n subsystem on app mount.
 */
export function initI18n() {
  try {
    const lang = getStoredLanguageName();
    changeLanguage(lang, false);
  } catch (err) {
    console.warn("Error initializing i18n:", err);
  }
}

export const i18nCoordinator = {
  changeLanguage,
  getLanguage,
  getLocaleCode,
  isRTL,
  init: initI18n,
};

export { i18n };
export default i18n;
