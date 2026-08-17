/**
 * Utility to auto-capture environment and client system details
 * for Feedback & Product Improvement submissions.
 */

import { getUser } from "./auth";

export function getAutoCapturedMetadata(currentLocationPath = window.location.pathname) {
  const user = getUser();
  const ua = navigator.userAgent;

  return {
    organization_id: user?.company_id || null,
    organization_name: user?.company_name || "TechXaro",
    user_id: user?.id || null,
    user_name: user?.name || "Anonymous",
    user_role: user?.role || "member",
    current_page: currentLocationPath || window.location.pathname,
    browser: detectBrowser(ua),
    operating_system: detectOS(ua),
    device_type: detectDeviceType(ua),
    app_version: "1.0.0",
  };
}

function detectBrowser(ua) {
  if (!ua) return "Unknown Browser";
  if (ua.includes("Edg/")) return "Microsoft Edge";
  if (ua.includes("Chrome/") && !ua.includes("Edg/")) return "Google Chrome";
  if (ua.includes("Safari/") && !ua.includes("Chrome/")) return "Safari";
  if (ua.includes("Firefox/")) return "Mozilla Firefox";
  return "Other Browser";
}

function detectOS(ua) {
  if (!ua) return "Unknown OS";
  if (ua.includes("Windows NT 10.0")) return "Windows 10/11";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac OS X")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Other OS";
}

function detectDeviceType(ua) {
  if (!ua) return "Desktop";
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return "Mobile";
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  return "Desktop";
}
