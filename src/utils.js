const { execSync } = require("child_process");
const fs = require("fs");

/**
 * Check if a command exists in PATH
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Determine if input is a URL or file path
 */
function getInputType(input) {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return "url";
  }
  if (input.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (fs.existsSync(input)) {
    return "file";
  }
  return "unknown";
}

/**
 * Sanitize filename to be safe for filesystem
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 100);
}

/**
 * Escape text for YAML (handle quotes, newlines, etc.)
 */
function escapeYaml(text) {
  if (!text) return '""';

  text = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, " ")
    .replace(/\r/g, "")
    .replace(/\t/g, " ");

  return `"${text}"`;
}

module.exports = { commandExists, getInputType, sanitizeFilename, escapeYaml };
