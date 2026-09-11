/**
 * projectUtils.js
 * Utilities for formatting and extracting project details.
 */

/**
 * Extracts and formats the project name strictly without any numeric ID,
 * business ID prefix (e.g. "PRJ-1"), or concatenated IDs (e.g. "2 Second", "Second 2", "2 - Second").
 *
 * @param {Object|string} project - The project object or project name string.
 * @returns {string} Clean project name.
 */
export function getProjectDisplayName(project) {
  if (!project) return "";
  if (typeof project === "string") {
    let name = project.trim();
    // Remove "PRJ-123 — ", "PRJ-123 - ", "PRJ-123: ", "PRJ-123 "
    name = name.replace(/^PRJ-\d+[\s\-—–:]*/i, "");
    // Remove leading numeric ID like "2 - ", "2 — ", "2: ", "2 "
    name = name.replace(/^\d+[\s\-—–:]+/, "");
    // Remove trailing numeric ID like " - 2", " — 2", ": 2", " 2"
    name = name.replace(/[\s\-—–:]+\d+$/, "");
    return name || project.trim();
  }

  // If object, prioritize project.name, then fallback to project.title
  let name = project.name || project.title || "";
  if (typeof name !== "string") name = String(name);
  name = name.trim();

  if (project.id !== undefined && project.id !== null) {
    const idStr = String(project.id);
    const busId = project.business_id ? String(project.business_id) : "";

    // Remove leading business_id (e.g. "PRJ-2 — Second")
    if (busId && name.toLowerCase().startsWith(busId.toLowerCase())) {
      name = name.slice(busId.length).replace(/^[\s\-—–:]+/, "").trim();
    }

    // Remove leading id (e.g. "2 Second", "2 - Second")
    const leadingIdRegex = new RegExp(`^${idStr}[\\s\\-—–:]+`, "i");
    if (leadingIdRegex.test(name)) {
      name = name.replace(leadingIdRegex, "").trim();
    }

    // Remove trailing id (e.g. "Second 2", "Second - 2")
    const trailingIdRegex = new RegExp(`[\\s\\-—–:]+${idStr}$`, "i");
    if (trailingIdRegex.test(name)) {
      name = name.replace(trailingIdRegex, "").trim();
    }
  }

  // Remove general leading/trailing numeric/code prefixes if name is mixed (e.g. "PRJ-2 - Second")
  name = name.replace(/^PRJ-\d+[\s\-—–:]*/i, "");
  name = name.replace(/^\d+[\s\-—–:]+/, "");

  return name || project.name || project.title || "";
}
